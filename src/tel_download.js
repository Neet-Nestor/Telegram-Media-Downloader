// ==UserScript==
// @name         Telegram Media Downloader (with Bulk Download)
// @name:en      Telegram Media Downloader (with Bulk Download)
// @name:zh-CN   Telegram 受限图片视频下载器 (批量下载)
// @name:zh-TW   Telegram 受限圖片影片下載器 (批量下載)
// @name:ru      Telegram: загрузчик медиафайлов (массовая загрузка)
// @version      4.0-fork
// @namespace    https://github.com/ArtyMcLabin/Telegram-Media-Downloader
// @description  Download images, GIFs, videos, and voice messages on the Telegram webapp from private channels that disable downloading and restrict saving content. Now with smart auto-loading bulk download!
// @description:en  Download images, GIFs, videos, and voice messages on the Telegram webapp from private channels that disable downloading and restrict saving content. Now with smart auto-loading bulk download!
// @description:ru Загружайте изображения, GIF-файлы, видео и голосовые сообщения в веб-приложении Telegram из частных каналов, которые отключили загрузку и ограничили сохранение контента. Теперь с интеллектуальной массовой загрузкой!
// @description:zh-CN 从禁止下载的Telegram频道中下载图片、视频及语音消息。现在支持智能批量下载！
// @description:zh-TW 從禁止下載的 Telegram 頻道中下載圖片、影片及語音訊息。現在支援智慧批量下載！
// @author       Nestor Qin (Original), Arty McLabin (Fork/Bulk Download)
// @license      GNU GPLv3
// @website      https://github.com/ArtyMcLabin/Telegram-Media-Downloader
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

  // Unicode values for icons
  const DOWNLOAD_ICON = "\uE95F";
  const FORWARD_ICON = "\uE97B";
  const contentRangeRegex = /^bytes (\d+)-(\d+)\/(\d+)$/;

  // Configuration constants
  const CONFIG = {
    REFRESH_DELAY: 500,
    VIDEO_LOAD_TIMEOUT: 1000,
    SCROLL_ANIMATION_DELAY: 500,
    DOWNLOAD_DELAY: 300,
    HIGHLIGHT_DURATION: 1500,
    SCROLL_INCREMENT: 500,
    SCROLL_WAIT_TIME: 800,
    SAME_COUNT_THRESHOLD: 3,
    SCROLL_BOTTOM_THRESHOLD: 100,
    MAX_MEDIA_ITEMS: 10000,
    CLEANUP_THRESHOLD: 0.8,
    BUTTON_TOP_POSITION: "100px",
    BUTTON_RIGHT_POSITION: "20px",
    MAX_RETRIES: 3,
    RETRY_BACKOFF_MS: 2000,
    STORAGE_KEY: "tel_bulk_download_state",
    STATE_EXPIRY_MS: 24 * 60 * 60 * 1000, // 24 hours
    AUTO_LOAD_THRESHOLD: 0.8, // Load when 80% visible
    SEQUENTIAL_DOWNLOAD_DELAY: 2000 // Delay between auto-downloads (2s to avoid browser blocking)
  };

  const REFRESH_DELAY = CONFIG.REFRESH_DELAY;

  // ===== BULK DOWNLOAD STATE - MAP-BASED ARCHITECTURE =====
  let mediaMap = new Map(); // Key: messageId, Value: { id, type, url, date, needsClick, selector, status }
  let mediaIdOrder = []; // Ordered array of message IDs (chronological order)
  let downloadInProgress = false;
  let autoLoadObserver = null;
  let isAutoDownloading = false;
  let autoDownloadPaused = false;

  let bulkDownloadState = {
    active: false,
    currentIndex: 0,
    downloaded: 0,
    skipped: 0,
    failed: 0,
    paused: false
  };

  // Memory cleanup function
  const cleanupOldMedia = () => {
    if (mediaMap.size > CONFIG.MAX_MEDIA_ITEMS * CONFIG.CLEANUP_THRESHOLD) {
      const itemsToRemove = Math.floor(mediaMap.size * 0.3);
      const idsToRemove = mediaIdOrder.slice(0, itemsToRemove);

      idsToRemove.forEach(id => {
        mediaMap.delete(id);
      });

      mediaIdOrder = mediaIdOrder.slice(itemsToRemove);

      logger.info(`🧹 Memory cleanup: Removed ${itemsToRemove} old items. Current size: ${mediaMap.size}`);
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
    progressBar.querySelector("p").innerText = progress + "%";
    progressBar.querySelector("div").style.width = progress + "%";
  };

  const completeProgress = (videoId) => {
    const container = document.getElementById("tel-downloader-progress-" + videoId);
    if (!container) return;
    const progressBar = container.querySelector("div.progress");
    progressBar.querySelector("p").innerText = "Completed";
    progressBar.querySelector("div").style.backgroundColor = "#B6C649";
    progressBar.querySelector("div").style.width = "100%";
  };

  const AbortProgress = (videoId) => {
    const container = document.getElementById("tel-downloader-progress-" + videoId);
    if (!container) return;
    const progressBar = container.querySelector("div.progress");
    progressBar.querySelector("p").innerText = "Aborted";
    progressBar.querySelector("div").style.backgroundColor = "#D16666";
    progressBar.querySelector("div").style.width = "100%";
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

    // Disable showSaveFilePicker in bulk download mode (causes "Illegal invocation" errors)
    const isBulkDownloadActive = bulkDownloadState.active;

    const supportsFileSystemAccess =
      !isBulkDownloadActive && // Force blob method during bulk download
      "showSaveFilePicker" in window &&
      (() => {
        try {
          return window.self === window.top;
        } catch {
          return false;
        }
      })();
    if (supportsFileSystemAccess) {
      window
        .showSaveFilePicker({
          suggestedName: fileName,
        })
        .then((handle) => {
          handle
            .createWritable()
            .then((writable) => {
              fetchNextPart(writable);
              createProgressBar(videoId, fileName);
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
      createProgressBar(videoId, fileName);
    }

    logger.info(`🎬 Video download initiated: ${fileName}`);
    return true; // Download started successfully
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

    // Disable showSaveFilePicker in bulk download mode (causes "Illegal invocation" errors)
    const isBulkDownloadActive = bulkDownloadState.active;

    const supportsFileSystemAccess =
      !isBulkDownloadActive && // Force blob method during bulk download
      "showSaveFilePicker" in window &&
      (() => {
        try {
          return window.self === window.top;
        } catch {
          return false;
        }
      })();
    if (supportsFileSystemAccess) {
      window
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

    logger.info(`🎵 Audio download initiated: ${fileName}`);
    return true; // Download started successfully
  };

  const tel_download_image = (imageUrl) => {
    try {
      logger.info(`📸 Starting image download from: ${imageUrl.substring(0, 60)}...`);

      const fileName =
        (Math.random() + 1).toString(36).substring(2, 10) + ".jpeg";

      logger.info(`Creating download link with filename: ${fileName}`);

      const a = document.createElement("a");
      a.style.display = "none";
      document.body.appendChild(a);
      a.href = imageUrl;
      a.download = fileName;
      a.target = "_blank"; // Try opening in new tab if download fails

      logger.info(`Clicking download link...`);
      a.click();

      setTimeout(() => {
        document.body.removeChild(a);
        logger.info(`✓ Image download triggered: ${fileName}`);
      }, 100);

      return true;
    } catch (error) {
      logger.error(`❌ Image download error: ${error.message}`);
      return false;
    }
  };

  // ===== NEW SIDEBAR UI (REPLACES BLOCKING MODAL) =====

  const createSidebarUI = () => {
    // Remove existing sidebar if any
    const existingSidebar = document.getElementById("tel-bulk-sidebar");
    if (existingSidebar) {
      existingSidebar.remove();
    }

    const isDarkMode =
      document.querySelector("html").classList.contains("night") ||
      document.querySelector("html").classList.contains("theme-dark");

    const sidebar = document.createElement("div");
    sidebar.id = "tel-bulk-sidebar";
    sidebar.className = "tel-sidebar-expanded";
    sidebar.style.cssText = `
      position: fixed;
      top: 0;
      right: 0;
      height: 100vh;
      width: 400px;
      background: ${isDarkMode ? "#1e1e1e" : "#ffffff"};
      color: ${isDarkMode ? "#ffffff" : "#000000"};
      box-shadow: -4px 0 20px rgba(0,0,0,0.3);
      z-index: 9997;
      display: flex;
      flex-direction: column;
      transition: transform 0.3s ease;
      overflow: hidden;
      user-select: text;
    `;

    // Header with minimize button
    const header = document.createElement("div");
    header.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 1rem;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      user-select: text;
    `;

    const title = document.createElement("h2");
    title.textContent = "Bulk Download";
    title.style.cssText = "margin: 0; font-size: 1.3rem; user-select: text;";

    const minimizeBtn = document.createElement("button");
    minimizeBtn.innerHTML = "&minus;";
    minimizeBtn.style.cssText = `
      background: rgba(255,255,255,0.2);
      border: none;
      color: white;
      width: 30px;
      height: 30px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 1.5rem;
      line-height: 1;
      transition: background 0.2s;
    `;
    minimizeBtn.onmouseover = () => minimizeBtn.style.background = "rgba(255,255,255,0.3)";
    minimizeBtn.onmouseout = () => minimizeBtn.style.background = "rgba(255,255,255,0.2)";
    minimizeBtn.onclick = () => toggleSidebar();

    header.appendChild(title);
    header.appendChild(minimizeBtn);

    // Status area
    const statusArea = document.createElement("div");
    statusArea.id = "tel-sidebar-status";
    statusArea.style.cssText = `
      flex: 1;
      padding: 1.5rem;
      overflow-y: auto;
      user-select: text;
    `;

    // Button area
    const buttonArea = document.createElement("div");
    buttonArea.style.cssText = `
      padding: 1rem;
      border-top: 1px solid ${isDarkMode ? "#333" : "#ddd"};
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    `;

    const startAutoBtn = document.createElement("button");
    startAutoBtn.id = "tel-start-auto-download";
    startAutoBtn.textContent = "Start Auto-Download";
    startAutoBtn.style.cssText = `
      padding: 1rem;
      background: #4caf50;
      color: white;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 1rem;
      font-weight: 600;
      transition: background 0.2s;
    `;
    startAutoBtn.onmouseover = () => startAutoBtn.style.background = "#45a049";
    startAutoBtn.onmouseout = () => startAutoBtn.style.background = "#4caf50";
    startAutoBtn.onclick = () => startAutoDownload();

    const pauseBtn = document.createElement("button");
    pauseBtn.id = "tel-pause-download";
    pauseBtn.textContent = "Pause";
    pauseBtn.style.cssText = `
      padding: 0.75rem;
      background: #ff9800;
      color: white;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.9rem;
      transition: background 0.2s;
      display: none;
    `;
    pauseBtn.onmouseover = () => pauseBtn.style.background = "#f57c00";
    pauseBtn.onmouseout = () => pauseBtn.style.background = "#ff9800";
    pauseBtn.onclick = () => togglePauseDownload();

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "Close";
    closeBtn.style.cssText = `
      padding: 0.75rem;
      background: #d9534f;
      color: white;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.9rem;
      transition: background 0.2s;
    `;
    closeBtn.onmouseover = () => closeBtn.style.background = "#c9302c";
    closeBtn.onmouseout = () => closeBtn.style.background = "#d9534f";
    closeBtn.onclick = () => closeSidebar();

    buttonArea.appendChild(startAutoBtn);
    buttonArea.appendChild(pauseBtn);
    buttonArea.appendChild(closeBtn);

    sidebar.appendChild(header);
    sidebar.appendChild(statusArea);
    sidebar.appendChild(buttonArea);

    document.body.appendChild(sidebar);

    // Create collapsed tab
    const collapsedTab = document.createElement("div");
    collapsedTab.id = "tel-bulk-tab";
    collapsedTab.style.cssText = `
      position: fixed;
      top: 50%;
      right: 0;
      transform: translateY(-50%);
      width: 60px;
      height: 120px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      display: none;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      z-index: 9996;
      border-radius: 8px 0 0 8px;
      box-shadow: -4px 0 10px rgba(0,0,0,0.2);
      font-weight: 600;
      writing-mode: vertical-rl;
      text-orientation: mixed;
      user-select: text;
    `;
    collapsedTab.textContent = "Bulk Download";
    collapsedTab.onclick = () => toggleSidebar();

    document.body.appendChild(collapsedTab);

    updateSidebarStatus();
  };

  const toggleSidebar = () => {
    const sidebar = document.getElementById("tel-bulk-sidebar");
    const tab = document.getElementById("tel-bulk-tab");

    if (!sidebar || !tab) return;

    if (sidebar.classList.contains("tel-sidebar-expanded")) {
      // Minimize
      sidebar.style.transform = "translateX(100%)";
      sidebar.classList.remove("tel-sidebar-expanded");
      tab.style.display = "flex";
    } else {
      // Expand
      sidebar.style.transform = "translateX(0)";
      sidebar.classList.add("tel-sidebar-expanded");
      tab.style.display = "none";
    }
  };

  const closeSidebar = () => {
    const sidebar = document.getElementById("tel-bulk-sidebar");
    const tab = document.getElementById("tel-bulk-tab");

    if (sidebar) sidebar.remove();
    if (tab) tab.remove();

    // Stop auto-download if active
    if (isAutoDownloading) {
      isAutoDownloading = false;
      autoDownloadPaused = true;
    }

    // Disconnect observer
    if (autoLoadObserver) {
      autoLoadObserver.disconnect();
      autoLoadObserver = null;
    }

    bulkDownloadState.active = false;
    logger.info("Sidebar closed");
  };

  const updateSidebarStatus = () => {
    const statusArea = document.getElementById("tel-sidebar-status");
    if (!statusArea) return;

    const { currentIndex, downloaded, skipped, failed } = bulkDownloadState;
    const total = mediaIdOrder.length;
    const needsLoading = Array.from(mediaMap.values()).filter(m => m.needsClick).length;
    const loaded = Array.from(mediaMap.values()).filter(m => !m.needsClick && m.type === "video").length;

    let html = `
      <div style="user-select: text;">
        <h3 style="margin: 0 0 1rem 0; user-select: text;">Status</h3>
        <p style="user-select: text;"><strong>Total media:</strong> ${total}</p>
        <p style="user-select: text;"><strong>Progress:</strong> ${currentIndex} / ${total}</p>
        <p style="user-select: text;"><strong>Downloaded:</strong> ${downloaded}</p>
        <p style="user-select: text;"><strong>Skipped:</strong> ${skipped}</p>
        <p style="user-select: text;"><strong>Failed:</strong> ${failed}</p>
        ${needsLoading > 0 ? `<p style="color: #ff9800; user-select: text;"><strong>Videos needing URL load:</strong> ${needsLoading}</p>` : ''}
        ${loaded > 0 ? `<p style="color: #4caf50; user-select: text;"><strong>Videos with URLs loaded:</strong> ${loaded}</p>` : ''}
      </div>
    `;

    // Show upcoming downloads
    if (total > 0) {
      html += `<div style="margin-top: 1.5rem; user-select: text;"><h3 style="margin: 0 0 0.5rem 0; user-select: text;">Queue</h3><div style="user-select: text;">`;

      const upcomingCount = Math.min(5, total - currentIndex);
      for (let i = 0; i < upcomingCount; i++) {
        const idx = currentIndex + i;
        const mediaId = mediaIdOrder[idx];
        const media = mediaMap.get(mediaId);

        if (media) {
          const status = media.status || (media.needsClick ? "needs-load" : "ready");
          const statusIcon =
            status === "completed" ? "✓" :
            status === "downloading" ? "⏬" :
            status === "needs-load" ? "⚠" :
            status === "failed" ? "✗" : "⏳";

          const statusColor =
            status === "completed" ? "#4caf50" :
            status === "downloading" ? "#2196f3" :
            status === "needs-load" ? "#ff9800" :
            status === "failed" ? "#f44336" : "#888";

          html += `
            <div style="padding: 0.5rem; margin-bottom: 0.25rem; background: rgba(128,128,128,0.1); border-radius: 4px; user-select: text;">
              <span style="color: ${statusColor}; user-select: text;">${statusIcon}</span>
              <span style="user-select: text;"> ${idx + 1}. ${media.type}</span>
              ${i === 0 && isAutoDownloading ? '<strong style="user-select: text;"> (Current)</strong>' : ''}
            </div>
          `;
        }
      }

      html += `</div></div>`;
    }

    statusArea.innerHTML = html;
  };

  // ===== SMART AUTO-LOADING ENGINE =====

  const setupIntersectionObserver = () => {
    // Disconnect existing observer
    if (autoLoadObserver) {
      autoLoadObserver.disconnect();
    }

    const options = {
      root: null,
      rootMargin: "200px",
      threshold: CONFIG.AUTO_LOAD_THRESHOLD
    };

    autoLoadObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const bubble = entry.target;
          const msgId = getMessageId(bubble);
          const media = mediaMap.get(msgId);

          if (media && media.needsClick && media.type === "video") {
            logger.info(`Auto-loading video ${msgId} (scrolled into view)`);
            triggerVideoLoad(bubble).then(videoUrl => {
              if (videoUrl) {
                media.url = videoUrl;
                media.needsClick = false;
                logger.info(`✓ Auto-loaded video URL for ${msgId}`);
                updateSidebarStatus();
              }
            });
          }
        }
      });
    }, options);

    // Observe all video messages
    mediaMap.forEach((media, msgId) => {
      if (media.needsClick && media.type === "video") {
        const element = findMessageElement(msgId);
        if (element) {
          autoLoadObserver.observe(element);
        }
      }
    });

    logger.info(`IntersectionObserver set up for ${mediaMap.size} media items`);
  };

  // ===== ONE-CLICK AUTO-DOWNLOAD WORKFLOW =====

  const startAutoDownload = async () => {
    logger.info("Starting auto-download workflow...");

    const startBtn = document.getElementById("tel-start-auto-download");
    const pauseBtn = document.getElementById("tel-pause-download");

    if (isAutoDownloading) {
      logger.info("Auto-download already in progress");
      return;
    }

    startBtn.disabled = true;
    startBtn.textContent = "Initializing...";
    startBtn.style.background = "#999";

    // Step 1: Scan entire chat
    await scanEntireChat();

    // Step 2: Setup auto-loader
    setupIntersectionObserver();

    // Step 3: Start sequential download (from newest to oldest)
    isAutoDownloading = true;
    autoDownloadPaused = false;
    bulkDownloadState.active = true;
    bulkDownloadState.currentIndex = mediaIdOrder.length - 1; // Start from newest (end of array)

    startBtn.style.display = "none";
    pauseBtn.style.display = "block";

    logger.info(`Starting auto-download of ${mediaIdOrder.length} items (newest → oldest)`);

    // Step 4: Process queue
    processDownloadQueue();
  };

  const togglePauseDownload = () => {
    const pauseBtn = document.getElementById("tel-pause-download");

    if (autoDownloadPaused) {
      autoDownloadPaused = false;
      pauseBtn.textContent = "Pause";
      pauseBtn.style.background = "#ff9800";
      logger.info("Auto-download resumed");
      processDownloadQueue();
    } else {
      autoDownloadPaused = true;
      pauseBtn.textContent = "Resume";
      pauseBtn.style.background = "#4caf50";
      logger.info("Auto-download paused");
    }
  };

  // ===== INTELLIGENT QUEUE PROCESSOR =====

  const processDownloadQueue = async () => {
    if (!isAutoDownloading || autoDownloadPaused) {
      logger.info("Queue processing stopped (paused or inactive)");
      return;
    }

    const { currentIndex } = bulkDownloadState;

    if (currentIndex < 0) {
      logger.info("All downloads completed!");
      isAutoDownloading = false;

      const startBtn = document.getElementById("tel-start-auto-download");
      const pauseBtn = document.getElementById("tel-pause-download");

      if (startBtn) {
        startBtn.textContent = "All Done!";
        startBtn.style.background = "#4caf50";
        startBtn.disabled = true;
      }
      if (pauseBtn) pauseBtn.style.display = "none";

      updateSidebarStatus();
      return;
    }

    const mediaId = mediaIdOrder[currentIndex];
    const media = mediaMap.get(mediaId);

    if (!media) {
      logger.error(`Media not found: ${mediaId}`);
      bulkDownloadState.skipped++;
      bulkDownloadState.currentIndex--;
      updateSidebarStatus();
      setTimeout(() => processDownloadQueue(), 100);
      return;
    }

    // Update status
    media.status = "downloading";
    updateSidebarStatus();

    // Scroll to message
    const element = scrollToMessage(mediaId);

    if (!element) {
      logger.error(`Element not found for ${mediaId}`);
      media.status = "failed";
      bulkDownloadState.failed++;
      bulkDownloadState.currentIndex--;
      updateSidebarStatus();
      setTimeout(() => processDownloadQueue(), 100);
      return;
    }

    await new Promise(resolve => setTimeout(resolve, CONFIG.SCROLL_ANIMATION_DELAY));

    // If video needs loading, try to load it
    if (media.needsClick && media.type === "video") {
      logger.info(`Video ${mediaId} needs URL loading...`);

      const videoUrl = await triggerVideoLoad(element);

      if (videoUrl) {
        media.url = videoUrl;
        media.needsClick = false;
        logger.info(`✓ Successfully loaded URL for ${mediaId}`);
      } else {
        logger.error(`Failed to auto-load video ${mediaId}`);
        media.status = "failed";
        bulkDownloadState.failed++;
        bulkDownloadState.currentIndex--;
        updateSidebarStatus();
        setTimeout(() => processDownloadQueue(), CONFIG.SEQUENTIAL_DOWNLOAD_DELAY);
        return;
      }
    }

    // Check if URL is available
    if (!media.url) {
      logger.error(`No URL for ${mediaId}`);
      media.status = "failed";
      bulkDownloadState.failed++;
      bulkDownloadState.currentIndex--;
      updateSidebarStatus();
      setTimeout(() => processDownloadQueue(), CONFIG.SEQUENTIAL_DOWNLOAD_DELAY);
      return;
    }

    // Download based on type
    try {
      logger.info(`🔽 Triggering download for ${media.type}: ${media.url.substring(0, 60)}...`);

      let downloadSuccess = false;

      switch (media.type) {
        case "video":
          downloadSuccess = tel_download_video(media.url);
          break;
        case "image":
          downloadSuccess = tel_download_image(media.url);
          break;
        case "audio":
          downloadSuccess = tel_download_audio(media.url);
          break;
      }

      if (downloadSuccess !== false) {
        media.status = "completed";
        bulkDownloadState.downloaded++;
        logger.info(`✓ Download triggered successfully for ${mediaId} (${bulkDownloadState.downloaded}/${mediaIdOrder.length})`);
        logger.info(`Check your browser's download bar/folder`);
      } else {
        throw new Error("Download function returned false");
      }
    } catch (error) {
      logger.error(`❌ Download FAILED for ${mediaId}: ${error}`);
      logger.error(`URL was: ${media.url}`);
      media.status = "failed";
      bulkDownloadState.failed++;
    }

    bulkDownloadState.currentIndex--;
    updateSidebarStatus();

    // Continue with next item
    setTimeout(() => processDownloadQueue(), CONFIG.SEQUENTIAL_DOWNLOAD_DELAY);
  };

  // ===== HELPER FUNCTIONS =====

  const getMessageId = (element) => {
    const standardId = element.getAttribute("data-mid") ||
                      element.getAttribute("data-message-id") ||
                      element.id;

    if (standardId) return standardId;

    const peerId = element.getAttribute("data-peer-id");
    const msgId = element.getAttribute("data-msg-id");

    if (peerId && msgId) {
      return `${peerId}_${msgId}`;
    }

    const timeEl = element.querySelector(".time") ||
                   element.querySelector(".message-time") ||
                   element.querySelector("[datetime]");

    const timestamp = timeEl?.getAttribute("datetime") ||
                     timeEl?.textContent ||
                     "";

    const textContent = element.textContent?.substring(0, 100) || "";
    const contentHash = hashCode(timestamp + textContent);

    return `msg_${contentHash}`;
  };

  const getMessageDate = (element) => {
    const timeEl = element.querySelector(".time") ||
                   element.querySelector(".message-time") ||
                   element.querySelector("[datetime]");

    if (timeEl) {
      const datetime = timeEl.getAttribute("datetime") || timeEl.textContent;
      return new Date(datetime).getTime() || Date.now();
    }
    return Date.now();
  };

  const findMessageElement = (messageId) => {
    if (!messageId) return null;

    const mediaData = mediaMap.get(messageId);
    if (!mediaData) return null;

    return document.querySelector(mediaData.selector) ||
           document.querySelector(`[data-mid="${messageId}"]`) ||
           document.querySelector(`[data-message-id="${messageId}"]`);
  };

  const scrollToMessage = (messageId) => {
    const element = findMessageElement(messageId);

    if (!element) {
      logger.error(`Could not find element for message ID: ${messageId}`);
      return null;
    }

    element.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });

    // Highlight
    const originalBg = element.style.backgroundColor;
    element.style.backgroundColor = "rgba(0, 136, 204, 0.3)";
    element.style.transition = "background-color 0.3s";

    setTimeout(() => {
      element.style.backgroundColor = originalBg;
    }, CONFIG.HIGHLIGHT_DURATION);

    return element;
  };

  const triggerVideoLoad = (element) => {
    return new Promise((resolve) => {
      try {
        // Try to trigger mouseover (no view parameter in userscript context)
        const mouseoverEvent = new MouseEvent('mouseover', {
          bubbles: true,
          cancelable: true
        });
        element.dispatchEvent(mouseoverEvent);

        const clickableArea = element.querySelector('.media-video') ||
                             element.querySelector('.video-player') ||
                             element;

        if (clickableArea) {
          const clickEvent = new MouseEvent('click', {
            bubbles: true,
            cancelable: true
          });
          clickableArea.dispatchEvent(clickEvent);
        }
      } catch (error) {
        logger.error(`Error triggering video load: ${error.message}`);
      }

      setTimeout(() => {
        const video = element.querySelector("video");
        const videoUrl = video?.src || video?.currentSrc || element.querySelector("video source")?.src;
        resolve(videoUrl);
      }, CONFIG.VIDEO_LOAD_TIMEOUT);
    });
  };

  const findMediaMessages = () => {
    let newCount = 0;

    const bubbles = document.querySelectorAll(".bubble:not(.is-date)");

    bubbles.forEach((bubble) => {
      const msgId = getMessageId(bubble);

      if (mediaMap.has(msgId)) {
        const existing = mediaMap.get(msgId);
        if (existing.needsClick && existing.type === "video") {
          const video = bubble.querySelector("video");
          const videoUrl = video?.src || video?.currentSrc || bubble.querySelector("video source")?.src;
          if (videoUrl) {
            existing.url = videoUrl;
            existing.needsClick = false;
          }
        }
        return;
      }

      const hasVideo = bubble.querySelector("video") ||
                      bubble.querySelector(".video-player") ||
                      bubble.querySelector(".media-video") ||
                      bubble.classList.contains("video");

      if (hasVideo) {
        const video = bubble.querySelector("video");
        const videoUrl = video?.src || video?.currentSrc || bubble.querySelector("video source")?.src;

        mediaMap.set(msgId, {
          id: msgId,
          type: "video",
          url: videoUrl || null,
          needsClick: !videoUrl,
          date: getMessageDate(bubble),
          selector: `[data-mid="${msgId}"]`,
          status: null
        });
        mediaIdOrder.push(msgId);
        newCount++;
        return;
      }

      const hasImage = bubble.querySelector("img.thumbnail") ||
                      bubble.querySelector(".album-item") ||
                      bubble.classList.contains("photo");

      if (hasImage) {
        const img = bubble.querySelector("img.thumbnail") || bubble.querySelector("img");
        if (img && img.src && !img.src.includes("data:")) {
          mediaMap.set(msgId, {
            id: msgId,
            type: "image",
            url: img.src,
            needsClick: false,
            date: getMessageDate(bubble),
            selector: `[data-mid="${msgId}"]`,
            status: null
          });
          mediaIdOrder.push(msgId);
          newCount++;
          return;
        }
      }

      const audio = bubble.querySelector("audio-element audio") ||
                   bubble.querySelector("audio");
      if (audio) {
        const audioUrl = audio.src || audio.currentSrc;
        if (audioUrl) {
          mediaMap.set(msgId, {
            id: msgId,
            type: "audio",
            url: audioUrl,
            needsClick: false,
            date: getMessageDate(bubble),
            selector: `[data-mid="${msgId}"]`,
            status: null
          });
          mediaIdOrder.push(msgId);
          newCount++;
        }
      }
    });

    const mediaMessages = document.querySelectorAll(".Message");
    mediaMessages.forEach((msg) => {
      const msgId = getMessageId(msg);

      if (mediaMap.has(msgId)) {
        const existing = mediaMap.get(msgId);
        if (existing.needsClick && existing.type === "video") {
          const video = msg.querySelector("video");
          const videoUrl = video?.src || video?.currentSrc;
          if (videoUrl) {
            existing.url = videoUrl;
            existing.needsClick = false;
          }
        }
        return;
      }

      const video = msg.querySelector("video");
      const img = msg.querySelector("img[src*='://']");

      if (video) {
        const videoUrl = video.src || video.currentSrc;
        mediaMap.set(msgId, {
          id: msgId,
          type: "video",
          url: videoUrl || null,
          needsClick: !videoUrl,
          date: getMessageDate(msg),
          selector: `[data-message-id="${msgId}"]`,
          status: null
        });
        mediaIdOrder.push(msgId);
        newCount++;
      } else if (img && img.src && !img.src.includes("data:")) {
        mediaMap.set(msgId, {
          id: msgId,
          type: "image",
          url: img.src,
          needsClick: false,
          date: getMessageDate(msg),
          selector: `[data-message-id="${msgId}"]`,
          status: null
        });
        mediaIdOrder.push(msgId);
        newCount++;
      }
    });

    if (newCount > 0) {
      logger.info(`Found ${newCount} new media items. Total: ${mediaMap.size}`);
      cleanupOldMedia();
    }

    return mediaMap.size;
  };

  const scanEntireChat = async () => {
    const statusArea = document.getElementById("tel-sidebar-status");
    if (statusArea) {
      statusArea.innerHTML = `<p style="user-select: text;"><strong>Scanning entire chat...</strong></p><p style="user-select: text;">Please wait...</p>`;
    }

    // Target the chat messages container specifically, not the All Chats sidebar
    const scrollContainer = document.querySelector("#column-center .scrollable-y") ||
                           document.querySelector(".bubbles-inner") ||
                           document.querySelector("#bubbles-inner") ||
                           document.querySelector(".messages-container") ||
                           document.querySelector(".MiddleColumn .messages-container");

    if (!scrollContainer) {
      logger.error("Could not find scroll container");
      return;
    }

    logger.info("Starting full chat scan...");

    scrollContainer.scrollTop = 0;
    await new Promise(resolve => setTimeout(resolve, 1000));

    let previousCount = 0;
    let sameCountIterations = 0;
    let scrollPosition = 0;

    while (sameCountIterations < CONFIG.SAME_COUNT_THRESHOLD) {
      scrollPosition += CONFIG.SCROLL_INCREMENT;
      scrollContainer.scrollTop = scrollPosition;

      await new Promise(resolve => setTimeout(resolve, CONFIG.SCROLL_WAIT_TIME));

      const currentCount = findMediaMessages();

      if (statusArea) {
        statusArea.innerHTML = `<p style="user-select: text;"><strong>Scanning chat...</strong></p><p style="user-select: text;">Found: ${currentCount} media items</p>`;
      }

      if (currentCount === previousCount) {
        sameCountIterations++;
      } else {
        sameCountIterations = 0;
        previousCount = currentCount;
      }

      if (scrollContainer.scrollTop + scrollContainer.clientHeight >= scrollContainer.scrollHeight - CONFIG.SCROLL_BOTTOM_THRESHOLD) {
        break;
      }
    }

    const finalCount = findMediaMessages();
    logger.info(`Chat scan complete. Found ${finalCount} media items`);

    updateSidebarStatus();
  };

  const openBulkDownloadSidebar = () => {
    logger.info("Opening bulk download sidebar...");

    const count = findMediaMessages();

    if (count === 0) {
      alert("No media found in this chat! Try scrolling through the chat first.");
      return;
    }

    bulkDownloadState = {
      active: true,
      currentIndex: 0,
      downloaded: 0,
      skipped: 0,
      failed: 0,
      paused: false
    };

    createSidebarUI();

    logger.info(`Sidebar opened with ${count} media items`);
  };

  // IMPROVED: Floating button
  const addBulkDownloadButton = () => {
    if (document.getElementById("tel-bulk-download-floating")) {
      return;
    }

    const isInChat = document.querySelector("#column-center") ||
                     document.querySelector(".chat-container") ||
                     document.querySelector(".MiddleColumn") ||
                     document.querySelector("#bubbles-inner") ||
                     document.querySelector(".messages-container");

    if (!isInChat) {
      return;
    }

    logger.info("Chat view detected! Adding bulk download button");

    const floatingButton = document.createElement("button");
    floatingButton.id = "tel-bulk-download-floating";
    floatingButton.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="7 10 12 15 17 10"></polyline>
        <line x1="12" y1="15" x2="12" y2="3"></line>
      </svg>
      <span style="margin-left: 6px;">Bulk Download</span>
    `;
    floatingButton.setAttribute("title", "Smart Auto-Download - Download all media automatically");
    floatingButton.style.cssText = `
      position: fixed;
      top: ${CONFIG.BUTTON_TOP_POSITION};
      right: ${CONFIG.BUTTON_RIGHT_POSITION};
      z-index: 9998;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 12px;
      padding: 14px 24px;
      cursor: pointer;
      font-size: 15px;
      font-weight: 600;
      box-shadow: 0 8px 24px rgba(102, 126, 234, 0.4);
      display: flex;
      align-items: center;
      gap: 6px;
      transition: all 0.3s ease;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    `;
    floatingButton.onmouseover = () => {
      floatingButton.style.background = "linear-gradient(135deg, #5568d3 0%, #6440a0 100%)";
      floatingButton.style.transform = "translateY(-2px)";
      floatingButton.style.boxShadow = "0 12px 32px rgba(102, 126, 234, 0.5)";
    };
    floatingButton.onmouseout = () => {
      floatingButton.style.background = "linear-gradient(135deg, #667eea 0%, #764ba2 100%)";
      floatingButton.style.transform = "translateY(0)";
      floatingButton.style.boxShadow = "0 8px 24px rgba(102, 126, 234, 0.4)";
    };
    floatingButton.onclick = openBulkDownloadSidebar;
    document.body.appendChild(floatingButton);
    logger.info("Floating bulk download button added");
  };

  logger.info("Initialized");

  // Original functionality for webz /a/ webapp
  setInterval(() => {
    // Stories
    const storiesContainer = document.getElementById("StoryViewer");
    if (storiesContainer) {
      const createDownloadButton = () => {
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
          const video = storiesContainer.querySelector("video");
          const videoSrc =
            video?.src ||
            video?.currentSrc ||
            video?.querySelector("source")?.src;
          if (videoSrc) {
            tel_download_video(videoSrc);
          } else {
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
        storyHeader.insertBefore(
          createDownloadButton(),
          storyHeader.querySelector("button")
        );
      }
    }

    const mediaContainer = document.querySelector(
      "#MediaViewer .MediaViewerSlide--active"
    );
    const mediaViewerActions = document.querySelector(
      "#MediaViewer .MediaViewerActions"
    );
    if (!mediaContainer || !mediaViewerActions) return;

    const videoPlayer = mediaContainer.querySelector(
      ".MediaViewerContent > .VideoPlayer"
    );
    const img = mediaContainer.querySelector(".MediaViewerContent > div > img");

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

      const controls = videoPlayer.querySelector(".VideoPlayerControls");
      if (controls) {
        const buttons = controls.querySelector(".buttons");
        if (!buttons.querySelector("button.tel-download")) {
          const spacer = buttons.querySelector(".spacer");
          spacer.after(downloadButton);
        }
      }

      if (mediaViewerActions.querySelector("button.tel-download")) {
        const telDownloadButton = mediaViewerActions.querySelector(
          "button.tel-download"
        );
        if (
          mediaViewerActions.querySelectorAll('button[title="Download"]')
            .length > 1
        ) {
          mediaViewerActions.querySelector("button.tel-download").remove();
        } else if (
          telDownloadButton.getAttribute("data-tel-download-url") !== videoUrl
        ) {
          telDownloadButton.onclick = () => {
            tel_download_video(videoPlayer.querySelector("video").currentSrc);
          };
          telDownloadButton.setAttribute("data-tel-download-url", videoUrl);
        }
      } else if (
        !mediaViewerActions.querySelector('button[title="Download"]')
      ) {
        mediaViewerActions.prepend(downloadButton);
      }
    } else if (img && img.src) {
      downloadButton.setAttribute("data-tel-download-url", img.src);
      downloadButton.appendChild(downloadIcon);
      downloadButton.onclick = () => {
        tel_download_image(img.src);
      };

      if (mediaViewerActions.querySelector("button.tel-download")) {
        const telDownloadButton = mediaViewerActions.querySelector(
          "button.tel-download"
        );
        if (
          mediaViewerActions.querySelectorAll('button[title="Download"]')
            .length > 1
        ) {
          mediaViewerActions.querySelector("button.tel-download").remove();
        } else if (
          telDownloadButton.getAttribute("data-tel-download-url") !== img.src
        ) {
          telDownloadButton.onclick = () => {
            tel_download_image(img.src);
          };
          telDownloadButton.setAttribute("data-tel-download-url", img.src);
        }
      } else if (
        !mediaViewerActions.querySelector('button[title="Download"]')
      ) {
        mediaViewerActions.prepend(downloadButton);
      }
    }

    // Add bulk download button
    addBulkDownloadButton();
  }, REFRESH_DELAY);

  // Original functionality for webk /k/ webapp
  setInterval(() => {
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
        return;
      }
      if (
        dataMid &&
        downloadButtonPinnedAudio.getAttribute("data-mid") !== dataMid &&
        audioElement.getAttribute("data-mid") === dataMid
      ) {
        downloadButtonPinnedAudio.onclick = (e) => {
          e.stopPropagation();
          const link = audioElement.audio && audioElement.audio.getAttribute("src");
          const isAudio = audioElement.audio && audioElement.audio instanceof HTMLAudioElement;
          if (isAudio) {
            tel_download_audio(link);
          } else {
            tel_download_video(link);
          }
        };
        downloadButtonPinnedAudio.setAttribute("data-mid", dataMid);
        const link = audioElement.audio && audioElement.audio.getAttribute("src");
        if (link) {
          pinnedAudio
            .querySelector(".pinned-container-wrapper-utils")
            .appendChild(downloadButtonPinnedAudio);
        }
      }
    });

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
          const video = storiesContainer.querySelector("video.media-video");
          const videoSrc =
            video?.src ||
            video?.currentSrc ||
            video?.querySelector("source")?.src;
          if (videoSrc) {
            tel_download_video(videoSrc);
          } else {
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

    const mediaContainer = document.querySelector(".media-viewer-whole");
    if (!mediaContainer) return;
    const mediaAspecter = mediaContainer.querySelector(
      ".media-viewer-movers .media-viewer-aspecter"
    );
    const mediaButtons = mediaContainer.querySelector(
      ".media-viewer-topbar .media-viewer-buttons"
    );
    if (!mediaAspecter || !mediaButtons) return;

    const hiddenButtons = mediaButtons.querySelectorAll("button.btn-icon.hide");
    let onDownload = null;
    for (const btn of hiddenButtons) {
      btn.classList.remove("hide");
      if (btn.textContent === FORWARD_ICON) {
        btn.classList.add("tgico-forward");
      }
      if (btn.textContent === DOWNLOAD_ICON) {
        btn.classList.add("tgico-download");
        onDownload = () => {
          btn.click();
        };
      }
    }

    if (mediaAspecter.querySelector(".ckin__player")) {
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
      !mediaButtons.querySelector("button.btn-icon.tgico-download")
    ) {
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

    // Add bulk download button
    addBulkDownloadButton();
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

  logger.info("Completed script setup with SMART AUTO-DOWNLOAD bulk functionality.");
})();
