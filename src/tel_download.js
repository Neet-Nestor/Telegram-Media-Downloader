// ==UserScript==
// @name         Telegram Media Downloader
// @name:en      Telegram Media Downloader
// @name:zh-CN   Telegram 受限图片视频下载器
// @name:zh-TW   Telegram 受限圖片影片下載器
// @name:ru      Telegram: загрузчик медиафайлов
// @version      1.213
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
  // WebK's icon font code points change between releases. Only learn the
  // download glyph from native buttons in this page, never from our own buttons.
  const WEB_K_DOWNLOAD_BUTTON_SELECTOR = [
    "button.quality-download-options-button-menu",
    "button.tgico-download",
    'button[aria-label="Download"]',
    'button[title="Download"]',
  ].join(", ");
  const getWebKDownloadButtons = (container) =>
    Array.from(container.querySelectorAll(WEB_K_DOWNLOAD_BUTTON_SELECTOR)).filter(
      (button) =>
        !button.matches(".tel-download, ._tel_download_button_pinned_container")
    );
  const isUsableDownloadButton = (button) => {
    if (button.disabled || button.getAttribute("aria-disabled") === "true" ||
        button.hidden || button.classList.contains("hide") || button.closest("[inert]")) {
      return false;
    }
    const style = getComputedStyle(button);
    return style.visibility !== "hidden" && style.visibility !== "collapse" &&
      button.getClientRects().length > 0;
  };
  let webKDownloadGlyph = "";
  const createWebKDownloadIcon = (buttonIcon = false) =>
    `<span class="tgico tel-download-icon${buttonIcon ? " button-icon" : ""}" aria-hidden="true">${
      webKDownloadGlyph ||
      '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle" aria-hidden="true" focusable="false"><path d="M12 3v12m-5-5 5 5 5-5M5 16v4h14v-4"/></svg>'
    }</span>`;
  const refreshWebKDownloadIcon = () => {
    for (const button of getWebKDownloadButtons(document)) {
      const glyph = button.querySelector(":scope > .tgico")?.textContent.trim();
      // Ignore labels or menu contents; the icon must be one private-use glyph.
      if (!glyph || !/^[\uE000-\uF8FF]$/.test(glyph)) continue;
      if (glyph !== webKDownloadGlyph) {
        // Keep this in memory only: a new page load may use a different font.
        webKDownloadGlyph = glyph;
        document.querySelectorAll(".tel-download-icon").forEach((icon) => {
          icon.textContent = glyph;
        });
      }
      return;
    }
  };
  const contentRangeRegex = /^bytes (\d+)-(\d+)\/(\d+)$/;
  const REFRESH_DELAY = 2000;
  const DOWNLOAD_CHUNK_SIZE = 4 * 1024 * 1024;
  const fetchMediaPart = async (url, offset, total, kind, options = {}) => {
    const controller = new AbortController();
    const abort = () => controller.abort(options.signal.reason);
    let timer;
    let reader;
    const resetTimeout = () => {
      clearTimeout(timer);
      timer = setTimeout(() => controller.abort(
        new DOMException("No data received for 30 seconds. Please retry.", "TimeoutError")
      ), 30000);
    };
    const checkAborted = () => {
      if (controller.signal.aborted) throw controller.signal.reason;
    };
    if (options.signal?.aborted) abort();
    options.signal?.addEventListener("abort", abort, { once: true });
    resetTimeout();
    try {
      checkAborted();
      const res = await fetch(url, {
        headers: { Range: `bytes=${offset}-${offset + DOWNLOAD_CHUNK_SIZE - 1}` },
        signal: controller.signal,
      });
      if (res.status !== 200 && res.status !== 206) {
        throw new Error(`Download request failed (HTTP ${res.status})`);
      }
      const mime = res.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase();
      if (!mime?.startsWith(`${kind}/`)) {
        throw new Error(`Expected ${kind}, received ${mime || "an unknown file type"}`);
      }
      let expectedSize;
      let totalSize;
      if (res.status === 206) {
        const match = res.headers.get("Content-Range")?.match(contentRangeRegex);
        if (!match) throw new Error("Missing or invalid Content-Range");
        const [start, end, size] = match.slice(1).map(Number);
        if (! [start, end, size].every(Number.isSafeInteger) ||
            start !== offset || end < start || size <= end ||
            (total !== null && total !== size)) {
          throw new Error("Inconsistent media range; download stopped to avoid a corrupt file");
        }
        expectedSize = end - start + 1;
        totalSize = size;
      } else {
        if (offset !== 0) throw new Error("Server stopped supporting partial downloads");
        const length = res.headers.get("Content-Length");
        if (length !== null && !res.headers.has("Content-Encoding")) {
          if (!/^\d+$/.test(length) || !Number.isSafeInteger(Number(length))) {
            throw new Error("Invalid Content-Length");
          }
          expectedSize = Number(length);
          totalSize = expectedSize;
        }
      }
      if (!res.body) throw new Error("Empty media response");
      reader = res.body.getReader();
      controller.signal.addEventListener("abort", () => {
        reader.cancel().catch(() => {});
      }, { once: true });
      const chunks = [];
      let received = 0;
      options.onProgress?.(offset, totalSize ?? null);
      while (true) {
        checkAborted();
        const { value, done } = await reader.read();
        checkAborted();
        if (done) break;
        received += value.byteLength;
        if (expectedSize !== undefined && received > expectedSize) {
          throw new Error("Media response exceeds the expected size");
        }
        // Wait for disk writes before reading more data, so slow disks do not
        // cause an unbounded queue of writes or large in-memory responses.
        clearTimeout(timer);
        if (options.write) await options.write(value);
        else chunks.push(value);
        checkAborted();
        resetTimeout();
        options.onProgress?.(offset + received, totalSize ?? null);
      }
      if (!received || (expectedSize !== undefined && received !== expectedSize)) {
        throw new Error("Incomplete media response; received byte count does not match");
      }
      return {
        blob: options.write ? null : new Blob(chunks, { type: mime }),
        mime, totalSize: totalSize ?? received, nextOffset: offset + received,
      };
    } catch (error) {
      controller.abort(error);
      throw controller.signal.reason || error;
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
      if (reader) {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
    }
  };
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

  const getMediaMetadata = (url) => {
    try {
      return JSON.parse(decodeURIComponent(url.split("/").pop()));
    } catch {
      return {};
    }
  };
  const getDownloadFileName = (url, mime, kind) => {
    const extensions = {
      "video/mp4": ["mp4", "m4v"], "video/webm": ["webm"],
      "video/quicktime": ["mov"], "video/x-matroska": ["mkv"],
      "audio/ogg": ["ogg", "oga", "opus"], "audio/mpeg": ["mp3"],
      "audio/mp4": ["m4a"], "audio/webm": ["webm"], "audio/aac": ["aac"],
      "audio/wav": ["wav"], "audio/x-wav": ["wav"],
      "image/jpeg": ["jpg", "jpeg"], "image/png": ["png"],
      "image/webp": ["webp"], "image/gif": ["gif"], "image/avif": ["avif"],
      "image/heic": ["heic"], "image/bmp": ["bmp"], "image/svg+xml": ["svg"],
    };
    const metadata = getMediaMetadata(url);
    let name = typeof metadata?.fileName === "string" ? metadata.fileName : "";
    if (!name) {
      try {
        const basename = decodeURIComponent(new URL(url, location.href).pathname.split("/").pop());
        if (/\.[a-z0-9]{2,5}$/i.test(basename)) name = basename;
      } catch {
        // Some blob URLs do not carry a filename.
      }
    }
    name = (name || hashCode(url).toString(36)).replace(/[\x00-\x1f\x7f<>:"/\\|?*]/g, "_");
    const allowed = extensions[mime?.toLowerCase()] || (mime ? null :
      (kind === "video" ? ["mp4"] : kind === "audio" ? ["ogg"] : ["jpg"]));
    const dot = name.lastIndexOf(".");
    if (!allowed) return dot > 0 ? name : name + ".bin";
    if (dot > 0 && allowed.includes(name.slice(dot + 1).toLowerCase())) return name;
    return (dot > 0 ? name.slice(0, dot) : name) + "." + allowed[0];
  };
  const saveMediaBlob = (blob, fileName) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    // Let the browser consume the URL before releasing it.
    setTimeout(() => URL.revokeObjectURL(url), 60000);
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
    if (!innerContainer) return;
    innerContainer.querySelector("p.filename").innerText = fileName;
    const progressBar = innerContainer.querySelector("div.progress");
    progressBar.querySelector("p").innerText = progress === null ? "Downloading" : progress + "%";
    progressBar.querySelector("div").style.width = (progress ?? 0) + "%";
  };

  const completeProgress = (videoId) => {
    const progressBar = document
      .getElementById("tel-downloader-progress-" + videoId)
      ?.querySelector("div.progress");
    if (!progressBar) return;
    progressBar.querySelector("p").innerText = "Completed";
    progressBar.querySelector("div").style.backgroundColor = "#B6C649";
    progressBar.querySelector("div").style.width = "100%";
  };

  const AbortProgress = (videoId) => {
    const progressBar = document
      .getElementById("tel-downloader-progress-" + videoId)
      ?.querySelector("div.progress");
    if (!progressBar) return;
    progressBar.querySelector("p").innerText = "Aborted";
    progressBar.querySelector("div").style.backgroundColor = "#D16666";
    progressBar.querySelector("div").style.width = "100%";
  };

  const downloadMedia = async (url, kind) => {
    if (typeof url !== "string" || !url) return;
    const id = Math.random().toString(36).slice(2) + Date.now().toString(36);
    let fileName = getDownloadFileName(url, getMediaMetadata(url)?.mimeType, kind);
    const parts = [];
    let writable;
    createProgressBar(id, fileName);
    try {
      const pageWindow = typeof unsafeWindow === "undefined" ? window : unsafeWindow;
      // Invoke the picker before awaiting network work to preserve user activation.
      if (kind !== "image" && typeof pageWindow.showSaveFilePicker === "function" &&
          pageWindow.self === pageWindow.top) {
        const handle = await pageWindow.showSaveFilePicker({ suggestedName: fileName });
        writable = await handle.createWritable();
      }
      let offset = 0;
      let total = null;
      let mime;
      do {
        const part = await fetchMediaPart(url, offset, total, kind, {
          write: writable ? (chunk) => writable.write(chunk) : undefined,
          onProgress: (received, size) => updateProgress(id, fileName,
            size ? ((received * 100) / size).toFixed(0) : null),
        });
        if (!writable) parts.push(part.blob);
        offset = part.nextOffset;
        total = part.totalSize;
        mime = part.mime;
        fileName = getDownloadFileName(url, mime, kind);
        updateProgress(id, fileName, ((offset * 100) / total).toFixed(0));
      } while (offset < total);
      if (writable) await writable.close();
      else saveMediaBlob(new Blob(parts, { type: mime }), fileName);
      completeProgress(id);
    } catch (error) {
      if (writable) {
        try {
          await writable.abort();
        } catch {
          // Failed or already closed streams may reject abort as well.
        }
      }
      if (error.name !== "AbortError") logger.error(error, fileName);
      AbortProgress(id);
    } finally {
      parts.length = 0;
    }
  };
  const tel_download_video = (url) => downloadMedia(url, "video");
  const tel_download_audio = (url) => downloadMedia(url, "audio");
  const tel_download_image = (url) => downloadMedia(url, "image");

  const getMediaSource = (media) =>
    media?.getAttribute("src") ? media.src :
      media?.currentSrc || media?.querySelector("source")?.src;

  const getPinnedMedia = () => {
    const pinned = document.querySelector(".pinned-audio");
    const mid = pinned?.getAttribute("data-mid");
    if (!mid) return null;
    const peer = pinned.getAttribute("data-peer-id");
    const candidates = Array.from(document.querySelectorAll("audio-element")).filter(
      (element) => element.closest(".bubble") && element.getAttribute("data-mid") === mid &&
        (!peer || element.closest("[data-peer-id]")?.getAttribute("data-peer-id") === peer)
    );
    const element = candidates.length === 1 ? candidates[0] :
      candidates.find((candidate) => candidate.audio && !candidate.audio.paused);
    const url = getMediaSource(element?.audio);
    return url ? { url, kind: element.audio.tagName === "AUDIO" ? "audio" : "video" } : null;
  };

  const downloadCurrentWebKMedia = () => {
    // The toolbar can outlive its media node. Resolve both at click time.
    const viewer = document.querySelector(".media-viewer-whole");
    if (!viewer) return;
    const buttons = viewer.querySelector(".media-viewer-topbar .media-viewer-buttons");
    const nativeDownload = buttons && getWebKDownloadButtons(buttons).find(
      (button) => isUsableDownloadButton(button) && !button.matches(
        '.quality-download-options-button-menu, .btn-menu-toggle, [aria-haspopup="menu"], [aria-haspopup="true"]'
      )
    );
    if (nativeDownload) {
      nativeDownload.click();
      return;
    }
    const media = viewer.querySelector(".media-viewer-movers .media-viewer-aspecter");
    const videoUrl = getMediaSource(media?.querySelector("video"));
    const imageUrl = getMediaSource(media?.querySelector("img.thumbnail"));
    if (videoUrl) tel_download_video(videoUrl);
    else if (imageUrl) tel_download_image(imageUrl);
  };

  logger.info("Initialized");

  const createDownloadButton = (className, iconHTML, onClick) => {
    const button = document.createElement("button");
    button.className = className;
    button.innerHTML = iconHTML;
    button.type = "button";
    button.title = "Download";
    button.setAttribute("aria-label", "Download");
    button.onclick = onClick;
    return button;
  };
  const getWebADownloadButtons = (container) =>
    Array.from(container.querySelectorAll("button")).filter((button) =>
      !button.classList.contains("tel-download") &&
      (button.querySelector(".icon-download") || button.title === "Download" ||
        button.getAttribute("aria-label") === "Download") && isUsableDownloadButton(button)
    );
  const downloadCurrentWebAMedia = () => {
    const media = document.querySelector("#MediaViewer .MediaViewerSlide--active");
    const videoUrl = getMediaSource(media?.querySelector(".VideoPlayer video"));
    const imageUrl = getMediaSource(media?.querySelector(".MediaViewerContent > div > img"));
    if (videoUrl) tel_download_video(videoUrl);
    else if (imageUrl) tel_download_image(imageUrl);
  };

  // WebA owns only media discovery and button placement.
  const refreshWebA = () => {
    const story = document.getElementById("StoryViewer");
    if (story) {
      const header = story.querySelector(".GrsJNw3y") || story.querySelector(".DropdownMenu")?.parentNode;
      if (header && !header.querySelector(".tel-download") && !getWebADownloadButtons(header).length) {
        header.prepend(createDownloadButton(
          "Button TkphaPyQ tiny translucent-white round tel-download",
          '<i class="icon icon-download" aria-hidden="true"></i>',
          () => {
            const current = document.getElementById("StoryViewer");
            const videoUrl = getMediaSource(current?.querySelector("video"));
            const images = current?.querySelectorAll("img.PVZ8TOWS");
            const imageUrl = getMediaSource(images?.[images.length - 1]);
            if (videoUrl) tel_download_video(videoUrl);
            else if (imageUrl) tel_download_image(imageUrl);
          }
        ));
      }
    }
    const media = document.querySelector("#MediaViewer .MediaViewerSlide--active");
    const actions = document.querySelector("#MediaViewer .MediaViewerActions");
    if (!media || !actions) return;
    const video = media.querySelector(".VideoPlayer video");
    const image = media.querySelector(".MediaViewerContent > div > img");
    if (!getMediaSource(video) && !getMediaSource(image)) return;
    const makeButton = () => createDownloadButton(
      "Button smaller translucent-white round tel-download",
      '<i class="icon icon-download" aria-hidden="true"></i>',
      downloadCurrentWebAMedia
    );
    if (getWebADownloadButtons(actions).length) {
      actions.querySelectorAll("button.tel-download").forEach((button) => button.remove());
    } else if (!actions.querySelector("button.tel-download")) {
      actions.prepend(makeButton());
    }
    const controls = media.querySelector(".VideoPlayerControls .buttons");
    if (video && controls && !controls.querySelector("button.tel-download")) {
      const spacer = controls.querySelector(".spacer");
      if (spacer) spacer.after(makeButton());
      else controls.appendChild(makeButton());
    }
  };

  // WebK owns only media discovery and button placement.
  const refreshWebK = () => {
    refreshWebKDownloadIcon();

    // Resolve the pinned media again on every click: its source may load after
    // the pinned message changes, and message IDs can repeat across chats.
    const pinnedAudio = document.querySelector(".pinned-audio");
    const pinnedUtils = pinnedAudio?.querySelector(".pinned-container-wrapper-utils");
    if (pinnedUtils) {
      let button = pinnedUtils.querySelector("._tel_download_button_pinned_container");
      if (!button) {
        button = document.createElement("button");
        button.className = "btn-icon tgico-download _tel_download_button_pinned_container";
        button.innerHTML = createWebKDownloadIcon(true);
        button.type = "button";
        button.setAttribute("aria-label", "Download");
        button.onclick = (event) => {
          event.stopPropagation();
          const media = getPinnedMedia();
          if (!media) return;
          if (media.kind === "audio") tel_download_audio(media.url);
          else tel_download_video(media.url);
        };
        pinnedUtils.appendChild(button);
      }
      const disabled = !getPinnedMedia();
      if (button.disabled !== disabled) button.disabled = disabled;
      const title = disabled ? "Media is loading" : "Download";
      if (button.title !== title) button.title = title;
    }

    // Stories
    const storiesContainer = document.getElementById("stories-viewer");
    if (storiesContainer) {
      const createDownloadButton = () => {
        const downloadButton = document.createElement("button");
        downloadButton.className = "btn-icon rp tel-download";
        downloadButton.innerHTML = `${createWebKDownloadIcon()}<div class="c-ripple"></div>`;
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
        "[class*='_ViewerStoryHeaderRight']"
      );
      if (storyHeader && !storyHeader.querySelector(".tel-download")) {
        storyHeader.prepend(createDownloadButton());
      }

      const storyFooter = storiesContainer.querySelector(
        "[class*='_ViewerStoryFooterRight']"
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

    // Restore only identified download controls. Other hidden actions may be
    // unavailable for this media and should remain under Telegram's control.
    for (const button of getWebKDownloadButtons(mediaButtons)) {
      if (!button.disabled && button.getAttribute("aria-disabled") !== "true") {
        button.classList.remove("hide");
      }
    }

    // Recognize native downloads by their purpose, not their font code point.
    const nativeDownloadButtons = getWebKDownloadButtons(mediaButtons).filter(isUsableDownloadButton);
    if (nativeDownloadButtons.length > 0) {
      mediaButtons.querySelectorAll("button.tel-download").forEach((button) => {
        button.remove();
      });
    }
    const hasDownloadButton =
      nativeDownloadButtons.length > 0 ||
      mediaButtons.querySelector("button.tel-download");

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
        downloadButton.innerHTML = createWebKDownloadIcon();
        downloadButton.setAttribute("type", "button");
        downloadButton.setAttribute("title", "Download");
        downloadButton.setAttribute("aria-label", "Download");
        downloadButton.onclick = downloadCurrentWebKMedia;
        brControls?.prepend(downloadButton);
      }
    } else if (
      mediaAspecter.querySelector("video") &&
      !hasDownloadButton
    ) {
      // 2. Video HTML element detected, could be either GIF or unloaded video
      // container > video[src]
      const downloadButton = document.createElement("button");
      downloadButton.className = "btn-icon tgico-download tel-download";
      downloadButton.innerHTML = createWebKDownloadIcon(true);
      downloadButton.setAttribute("type", "button");
      downloadButton.setAttribute("title", "Download");
      downloadButton.setAttribute("aria-label", "Download");
      downloadButton.onclick = downloadCurrentWebKMedia;
      mediaButtons.prepend(downloadButton);
    } else if (!hasDownloadButton) {
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
      downloadButton.innerHTML = createWebKDownloadIcon(true);
      downloadButton.setAttribute("type", "button");
      downloadButton.setAttribute("title", "Download");
      downloadButton.setAttribute("aria-label", "Download");
      downloadButton.onclick = downloadCurrentWebKMedia;
      mediaButtons.prepend(downloadButton);
    }
  };

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

  const isWebK = location.hostname === "webk.telegram.org" || location.pathname.startsWith("/k/");
  const isWebA = location.hostname === "webz.telegram.org" || location.pathname.startsWith("/a/");
  const refreshApp = isWebK ? refreshWebK : isWebA ? refreshWebA : null;
  if (refreshApp) {
    const roots = isWebK
      ? ".media-viewer-whole, #stories-viewer, .pinned-audio, audio-element"
      : "#MediaViewer, #StoryViewer";
    let pending;
    const scheduleRefresh = () => {
      if (pending) return;
      pending = setTimeout(() => {
        pending = null;
        refreshApp();
      }, 100);
    };
    const observer = new MutationObserver((records) => {
      if (records.some((record) => {
        const target = record.target instanceof Element ? record.target : record.target.parentElement;
        if (target?.closest("#tel-downloader-progress-bar-container, .tel-download, ._tel_download_button_pinned_container")) return false;
        return target?.closest(roots) || Array.from(record.addedNodes).some((node) =>
          node instanceof Element && (node.matches(roots) || node.querySelector(roots))
        );
      })) scheduleRefresh();
    });
    observer.observe(document.body, {
      childList: true, subtree: true, attributes: true,
      attributeFilter: ["class", "src", "data-mid", "data-peer-id", "disabled", "aria-disabled", "hidden"],
    });
    // A fallback handles media source properties changed outside the DOM.
    setInterval(() => { if (!document.hidden) refreshApp(); }, REFRESH_DELAY);
    document.addEventListener("visibilitychange", scheduleRefresh);
    refreshApp();
  }

  logger.info("Completed script setup.");
})();
