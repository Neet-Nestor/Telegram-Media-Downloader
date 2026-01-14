// ==UserScript==
// @name         Telegram Media Downloader
// @name:en      Telegram Media Downloader
// @name:zh-CN   Telegram 受限图片视频下载器
// @name:zh-TW   Telegram 受限圖片影片下載器
// @name:ru      Telegram: загрузчик медиафайлов
// @version      1.21
// @namespace    https://github.com/Neet-Nestor/Telegram-Media-Downloader
// @description  Download images, GIFs, videos, and voice messages on the Telegram webapp from private channels that disable downloading and restrict saving content
// @description:en  Download images, GIFs, videos, and voice messages on the Telegram webapp from private channels that disable downloading and restrict saving content
// @description:ru Загружайте изображения, GIF-файлы, видео и голосовые сообщения в веб-приложении Telegram из частных каналов, которые отключили загрузку и ограничили сохранение контента
// @description:zh-CN 从禁止下载的Telegram频道中下载图片、视频及语音消息
// @description:zh-TW 從禁止下載的 Telegram 頻道中下載圖片、影片及語音訊息
// @author       Nestor Qin
// @license      GNU GPLv3
// @website      https://github.com/Neet-Nestor/Telegram-Media-Downloader
// @match        https://web.telegram.org/*
// @match        https://webk.telegram.org/*
// @match        https://webz.telegram.org/*
// @icon         https://img.icons8.com/color/452/telegram-app--v5.png
// ==/UserScript==


(function () {
  const logger = {
    info: (message, fileName = null) => {
      console.log(
        `[Tel Download] ${fileName ? `${fileName}: ` : ""}${message}`
      );
    },
    error: (message, fileName = null) => {
      console.error(
        `[Tel Download] ${fileName ? `${fileName}: ` : ""}${message}`
      );
    },
  };
  // Unicode values for icons (used in /k/ app)
  // https://github.com/morethanwords/tweb/blob/master/src/icons.ts
  const DOWNLOAD_ICON = "\uE967";
  const FORWARD_ICON = "\uE983";
  const contentRangeRegex = /^bytes (\d+)-(\d+)\/(\d+)$/;
  const REFRESH_DELAY = 500;
  const hashCode = (s) => {
    var h = 0,
      l = s.length,
      i = 0;
    if (l > 0) {
      while (i < l) {
        h = ((h << 5) - h + s.charCodeAt(i++)) | 0;
      }
    }
    return h >>> 0;
  };

  const sanitizeFilename = (s) => {
    try {
      return String(s).replace(/[^a-z0-9\.\-_]/gi, '_');
    } catch (e) { return String(s); }
  };

  // Extract ID portion from blob URLs robustly.
  const extractBlobIdFromUrl = (u) => {
    try {
      const s = String(u || '');
      // take last path segment and try to match UUID-like pattern
      const last = s.split('/').pop();
      const m = last && last.match(/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/);
      if (m) return m[1];
      // fallback: return last segment if reasonably short
      if (last && last.length <= 64) return last;
      return null;
    } catch (e) {
      return null;
    }
  };

  // Parse filename from Content-Disposition header if present
  const parseFilenameFromContentDisposition = (hdr) => {
    try {
      if (!hdr) return null;
      // Fits common patterns: attachment; filename="name.ext" or filename=name.ext
      const m = hdr.match(/filename\*?=(?:UTF-8''\s*)?"?([^";]+)"?/i);
      if (m && m[1]) return m[1].trim();
      return null;
    } catch (e) { return null; }
  };

  // Centralized fetch-and-save helper: fetch URL, derive filename (hint/itemMid/blobId/hash), save blob
  const fetchAndSaveUrl = async (url, { filenameHint = null, itemMid = null } = {}) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Fetch failed: ' + res.status);
    // Try filename from headers first
    const cd = res.headers.get('Content-Disposition');
    let filenameFromCd = parseFilenameFromContentDisposition(cd);
    const blob = await res.blob();
    const contentType = res.headers.get('Content-Type') || blob.type || '';
    const ext = (contentType.split('/')[1] || '').split(';')[0] || '';

    const candidates = [];
    if (filenameHint) candidates.push(sanitizeFilename(filenameHint));
    if (itemMid) candidates.push(sanitizeFilename(itemMid));
    if (filenameFromCd) candidates.push(sanitizeFilename(filenameFromCd));
    const blobId = extractBlobIdFromUrl(url);
    if (blobId) candidates.push(sanitizeFilename(blobId));

    const base = candidates.find(Boolean);
    if (!base) throw new Error('No filename could be determined (no hint, mid, or blob ID)');
    const finalExt = ext || 'bin';
    const finalName = base + '.' + finalExt;

    const blobUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    document.body.appendChild(a);
    a.href = blobUrl;
    a.download = finalName;
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(blobUrl);

    return finalName;
  };

  // Probe the opened media viewer to find a playable stream URL.
  // Returns { url, contentType } if found, otherwise null.
  const probeViewerStream = async (item, { maxAttempts = 3, timeout = 12000 } = {}) => {
    // Choose the element that most reliably opens the viewer. Some album items don't
    // have an <a> anchor — the clickable target is the media element itself (img/.album-item-media/.media-container)
    let opener = item;
    if (item && item.querySelector) {
      opener = item.querySelector('a, .album-item-media, .media-container, .media-photo, img, .thumbnail, .canvas-thumbnail') || item;
    }
    const playBtn = item && (item.querySelector('.video-play, .btn-circle.video-play, .toggle') || null);

    const prevSuppress = typeof telSuppressMediaError !== 'undefined' ? telSuppressMediaError : false;
    telSuppressMediaError = true;

    try {
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          // Close any existing viewer first to avoid stale slides being detected
          try {
            const existingClose = document.querySelector('#MediaViewer button[aria-label="Close"], #MediaViewer button[title="Close"], .media-viewer-whole .close');
            if (existingClose) {
              existingClose.click();
              await new Promise((r) => setTimeout(r, 200));
            }
          } catch (e) {}

          if (playBtn) {
            try { playBtn.click(); logger.info('Clicked in-item play button (probe attempt ' + attempt + ')'); } catch (e) { logger.info('Play button click failed during probe: ' + (e?.message || e)); }
          }
          try { opener && opener.click(); } catch (e) { logger.info('Opener click failed during probe: ' + (e?.message || e)); }

          // Wait for viewer to open and stabilize
          await new Promise((r) => setTimeout(r, 500));

          const start = Date.now();
          while (Date.now() - start < timeout) {
            try {
              const v = document.querySelector('#MediaViewer .MediaViewerSlide--active video, .media-viewer-whole video, video.media-video, .ckin__player video');
              if (v) {
                const s = v.currentSrc || v.src;
                if (s) {
                  try {
                    const href = new URL(s, location.href).href;
                    // HEAD check to avoid HTML/service-worker pages
                    let contentType = null;
                    try {
                      const headRes = await fetch(href, { method: 'HEAD' });
                      contentType = headRes.headers.get('Content-Type') || '';
                    } catch (e) { logger.info('HEAD check failed for probe URL: ' + href + ' (' + (e?.message || e) + ')'); }

                    if (!contentType || contentType.indexOf('text/html') !== 0) {
                      return { url: href, contentType };
                    }
                  } catch (e) {
                    return { url: s, contentType: null };
                  }
                }
              }

              const streamLink = document.querySelector('#MediaViewer a[href*="stream/"]')?.href || document.querySelector('.media-viewer-whole a[href*="stream/"]')?.href;
              if (streamLink) {
                let contentType = null;
                try {
                  const headRes = await fetch(streamLink, { method: 'HEAD' });
                  contentType = headRes.headers.get('Content-Type') || '';
                } catch (e) { logger.info('HEAD check failed for probe stream link: ' + streamLink + ' (' + (e?.message || e) + ')'); }
                if (!contentType || contentType.indexOf('text/html') !== 0) return { url: streamLink, contentType };
              }
            } catch (e) {
              logger.error('Error while polling viewer during probe: ' + (e?.message || e));
            }
            await new Promise((r) => setTimeout(r, 200));
          }

          if (attempt < maxAttempts) {
            const backoff = 500 * attempt;
            logger.info('Viewer probe no result, retrying after ' + backoff + 'ms (attempt ' + (attempt + 1) + ')');
            await new Promise((r) => setTimeout(r, backoff));
          }
        } catch (e) {
          logger.error('Unexpected error in probe attempt: ' + (e?.message || e));
        }
      }
    } finally {
      telSuppressMediaError = prevSuppress;
    }

    return null;
  };


  const createProgressBar = (videoId, fileName) => {
    const isDarkMode =
      document.querySelector("html").classList.contains("night") ||
      document.querySelector("html").classList.contains("theme-dark");
    const container = document.getElementById(
      "tel-downloader-progress-bar-container"
    );
    const innerContainer = document.createElement("div");
    innerContainer.id = "tel-downloader-progress-" + videoId;
    innerContainer.style.width = "20rem";
    innerContainer.style.marginTop = "0.4rem";
    innerContainer.style.padding = "0.6rem";
    innerContainer.style.backgroundColor = isDarkMode
      ? "rgba(0,0,0,0.3)"
      : "rgba(0,0,0,0.6)";

    const flexContainer = document.createElement("div");
    flexContainer.style.display = "flex";
    flexContainer.style.justifyContent = "space-between";

    const title = document.createElement("p");
    title.className = "filename";
    title.style.margin = 0;
    title.style.color = "white";
    title.innerText = fileName;

    const closeButton = document.createElement("div");
    closeButton.className = "tel-progress-close";
    closeButton.style.fontSize = "1.2rem";
    closeButton.style.color = isDarkMode ? "#4a4a4a" : "#888";
    closeButton.style.cursor = "not-allowed";
    closeButton.style.opacity = "0.5";
    closeButton.innerHTML = "&times;";
    closeButton.onclick = function () {
      // Only allow close if download is completed or aborted
      if (closeButton.dataset.canClose === "true") {
        container.removeChild(innerContainer);
      }
    };

    const progressBar = document.createElement("div");
    progressBar.className = "progress";
    progressBar.style.backgroundColor = "#e2e2e2";
    progressBar.style.position = "relative";
    progressBar.style.width = "100%";
    progressBar.style.height = "1.6rem";
    progressBar.style.borderRadius = "2rem";
    progressBar.style.overflow = "hidden";

    const counter = document.createElement("p");
    counter.style.position = "absolute";
    counter.style.zIndex = 5;
    counter.style.left = "50%";
    counter.style.top = "50%";
    counter.style.transform = "translate(-50%, -50%)";
    counter.style.margin = 0;
    counter.style.color = "black";
    const progress = document.createElement("div");
    progress.style.position = "absolute";
    progress.style.height = "100%";
    progress.style.width = "0%";
    progress.style.backgroundColor = "#6093B5";

    progressBar.appendChild(counter);
    progressBar.appendChild(progress);
    flexContainer.appendChild(title);
    flexContainer.appendChild(closeButton);
    innerContainer.appendChild(flexContainer);
    innerContainer.appendChild(progressBar);
    container.appendChild(innerContainer);
  };

  const updateProgress = (videoId, fileName, progress) => {
    const innerContainer = document.getElementById(
      "tel-downloader-progress-" + videoId
    );
    if (!innerContainer) {
      logger.info(`Progress UI closed but download continues: ${progress}%`, fileName);
      return;
    }
    innerContainer.querySelector("p.filename").innerText = fileName;
    const progressBar = innerContainer.querySelector("div.progress");
    const pct = parseInt(progress, 10);
    progressBar.querySelector("p").innerText = pct + "%";
    progressBar.querySelector("div").style.width = pct + "%";
    if (pct >= 100) {
      // Treat 100% as completion and trigger completion handler
      completeProgress(videoId);
    }
  };

  const downloadCompletionResolvers = new Map();

  const completeProgress = (videoId) => {
    const container = document.getElementById("tel-downloader-progress-" + videoId);
    if (!container) return;
    const progressBar = container.querySelector("div.progress");
    progressBar.querySelector("p").innerText = "Completed";
    progressBar.querySelector("div").style.backgroundColor = "#B6C649";
    progressBar.querySelector("div").style.width = "100%";

    // Enable close button
    const closeBtn = container.querySelector(".tel-progress-close");
    if (closeBtn) {
      closeBtn.dataset.canClose = "true";
      closeBtn.style.cursor = "pointer";
      closeBtn.style.opacity = "1";
      const isDarkMode = document.querySelector("html").classList.contains("night") || document.querySelector("html").classList.contains("theme-dark");
      closeBtn.style.color = isDarkMode ? "#8a8a8a" : "white";
    }

    const r = downloadCompletionResolvers.get(videoId);
    if (r && r.resolve) {
      r.resolve();
      downloadCompletionResolvers.delete(videoId);
    }

    // Auto-close completed progress after a short delay
    setTimeout(() => {
      try {
        const c = document.getElementById("tel-downloader-progress-" + videoId);
        if (c && c.parentNode) c.parentNode.removeChild(c);
      } catch (e) {}
    }, 2000);
  };

  const AbortProgress = (videoId, err) => {
    const container = document.getElementById("tel-downloader-progress-" + videoId);
    if (!container) return;
    const progressBar = container.querySelector("div.progress");
    progressBar.querySelector("p").innerText = "Aborted";
    progressBar.querySelector("div").style.backgroundColor = "#D16666";
    progressBar.querySelector("div").style.width = "100%";

    // Enable close button
    const closeBtn = container.querySelector(".tel-progress-close");
    if (closeBtn) {
      closeBtn.dataset.canClose = "true";
      closeBtn.style.cursor = "pointer";
      closeBtn.style.opacity = "1";
      const isDarkMode = document.querySelector("html").classList.contains("night") || document.querySelector("html").classList.contains("theme-dark");
      closeBtn.style.color = isDarkMode ? "#8a8a8a" : "white";
    }

    const r = downloadCompletionResolvers.get(videoId);
    if (r && r.reject) {
      r.reject(err || new Error('Aborted'));
      downloadCompletionResolvers.delete(videoId);
    }
  };

  const tel_download_video = (url, filenameHint) => {
    let _blobs = [];
    let _next_offset = 0;
    let _total_size = null;
    let _file_extension = "mp4";

    const videoId =
      (Math.random() + 1).toString(36).substring(2, 10) +
      "_" +
      Date.now().toString();

    // Filename determination:
    // Priority: filenameHint (if provided) -> metadata.fileName (stream/ JSON) -> blob-id (if blob URL) -> hash(url)
    let baseName = null;
    let fileName = null;
    if (filenameHint) baseName = sanitizeFilename(filenameHint);

    // Promise that resolves when download completes (or rejects on abort)
    const completionPromise = new Promise((resolve, reject) => {
      downloadCompletionResolvers.set(videoId, { resolve, reject });
    });

    // Try to extract embedded filename from URL metadata if present
    try {
      const metaRaw = decodeURIComponent(url.split("/")[url.split("/").length - 1]);
      const metadata = JSON.parse(metaRaw);
      if (metadata && metadata.fileName) {
        fileName = metadata.fileName;
      }
    } catch (e) {
      // ignore invalid metadata
    }

    if (!baseName && !fileName) {
      const blobId = extractBlobIdFromUrl(url);
      if (blobId) baseName = sanitizeFilename(blobId);
    }
    if (!fileName && !baseName) {
      throw new Error('No filename could be determined for video (no hint, metadata, or blob ID)');
    }
    if (!fileName) fileName = baseName + "." + _file_extension;

    logger.info(`URL: ${url}`, fileName);

    const fetchNextPart = (_writable) => {
      fetch(url, {
        method: "GET",
        headers: {
          Range: `bytes=${_next_offset}-`,
        },
        "User-Agent":
          "User-Agent Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/117.0",
      })
        .then((res) => {
          if (![200, 206].includes(res.status)) {
            throw new Error("Non 200/206 response was received: " + res.status);
          }
          const mime = res.headers.get("Content-Type").split(";")[0];
          if (!mime.startsWith("video/")) {
            throw new Error("Get non video response with MIME type " + mime);
          }
          _file_extension = mime.split("/")[1];
          fileName =
            fileName.substring(0, fileName.indexOf(".") + 1) + _file_extension;

          const match = res.headers
            .get("Content-Range")
            .match(contentRangeRegex);

          const startOffset = parseInt(match[1]);
          const endOffset = parseInt(match[2]);
          const totalSize = parseInt(match[3]);

          if (startOffset !== _next_offset) {
            logger.error("Gap detected between responses.", fileName);
            logger.info("Last offset: " + _next_offset, fileName);
            logger.info("New start offset " + match[1], fileName);
            throw "Gap detected between responses.";
          }
          if (_total_size && totalSize !== _total_size) {
            logger.error("Total size differs", fileName);
            throw "Total size differs";
          }

          _next_offset = endOffset + 1;
          _total_size = totalSize;

          updateProgress(
            videoId,
            fileName,
            ((_next_offset * 100) / _total_size).toFixed(0)
          );
          return res.blob();
        })
        .then((resBlob) => {
          if (_writable !== null) {
            _writable.write(resBlob).then(() => {});
          } else {
            _blobs.push(resBlob);
          }
        })
        .then(() => {
          if (!_total_size) {
            throw new Error("_total_size is NULL");
          }

          if (_next_offset < _total_size) {
            fetchNextPart(_writable);
          } else {
            if (_writable !== null) {
              _writable.close().then(() => {
                logger.info("Download finished", fileName);
              });
            } else {
              save();
            }
          }
        })
        .catch((reason) => {
          logger.error(reason, fileName);
          AbortProgress(videoId);
        });
    };

    const save = () => {
      logger.info("Finish downloading blobs", fileName);
      logger.info("Concatenating blobs and downloading...", fileName);

      const blob = new Blob(_blobs, { type: "video/mp4" });
      const blobUrl = window.URL.createObjectURL(blob);

      logger.info("Final blob size: " + blob.size + " bytes", fileName);

      const a = document.createElement("a");
      document.body.appendChild(a);
      a.href = blobUrl;
      a.download = fileName;
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(blobUrl);

      logger.info("Download triggered", fileName);

      completeProgress(videoId);
    };

    const supportsFileSystemAccess =
      "showSaveFilePicker" in unsafeWindow &&
      (() => {
        try {
          return unsafeWindow.self === unsafeWindow.top;
        } catch {
          return false;
        }
      })();
    if (supportsFileSystemAccess) {
      unsafeWindow
        .showSaveFilePicker({
          suggestedName: fileName,
        })
        .then((handle) => {
          handle
            .createWritable()
            .then((writable) => {
              fetchNextPart(writable);
              createProgressBar(videoId);
            })
            .catch((err) => {
              console.error(err.name, err.message);
              AbortProgress(videoId, err);
            });
        })
        .catch((err) => {
          if (err.name !== "AbortError") {
            console.error(err.name, err.message);
            AbortProgress(videoId, err);
          }
        });
    } else {
      fetchNextPart(null);
      createProgressBar(videoId);
    }

    return completionPromise;
  };

  const tel_download_audio = (url) => {
    let _blobs = [];
    let _next_offset = 0;
    let _total_size = null;
    const blobId = extractBlobIdFromUrl(url);
    if (!blobId) {
      throw new Error('No filename could be determined for audio (no blob ID)');
    }
    const fileName = sanitizeFilename(blobId) + ".ogg";

    const fetchNextPart = (_writable) => {
      fetch(url, {
        method: "GET",
        headers: {
          Range: `bytes=${_next_offset}-`,
        },
      })
        .then((res) => {
          if (res.status !== 206 && res.status !== 200) {
            logger.error(
              "Non 200/206 response was received: " + res.status,
              fileName
            );
            return;
          }

          const mime = res.headers.get("Content-Type").split(";")[0];
          if (!mime.startsWith("audio/")) {
            logger.error(
              "Get non audio response with MIME type " + mime,
              fileName
            );
            throw "Get non audio response with MIME type " + mime;
          }

          try {
            const match = res.headers
              .get("Content-Range")
              .match(contentRangeRegex);

            const startOffset = parseInt(match[1]);
            const endOffset = parseInt(match[2]);
            const totalSize = parseInt(match[3]);

            if (startOffset !== _next_offset) {
              logger.error("Gap detected between responses.");
              logger.info("Last offset: " + _next_offset);
              logger.info("New start offset " + match[1]);
              throw "Gap detected between responses.";
            }
            if (_total_size && totalSize !== _total_size) {
              logger.error("Total size differs");
              throw "Total size differs";
            }

            _next_offset = endOffset + 1;
            _total_size = totalSize;
          } finally {
            logger.info(
              `Get response: ${res.headers.get(
                "Content-Length"
              )} bytes data from ${res.headers.get("Content-Range")}`
            );
            return res.blob();
          }
        })
        .then((resBlob) => {
          if (_writable !== null) {
            _writable.write(resBlob).then(() => {});
          } else {
            _blobs.push(resBlob);
          }
        })
        .then(() => {
          if (_next_offset < _total_size) {
            fetchNextPart(_writable);
          } else {
            if (_writable !== null) {
              _writable.close().then(() => {
                logger.info("Download finished", fileName);
              });
            } else {
              save();
            }
          }
        })
        .catch((reason) => {
          logger.error(reason, fileName);
        });
    };

    const save = () => {
      logger.info(
        "Finish downloading blobs. Concatenating blobs and downloading...",
        fileName
      );

      let blob = new Blob(_blobs, { type: "audio/ogg" });
      const blobUrl = window.URL.createObjectURL(blob);

      logger.info("Final blob size in bytes: " + blob.size, fileName);

      blob = 0;

      const a = document.createElement("a");
      document.body.appendChild(a);
      a.href = blobUrl;
      a.download = fileName;
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(blobUrl);

      logger.info("Download triggered", fileName);
    };

    const supportsFileSystemAccess =
      "showSaveFilePicker" in unsafeWindow &&
      (() => {
        try {
          return unsafeWindow.self === unsafeWindow.top;
        } catch {
          return false;
        }
      })();
    if (supportsFileSystemAccess) {
      unsafeWindow
        .showSaveFilePicker({
          suggestedName: fileName,
        })
        .then((handle) => {
          handle
            .createWritable()
            .then((writable) => {
              fetchNextPart(writable);
            })
            .catch((err) => {
              console.error(err.name, err.message);
            });
        })
        .catch((err) => {
          if (err.name !== "AbortError") {
            console.error(err.name, err.message);
          }
        });
    } else {
      fetchNextPart(null);
    }
  };

  const tel_download_image = async (imageUrl, filenameHint) => {
    // Try to preserve a sensible extension and filename. Use filenameHint first, then blob id, then a random name.
    let ext = 'jpeg';
    try {
      const m = String(imageUrl).match(/\.([a-z0-9]{2,5})(?:[?#]|$)/i);
      if (m && m[1]) ext = m[1];
      else if (imageUrl && imageUrl.startsWith('blob:')) {
        // Try to fetch a small chunk to determine type
        try {
          const r = await fetch(imageUrl);
          const b = await r.blob();
          if (b && b.type) ext = (b.type.split('/')[1] || ext).split(';')[0];
          // Save blob directly so we don't rely on a href blob with unknown name
          const deduced = filenameHint ? sanitizeFilename(filenameHint) : (extractBlobIdFromUrl(imageUrl) || hashCode(imageUrl).toString(36));
          const fileName = deduced + '.' + ext;
          const blobUrl = window.URL.createObjectURL(b);
          const a = document.createElement('a');
          document.body.appendChild(a);
          a.href = blobUrl;
          a.download = fileName;
          a.click();
          document.body.removeChild(a);
          window.URL.revokeObjectURL(blobUrl);
          logger.info('Download triggered', fileName);
          return Promise.resolve();
        } catch (e) {
          // fall back to simple anchor method
        }
      }
    } catch (e) {}

    const blobId = extractBlobIdFromUrl(imageUrl);
    if (!filenameHint && !blobId) {
      throw new Error('No filename could be determined for image (no hint or blob ID)');
    }
    const fileName = filenameHint ? sanitizeFilename(filenameHint) + '.' + ext : sanitizeFilename(blobId) + '.' + ext;

    const a = document.createElement('a');
    document.body.appendChild(a);
    a.href = imageUrl;
    a.download = fileName;
    a.click();
    document.body.removeChild(a);

    logger.info('Download triggered', fileName);
    return Promise.resolve();
  };

  logger.info("Initialized");

  // Global handler to optionally suppress noisy MediaError unhandled rejections
  let telSuppressMediaError = false;
  window.addEventListener('unhandledrejection', (ev) => {
    try {
      const reason = ev && ev.reason;
      const msg = (reason && reason.message) || String(reason || '');
      if (telSuppressMediaError && msg && msg.includes('Failed to init decoder')) {
        ev.preventDefault && ev.preventDefault();
        logger.info('Suppressed MediaError: ' + msg);
      }
    } catch (e) {}
  });

  // For webz /a/ webapp
  setInterval(() => {
    // Stories
    const storiesContainer = document.getElementById("StoryViewer");
    if (storiesContainer) {
      console.log("storiesContainer");
      const createDownloadButton = () => {
        console.log("createDownloadButton");
        const downloadIcon = document.createElement("i");
        downloadIcon.className = "icon icon-download";
        const downloadButton = document.createElement("button");
        downloadButton.className =
          "Button TkphaPyQ tiny translucent-white round tel-download";
        downloadButton.appendChild(downloadIcon);
        downloadButton.setAttribute("type", "button");
        downloadButton.setAttribute("title", "Download");
        downloadButton.setAttribute("aria-label", "Download");
        downloadButton.onclick = () => {
          // 1. Story with video
          const video = storiesContainer.querySelector("video");
          const videoSrc =
            video?.src ||
            video?.currentSrc ||
            video?.querySelector("source")?.src;
          if (videoSrc) {
            const dataMid = storiesContainer.getAttribute('data-mid') || storiesContainer.closest('[data-mid]')?.getAttribute('data-mid');
            tel_download_video(videoSrc, dataMid);
          } else {
            // 2. Story with image
            const images = storiesContainer.querySelectorAll("img.PVZ8TOWS");
            if (images.length > 0) {
              const imageSrc = images[images.length - 1]?.src;
              const dataMid = storiesContainer.getAttribute('data-mid') || storiesContainer.closest('[data-mid]')?.getAttribute('data-mid');
              if (imageSrc) tel_download_image(imageSrc, dataMid);
            }
          }
        };
        return downloadButton;
      };

      const storyHeader =
        storiesContainer.querySelector(".GrsJNw3y") ||
        storiesContainer.querySelector(".DropdownMenu").parentNode;
      if (storyHeader && !storyHeader.querySelector(".tel-download")) {
        console.log("storyHeader");
        storyHeader.insertBefore(
          createDownloadButton(),
          storyHeader.querySelector("button")
        );
      }
    }

    // All media opened are located in .media-viewer-movers > .media-viewer-aspecter
    const mediaContainer = document.querySelector(
      "#MediaViewer .MediaViewerSlide--active"
    );
    const mediaViewerActions = document.querySelector(
      "#MediaViewer .MediaViewerActions"
    );
    if (!mediaContainer || !mediaViewerActions) return;

    // Videos in channels
    const videoPlayer = mediaContainer.querySelector(
      ".MediaViewerContent > .VideoPlayer"
    );
    const img = mediaContainer.querySelector(".MediaViewerContent > div > img");
    // 1. Video player detected - Video or GIF
    // container > .MediaViewerSlides > .MediaViewerSlide > .MediaViewerContent > .VideoPlayer > video[src]
    const downloadIcon = document.createElement("i");
    downloadIcon.className = "icon icon-download";
    const downloadButton = document.createElement("button");
    downloadButton.className =
      "Button smaller translucent-white round tel-download";
    downloadButton.setAttribute("type", "button");
    downloadButton.setAttribute("title", "Download");
    downloadButton.setAttribute("aria-label", "Download");
    if (videoPlayer) {
      const videoUrl = videoPlayer.querySelector("video").currentSrc;
      downloadButton.setAttribute("data-tel-download-url", videoUrl);
      downloadButton.appendChild(downloadIcon);
      downloadButton.onclick = () => {
        const dataMid = mediaContainer.getAttribute('data-mid') || mediaContainer.closest('[data-mid]')?.getAttribute('data-mid');
        tel_download_video(videoPlayer.querySelector("video").currentSrc, dataMid);
      };

      // Add download button to video controls
      const controls = videoPlayer.querySelector(".VideoPlayerControls");
      if (controls) {
        const buttons = controls.querySelector(".buttons");
        if (!buttons.querySelector("button.tel-download")) {
          const spacer = buttons.querySelector(".spacer");
          spacer.after(downloadButton);
        }
      }

      // Add/Update/Remove download button to topbar
      if (mediaViewerActions.querySelector("button.tel-download")) {
        const telDownloadButton = mediaViewerActions.querySelector(
          "button.tel-download"
        );
        if (
          mediaViewerActions.querySelectorAll('button[title="Download"]')
            .length > 1
        ) {
          // There's existing download button, remove ours
          mediaViewerActions.querySelector("button.tel-download").remove();
        } else if (
          telDownloadButton.getAttribute("data-tel-download-url") !== videoUrl
        ) {
          // Update existing button
          telDownloadButton.onclick = () => {
            const dataMid = mediaContainer.getAttribute('data-mid') || mediaContainer.closest('[data-mid]')?.getAttribute('data-mid');
            tel_download_video(videoPlayer.querySelector("video").currentSrc, dataMid);
          };
          telDownloadButton.setAttribute("data-tel-download-url", videoUrl);
        }
      } else if (
        !mediaViewerActions.querySelector('button[title="Download"]')
      ) {
        // Add the button if there's no download button at all
        mediaViewerActions.prepend(downloadButton);
      }
    } else if (img && img.src) {
      downloadButton.setAttribute("data-tel-download-url", img.src);
      downloadButton.appendChild(downloadIcon);
      downloadButton.onclick = () => {
        const dataMid = mediaContainer.getAttribute('data-mid') || mediaContainer.closest('[data-mid]')?.getAttribute('data-mid');
        tel_download_image(img.src, dataMid);
      };

      // Add/Update/Remove download button to topbar
      if (mediaViewerActions.querySelector("button.tel-download")) {
        const telDownloadButton = mediaViewerActions.querySelector(
          "button.tel-download"
        );
        if (
          mediaViewerActions.querySelectorAll('button[title="Download"]')
            .length > 1
        ) {
          // There's existing download button, remove ours
          mediaViewerActions.querySelector("button.tel-download").remove();
        } else if (
          telDownloadButton.getAttribute("data-tel-download-url") !== img.src
        ) {
          // Update existing button
          telDownloadButton.onclick = () => {
            const dataMid = mediaContainer.getAttribute('data-mid') || mediaContainer.closest('[data-mid]')?.getAttribute('data-mid');
            tel_download_image(img.src, dataMid);
          };
          telDownloadButton.setAttribute("data-tel-download-url", img.src);
        }
      } else if (
        !mediaViewerActions.querySelector('button[title="Download"]')
      ) {
        // Add the button if there's no download button at all
        mediaViewerActions.prepend(downloadButton);
      }
    }
  }, REFRESH_DELAY);

  // For webk /k/ webapp
  setInterval(() => {
    /* Voice Message or Circle Video */
    const pinnedAudio = document.body.querySelector(".pinned-audio");
    let dataMid;
    let downloadButtonPinnedAudio =
      document.body.querySelector("._tel_download_button_pinned_container") ||
      document.createElement("button");
    if (pinnedAudio) {
      dataMid = pinnedAudio.getAttribute("data-mid");
      downloadButtonPinnedAudio.className =
        "btn-icon tgico-download _tel_download_button_pinned_container";
      downloadButtonPinnedAudio.innerHTML = `<span class="tgico button-icon">${DOWNLOAD_ICON}</span>`;
    }
    const audioElements = document.body.querySelectorAll("audio-element");
    audioElements.forEach((audioElement) => {
      const bubble = audioElement.closest(".bubble");
      if (
        !bubble ||
        bubble.querySelector("._tel_download_button_pinned_container")
      ) {
        return; /* Skip if there's already a download button */
      }
      if (
        dataMid &&
        downloadButtonPinnedAudio.getAttribute("data-mid") !== dataMid &&
        audioElement.getAttribute("data-mid") === dataMid
      ) {
        downloadButtonPinnedAudio.onclick = (e) => {
          e.stopPropagation();
          if (isAudio) {
              tel_download_audio(link);
          } else {
              tel_download_video(link);
          }
        };
        downloadButtonPinnedAudio.setAttribute("data-mid", dataMid);
        const link = audioElement.audio && audioElement.audio.getAttribute("src");
        const isAudio = audioElement.audio && audioElement.audio instanceof HTMLAudioElement
        if (link) {
          pinnedAudio
            .querySelector(".pinned-container-wrapper-utils")
            .appendChild(downloadButtonPinnedAudio);
        }
      }
    });

    // Stories
    const storiesContainer = document.getElementById("stories-viewer");
    if (storiesContainer) {
      const createDownloadButton = () => {
        const downloadButton = document.createElement("button");
        downloadButton.className = "btn-icon rp tel-download";
        downloadButton.innerHTML = `<span class="tgico">${DOWNLOAD_ICON}</span><div class="c-ripple"></div>`;
        downloadButton.setAttribute("type", "button");
        downloadButton.setAttribute("title", "Download");
        downloadButton.setAttribute("aria-label", "Download");
        downloadButton.onclick = () => {
          // 1. Story with video
          const video = storiesContainer.querySelector("video.media-video");
          const videoSrc =
            video?.src ||
            video?.currentSrc ||
            video?.querySelector("source")?.src;
          if (videoSrc) {
            const dataMid = storiesContainer.getAttribute('data-mid') || storiesContainer.closest('[data-mid]')?.getAttribute('data-mid');
            tel_download_video(videoSrc, dataMid);
          } else {
            // 2. Story with image
            const imageSrc =
              storiesContainer.querySelector("img.media-photo")?.src;
            const dataMid = storiesContainer.getAttribute('data-mid') || storiesContainer.closest('[data-mid]')?.getAttribute('data-mid');
            if (imageSrc) tel_download_image(imageSrc, dataMid);
          }
        };
        return downloadButton;
      };

      const storyHeader = storiesContainer.querySelector(
        "[class^='_ViewerStoryHeaderRight']"
      );
      if (storyHeader && !storyHeader.querySelector(".tel-download")) {
        storyHeader.prepend(createDownloadButton());
      }

      const storyFooter = storiesContainer.querySelector(
        "[class^='_ViewerStoryFooterRight']"
      );
      if (storyFooter && !storyFooter.querySelector(".tel-download")) {
        storyFooter.prepend(createDownloadButton());
      }
    }

    // All media opened are located in .media-viewer-movers > .media-viewer-aspecter
    const mediaContainer = document.querySelector(".media-viewer-whole");
    if (!mediaContainer) return;
    const mediaAspecter = mediaContainer.querySelector(
      ".media-viewer-movers .media-viewer-aspecter"
    );
    const mediaButtons = mediaContainer.querySelector(
      ".media-viewer-topbar .media-viewer-buttons"
    );
    if (!mediaAspecter || !mediaButtons) return;

    // Query hidden buttons and unhide them
    const hiddenButtons = mediaButtons.querySelectorAll("button.btn-icon.hide");
    let onDownload = null;
    for (const btn of hiddenButtons) {
      btn.classList.remove("hide");
      if (btn.textContent === FORWARD_ICON) {
        btn.classList.add("tgico-forward");
      }
      if (btn.textContent === DOWNLOAD_ICON) {
        btn.classList.add("tgico-download");
        // Use official download buttons
        onDownload = () => {
          btn.click();
        };
        logger.info("onDownload", onDownload);
      }
    }

    if (mediaAspecter.querySelector(".ckin__player")) {
      // 1. Video player detected - Video and it has finished initial loading
      // container > .ckin__player > video[src]

      // add download button to videos
      const controls = mediaAspecter.querySelector(
        ".default__controls.ckin__controls"
      );
      if (controls && !controls.querySelector(".tel-download")) {
        const brControls = controls.querySelector(
          ".bottom-controls .right-controls"
        );
        const downloadButton = document.createElement("button");
        downloadButton.className =
          "btn-icon default__button tgico-download tel-download";
        downloadButton.innerHTML = `<span class="tgico">${DOWNLOAD_ICON}</span>`;
        downloadButton.setAttribute("type", "button");
        downloadButton.setAttribute("title", "Download");
        downloadButton.setAttribute("aria-label", "Download");
        if (onDownload) {
          downloadButton.onclick = onDownload;
        } else {
          downloadButton.onclick = () => {
            const dataMid = mediaContainer.getAttribute('data-mid') || mediaContainer.closest('[data-mid]')?.getAttribute('data-mid');
            tel_download_video(mediaAspecter.querySelector("video").src, dataMid);
          };
        }
        brControls.prepend(downloadButton);
      }
    } else if (
      mediaAspecter.querySelector("video") &&
      mediaAspecter.querySelector("video") &&
      !mediaButtons.querySelector("button.btn-icon.tgico-download")
    ) {
      // 2. Video HTML element detected, could be either GIF or unloaded video
      // container > video[src]
      const downloadButton = document.createElement("button");
      downloadButton.className = "btn-icon tgico-download tel-download";
      downloadButton.innerHTML = `<span class="tgico button-icon">${DOWNLOAD_ICON}</span>`;
      downloadButton.setAttribute("type", "button");
      downloadButton.setAttribute("title", "Download");
      downloadButton.setAttribute("aria-label", "Download");
      if (onDownload) {
        downloadButton.onclick = onDownload;
      } else {
        downloadButton.onclick = () => {
          const dataMid = mediaContainer.getAttribute('data-mid') || mediaContainer.closest('[data-mid]')?.getAttribute('data-mid');
          tel_download_video(mediaAspecter.querySelector("video").src, dataMid);
        };
      }
      mediaButtons.prepend(downloadButton);
    } else if (!mediaButtons.querySelector("button.btn-icon.tgico-download")) {
      // 3. Image without download button detected
      // container > img.thumbnail
      if (
        !mediaAspecter.querySelector("img.thumbnail") ||
        !mediaAspecter.querySelector("img.thumbnail").src
      ) {
        return;
      }
      const downloadButton = document.createElement("button");
      downloadButton.className = "btn-icon tgico-download tel-download";
      downloadButton.innerHTML = `<span class="tgico button-icon">${DOWNLOAD_ICON}</span>`;
      downloadButton.setAttribute("type", "button");
      downloadButton.setAttribute("title", "Download");
      downloadButton.setAttribute("aria-label", "Download");
      if (onDownload) {
        downloadButton.onclick = onDownload;
      } else {
        downloadButton.onclick = () => {
          const dataMid = mediaContainer.getAttribute('data-mid') || mediaContainer.closest('[data-mid]')?.getAttribute('data-mid');
          tel_download_image(mediaAspecter.querySelector("img.thumbnail").src, dataMid);
        };
      }
      mediaButtons.prepend(downloadButton);
    }
  }, REFRESH_DELAY);

  // Progress bar container setup
  (function setupProgressBar() {
    const body = document.querySelector("body");
    const container = document.createElement("div");
    container.id = "tel-downloader-progress-bar-container";
    container.style.position = "fixed";
    container.style.bottom = 0;
    container.style.right = 0;
    if (location.pathname.startsWith("/k/")) {
      container.style.zIndex = 4;
    } else {
      container.style.zIndex = 1600;
    }
    body.appendChild(container);
  })();

  // Persistent album state helpers (per-album keys)
  const ALBUM_STORAGE_KEY_BASE = 'tel_album_states_v1';

  // Migrate legacy aggregated storage key to per-album keys
  const migrateAlbumStates = () => {
    try {
      const raw = localStorage.getItem(ALBUM_STORAGE_KEY_BASE);
      if (!raw) return; // nothing to migrate
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        Object.keys(parsed).forEach((albumMid) => {
          try {
            localStorage.setItem(
              `${ALBUM_STORAGE_KEY_BASE}_${albumMid}`,
              JSON.stringify(parsed[albumMid])
            );
          } catch (e) {
            logger.error('Failed to migrate album state for ' + albumMid + ': ' + (e?.message || e));
          }
        });
        // Remove legacy aggregated key after migrating
        localStorage.removeItem(ALBUM_STORAGE_KEY_BASE);
        logger.info('Migrated album states to per-album keys');
      }
    } catch (e) {
      logger.error('Migration failed: ' + (e?.message || e));
    }
  };

  const getAlbumState = (albumMid) => {
    try {
      const key = `${ALBUM_STORAGE_KEY_BASE}_${albumMid}`;
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : { status: null, items: {} };
    } catch (e) {
      logger.error('Failed to get album state: ' + (e?.message || e));
      return { status: null, items: {} };
    }
  };

  const setAlbumState = (albumMid, state) => {
    try {
      const key = `${ALBUM_STORAGE_KEY_BASE}_${albumMid}`;
      localStorage.setItem(key, JSON.stringify(state));
    } catch (e) {
      logger.error('Failed to set album state: ' + (e?.message || e));
    }
  };

  const createBadgeForAlbum = (album, initStatus = null) => {
    try {
      if (getComputedStyle(album).position === 'static') {
        album.style.position = 'relative';
      }
      const existing = album.querySelector('.tel-album-scanned-badge');
      const albumMid = album.getAttribute && album.getAttribute('data-mid');
      let state = albumMid ? getAlbumState(albumMid) : { status: null, items: {} };
      if (initStatus && !state.status) {
        state.status = initStatus;
        if (albumMid) setAlbumState(albumMid, state);
      }
      if (existing) {
        const label = state.status === 'downloaded' ? 'Downloaded' : (state.status === 'partial' ? 'Partial downloaded' : 'Scanned');
        existing.innerText = label;
        // Ensure it's inside a badge wrapper for proper layout
        try {
          let wrap = existing.parentNode;
          if (!wrap || !wrap.classList || !wrap.classList.contains('tel-album-badge-wrap')) {
            wrap = document.createElement('div');
            wrap.className = 'tel-album-badge-wrap';
            wrap.style.position = 'absolute';
            wrap.style.top = '8px';
            wrap.style.right = '8px';
            wrap.style.zIndex = 9999;
            wrap.style.display = 'flex';
            wrap.style.alignItems = 'center';
            wrap.style.gap = '8px';
            try { existing.remove(); } catch (e) {}
            wrap.appendChild(existing);
            album.appendChild(wrap);
          }
        } catch (e) {}
        return existing;
      }

      const badge = document.createElement('button');
      badge.className = 'tel-album-scanned-badge';
      badge.title = 'Download album';
      // badge will be placed inside a wrapper for correct layout
      badge.style.padding = '4px 8px';
      badge.style.borderRadius = '12px';
      badge.style.background = '#6093B5';
      badge.style.color = 'white';
      badge.style.border = 'none';
      badge.style.cursor = 'pointer';
      badge.style.display = 'inline-flex';
      badge.style.alignItems = 'center';
      badge.style.justifyContent = 'center';
      badge.style.whiteSpace = 'nowrap';
      badge.style.boxSizing = 'border-box';
      badge.innerText = state.status === 'downloaded' ? 'Downloaded' : (state.status === 'partial' ? 'Partial downloaded' : 'Scanned');

      // create wrapper and append badge into it
      const badgeWrap = document.createElement('div');
      badgeWrap.className = 'tel-album-badge-wrap';
      badgeWrap.style.position = 'absolute';
      badgeWrap.style.top = '8px';
      badgeWrap.style.right = '8px';
      badgeWrap.style.zIndex = 9999;
      badgeWrap.style.display = 'flex';
      badgeWrap.style.alignItems = 'center';
      badgeWrap.style.gap = '8px';
      badgeWrap.appendChild(badge);
      album.appendChild(badgeWrap);

      const updateBadgeText = (s) => {
        try {
          badge.innerText = s;
        } catch (e) {}
        try {
          if (typeof ensureRedownloadButton === 'function') ensureRedownloadButton();
        } catch (e) {}
      };

      // Ensure redownload button exists when album is partial or downloaded
      const ensureRedownloadButton = () => {
        try {
          const existingR = badge.parentNode && badge.parentNode.querySelector('.tel-album-redownload');
          if (existingR) existingR.remove();

          if (state.status === 'downloaded' || state.status === 'partial') {
            const red = document.createElement('button');
            red.className = 'tel-album-redownload';
            red.title = 'Redownload album';
            red.innerText = 'Redownload';

            // Copy computed styles from the main badge so the buttons match exactly
            try {
              const cs = window.getComputedStyle(badge);
              red.style.padding = cs.padding || '4px 8px';
              red.style.borderRadius = cs.borderRadius || '12px';
              red.style.fontSize = cs.fontSize || '0.9rem';
              red.style.lineHeight = cs.lineHeight || '1';
              // Only set explicit height if computed height is pixels (avoid % or auto which can stretch)
              if (/^\d+px$/.test(cs.height)) red.style.height = cs.height;
              red.style.display = 'inline-flex';
              red.style.alignItems = 'center';
              red.style.justifyContent = 'center';
              red.style.whiteSpace = 'nowrap';
              red.style.boxSizing = 'border-box';
              red.style.marginLeft = '8px';
              // color & background (red variant)
              red.style.background = '#D16666';
              red.style.color = cs.color || 'white';
              red.style.border = 'none';
              red.style.cursor = 'pointer';
            } catch (e) {
              // Fallback styles
              red.style.marginLeft = '8px';
              red.style.padding = badge.style.padding || '4px 8px';
              red.style.borderRadius = badge.style.borderRadius || '12px';
              red.style.background = '#D16666';
              red.style.color = 'white';
              red.style.border = 'none';
              red.style.cursor = 'pointer';
              red.style.display = 'inline-block';
            }

            red.addEventListener('click', async (ev) => {
              ev.stopPropagation();
              red.disabled = true;
              badge.disabled = true;
              try {
                await forceRedownloadAlbum(album, albumMid);
              } catch (e) {
                logger.error('Redownload album failed: ' + (e?.message || e));
              } finally {
                red.disabled = false;
                badge.disabled = false;
                ensureRedownloadButton();
              }
            });

            // append red to same wrapper as the main badge for correct sizing and alignment
            try {
              const wrap = badge.parentNode && badge.parentNode.classList && badge.parentNode.classList.contains('tel-album-badge-wrap') ? badge.parentNode : null;
              if (wrap) wrap.appendChild(red); else badge.after(red);
            } catch (e) {
              try { badge.after(red); } catch (e) {}
            }
          }
        } catch (e) {
          logger.error('ensureRedownloadButton error: ' + (e?.message || e));
        }
      };

      badge.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        badge.disabled = true;
        // Gather album items; if none (single message), treat the attachment itself as one item
        let albumItems = Array.from(album.querySelectorAll('.album-item.grouped-item'));
        if (albumItems.length === 0) {
          const attach = album.querySelector('.attachment, .album-item, .album-item-media, .media-container');
          if (attach) albumItems = [attach];
        }

        // load latest state
        state = albumMid ? getAlbumState(albumMid) : state;
        for (const item of albumItems) {
          // For single-message attachments the item may not have its own data-mid,
          // so fall back to album's data-mid
          const itemMid = (item.getAttribute && item.getAttribute('data-mid')) || (album.getAttribute && album.getAttribute('data-mid'));
          if (itemMid && state.items && state.items[itemMid]) {
            logger.info('Skipping already downloaded item: ' + itemMid);
            continue;
          }

          // Detect video by presence of .video-time anywhere inside the item or a <video> element
        // This covers both grouped album items and single-message attachments
        const isVideo = !!(item.querySelector('.video-time') || item.querySelector('video'));
          if (isVideo) {
            // try to find a direct source as a fallback, but DO NOT use it immediately — we want to open the player first
            let directSrc =
              item.querySelector('video')?.currentSrc ||
              item.querySelector('video')?.src ||
              item.querySelector('video source')?.src ||
              item.querySelector('a')?.href ||
              item.querySelector('[data-src]')?.getAttribute('data-src');

            if (!directSrc) {
              const bg = item.style.backgroundImage || getComputedStyle(item).backgroundImage;
              const m = bg && bg.match(/url\(["']?(.*?)['"]?\)/);
              if (m && m[1]) directSrc = m[1];
            }


            // prefer using the directSrc after a HEAD check to avoid opening the viewer unnecessarily.
            else if (directSrc && (item.closest('.reply') || directSrc.includes('stream/') || directSrc.startsWith('blob:') || /\.mp4($|\?)/i.test(directSrc))) {
              try {
                let contentType = null;
                try {
                  const headRes = await fetch(directSrc, { method: 'HEAD' });
                  contentType = headRes.headers.get('Content-Type') || '';
                } catch (e) {
                  logger.info('HEAD check failed for direct src: ' + directSrc + ' (' + (e?.message || e) + ')');
                }

                if (!contentType || contentType.indexOf('text/html') !== 0) {
                  logger.info('Using direct video src for download: ' + directSrc);
                  await tel_download_video(directSrc, itemMid || undefined);
                  if (itemMid) {
                    state.items = state.items || {};
                    state.items[itemMid] = true;
                    if (albumMid) setAlbumState(albumMid, state);
                  }
                  await new Promise((r) => setTimeout(r, 200));
                  continue; // move to next item
                } else {
                  logger.info('Direct src HEAD returned HTML, will fall back to viewer probe: ' + directSrc);
                }
              } catch (e) {
                logger.error('Error while attempting direct src download: ' + (e?.message || e));
                // fall through to viewer probe
              }
            }

            // Use helper to probe viewer and extract a stream URL
            telSuppressMediaError = true;
            let probeRes = null;
            try {
              probeRes = await probeViewerStream(item, { maxAttempts: 3, timeout: 12000 });

              if (probeRes && probeRes.url) {
                const found = probeRes.url;
                const contentType = probeRes.contentType;

                if (contentType && contentType.indexOf('text/html') === 0) {
                  logger.info('Found URL returns text/html, skipping: ' + found);
                } else {
                  if (!(state.items && state.items[itemMid] === true)) {
                    logger.info('Found video in viewer, starting download: ' + found);
                    try {
                      if (typeof found === 'string' && found.startsWith('blob:')) {
                        logger.info('Found blob: URL, downloading with itemMid: ' + found);
                        try {
                          const fileName = await fetchAndSaveUrl(found, { filenameHint: itemMid, itemMid });
                          logger.info('Saved blob resource as: ' + fileName);
                          if (itemMid) { state.items = state.items || {}; state.items[itemMid] = true; if (albumMid) setAlbumState(albumMid, state); }
                        } catch (e) { logger.error('Direct fetch of blob URL failed: ' + (e?.message || e)); }
                      } else {
                        await tel_download_video(found, itemMid || undefined);
                        if (itemMid) { state.items = state.items || {}; state.items[itemMid] = true; if (albumMid) setAlbumState(albumMid, state); }
                      }
                    } catch (e) {
                      logger.error('Download failed for: ' + found + ' - ' + (e?.message || e));
                    }
                  } else {
                    logger.info('Skipping already downloaded item (by mid) while processing found video');
                  }
                }
                await new Promise((r) => setTimeout(r, 200));
              } else {
                logger.info('Unable to extract video URL from viewer within timeout');
                // Fallback to direct src if probe failed
                if (directSrc) {
                  try {
                    logger.info('Falling back to direct src for download: ' + directSrc);
                    if (directSrc.startsWith('blob:')) {
                      logger.info('Direct src is a blob: URL; downloading with itemMid');
                      try {
                        const fileName = await fetchAndSaveUrl(directSrc, { filenameHint: itemMid, itemMid });
                        logger.info('Saved direct blob resource as: ' + fileName);
                        if (itemMid) { state.items = state.items || {}; state.items[itemMid] = true; if (albumMid) setAlbumState(albumMid, state); }
                      } catch (e) {
                        logger.error('Direct fetch of blob directSrc failed: ' + (e?.message || e));
                      }
                    } else {
                      await tel_download_video(directSrc, itemMid || undefined);
                      if (itemMid) { state.items = state.items || {}; state.items[itemMid] = true; if (albumMid) setAlbumState(albumMid, state); }
                    }
                  } catch (e) {
                    logger.error('Fallback download failed for: ' + directSrc + ' - ' + (e?.message || e));
                  }
                }
              }
            } finally {
              // Close viewer and remove handler
              try {
                const closeBtn = document.querySelector('#MediaViewer button[aria-label="Close"], #MediaViewer button[title="Close"], .media-viewer-whole .close');
                if (closeBtn) {
                  closeBtn.click();
                } else {
                  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
                }
              } catch (e) {
                logger.error('Error closing viewer: ' + (e?.message || e));
              }
              // Disable global suppression when done probing
              telSuppressMediaError = false;
            }

            // small pause to ensure viewer closed before next item
            await new Promise((r) => setTimeout(r, 250));
          } else {
            const imgEl = item.querySelector('img');
            if (imgEl && imgEl.src) {
              const src = imgEl.src;
              if (!(itemMid && state.items && state.items[itemMid])) {
                logger.info('Downloading media: ' + src);
                // Use itemMid or blob id as filename hint when possible
                const hint = itemMid ? itemMid : (extractBlobIdFromUrl(src) || undefined);

                // For images we do NOT open the viewer. Use existing image download logic
                // which fetches blob and preserves an appropriate extension/filename.
                try {
                  await tel_download_image(src, hint);
                } catch (e) {
                  logger.error('Image download failed: ' + (e?.message || e));
                }

                if (itemMid) {
                  state.items = state.items || {};
                  state.items[itemMid] = true;
                  if (albumMid) setAlbumState(albumMid, state);
                }
                await new Promise((r) => setTimeout(r, 150));
                continue;
              } else {
                logger.info('Skipping duplicate media: ' + src);
                continue;
              }
            }

            const bg = item.style.backgroundImage || getComputedStyle(item).backgroundImage;
            const m = bg && bg.match(/url\(["']?(.*?)["']?\)/);
            if (m && m[1]) {
              const src = m[1];
              if (!(itemMid && state.items && state.items[itemMid])) {
                logger.info('Downloading media: ' + src);
                tel_download_image(src);
                if (itemMid) {
                  state.items = state.items || {};
                  state.items[itemMid] = true;
                  if (albumMid) setAlbumState(albumMid, state);
                }
                await new Promise((r) => setTimeout(r, 150));
                continue;
              } else {
                logger.info('Skipping duplicate media: ' + src);
                continue;
              }
            }

            logger.info('No media detected in album item.');
          }
        }

        // Update album status
        const total = album.querySelectorAll('.album-item.grouped-item').length || albumItems.length;
        const downloaded = Object.keys(state.items || {}).length;
        if (downloaded >= total) {
          state.status = 'downloaded';
        } else if (downloaded > 0) {
          state.status = 'partial';
        } else {
          state.status = 'scanned';
        }
        if (albumMid) setAlbumState(albumMid, state);
        updateBadgeText(state.status === 'downloaded' ? 'Downloaded' : (state.status === 'partial' ? 'Partial downloaded' : 'Scanned'));

        badge.disabled = false;
      });

      // Badge already appended inside wrapper; ensure redownload UI is present when appropriate
      ensureRedownloadButton();
      return badge;
    } catch (e) {
      logger.error('createBadgeForAlbum error: ' + (e.message || e));
    }
  };

  // Force redownload helper: re-download items regardless of storage and override only those re-downloaded
  const forceRedownloadAlbum = async (album, albumMid) => {
    try {
      const state = albumMid ? getAlbumState(albumMid) : { status: null, items: {} };
      state.items = state.items || {};

      let albumItems = Array.from(album.querySelectorAll('.album-item.grouped-item'));
      if (albumItems.length === 0) {
        const attach = album.querySelector('.attachment, .album-item, .album-item-media, .media-container');
        if (attach) albumItems = [attach];
      }

      for (const item of albumItems) {
        const itemMid = (item.getAttribute && item.getAttribute('data-mid')) || null;
        // Identify video by presence of .video-time anywhere inside the item or a <video> element
        const isVideo = !!(item.querySelector('.video-time') || item.querySelector('video'));

        if (!isVideo) {
          // Image — download immediately
          const imgEl = item.querySelector('img') || item.querySelector('canvas.media-photo');
          const bg = (item.style && item.style.backgroundImage) || getComputedStyle(item).backgroundImage;
          const m = bg && bg.match(/url\(["']?(.*?)['"]?\)/);
          const src = (imgEl && imgEl.src) || (m && m[1]);
          if (src) {
            logger.info('Redownloading image: ' + src);
            try {
              const hint = itemMid ? itemMid : (extractBlobIdFromUrl(src) || undefined);

              try {
                await tel_download_image(src, hint);
              } catch (e) {
                logger.error('Redownload image failed: ' + (e?.message || e));
              }

              if (itemMid) {
                state.items[itemMid] = true;
                if (albumMid) setAlbumState(albumMid, state);
              }
            } catch (e) {
              logger.error('Redownload image failed: ' + (e?.message || e));
            }
          }
          await new Promise(r => setTimeout(r, 200));
          continue;
        }

        // Video — open the viewer first and probe for a stream; fall back to direct src if probing fails
        let directSrc = item.querySelector('video')?.currentSrc || item.querySelector('video')?.src || item.querySelector('video source')?.src || item.querySelector('a')?.href || item.querySelector('[data-src]')?.getAttribute('data-src');
        if (!directSrc) {
          const bg = item.style.backgroundImage || getComputedStyle(item).backgroundImage;
          const mm = bg && bg.match(/url\(["']?(.*?)['"]?\)/);
          if (mm && mm[1]) directSrc = mm[1];
        }

        // Prefer direct src for redownload when safe (reply/stream/blob/mp4)
        else if (directSrc && (item.closest('.reply') || directSrc.includes('stream/') || directSrc.startsWith('blob:') || /\.mp4($|\?)/i.test(directSrc))) {
          try {
            let contentType = null;
            try {
              const headRes = await fetch(directSrc, { method: 'HEAD' });
              contentType = headRes.headers.get('Content-Type') || '';
            } catch (e) {
              logger.info('HEAD check failed for direct src during redownload: ' + directSrc + ' (' + (e?.message || e) + ')');
            }

            if (!contentType || contentType.indexOf('text/html') !== 0) {
              logger.info('Using direct video src for redownload: ' + directSrc);
              try {
                await tel_download_video(directSrc, itemMid || undefined);
                if (itemMid) {
                  state.items[itemMid] = true;
                  if (albumMid) setAlbumState(albumMid, state);
                }
              } catch (e) {
                logger.error('Redownload direct src failed: ' + (e?.message || e));
              }
              await new Promise(r => setTimeout(r, 200));
              continue; // next item
            } else {
              logger.info('Direct src HEAD returned HTML during redownload, will fall back to viewer probe: ' + directSrc);
            }
          } catch (e) {
            logger.error('Error while attempting direct src redownload: ' + (e?.message || e));
            // fall through to viewer probe
          }
        }

        // Otherwise open viewer and extract using the probe helper
        telSuppressMediaError = true;
        try {
          const probeRes = await probeViewerStream(item, { maxAttempts: 3, timeout: 12000 });
          if (probeRes && probeRes.url) {
            const found = probeRes.url;

            logger.info('Redownloading video (viewer): ' + found);
            try {
              if (typeof found === 'string' && found.startsWith('blob:')) {
                logger.info('Found blob: URL in redownload; downloading with itemMid');
                try {
                  const fileName = await fetchAndSaveUrl(found, { filenameHint: itemMid, itemMid });
                  logger.info('Saved redownloaded blob as: ' + fileName);
                  if (itemMid) {
                    state.items[itemMid] = state.items || {};
                    state.items[itemMid] = true;
                    if (albumMid) setAlbumState(albumMid, state);
                  }
                } catch (e) {
                  logger.error('Direct fetch of blob URL failed during redownload: ' + (e?.message || e));
                }
              } else {
                await tel_download_video(found, itemMid || undefined);
                if (itemMid) {
                  state.items[itemMid] = true;
                  if (albumMid) setAlbumState(albumMid, state);
                }
              }
            } catch (e) {
              logger.error('Redownload video (viewer) failed: ' + (e?.message || e));
            }
          } else {
            logger.info('Redownload: unable to extract video URL within timeout');
            if (directSrc) {
              try {
                logger.info('Falling back to direct src for redownload: ' + directSrc);
                if (directSrc.startsWith('blob:')) {
                  logger.info('Direct src is a blob: URL; downloading with itemMid');
                  try {
                    const fileName = await fetchAndSaveUrl(directSrc, { filenameHint: itemMid, itemMid });
                    logger.info('Saved redownloaded blob (direct src) as: ' + fileName);
                    if (itemMid) {
                      state.items[itemMid] = true;
                      if (albumMid) setAlbumState(albumMid, state);
                    }
                  } catch (e) {
                    logger.error('Direct fetch of blob directSrc failed during redownload: ' + (e?.message || e));
                  }
                } else {
                  await tel_download_video(directSrc, itemMid || undefined);
                  if (itemMid) {
                    state.items[itemMid] = true;
                    if (albumMid) setAlbumState(albumMid, state);
                  }
                }
              } catch (e) {
                logger.error('Fallback redownload failed for: ' + directSrc + ' - ' + (e?.message || e));
              }
            }
          }
        } finally {
          // close viewer
          try {
            const closeBtn = document.querySelector('#MediaViewer button[aria-label="Close"], #MediaViewer button[title="Close"], .media-viewer-whole .close');
            if (closeBtn) closeBtn.click(); else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
          } catch (e) {}
          telSuppressMediaError = false;
          await new Promise(r => setTimeout(r, 250));
        }
      }

      // After redownloads, update album status (only modify items we changed above)
      const total = album.querySelectorAll('.album-item.grouped-item').length || albumItems.length;
      const downloaded = Object.keys(state.items || {}).filter(k => state.items[k] === true).length;
      state.status = downloaded >= total ? 'downloaded' : (downloaded > 0 ? 'partial' : 'scanned');
      if (albumMid) setAlbumState(albumMid, state);

      // Update badge text
      const b = album.querySelector('.tel-album-scanned-badge');
      if (b) b.innerText = state.status === 'downloaded' ? 'Downloaded' : (state.status === 'partial' ? 'Partial downloaded' : 'Scanned');
      // Ensure redownload button remains when appropriate
      if (b) {
        const existingR = b.parentNode && b.parentNode.querySelector('.tel-album-redownload');
        if (existingR) existingR.remove();
        if (state.status === 'downloaded' || state.status === 'partial') createBadgeForAlbum(album);
      }

    } catch (e) {
      logger.error('forceRedownloadAlbum error: ' + (e?.message || e));
    }
  };

  // Load existing badges from storage on start (scan per-album keys)
  const loadSavedBadges = () => {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith(ALBUM_STORAGE_KEY_BASE + '_')) continue;
        const albumMid = key.substring((ALBUM_STORAGE_KEY_BASE + '_').length);
        // Look for album, single-message (group-first), or single-message (group-last) elements
        let album = document.querySelector('.is-album[data-mid="' + albumMid + '"]');
        // Fallback: the element with data-mid might *contain* multiple album items — treat that as an album to restore badge
        if (!album) {
          const candidate = document.querySelector('[data-mid="' + albumMid + '"]');
          if (candidate && candidate.querySelectorAll && candidate.querySelectorAll('.album-item.grouped-item').length > 1) album = candidate;
        }
        if (album) createBadgeForAlbum(album);
      }
    } catch (e) {
      logger.error('loadSavedBadges error: ' + (e?.message || e));
    }
  };

  // Album scanning & badge download feature
  // When a `.media-photo` is clicked inside an `.is-album` parent, mark the album with
  // a clickable "Scanned" badge that downloads all media inside that album.
  const addAlbumScanFeature = () => {
    document.body.addEventListener('click', (e) => {
      try {
        const clicked = e.target;
        // Accept clicks on images, canvases, videos, play buttons, replies, or the container around them
        let target = clicked.closest && (
          clicked.closest('.media-photo') ||
          clicked.closest('.canvas-thumbnail') ||
          clicked.closest('.media-video') ||
          clicked.closest('.media-container') ||
          clicked.closest('.media-container-aspecter') ||
          clicked.closest('.attachment') ||
          clicked.closest('.video-play') ||
          clicked.closest('.btn-circle.video-play') ||
          clicked.closest('.reply') ||
          clicked.closest('.reply-content') ||
          clicked.closest('.reply-media') ||
          clicked.closest('.album-item') ||
          clicked.closest('.album-item-media')
        );
        if (!target) return;
        // If the target is a container, find the actual media element inside it
        let media = null;
        if (target.matches && target.matches('.media-photo, .canvas-thumbnail, .media-video, .video-play, .btn-circle.video-play')) {
          media = target;
        } else if (target.querySelector) {
          media = target.querySelector('.media-photo, .canvas-thumbnail, .media-video, .video-play, .btn-circle.video-play, .canvas-thumbnail');
        }
        if (!media) return;

        // Only treat true multi-item albums as albums. Do not mark single-message bubbles as scanned.
        let album = media.closest && media.closest('.is-album');
        if (!album) {
          // Secondary check: accept an ancestor that contains multiple album items
          const ancestor = media.closest && media.closest('[data-mid]');
          if (ancestor && ancestor.querySelectorAll && ancestor.querySelectorAll('.album-item.grouped-item').length > 1) {
            album = ancestor;
          }
        }

        if (!album) return;

        const albumMid = album.getAttribute && album.getAttribute('data-mid');
        // create or update badge and mark scanned
        const badge = createBadgeForAlbum(album, 'scanned');
        if (albumMid) {
          const st = getAlbumState(albumMid);
          st.status = st.status || 'scanned';
          setAlbumState(albumMid, st);
        }
      } catch (err) {
        logger.error(err?.message || err);
      }
    }, true);

    loadSavedBadges();

    // Observe DOM for new albums and restore badge if saved state exists (per-album keys)
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        // Handle newly added nodes
        for (const node of m.addedNodes) {
          if (!(node instanceof Element)) continue;
          const checkAndCreate = (el) => {
            const albumMid = el.getAttribute && el.getAttribute('data-mid');
            if (!albumMid) return;
            const key = `${ALBUM_STORAGE_KEY_BASE}_${albumMid}`;
            if (localStorage.getItem(key)) createBadgeForAlbum(el);
          };

          if (node.matches && node.matches('.is-album')) {
            checkAndCreate(node);
          }
          const albums = node.querySelectorAll && node.querySelectorAll('.is-album');
          if (albums && albums.length) {
            albums.forEach((a) => checkAndCreate(a));
          }
        }

        // Handle attribute changes (e.g., data-mid or class added later)
        if (m.type === 'attributes' && m.target instanceof Element) {
          const el = m.target;
          // Element itself matches, or it contains a child that marks it as a group-first/last, or contains media nodes
          if (el.matches && (el.matches('.is-album') || (el.querySelectorAll && el.querySelectorAll('.album-item.grouped-item').length > 1))) {
            const albumMid = el.getAttribute('data-mid');
            if (albumMid) {
              const key = `${ALBUM_STORAGE_KEY_BASE}_${albumMid}`;
              if (localStorage.getItem(key)) createBadgeForAlbum(el);
            }
          }
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-mid'] });
  };
  // Perform one-time migration and then initialize features
  migrateAlbumStates();
  addAlbumScanFeature();

  logger.info("Completed script setup.");
})();
