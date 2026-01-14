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
    closeButton.style.cursor = "pointer";
    closeButton.style.fontSize = "1.2rem";
    closeButton.style.color = isDarkMode ? "#8a8a8a" : "white";
    closeButton.innerHTML = "&times;";
    closeButton.onclick = function () {
      container.removeChild(innerContainer);
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
    innerContainer.querySelector("p.filename").innerText = fileName;
    const progressBar = innerContainer.querySelector("div.progress");
    progressBar.querySelector("p").innerText = progress + "%";
    progressBar.querySelector("div").style.width = progress + "%";
  };

  const downloadCompletionResolvers = new Map();

  const completeProgress = (videoId) => {
    const container = document.getElementById("tel-downloader-progress-" + videoId);
    if (!container) return;
    const progressBar = container.querySelector("div.progress");
    progressBar.querySelector("p").innerText = "Completed";
    progressBar.querySelector("div").style.backgroundColor = "#B6C649";
    progressBar.querySelector("div").style.width = "100%";

    const r = downloadCompletionResolvers.get(videoId);
    if (r && r.resolve) {
      r.resolve();
      downloadCompletionResolvers.delete(videoId);
    }

    // Remove the progress UI after a short delay so users can see completion
    setTimeout(() => {
      try {
        container.remove();
      } catch (e) {}
    }, 800);
  };

  const AbortProgress = (videoId, err) => {
    const progressBar = document
      .getElementById("tel-downloader-progress-" + videoId)
      .querySelector("div.progress");
    progressBar.querySelector("p").innerText = "Aborted";
    progressBar.querySelector("div").style.backgroundColor = "#D16666";
    progressBar.querySelector("div").style.width = "100%";

    const r = downloadCompletionResolvers.get(videoId);
    if (r && r.reject) {
      r.reject(err || new Error('Aborted'));
      downloadCompletionResolvers.delete(videoId);
    }
  };

  const tel_download_video = (url) => {
    let _blobs = [];
    let _next_offset = 0;
    let _total_size = null;
    let _file_extension = "mp4";

    const videoId =
      (Math.random() + 1).toString(36).substring(2, 10) +
      "_" +
      Date.now().toString();
    let fileName = hashCode(url).toString(36) + "." + _file_extension;

    // Promise that resolves when download completes (or rejects on abort)
    const completionPromise = new Promise((resolve, reject) => {
      downloadCompletionResolvers.set(videoId, { resolve, reject });
    });

    // Some video src is in format:
    // 'stream/{"dcId":5,"location":{...},"size":...,"mimeType":"video/mp4","fileName":"xxxx.MP4"}'
    try {
      const metadata = JSON.parse(
        decodeURIComponent(url.split("/")[url.split("/").length - 1])
      );
      if (metadata.fileName) {
        fileName = metadata.fileName;
      }
    } catch (e) {
      // Invalid JSON string, pass extracting fileName
    }
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

          logger.info(
            `Get response: ${res.headers.get(
              "Content-Length"
            )} bytes data from ${res.headers.get("Content-Range")}`,
            fileName
          );
          logger.info(
            `Progress: ${((_next_offset * 100) / _total_size).toFixed(0)}%`,
            fileName
          );
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
            completeProgress(videoId);
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
    const fileName = hashCode(url).toString(36) + ".ogg";

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

  const tel_download_image = (imageUrl) => {
    const fileName =
      (Math.random() + 1).toString(36).substring(2, 10) + ".jpeg"; // assume jpeg

    const a = document.createElement("a");
    document.body.appendChild(a);
    a.href = imageUrl;
    a.download = fileName;
    a.click();
    document.body.removeChild(a);

    logger.info("Download triggered", fileName);
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
            tel_download_video(videoSrc);
          } else {
            // 2. Story with image
            const images = storiesContainer.querySelectorAll("img.PVZ8TOWS");
            if (images.length > 0) {
              const imageSrc = images[images.length - 1]?.src;
              if (imageSrc) tel_download_image(imageSrc);
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
        tel_download_video(videoPlayer.querySelector("video").currentSrc);
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
            tel_download_video(videoPlayer.querySelector("video").currentSrc);
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
        tel_download_image(img.src);
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
            tel_download_image(img.src);
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
            tel_download_video(videoSrc);
          } else {
            // 2. Story with image
            const imageSrc =
              storiesContainer.querySelector("img.media-photo")?.src;
            if (imageSrc) tel_download_image(imageSrc);
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
            tel_download_video(mediaAspecter.querySelector("video").src);
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
          tel_download_video(mediaAspecter.querySelector("video").src);
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
          tel_download_image(mediaAspecter.querySelector("img.thumbnail").src);
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

          // Detect video specifically by presence of .album-item-media .video-time as primary signal
        // Identify video only when the album-item-media contains .video-time (primary signal)
        const isVideo = !!item.querySelector('.album-item-media .video-time');
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

            // open viewer to extract streaming url with robust handling
            const opener = item.querySelector('a') || item;

            // Enable global suppression of MediaError unhandled rejections while probing
            telSuppressMediaError = true;

            try {
              // Attempt to start playback in-item if there's a play button to encourage the stream to start
              const playBtn = item.querySelector('.video-play, .btn-circle.video-play, .btn-circle.video-play.position-center, .toggle');
              const maxAttempts = 3;
              const baseTimeout = 12000; // ms
              let found = null;

              for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                try {
                  if (playBtn) {
                    try {
                      playBtn.click();
                      logger.info('Clicked in-item play button (attempt ' + attempt + ')');
                    } catch (e) {
                      logger.info('Play button click failed: ' + (e?.message || e));
                    }
                  }

                  try {
                    opener.click();
                  } catch (e) {
                    logger.info('Opener click failed: ' + (e?.message || e));
                  }

                  const timeout = baseTimeout;
                  const start = Date.now();

                  try {
                    while (Date.now() - start < timeout) {
                      const v = document.querySelector('#MediaViewer .MediaViewerSlide--active video, .media-viewer-whole video, video.media-video, .ckin__player video');
                      if (v) {
                        v.addEventListener('error', () => {
                          (async () => {
                            try {
                              const url = v.currentSrc || v.src;
                              if (!url) {
                                if (!telSuppressMediaError) logger.info('Video element reported an error with no src while probing viewer');
                                return;
                              }

                              // Try HEAD to see if URL returns HTML (service worker) or media
                              let contentType = null;
                              try {
                                const headRes = await fetch(url, { method: 'HEAD' });
                                contentType = headRes.headers.get('Content-Type') || '';
                              } catch (e) {
                                if (!telSuppressMediaError) logger.info('HEAD check failed for ' + url + ': ' + (e?.message || e));
                              }

                              if (contentType && contentType.indexOf('text/html') === 0) {
                                if (!telSuppressMediaError) logger.info('Viewer returned HTML, skipping video src: ' + url);
                                return;
                              }

                              if (!telSuppressMediaError) logger.info('Video element error while probing viewer for: ' + url + ' (Content-Type: ' + (contentType || 'unknown') + ')');
                            } catch (e) {
                              logger.error('Error in video error handler: ' + (e?.message || e));
                            }
                          })();
                        }, { once: true });
                      }

                      const s = v && (v.currentSrc || v.src);
                      if (s) {
                        found = s;
                        break;
                      }

                      const streamLink = document.querySelector('#MediaViewer a[href*="stream/"]')?.href || document.querySelector('.media-viewer-whole a[href*="stream/"]')?.href;
                      if (streamLink) {
                        found = streamLink;
                        break;
                      }

                      await new Promise((r) => setTimeout(r, 200));
                    }
                  } catch (e) {
                    logger.error('Error while probing viewer: ' + (e?.message || e));
                  }

                  if (found) break; // success

                  // retry backoff if not found
                  if (attempt < maxAttempts) {
                    const backoff = 500 * attempt;
                    logger.info('Viewer probe no result, retrying after ' + backoff + 'ms (attempt ' + (attempt + 1) + ')');
                    await new Promise((r) => setTimeout(r, backoff));
                  }
                } catch (e) {
                  logger.error('Unexpected error in probe attempt: ' + (e?.message || e));
                }
              }

              if (found) {
                try {
                  // Quick HEAD check to avoid HTML responses that browsers can't decode as media
                  let contentType = null;
                  try {
                    const headRes = await fetch(found, { method: 'HEAD' });
                    contentType = headRes.headers.get('Content-Type') || '';
                  } catch (e) {
                    logger.info('HEAD check failed for: ' + found + ' (' + (e?.message || e) + ')');
                  }

                  if (contentType && contentType.indexOf('text/html') === 0) {
                    logger.info('Found URL returns text/html, skipping: ' + found);
                  } else {
                    if (!(state.items && state.items[itemMid] === true)) {
                      logger.info('Found video in viewer, starting download: ' + found);
                      try {
                        await tel_download_video(found);
                        if (itemMid) {
                          state.items = state.items || {};
                          state.items[itemMid] = true;
                          if (albumMid) setAlbumState(albumMid, state);
                        }
                      } catch (e) {
                        logger.error('Download failed for: ' + found + ' - ' + (e?.message || e));
                      }
                    } else {
                      logger.info('Skipping already downloaded item (by mid) while processing found video');
                    }
                  }
                } catch (e) {
                  logger.error('Error processing found video URL: ' + (e?.message || e));
                }
                await new Promise((r) => setTimeout(r, 200));
              } else {
                logger.info('Unable to extract video URL from viewer within timeout');
                // Fallback to direct src if probe failed
                if (directSrc) {
                  try {
                    logger.info('Falling back to direct src for download: ' + directSrc);
                    await tel_download_video(directSrc);
                    if (itemMid) {
                      state.items = state.items || {};
                      state.items[itemMid] = true;
                      if (albumMid) setAlbumState(albumMid, state);
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
        // Identify video only when the album-item-media contains .video-time (primary signal)
        const isVideo = !!item.querySelector('.album-item-media .video-time');

        if (!isVideo) {
          // Image — download immediately
          const imgEl = item.querySelector('img') || item.querySelector('canvas.media-photo');
          const bg = (item.style && item.style.backgroundImage) || getComputedStyle(item).backgroundImage;
          const m = bg && bg.match(/url\(["']?(.*?)['"]?\)/);
          const src = (imgEl && imgEl.src) || (m && m[1]);
          if (src) {
            logger.info('Redownloading image: ' + src);
            try {
              await tel_download_image(src);
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

        // Otherwise open viewer and extract
        telSuppressMediaError = true;
        try {
          const opener = item.querySelector('a') || item;
          try { opener.click(); } catch (e) { logger.info('Opener click failed during redownload: ' + (e?.message || e)); }

          const timeout = 12000; // wait longer for redownload
          const start = Date.now();
          let found = null;
          while (Date.now() - start < timeout) {
            const v = document.querySelector('#MediaViewer .MediaViewerSlide--active video, .media-viewer-whole video, video.media-video, .ckin__player video');
            const s = v && (v.currentSrc || v.src);
            if (s) {
              try { found = new URL(s, location.href).href; } catch(e) { found = s; }
              break;
            }
            const streamLink = document.querySelector('#MediaViewer a[href*="stream/"]')?.href || document.querySelector('.media-viewer-whole a[href*="stream/"]')?.href;
            if (streamLink) { found = streamLink; break; }
            await new Promise(r => setTimeout(r, 300));
          }

          if (found) {
            logger.info('Redownloading video (viewer): ' + found);
            try {
              await tel_download_video(found);
              if (itemMid) {
                state.items[itemMid] = true;
                if (albumMid) setAlbumState(albumMid, state);
              }
            } catch (e) {
              logger.error('Redownload video (viewer) failed: ' + (e?.message || e));
            }
          } else {
            logger.info('Redownload: unable to extract video URL within timeout');
            if (directSrc) {
              try {
                logger.info('Falling back to direct src for redownload: ' + directSrc);
                await tel_download_video(directSrc);
                if (itemMid) {
                  state.items[itemMid] = true;
                  if (albumMid) setAlbumState(albumMid, state);
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
        // Look for both album and single-message (group-first) elements
        const album = document.querySelector('.is-album[data-mid="' + albumMid + '"]') || document.querySelector('.is-group-first[data-mid="' + albumMid + '"]');
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
        const media = clicked.closest && clicked.closest('.media-photo');
        if (!media) return;
        // Support both multi-item albums (.is-album) and single messages marked with
        // .is-group-first (single video/photo bubble in a grouped thread)
        const album =
          media.closest &&
          (media.closest('.is-album') || media.closest('.is-group-first'));
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

          if (node.matches && (node.matches('.is-album') || node.matches('.is-group-first'))) {
            checkAndCreate(node);
          }
          const albums = node.querySelectorAll && node.querySelectorAll('.is-album, .is-group-first');
          if (albums && albums.length) {
            albums.forEach((a) => checkAndCreate(a));
          }
        }

        // Handle attribute changes (e.g., data-mid or class added later)
        if (m.type === 'attributes' && m.target instanceof Element) {
          const el = m.target;
          if (el.matches && (el.matches('.is-album') || el.matches('.is-group-first'))) {
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
