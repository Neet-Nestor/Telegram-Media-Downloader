// ==UserScript==
// @name         Telegram Media Downloader
// @name:en      Telegram Media Downloader
// @name:zh-CN   Telegram 受限图片视频下载器
// @name:zh-TW   Telegram 受限圖片影片下載器
// @name:ru      Telegram: загрузчик медиафайлов
// @version      1.222
// @namespace    https://github.com/Neet-Nestor/Telegram-Media-Downloader
// @updateURL    https://raw.githubusercontent.com/charzl/Telegram-Media-Downloader/main/src/tel_download.js
// @downloadURL  https://raw.githubusercontent.com/charzl/Telegram-Media-Downloader/main/src/tel_download.js
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
// @match        https://t.me/*
// @match        https://*.t.me/*
// @icon         https://img.icons8.com/color/452/telegram-app--v5.png
// @grant        unsafeWindow
// ==/UserScript==

(function () {
  'use strict';

  const logger = {
    info: (message, fileName = null) => {
      console.log(`[Tel Download] ${fileName ? `${fileName}: ` : ""}${message}`);
    },
    warn: (message, fileName = null) => {
      console.warn(`[Tel Download] ${fileName ? `${fileName}: ` : ""}${message}`);
    },
    error: (message, fileName = null) => {
      console.error(`[Tel Download] ${fileName ? `${fileName}: ` : ""}${message}`);
    },
  };

  // Unicode values for icons (used in /k/ app)
  const DOWNLOAD_ICON = "\ue979";
  const FORWARD_ICON = "\ue99a";
  const contentRangeRegex = /^bytes\s+(\d+)-(\d+)\/(\d+|\*)$/i;
  const REFRESH_DELAY = 600;
  const MAX_AUTO_RETRIES = 4;
  const RETRY_DELAYS_MS = [1000, 2000, 3500, 5000];

  // 配置项
  const CONFIG = {
    // 是否启用系统另存为弹窗 (FileSystem Access API)
    // 设为 false 将使用原生 Blob 缓冲下载管道，彻底解决外挂硬盘 (USB/exFAT/NTFS) 写入失败与文件锁问题
    USE_FILE_PICKER: false,
  };

  const hashCode = (s) => {
    if (!s) return Math.random().toString(36).substring(2, 8);
    let h = 0, l = s.length, i = 0;
    if (l > 0) {
      while (i < l) {
        h = ((h << 5) - h + s.charCodeAt(i++)) | 0;
      }
    }
    return (h >>> 0).toString(36);
  };

  const formatBytes = (bytes, decimals = 1) => {
    if (!bytes || isNaN(bytes) || bytes <= 0) return "0 B";
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
  };

  const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds) || seconds <= 0 || !isFinite(seconds)) return "--";
    seconds = Math.round(seconds);
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m < 60) return `${m}m ${s}s`;
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  };

  const getVideoSrc = (container) => {
    if (!container) return null;
    const video = container.tagName === "VIDEO" ? container : container.querySelector("video");
    if (!video) return null;
    return (
      video.currentSrc ||
      video.src ||
      video.querySelector("source")?.src ||
      video.getAttribute("src") ||
      null
    );
  };

  const getImageSrc = (container) => {
    if (!container) return null;
    const img = container.tagName === "IMG" ? container : container.querySelector("img");
    if (!img) return null;
    return img.currentSrc || img.src || img.getAttribute("src") || null;
  };

  class SpeedTracker {
    constructor() {
      this.samples = [];
      this.lastLoaded = 0;
      this.lastTime = Date.now();
    }

    update(currentLoaded, totalBytes) {
      const now = Date.now();
      const timeDiff = (now - this.lastTime) / 1000;
      if (timeDiff >= 0.25 || this.samples.length === 0) {
        const bytesDiff = currentLoaded - this.lastLoaded;
        if (timeDiff > 0 && bytesDiff >= 0) {
          const speed = bytesDiff / timeDiff;
          this.samples.push({ time: now, speed });
          if (this.samples.length > 6) {
            this.samples.shift();
          }
        }
        this.lastLoaded = currentLoaded;
        this.lastTime = now;
      }

      let avgSpeed = 0;
      if (this.samples.length > 0) {
        const sum = this.samples.reduce((acc, s) => acc + s.speed, 0);
        avgSpeed = sum / this.samples.length;
      }

      let eta = 0;
      if (totalBytes && totalBytes > currentLoaded && avgSpeed > 0) {
        eta = (totalBytes - currentLoaded) / avgSpeed;
      }

      return {
        speedText: avgSpeed > 0 ? `${formatBytes(avgSpeed)}/s` : "--/s",
        etaText: eta > 0 ? formatTime(eta) : "--",
        rawSpeed: avgSpeed,
      };
    }
  }

  // ==========================
  // Modern Progress UI System
  // ==========================
  const ensureContainer = () => {
    let container = document.getElementById("tel-downloader-progress-bar-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "tel-downloader-progress-bar-container";
      container.style.cssText = `
        position: fixed !important;
        bottom: 20px !important;
        right: 20px !important;
        z-index: 2147483647 !important;
        max-height: 85vh !important;
        overflow-y: auto !important;
        display: flex !important;
        flex-direction: column-reverse !important;
        gap: 10px !important;
        pointer-events: none !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
      `;
      document.body.appendChild(container);
    }
    return container;
  };

  const createProgressBar = (taskId, fileName, onCancel = null) => {
    const container = ensureContainer();
    const existing = document.getElementById("tel-downloader-progress-" + taskId);
    if (existing) existing.remove();

    const isDarkMode =
      document.documentElement.classList.contains("night") ||
      document.documentElement.classList.contains("theme-dark") ||
      document.body.classList.contains("theme-dark") ||
      window.matchMedia("(prefers-color-scheme: dark)").matches;

    const card = document.createElement("div");
    card.id = "tel-downloader-progress-" + taskId;
    card.style.cssText = `
      width: 21rem;
      padding: 12px 14px;
      border-radius: 12px;
      box-sizing: border-box;
      pointer-events: auto;
      background: ${isDarkMode ? "rgba(28, 34, 43, 0.95)" : "rgba(255, 255, 255, 0.95)"};
      color: ${isDarkMode ? "#ffffff" : "#111111"};
      box-shadow: 0 8px 30px rgba(0, 0, 0, ${isDarkMode ? "0.5" : "0.2"});
      border: 1px solid ${isDarkMode ? "rgba(255, 255, 255, 0.12)" : "rgba(0, 0, 0, 0.08)"};
      backdrop-filter: blur(12px);
      transition: transform 0.2s ease, opacity 0.2s ease;
      display: flex;
      flex-direction: column;
      gap: 6px;
    `;

    // Header: Title & Close/Cancel
    const header = document.createElement("div");
    header.style.cssText = "display: flex; justify-content: space-between; align-items: center; gap: 8px;";

    const titleBox = document.createElement("div");
    titleBox.style.cssText = "display: flex; align-items: center; gap: 6px; overflow: hidden;";

    const icon = document.createElement("span");
    icon.innerText = fileName.endsWith(".ogg") || fileName.endsWith(".mp3") ? "🎵" : fileName.endsWith(".jpeg") || fileName.endsWith(".jpg") || fileName.endsWith(".png") ? "🖼️" : "🎬";
    icon.style.fontSize = "1rem";

    const title = document.createElement("p");
    title.className = "filename";
    title.style.cssText = `
      margin: 0;
      font-size: 0.85rem;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 15rem;
      color: inherit;
    `;
    title.innerText = fileName;
    title.title = fileName;

    titleBox.appendChild(icon);
    titleBox.appendChild(title);

    const closeBtn = document.createElement("div");
    closeBtn.style.cssText = `
      cursor: pointer;
      font-size: 1.25rem;
      line-height: 1;
      opacity: 0.7;
      padding: 2px 6px;
      border-radius: 4px;
      transition: opacity 0.15s, background-color 0.15s;
    `;
    closeBtn.innerHTML = "&times;";
    closeBtn.title = "Cancel / Close";
    closeBtn.onmouseenter = () => (closeBtn.style.opacity = "1");
    closeBtn.onmouseleave = () => (closeBtn.style.opacity = "0.7");
    closeBtn.onclick = () => {
      if (onCancel) onCancel();
      card.remove();
    };

    header.appendChild(titleBox);
    header.appendChild(closeBtn);

    // Progress Bar Track & Fill
    const track = document.createElement("div");
    track.className = "progress-track";
    track.style.cssText = `
      width: 100%;
      height: 8px;
      background: ${isDarkMode ? "rgba(255, 255, 255, 0.15)" : "rgba(0, 0, 0, 0.08)"};
      border-radius: 4px;
      overflow: hidden;
      position: relative;
    `;

    const fill = document.createElement("div");
    fill.className = "progress-fill";
    fill.style.cssText = `
      height: 100%;
      width: 0%;
      background: linear-gradient(90deg, #3390ec, #54a9eb);
      border-radius: 4px;
      transition: width 0.15s ease, background 0.3s ease;
    `;
    track.appendChild(fill);

    // Stats Row: [Size] [Speed · ETA] [Percentage]
    const statsRow = document.createElement("div");
    statsRow.className = "stats-row";
    statsRow.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.75rem;
      opacity: 0.85;
      font-variant-numeric: tabular-nums;
    `;

    const sizeText = document.createElement("span");
    sizeText.className = "size-text";
    sizeText.innerText = "0 B / Connecting...";

    const speedEtaText = document.createElement("span");
    speedEtaText.className = "speed-eta-text";
    speedEtaText.innerText = "";

    const percentText = document.createElement("span");
    percentText.className = "percent-text";
    percentText.style.fontWeight = "700";
    percentText.innerText = "0%";

    statsRow.appendChild(sizeText);
    statsRow.appendChild(speedEtaText);
    statsRow.appendChild(percentText);

    // Notification / Retry Bar (hidden by default)
    const noticeBar = document.createElement("div");
    noticeBar.className = "notice-bar";
    noticeBar.style.cssText = `
      display: none;
      font-size: 0.75rem;
      padding: 4px 8px;
      border-radius: 6px;
      margin-top: 2px;
      justify-content: space-between;
      align-items: center;
      background: rgba(235, 95, 95, 0.15);
      color: #ff6b6b;
    `;

    card.appendChild(header);
    card.appendChild(track);
    card.appendChild(statsRow);
    card.appendChild(noticeBar);

    container.appendChild(card);
    return card;
  };

  const updateProgress = (taskId, data) => {
    const card = document.getElementById("tel-downloader-progress-" + taskId);
    if (!card) return;

    const { fileName, loaded, total, speedText, etaText, percent } = data;

    if (fileName) {
      const nameEl = card.querySelector("p.filename");
      if (nameEl && nameEl.innerText !== fileName) {
        nameEl.innerText = fileName;
        nameEl.title = fileName;
      }
    }

    const fill = card.querySelector(".progress-fill");
    const sizeText = card.querySelector(".size-text");
    const speedEtaText = card.querySelector(".speed-eta-text");
    const percentText = card.querySelector(".percent-text");
    const noticeBar = card.querySelector(".notice-bar");

    if (noticeBar) noticeBar.style.display = "none";

    let calculatedPercent = 0;
    if (typeof percent === "number" && !isNaN(percent)) {
      calculatedPercent = Math.min(100, Math.max(0, percent));
    } else if (total && total > 0) {
      calculatedPercent = Math.min(100, Math.max(0, (loaded / total) * 100));
    }

    if (fill) {
      fill.style.width = `${calculatedPercent.toFixed(1)}%`;
      fill.style.background = "linear-gradient(90deg, #3390ec, #54a9eb)";
    }

    if (sizeText) {
      if (total && total > 0) {
        sizeText.innerText = `${formatBytes(loaded)} / ${formatBytes(total)}`;
      } else {
        sizeText.innerText = `${formatBytes(loaded)} (Streaming)`;
      }
    }

    if (speedEtaText) {
      if (speedText && speedText !== "--/s") {
        speedEtaText.innerText = `${speedText} · ${etaText}`;
      } else {
        speedEtaText.innerText = "";
      }
    }

    if (percentText) {
      if (total && total > 0) {
        percentText.innerText = `${calculatedPercent.toFixed(1)}%`;
      } else {
        percentText.innerText = ``;
      }
    }
  };

  const completeProgress = (taskId, totalBytes) => {
    const card = document.getElementById("tel-downloader-progress-" + taskId);
    if (!card) return;

    const fill = card.querySelector(".progress-fill");
    const sizeText = card.querySelector(".size-text");
    const speedEtaText = card.querySelector(".speed-eta-text");
    const percentText = card.querySelector(".percent-text");
    const noticeBar = card.querySelector(".notice-bar");

    if (noticeBar) noticeBar.style.display = "none";

    if (fill) {
      fill.style.width = "100%";
      fill.style.background = "linear-gradient(90deg, #2ecc71, #27ae60)";
    }
    if (sizeText) {
      sizeText.innerText = `✅ Completed (${formatBytes(totalBytes)})`;
    }
    if (speedEtaText) speedEtaText.innerText = "";
    if (percentText) percentText.innerText = "100%";

    setTimeout(() => {
      if (card && card.parentNode) {
        card.style.opacity = "0";
        card.style.transform = "translateX(20px)";
        setTimeout(() => card.remove(), 300);
      }
    }, 4000);
  };

  const showRetryNotice = (taskId, message, retryCount, maxRetries, delaySeconds, onManualRetry = null) => {
    const card = document.getElementById("tel-downloader-progress-" + taskId);
    if (!card) return;

    const fill = card.querySelector(".progress-fill");
    if (fill) fill.style.background = "linear-gradient(90deg, #f39c12, #e67e22)";

    const noticeBar = card.querySelector(".notice-bar");
    if (noticeBar) {
      noticeBar.style.display = "flex";
      noticeBar.style.background = "rgba(243, 156, 18, 0.15)";
      noticeBar.style.color = "#f39c12";

      let countdown = Math.ceil(delaySeconds);
      const updateNotice = () => {
        noticeBar.innerHTML = `
          <span>⚠️ ${message} (${retryCount}/${maxRetries}) ${countdown > 0 ? `${countdown}s` : ""}</span>
          <button class="retry-btn" style="
            background: #f39c12;
            color: #fff;
            border: none;
            border-radius: 4px;
            padding: 2px 8px;
            font-size: 0.72rem;
            cursor: pointer;
          ">Retry Now</button>
        `;
        const btn = noticeBar.querySelector(".retry-btn");
        if (btn) {
          btn.onclick = () => {
            if (onManualRetry) onManualRetry();
          };
        }
      };

      updateNotice();
      const timer = setInterval(() => {
        countdown--;
        if (countdown <= 0) {
          clearInterval(timer);
        } else {
          updateNotice();
        }
      }, 1000);
    }
  };

  const abortProgress = (taskId, errorMessage, onRetry = null) => {
    const card = document.getElementById("tel-downloader-progress-" + taskId);
    if (!card) return;

    const fill = card.querySelector(".progress-fill");
    if (fill) {
      fill.style.background = "linear-gradient(90deg, #e74c3c, #c0392b)";
    }

    const sizeText = card.querySelector(".size-text");
    if (sizeText) sizeText.innerText = "❌ Failed";

    const speedEtaText = card.querySelector(".speed-eta-text");
    if (speedEtaText) speedEtaText.innerText = "";

    const noticeBar = card.querySelector(".notice-bar");
    if (noticeBar) {
      noticeBar.style.display = "flex";
      noticeBar.style.background = "rgba(231, 76, 60, 0.15)";
      noticeBar.style.color = "#e74c3c";
      noticeBar.innerHTML = `
        <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:14rem;" title="${errorMessage}">${errorMessage || "Download aborted"}</span>
        ${onRetry ? `<button class="retry-btn" style="
          background: #3390ec;
          color: #fff;
          border: none;
          border-radius: 4px;
          padding: 2px 8px;
          font-size: 0.72rem;
          cursor: pointer;
        ">Retry</button>` : ""}
      `;

      if (onRetry) {
        const btn = noticeBar.querySelector(".retry-btn");
        if (btn) {
          btn.onclick = () => {
            noticeBar.style.display = "none";
            onRetry();
          };
        }
      }
    }
  };

  // ==========================
  // Core Download Engine
  // ==========================
  const tel_download_video = (url) => {
    if (!url) {
      const tempId = "err_" + Date.now();
      createProgressBar(tempId, "Video Stream");
      abortProgress(tempId, "未检测到视频流，请先点击播放视频");
      return;
    }

    const taskId = (Math.random() + 1).toString(36).substring(2, 10) + "_" + Date.now();
    let _blobs = [];
    let _committed_offset = 0;
    let _total_size = null;
    let _file_extension = "mp4";
    let _autoRetryCount = 0;
    let _abortController = new AbortController();
    let _isCancelled = false;
    let _writableStream = null;
    const speedTracker = new SpeedTracker();

    let fileName = hashCode(url) + "." + _file_extension;

    // Parse potential metadata in URL
    try {
      const decodedUrl = decodeURIComponent(url);
      const firstBrace = decodedUrl.indexOf('{');
      const lastBrace = decodedUrl.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        const metadata = JSON.parse(decodedUrl.substring(firstBrace, lastBrace + 1));
        if (metadata.fileName) fileName = metadata.fileName;
        if (metadata.size && typeof metadata.size === "number") _total_size = metadata.size;
      }
    } catch (e) {
      // Ignore JSON parse errors
    }

    logger.info(`Starting download: ${url}`, fileName);

    const onCancel = () => {
      _isCancelled = true;
      _abortController.abort();
      logger.info("Download cancelled by user", fileName);
    };

    createProgressBar(taskId, fileName, onCancel);
    updateProgress(taskId, {
      fileName,
      loaded: 0,
      total: _total_size,
      speedText: "--/s",
      etaText: "--",
      percent: 0,
    });

    const triggerSave = (finalFileName) => {
      logger.info("Saving file...", finalFileName);
      if (_writableStream) {
        _writableStream.close().then(() => {
          logger.info("Writable stream closed successfully", finalFileName);
          completeProgress(taskId, _committed_offset);
        }).catch((err) => {
          logger.error("Error closing writable stream: " + err.message, finalFileName);
          completeProgress(taskId, _committed_offset);
        });
      } else {
        const blob = new Blob(_blobs, { type: `video/${_file_extension}` });
        const blobUrl = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = finalFileName;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
          window.URL.revokeObjectURL(blobUrl);
        }, 3000);
        completeProgress(taskId, blob.size);
      }
    };

    // Fast path for blob: URLs
    if (url.startsWith("blob:")) {
      logger.info("Direct Blob URL detected, fetching complete blob...", fileName);
      fetch(url, { signal: _abortController.signal })
        .then(async (res) => {
          if (!res.ok) throw new Error(`Blob fetch HTTP ${res.status}`);
          const blob = await res.blob();
          _blobs = [blob];
          triggerSave(fileName);
        })
        .catch((err) => {
          logger.error("Blob fetch error: " + err.message, fileName);
          abortProgress(taskId, "Blob fetch error: " + err.message, () => tel_download_video(url));
        });
      return;
    }

    const fetchNextChunk = () => {
      if (_isCancelled) return;

      _abortController = new AbortController();

      const headers = {
        Range: `bytes=${_committed_offset}-`,
      };

      fetch(url, {
        method: "GET",
        headers,
        signal: _abortController.signal,
      })
        .then(async (res) => {
          if (_isCancelled) return;

          // Check for Range Not Satisfiable (416)
          if (res.status === 416) {
            if (_committed_offset > 0 && (_total_size === null || _committed_offset >= _total_size)) {
              logger.info("416 received, download complete", fileName);
              triggerSave(fileName);
              return;
            }
            throw new Error("HTTP 416 Range Not Satisfiable");
          }

          if (![200, 206].includes(res.status)) {
            throw new Error(`HTTP ${res.status} response received`);
          }

          const contentType = res.headers.get("Content-Type") || "";
          const mime = contentType.split(";")[0].trim();
          if (mime.startsWith("video/")) {
            const ext = mime.split("/")[1];
            if (ext && ext !== _file_extension) {
              _file_extension = ext;
              if (fileName.includes(".")) {
                fileName = fileName.substring(0, fileName.lastIndexOf(".") + 1) + _file_extension;
              }
            }
          }

          // Parse Content-Range / Content-Length
          const contentRange = res.headers.get("Content-Range");
          if (contentRange) {
            const match = contentRange.match(contentRangeRegex);
            if (match) {
              const startOffset = parseInt(match[1], 10);
              const endOffset = parseInt(match[2], 10);
              const totalSizeStr = match[3];

              if (!isNaN(startOffset) && startOffset !== _committed_offset) {
                logger.warn(`Gap detected: expected ${_committed_offset}, server returned ${startOffset}`, fileName);
                _committed_offset = startOffset;
              }

              if (totalSizeStr !== "*" && !isNaN(parseInt(totalSizeStr, 10))) {
                _total_size = parseInt(totalSizeStr, 10);
              }
            }
          } else if (res.status === 200) {
            // Full file single response
            const contentLength = res.headers.get("Content-Length");
            if (contentLength && !isNaN(parseInt(contentLength, 10))) {
              _total_size = parseInt(contentLength, 10);
            }
          }

          // Stream reading with ReadableStream
          if (!res.body) {
            const blob = await res.blob();
            const chunk = new Uint8Array(await blob.arrayBuffer());
            if (_writableStream) {
              await _writableStream.write(chunk);
            } else {
              _blobs.push(chunk);
            }
            _committed_offset += chunk.length;
            _autoRetryCount = 0;

            const stats = speedTracker.update(_committed_offset, _total_size);
            updateProgress(taskId, {
              fileName,
              loaded: _committed_offset,
              total: _total_size,
              speedText: stats.speedText,
              etaText: stats.etaText,
              percent: _total_size ? (_committed_offset / _total_size) * 100 : null,
            });
          } else {
            const reader = res.body.getReader();
            while (true) {
              if (_isCancelled) {
                reader.cancel();
                return;
              }
              const { done, value } = await reader.read();
              if (done) break;
              if (value && value.length > 0) {
                if (_writableStream) {
                  await _writableStream.write(value);
                } else {
                  _blobs.push(value);
                }
                _committed_offset += value.length;
                _autoRetryCount = 0;

                const stats = speedTracker.update(_committed_offset, _total_size);
                updateProgress(taskId, {
                  fileName,
                  loaded: _committed_offset,
                  total: _total_size,
                  speedText: stats.speedText,
                  etaText: stats.etaText,
                  percent: _total_size ? (_committed_offset / _total_size) * 100 : null,
                });
              }
            }
          }

          // Decide whether we need more chunks or we're done
          if (_total_size && _committed_offset < _total_size) {
            fetchNextChunk();
          } else {
            triggerSave(fileName);
          }
        })
        .catch((err) => {
          if (_isCancelled) return;

          logger.error(`Download chunk error: ${err.message || err}`, fileName);

          if (_autoRetryCount < MAX_AUTO_RETRIES) {
            const delay = RETRY_DELAYS_MS[_autoRetryCount] || 2000;
            _autoRetryCount++;
            logger.info(`Auto-retry #${_autoRetryCount} in ${delay}ms from offset ${_committed_offset}`, fileName);

            let timeoutId = setTimeout(() => {
              fetchNextChunk();
            }, delay);

            showRetryNotice(
              taskId,
              "Network hiccup, reconnecting...",
              _autoRetryCount,
              MAX_AUTO_RETRIES,
              delay / 1000,
              () => {
                clearTimeout(timeoutId);
                fetchNextChunk();
              }
            );
          } else {
            abortProgress(taskId, err.message || "Network error", () => {
              _autoRetryCount = 0;
              fetchNextChunk();
            });
          }
        });
    };

    // Check FileSystem Access API support
    const supportsFileSystemAccess =
      CONFIG.USE_FILE_PICKER &&
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
        .showSaveFilePicker({ suggestedName: fileName })
        .then(async (handle) => {
          try {
            _writableStream = await handle.createWritable();
            fileName = handle.name;
            fetchNextChunk();
          } catch (err) {
            logger.error("Failed to create writable stream: " + err.message);
            fetchNextChunk();
          }
        })
        .catch((err) => {
          if (err.name !== "AbortError") {
            logger.error("SaveFilePicker error: " + err.message);
            fetchNextChunk();
          } else {
            // User cancelled file picker
            const card = document.getElementById("tel-downloader-progress-" + taskId);
            if (card) card.remove();
          }
        });
    } else {
      fetchNextChunk();
    }
  };

  const tel_download_audio = (url) => {
    if (!url) return;
    const taskId = (Math.random() + 1).toString(36).substring(2, 10) + "_" + Date.now();
    let _blobs = [];
    let _committed_offset = 0;
    let _total_size = null;
    let _autoRetryCount = 0;
    let _abortController = new AbortController();
    let _isCancelled = false;
    let _writableStream = null;
    const speedTracker = new SpeedTracker();

    let fileName = hashCode(url) + ".ogg";

    const onCancel = () => {
      _isCancelled = true;
      _abortController.abort();
      logger.info("Audio download cancelled by user", fileName);
    };

    createProgressBar(taskId, fileName, onCancel);
    updateProgress(taskId, {
      fileName,
      loaded: 0,
      total: _total_size,
      speedText: "--/s",
      etaText: "--",
      percent: 0,
    });

    const triggerSave = (finalFileName) => {
      logger.info("Saving audio file...", finalFileName);
      if (_writableStream) {
        _writableStream.close().then(() => {
          completeProgress(taskId, _committed_offset);
        }).catch(() => completeProgress(taskId, _committed_offset));
      } else {
        const blob = new Blob(_blobs, { type: "audio/ogg" });
        const blobUrl = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = finalFileName;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
          window.URL.revokeObjectURL(blobUrl);
        }, 3000);
        completeProgress(taskId, blob.size);
      }
    };

    if (url.startsWith("blob:")) {
      fetch(url, { signal: _abortController.signal })
        .then(async (res) => {
          const blob = await res.blob();
          _blobs = [blob];
          triggerSave(fileName);
        })
        .catch((err) => {
          abortProgress(taskId, "Audio blob error: " + err.message);
        });
      return;
    }

    const fetchNextChunk = () => {
      if (_isCancelled) return;
      _abortController = new AbortController();

      fetch(url, {
        method: "GET",
        headers: { Range: `bytes=${_committed_offset}-` },
        signal: _abortController.signal,
      })
        .then(async (res) => {
          if (_isCancelled) return;

          if (res.status === 416) {
            if (_committed_offset > 0) {
              triggerSave(fileName);
              return;
            }
            throw new Error("HTTP 416");
          }

          if (![200, 206].includes(res.status)) {
            throw new Error(`HTTP ${res.status}`);
          }

          const contentRange = res.headers.get("Content-Range");
          if (contentRange) {
            const match = contentRange.match(contentRangeRegex);
            if (match) {
              const startOffset = parseInt(match[1], 10);
              const totalSizeStr = match[3];
              if (!isNaN(startOffset)) _committed_offset = startOffset;
              if (totalSizeStr !== "*" && !isNaN(parseInt(totalSizeStr, 10))) {
                _total_size = parseInt(totalSizeStr, 10);
              }
            }
          } else if (res.status === 200) {
            const cl = res.headers.get("Content-Length");
            if (cl && !isNaN(parseInt(cl, 10))) _total_size = parseInt(cl, 10);
          }

          if (!res.body) {
            const blob = await res.blob();
            const chunk = new Uint8Array(await blob.arrayBuffer());
            if (_writableStream) await _writableStream.write(chunk);
            else _blobs.push(chunk);
            _committed_offset += chunk.length;
          } else {
            const reader = res.body.getReader();
            while (true) {
              if (_isCancelled) {
                reader.cancel();
                return;
              }
              const { done, value } = await reader.read();
              if (done) break;
              if (value && value.length > 0) {
                if (_writableStream) await _writableStream.write(value);
                else _blobs.push(value);
                _committed_offset += value.length;
                _autoRetryCount = 0;

                const stats = speedTracker.update(_committed_offset, _total_size);
                updateProgress(taskId, {
                  fileName,
                  loaded: _committed_offset,
                  total: _total_size,
                  speedText: stats.speedText,
                  etaText: stats.etaText,
                  percent: _total_size ? (_committed_offset / _total_size) * 100 : null,
                });
              }
            }
          }

          if (_total_size && _committed_offset < _total_size) {
            fetchNextChunk();
          } else {
            triggerSave(fileName);
          }
        })
        .catch((err) => {
          if (_isCancelled) return;
          if (_autoRetryCount < MAX_AUTO_RETRIES) {
            const delay = RETRY_DELAYS_MS[_autoRetryCount] || 2000;
            _autoRetryCount++;
            let timeoutId = setTimeout(() => fetchNextChunk(), delay);
            showRetryNotice(
              taskId,
              "Reconnecting audio...",
              _autoRetryCount,
              MAX_AUTO_RETRIES,
              delay / 1000,
              () => {
                clearTimeout(timeoutId);
                fetchNextChunk();
              }
            );
          } else {
            abortProgress(taskId, err.message || "Audio download failed", () => {
              _autoRetryCount = 0;
              fetchNextChunk();
            });
          }
        });
    };

    fetchNextChunk();
  };

  const tel_download_image = (imageUrl) => {
    if (!imageUrl) return;
    const taskId = (Math.random() + 1).toString(36).substring(2, 10) + "_" + Date.now();
    const fileName = (Math.random() + 1).toString(36).substring(2, 10) + ".jpeg";

    createProgressBar(taskId, fileName);
    updateProgress(taskId, {
      fileName,
      loaded: 1,
      total: 1,
      speedText: "--/s",
      etaText: "--",
      percent: 100,
    });

    const a = document.createElement("a");
    document.body.appendChild(a);
    a.href = imageUrl;
    a.download = fileName;
    a.click();
    document.body.removeChild(a);

    completeProgress(taskId, 0);
    logger.info("Image download triggered", fileName);
  };

  logger.info("Initialized with advanced progress, multi-channel watchers and robust retry engine");

  // ============================================
  // DOM Observer / Button Injectors
  // ============================================

  // Helper to safely trigger video download with dynamic fallback
  const triggerVideoDownloadFromContainer = (container) => {
    let src = getVideoSrc(container);
    if (!src) {
      // If video element exists but src is not loaded yet, try to trigger load/play
      const video = container.querySelector("video") || container;
      if (video && typeof video.play === "function") {
        video.play().then(() => video.pause()).catch(() => {});
        src = getVideoSrc(container);
      }
    }
    if (src) {
      tel_download_video(src);
    } else {
      const tempId = "notice_" + Date.now();
      createProgressBar(tempId, "Video Player");
      abortProgress(tempId, "请先点击播放视频，缓冲后再点下载", () => {
        triggerVideoDownloadFromContainer(container);
      });
    }
  };

  // 1. For WebZ / WebA (/a/ and webz)
  setInterval(() => {
    // Stories in /a/
    const storiesContainer = document.getElementById("StoryViewer");
    if (storiesContainer) {
      const createDownloadButton = () => {
        const downloadIcon = document.createElement("i");
        downloadIcon.className = "icon icon-download";
        const downloadButton = document.createElement("button");
        downloadButton.className = "Button TkphaPyQ tiny translucent-white round tel-download";
        downloadButton.appendChild(downloadIcon);
        downloadButton.setAttribute("type", "button");
        downloadButton.setAttribute("title", "Download");
        downloadButton.setAttribute("aria-label", "Download");
        downloadButton.onclick = (e) => {
          e.stopPropagation();
          const videoSrc = getVideoSrc(storiesContainer);
          if (videoSrc) {
            tel_download_video(videoSrc);
          } else {
            const images = storiesContainer.querySelectorAll("img.PVZ8TOWS");
            const imageSrc = images.length > 0 ? images[images.length - 1]?.src : getImageSrc(storiesContainer);
            if (imageSrc) tel_download_image(imageSrc);
          }
        };
        return downloadButton;
      };

      const storyHeader =
        storiesContainer.querySelector(".GrsJNw3y") ||
        storiesContainer.querySelector(".DropdownMenu")?.parentNode;
      if (storyHeader && !storyHeader.querySelector(".tel-download")) {
        storyHeader.insertBefore(createDownloadButton(), storyHeader.querySelector("button"));
      }
    }

    // Media Viewer in /a/
    const mediaContainer = document.querySelector("#MediaViewer .MediaViewerSlide--active");
    const mediaViewerActions = document.querySelector("#MediaViewer .MediaViewerActions");
    if (mediaContainer && mediaViewerActions) {
      const videoPlayer = mediaContainer.querySelector(".MediaViewerContent > .VideoPlayer") || mediaContainer.querySelector(".VideoPlayer");
      const img = mediaContainer.querySelector(".MediaViewerContent > div > img") || mediaContainer.querySelector("img");

      if (videoPlayer) {
        // Controls Download Button
        const controls = videoPlayer.querySelector(".VideoPlayerControls");
        if (controls) {
          const buttons = controls.querySelector(".buttons");
          if (buttons && !buttons.querySelector("button.tel-download")) {
            const downloadIcon = document.createElement("i");
            downloadIcon.className = "icon icon-download";
            const downloadButton = document.createElement("button");
            downloadButton.className = "Button smaller translucent-white round tel-download";
            downloadButton.setAttribute("type", "button");
            downloadButton.setAttribute("title", "Download");
            downloadButton.appendChild(downloadIcon);
            downloadButton.onclick = (e) => {
              e.stopPropagation();
              triggerVideoDownloadFromContainer(videoPlayer);
            };
            const spacer = buttons.querySelector(".spacer");
            if (spacer) spacer.after(downloadButton);
            else buttons.appendChild(downloadButton);
          }
        }

        // Topbar Download Button
        if (!mediaViewerActions.querySelector("button.tel-download")) {
          const downloadIcon = document.createElement("i");
          downloadIcon.className = "icon icon-download";
          const downloadButton = document.createElement("button");
          downloadButton.className = "Button smaller translucent-white round tel-download";
          downloadButton.setAttribute("type", "button");
          downloadButton.setAttribute("title", "Download");
          downloadButton.appendChild(downloadIcon);
          downloadButton.onclick = (e) => {
            e.stopPropagation();
            triggerVideoDownloadFromContainer(videoPlayer);
          };
          mediaViewerActions.prepend(downloadButton);
        }
      } else if (img && img.src) {
        if (!mediaViewerActions.querySelector("button.tel-download")) {
          const downloadIcon = document.createElement("i");
          downloadIcon.className = "icon icon-download";
          const downloadButton = document.createElement("button");
          downloadButton.className = "Button smaller translucent-white round tel-download";
          downloadButton.setAttribute("type", "button");
          downloadButton.setAttribute("title", "Download");
          downloadButton.appendChild(downloadIcon);
          downloadButton.onclick = (e) => {
            e.stopPropagation();
            tel_download_image(img.src);
          };
          mediaViewerActions.prepend(downloadButton);
        }
      }
    }

    // In-Chat Message Videos in /a/
    const messageVideos = document.querySelectorAll(".Message .media-inner, .Message .VideoPlayer");
    messageVideos.forEach((msgMedia) => {
      if (msgMedia.querySelector(".tel-download-chat-btn")) return;
      const video = msgMedia.querySelector("video");
      if (!video) return;

      const btn = document.createElement("button");
      btn.className = "tel-download-chat-btn";
      btn.title = "Download Video";
      btn.style.cssText = `
        position: absolute;
        top: 8px;
        right: 8px;
        z-index: 10;
        background: rgba(0, 0, 0, 0.6);
        color: #fff;
        border: none;
        border-radius: 50%;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        font-size: 14px;
        opacity: 0.85;
        transition: opacity 0.2s, transform 0.2s;
      `;
      btn.innerHTML = "📥";
      btn.onmouseenter = () => (btn.style.opacity = "1", btn.style.transform = "scale(1.1)");
      btn.onmouseleave = () => (btn.style.opacity = "0.85", btn.style.transform = "scale(1)");
      btn.onclick = (e) => {
        e.stopPropagation();
        triggerVideoDownloadFromContainer(msgMedia);
      };
      if (getComputedStyle(msgMedia).position === "static") {
        msgMedia.style.position = "relative";
      }
      msgMedia.appendChild(btn);
    });
  }, REFRESH_DELAY);

  // 2. For WebK (/k/ and webk)
  setInterval(() => {
    // Pinned Audio / Circle Video
    const pinnedAudio = document.body.querySelector(".pinned-audio");
    let dataMid;
    let downloadButtonPinnedAudio =
      document.body.querySelector("._tel_download_button_pinned_container") ||
      document.createElement("button");
    if (pinnedAudio) {
      dataMid = pinnedAudio.getAttribute("data-mid");
      downloadButtonPinnedAudio.className = "btn-icon tgico-download _tel_download_button_pinned_container";
      downloadButtonPinnedAudio.innerHTML = `<span class="tgico button-icon">${DOWNLOAD_ICON}</span>`;
    }

    const audioElements = document.body.querySelectorAll("audio-element");
    audioElements.forEach((audioElement) => {
      const bubble = audioElement.closest(".bubble");
      if (!bubble || bubble.querySelector("._tel_download_button_pinned_container")) return;

      if (
        dataMid &&
        downloadButtonPinnedAudio.getAttribute("data-mid") !== dataMid &&
        audioElement.getAttribute("data-mid") === dataMid
      ) {
        downloadButtonPinnedAudio.onclick = (e) => {
          e.stopPropagation();
          const link = audioElement.audio && audioElement.audio.getAttribute("src");
          const isAudio = audioElement.audio && audioElement.audio instanceof HTMLAudioElement;
          if (link) {
            if (isAudio) tel_download_audio(link);
            else tel_download_video(link);
          }
        };
        downloadButtonPinnedAudio.setAttribute("data-mid", dataMid);
        const link = audioElement.audio && audioElement.audio.getAttribute("src");
        if (link) {
          pinnedAudio.querySelector(".pinned-container-wrapper-utils")?.appendChild(downloadButtonPinnedAudio);
        }
      }
    });

    // Stories in /k/
    const storiesContainer = document.getElementById("stories-viewer");
    if (storiesContainer) {
      const createDownloadButton = () => {
        const downloadButton = document.createElement("button");
        downloadButton.className = "btn-icon rp tel-download";
        downloadButton.innerHTML = `<span class="tgico">${DOWNLOAD_ICON}</span><div class="c-ripple"></div>`;
        downloadButton.setAttribute("type", "button");
        downloadButton.setAttribute("title", "Download");
        downloadButton.setAttribute("aria-label", "Download");
        downloadButton.onclick = (e) => {
          e.stopPropagation();
          const videoSrc = getVideoSrc(storiesContainer);
          if (videoSrc) {
            tel_download_video(videoSrc);
          } else {
            const imageSrc = storiesContainer.querySelector("img.media-photo")?.src;
            if (imageSrc) tel_download_image(imageSrc);
          }
        };
        return downloadButton;
      };

      const storyHeader = storiesContainer.querySelector("[class^='_ViewerStoryHeaderRight']");
      if (storyHeader && !storyHeader.querySelector(".tel-download")) {
        storyHeader.prepend(createDownloadButton());
      }

      const storyFooter = storiesContainer.querySelector("[class^='_ViewerStoryFooterRight']");
      if (storyFooter && !storyFooter.querySelector(".tel-download")) {
        storyFooter.prepend(createDownloadButton());
      }
    }

    // Media Viewer in /k/
    const mediaContainer = document.querySelector(".media-viewer-whole");
    if (mediaContainer) {
      const mediaAspecter = mediaContainer.querySelector(".media-viewer-movers .media-viewer-aspecter");
      const mediaButtons = mediaContainer.querySelector(".media-viewer-topbar .media-viewer-buttons");

      if (mediaAspecter && mediaButtons) {
        // Unhide Telegram's native hidden buttons
        const hiddenButtons = mediaButtons.querySelectorAll("button.btn-icon.hide");
        for (const btn of hiddenButtons) {
          btn.classList.remove("hide");
          if (btn.textContent === FORWARD_ICON) btn.classList.add("tgico-forward");
          if (btn.textContent === DOWNLOAD_ICON) btn.classList.add("tgico-download");
        }

        // Custom Download Button in controls
        const controls = mediaAspecter.querySelector(".default__controls.ckin__controls");
        if (controls && !controls.querySelector(".tel-download")) {
          const brControls = controls.querySelector(".bottom-controls .right-controls");
          const downloadButton = document.createElement("button");
          downloadButton.className = "btn-icon default__button tgico-download tel-download";
          downloadButton.innerHTML = `<span class="tgico">${DOWNLOAD_ICON}</span>`;
          downloadButton.setAttribute("type", "button");
          downloadButton.setAttribute("title", "Download");
          downloadButton.onclick = (e) => {
            e.stopPropagation();
            triggerVideoDownloadFromContainer(mediaAspecter);
          };
          if (brControls) brControls.prepend(downloadButton);
        }

        // Custom Download Button in topbar
        if (!mediaButtons.querySelector(".tel-download-topbar")) {
          const downloadButton = document.createElement("button");
          downloadButton.className = "btn-icon tgico-download tel-download tel-download-topbar";
          downloadButton.innerHTML = `<span class="tgico button-icon">${DOWNLOAD_ICON}</span>`;
          downloadButton.setAttribute("type", "button");
          downloadButton.setAttribute("title", "Download");
          downloadButton.onclick = (e) => {
            e.stopPropagation();
            const video = mediaAspecter.querySelector("video");
            if (video) {
              triggerVideoDownloadFromContainer(mediaAspecter);
            } else {
              const img = mediaAspecter.querySelector("img.thumbnail") || mediaAspecter.querySelector("img");
              if (img && img.src) tel_download_image(img.src);
            }
          };
          mediaButtons.prepend(downloadButton);
        }
      }
    }

    // In-Chat Message Videos in /k/
    const chatVideos = document.querySelectorAll(".bubble .media-viewer-aspecter, .bubble .video-player");
    chatVideos.forEach((bubbleMedia) => {
      if (bubbleMedia.querySelector(".tel-download-chat-btn")) return;
      const video = bubbleMedia.querySelector("video");
      if (!video) return;

      const btn = document.createElement("button");
      btn.className = "tel-download-chat-btn";
      btn.title = "Download Video";
      btn.style.cssText = `
        position: absolute;
        top: 8px;
        right: 8px;
        z-index: 10;
        background: rgba(0, 0, 0, 0.6);
        color: #fff;
        border: none;
        border-radius: 50%;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        font-size: 14px;
        opacity: 0.85;
        transition: opacity 0.2s, transform 0.2s;
      `;
      btn.innerHTML = "📥";
      btn.onmouseenter = () => (btn.style.opacity = "1", btn.style.transform = "scale(1.1)");
      btn.onmouseleave = () => (btn.style.opacity = "0.85", btn.style.transform = "scale(1)");
      btn.onclick = (e) => {
        e.stopPropagation();
        triggerVideoDownloadFromContainer(bubbleMedia);
      };
      if (getComputedStyle(bubbleMedia).position === "static") {
        bubbleMedia.style.position = "relative";
      }
      bubbleMedia.appendChild(btn);
    });
  }, REFRESH_DELAY);

  // 3. For Telegram Channel Post Preview (t.me/*)
  setInterval(() => {
    const postVideos = document.querySelectorAll(".tgme_widget_message_video_player, .tgme_widget_message_video");
    postVideos.forEach((postMedia) => {
      if (postMedia.querySelector(".tel-download-chat-btn")) return;
      const video = postMedia.querySelector("video");
      if (!video) return;

      const btn = document.createElement("button");
      btn.className = "tel-download-chat-btn";
      btn.title = "Download Video";
      btn.style.cssText = `
        position: absolute;
        top: 10px;
        right: 10px;
        z-index: 99;
        background: rgba(0, 0, 0, 0.65);
        color: #fff;
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 50%;
        width: 36px;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        font-size: 16px;
        opacity: 0.9;
        transition: opacity 0.2s, transform 0.2s;
      `;
      btn.innerHTML = "📥";
      btn.onmouseenter = () => (btn.style.opacity = "1", btn.style.transform = "scale(1.1)");
      btn.onmouseleave = () => (btn.style.opacity = "0.9", btn.style.transform = "scale(1)");
      btn.onclick = (e) => {
        e.stopPropagation();
        triggerVideoDownloadFromContainer(postMedia);
      };
      if (getComputedStyle(postMedia).position === "static") {
        postMedia.style.position = "relative";
      }
      postMedia.appendChild(btn);
    });
  }, REFRESH_DELAY);

  logger.info("Completed script setup.");
})();
