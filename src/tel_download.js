// ==UserScript==
// @name         Telegram Media Downloader Pro
// @name:en      Telegram Media Downloader Pro
// @name:zh-CN   Telegram 受限图片视频下载器
// @name:zh-TW   Telegram 受限圖片影片下載器
// @name:ru      Telegram: загрузчик медиафайлов
// @version      1.208
// @namespace    https://github.com/Neet-Nestor/Telegram-Media-Downloader
// @description  Enhanced downloader for images, GIFs, videos, and voice messages with better UX, performance optimizations, and advanced features
// @description:en Enhanced downloader for images, GIFs, videos, and voice messages with better UX, performance optimizations, and advanced features
// @description:ru Улучшенный загрузчик изображений, GIF, видео и голосовых сообщений с лучшим UX и оптимизацией
// @description:zh-CN 增强版Telegram媒体下载器，具有更好的用户体验、性能优化和高级功能
// @description:zh-TW 增強版Telegram媒體下載器，具有更好的用戶體驗、效能最佳化和進階功能
// @author       Nestor Qin
// @downloadURL https://update.greasyfork.org/scripts/446342/Telegram%20Media%20Downloader.user.js
// @updateURL https://update.greasyfork.org/scripts/446342/Telegram%20Media%20Downloader.meta.js
// @license      GNU GPLv3
// @match        https://web.telegram.org/*
// @match        https://webk.telegram.org/*
// @match        https://webz.telegram.org/*
// @icon         https://img.icons8.com/color/452/telegram-app--v5.png
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_notification
// @run-at       document-start
// ==/UserScript==

(() => {
  'use strict';

  // ================== CONSTANTS & CONFIGURATION ==================
  const CONFIG = {
    REFRESH_DELAY: 300, // Reduced for better responsiveness
    MAX_RETRY_ATTEMPTS: 3,
    CHUNK_SIZE: 1024 * 1024, // 1MB chunks
    NOTIFICATION_TIMEOUT: 5000,
    ANIMATION_DURATION: 300,
    ICONS: {
      DOWNLOAD: '\uE95B',
      FORWARD: '\uE976',
      SUCCESS: '✅',
      ERROR: '❌',
      PAUSE: '⏸️',
      RESUME: '▶️',
      CANCEL: '❌'
    }
  };

  const SELECTORS = {
    MEDIA_VIEWER: '#MediaViewer .MediaViewerSlide--active',
    MEDIA_ACTIONS: '#MediaViewer .MediaViewerActions',
    STORIES_CONTAINER: '#StoryViewer, #stories-viewer',
    VIDEO_PLAYER: '.VideoPlayer video, .ckin__player video, video.media-video',
    IMAGE: 'img.PVZ8TOWS, img.thumbnail, img.media-photo'
  };

  // ================== ENHANCED LOGGER ==================
  class Logger {
    constructor(prefix = '[Telegram Downloader Pro]') {
      this.prefix = prefix;
      this.levels = { INFO: 0, WARN: 1, ERROR: 2 };
      this.currentLevel = this.levels.INFO;
    }

    log(level, message, fileName = null, ...args) {
      if (this.levels[level] >= this.currentLevel) {
        const timestamp = new Date().toISOString();
        const fullMessage = `${this.prefix} [${timestamp}] ${fileName ? `${fileName}: ` : ''}${message}`;

        switch (level) {
          case 'ERROR':
            console.error(fullMessage, ...args);
            break;
          case 'WARN':
            console.warn(fullMessage, ...args);
            break;
          default:
            console.log(fullMessage, ...args);
        }
      }
    }

    info(message, fileName = null, ...args) { this.log('INFO', message, fileName, ...args); }
    warn(message, fileName = null, ...args) { this.log('WARN', message, fileName, ...args); }
    error(message, fileName = null, ...args) { this.log('ERROR', message, fileName, ...args); }
  }

  const logger = new Logger();

  // ================== UTILITIES ==================
  class Utils {
    static hashCode(str) {
      let hash = 0;
      if (str.length === 0) return hash;
      for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
      }
      return Math.abs(hash).toString(36);
    }

    static generateId() {
      return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    static formatBytes(bytes) {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    static extractFileName(url, defaultExt = 'mp4') {
      try {
        // Try to extract from metadata in URL
        const urlParts = url.split('/');
        const lastPart = urlParts[urlParts.length - 1];
        const metadata = JSON.parse(decodeURIComponent(lastPart));

        if (metadata.fileName) {
          return metadata.fileName;
        }
      } catch (e) {
        // Fallback to hash-based naming
      }

      return `${this.hashCode(url)}.${defaultExt}`;
    }

    static isDarkMode() {
      const html = document.querySelector('html');
      return html?.classList.contains('night') ||
             html?.classList.contains('theme-dark') ||
             window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    static debounce(func, wait) {
      let timeout;
      return function executedFunction(...args) {
        const later = () => {
          clearTimeout(timeout);
          func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
      };
    }

    static async sleep(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }
  }

  // ================== ENHANCED PROGRESS BAR ==================
  class ProgressManager {
    constructor() {
      this.activeDownloads = new Map();
      this.containerReady = false;
      this.pendingCards = [];
      this.ensureContainer();
    }

    async ensureContainer() {
      // Wait for DOM to be ready
      await this.waitForDOM();
      this.setupContainer();
    }

    async waitForDOM() {
      return new Promise(resolve => {
        if (document.body) {
          resolve();
          return;
        }

        const checkDOM = () => {
          if (document.body) {
            resolve();
          } else {
            setTimeout(checkDOM, 10);
          }
        };

        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', resolve);
        } else {
          checkDOM();
        }
      });
    }

    setupContainer() {
      if (document.getElementById('tel-progress-container') || !document.body) return;

      try {
        const container = document.createElement('div');
        container.id = 'tel-progress-container';
        container.style.cssText = `
          position: fixed;
          bottom: 20px;
          right: 20px;
          z-index: ${location.pathname.startsWith('/k/') ? 4 : 1600};
          max-width: 400px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        `;

        document.body.appendChild(container);
        this.containerReady = true;

        // Process any pending cards
        this.processPendingCards();

        logger.info('Progress container created successfully');
      } catch (error) {
        logger.error('Failed to create progress container:', null, error.message);
      }
    }

    processPendingCards() {
      while (this.pendingCards.length > 0) {
        const cardData = this.pendingCards.shift();
        this.createProgressCard(cardData.downloadId, cardData.fileName, cardData.fileSize);
      }
    }

    createProgressCard(downloadId, fileName, fileSize = null) {
      // If container not ready, queue the card creation
      if (!this.containerReady) {
        this.pendingCards.push({ downloadId, fileName, fileSize });
        return downloadId;
      }

      const container = document.getElementById('tel-progress-container');
      if (!container) {
        logger.error('Progress container not found');
        return downloadId;
      }

      const isDark = Utils.isDarkMode();
      const card = document.createElement('div');
      card.id = `progress-${downloadId}`;
      card.style.cssText = `
        background: ${isDark ? 'rgba(30, 30, 30, 0.95)' : 'rgba(255, 255, 255, 0.95)'};
        border: 1px solid ${isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'};
        border-radius: 12px;
        padding: 16px;
        margin-bottom: 12px;
        backdrop-filter: blur(10px);
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
        transform: translateX(100%);
        transition: all ${CONFIG.ANIMATION_DURATION}ms cubic-bezier(0.4, 0, 0.2, 1);
        max-width: 100%;
      `;

      const header = document.createElement('div');
      header.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
      `;

      const fileInfo = document.createElement('div');
      fileInfo.style.cssText = `
        flex: 1;
        min-width: 0;
      `;

      const fileName_ = document.createElement('div');
      fileName_.style.cssText = `
        font-weight: 600;
        font-size: 14px;
        color: ${isDark ? '#ffffff' : '#000000'};
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        margin-bottom: 4px;
      `;
      fileName_.textContent = fileName;

      const fileSize_ = document.createElement('div');
      fileSize_.style.cssText = `
        font-size: 12px;
        color: ${isDark ? '#aaaaaa' : '#666666'};
      `;
      fileSize_.textContent = fileSize ? Utils.formatBytes(fileSize) : 'Calculating...';

      const controls = document.createElement('div');
      controls.style.cssText = `
        display: flex;
        gap: 8px;
        margin-left: 12px;
      `;

      const pauseBtn = this.createControlButton(CONFIG.ICONS.PAUSE, 'Pause', () => {
        this.pauseDownload(downloadId);
      });

      const cancelBtn = this.createControlButton(CONFIG.ICONS.CANCEL, 'Cancel', () => {
        this.cancelDownload(downloadId);
      });

      controls.appendChild(pauseBtn);
      controls.appendChild(cancelBtn);

      const progressBar = document.createElement('div');
      progressBar.style.cssText = `
        background: ${isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'};
        border-radius: 8px;
        height: 8px;
        overflow: hidden;
        position: relative;
      `;

      const progressFill = document.createElement('div');
      progressFill.style.cssText = `
        background: linear-gradient(90deg, #4CAF50, #45a049);
        height: 100%;
        width: 0%;
        border-radius: 8px;
        transition: width 0.3s ease;
      `;

      const statusText = document.createElement('div');
      statusText.style.cssText = `
        font-size: 12px;
        color: ${isDark ? '#aaaaaa' : '#666666'};
        margin-top: 8px;
        text-align: center;
      `;
      statusText.textContent = '0% • Initializing...';

      fileInfo.appendChild(fileName_);
      fileInfo.appendChild(fileSize_);
      header.appendChild(fileInfo);
      header.appendChild(controls);
      progressBar.appendChild(progressFill);
      card.appendChild(header);
      card.appendChild(progressBar);
      card.appendChild(statusText);

      container.appendChild(card);

      // Animate in
      requestAnimationFrame(() => {
        card.style.transform = 'translateX(0)';
      });

      this.activeDownloads.set(downloadId, {
        card,
        progressFill,
        statusText,
        fileName: fileName_,
        fileSize: fileSize_,
        controls: { pauseBtn, cancelBtn },
        isPaused: false,
        isCancelled: false
      });

      return downloadId;
    }

    createControlButton(icon, title, onClick) {
      const button = document.createElement('button');
      button.style.cssText = `
        background: transparent;
        border: none;
        cursor: pointer;
        font-size: 16px;
        padding: 4px;
        border-radius: 4px;
        transition: background 0.2s ease;
      `;
      button.textContent = icon;
      button.title = title;
      button.onclick = onClick;

      button.onmouseenter = () => {
        button.style.background = Utils.isDarkMode() ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
      };
      button.onmouseleave = () => {
        button.style.background = 'transparent';
      };

      return button;
    }

    updateProgress(downloadId, progress, status = '', speed = null) {
      const download = this.activeDownloads.get(downloadId);
      if (!download) return;

      download.progressFill.style.width = `${progress}%`;

      let statusText = `${progress}%`;
      if (status) statusText += ` • ${status}`;
      if (speed) statusText += ` • ${Utils.formatBytes(speed)}/s`;

      download.statusText.textContent = statusText;
    }

    completeDownload(downloadId, message = 'Download completed') {
      const download = this.activeDownloads.get(downloadId);
      if (!download) return;

      download.progressFill.style.background = 'linear-gradient(90deg, #4CAF50, #45a049)';
      download.statusText.textContent = `${CONFIG.ICONS.SUCCESS} ${message}`;
      download.controls.pauseBtn.style.display = 'none';
      download.controls.cancelBtn.textContent = '×';
      download.controls.cancelBtn.title = 'Close';

      // Auto-remove after delay
      setTimeout(() => {
        this.removeDownload(downloadId);
      }, CONFIG.NOTIFICATION_TIMEOUT);
    }

    errorDownload(downloadId, error = 'Download failed') {
      const download = this.activeDownloads.get(downloadId);
      if (!download) return;

      download.progressFill.style.background = 'linear-gradient(90deg, #f44336, #d32f2f)';
      download.statusText.textContent = `${CONFIG.ICONS.ERROR} ${error}`;
      download.controls.pauseBtn.style.display = 'none';
      download.controls.cancelBtn.textContent = '×';
      download.controls.cancelBtn.title = 'Close';
    }

    pauseDownload(downloadId) {
      const download = this.activeDownloads.get(downloadId);
      if (!download) return;

      download.isPaused = !download.isPaused;
      download.controls.pauseBtn.textContent = download.isPaused ? CONFIG.ICONS.RESUME : CONFIG.ICONS.PAUSE;
      download.controls.pauseBtn.title = download.isPaused ? 'Resume' : 'Pause';

      if (download.isPaused) {
        download.statusText.textContent += ' (Paused)';
      }
    }

    cancelDownload(downloadId) {
      const download = this.activeDownloads.get(downloadId);
      if (!download) return;

      download.isCancelled = true;
      this.removeDownload(downloadId);
    }

    removeDownload(downloadId) {
      const download = this.activeDownloads.get(downloadId);
      if (!download) return;

      download.card.style.transform = 'translateX(100%)';
      download.card.style.opacity = '0';

      setTimeout(() => {
        download.card.remove();
        this.activeDownloads.delete(downloadId);
      }, CONFIG.ANIMATION_DURATION);
    }

    isDownloadActive(downloadId) {
      const download = this.activeDownloads.get(downloadId);
      return download && !download.isCancelled;
    }

    isDownloadPaused(downloadId) {
      const download = this.activeDownloads.get(downloadId);
      return download && download.isPaused;
    }
  }

  const progressManager = new ProgressManager();

  // ================== ENHANCED DOWNLOADER ==================
  class MediaDownloader {
    constructor() {
      this.contentRangeRegex = /^bytes (\d+)-(\d+)\/(\d+)$/;
      this.activeDownloads = new Map();
    }

    async downloadVideo(url, customFileName = null) {
      const downloadId = Utils.generateId();
      const fileName = customFileName || Utils.extractFileName(url, 'mp4');

      logger.info(`Starting video download: ${url}`, fileName);

      let blobs = [];
      let nextOffset = 0;
      let totalSize = null;
      let startTime = Date.now();
      let lastProgressTime = Date.now();
      let lastDownloadedBytes = 0;

      progressManager.createProgressCard(downloadId, fileName);

      const fetchChunk = async (writable = null) => {
        try {
          if (!progressManager.isDownloadActive(downloadId)) {
            throw new Error('Download cancelled');
          }

          while (progressManager.isDownloadPaused(downloadId)) {
            await Utils.sleep(100);
          }

          const response = await fetch(url, {
            method: 'GET',
            headers: {
              'Range': `bytes=${nextOffset}-`,
              'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/117.0'
            }
          });

          if (![200, 206].includes(response.status)) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          const contentType = response.headers.get('Content-Type')?.split(';')[0];
          if (!contentType?.startsWith('video/')) {
            throw new Error(`Invalid content type: ${contentType}`);
          }

          const contentRange = response.headers.get('Content-Range');
          if (contentRange) {
            const match = contentRange.match(this.contentRangeRegex);
            if (!match) {
              throw new Error('Invalid Content-Range header');
            }

            const [, startStr, endStr, totalStr] = match;
            const start = parseInt(startStr);
            const end = parseInt(endStr);
            const total = parseInt(totalStr);

            if (start !== nextOffset) {
              throw new Error(`Gap detected: expected ${nextOffset}, got ${start}`);
            }

            if (totalSize && total !== totalSize) {
              throw new Error('Total size mismatch');
            }

            nextOffset = end + 1;
            totalSize = total;
          }

          const blob = await response.blob();

          if (writable) {
            await writable.write(blob);
          } else {
            blobs.push(blob);
          }

          // Calculate and update progress
          const progress = totalSize ? Math.round((nextOffset * 100) / totalSize) : 0;
          const currentTime = Date.now();
          const timeDiff = currentTime - lastProgressTime;

          if (timeDiff > 1000) { // Update speed every second
            const bytesDiff = nextOffset - lastDownloadedBytes;
            const speed = bytesDiff / (timeDiff / 1000);
            progressManager.updateProgress(downloadId, progress, 'Downloading', speed);
            lastProgressTime = currentTime;
            lastDownloadedBytes = nextOffset;
          } else {
            progressManager.updateProgress(downloadId, progress, 'Downloading');
          }

          // Continue if more data needed
          if (totalSize && nextOffset < totalSize) {
            await fetchChunk(writable);
          } else {
            if (writable) {
              await writable.close();
            } else {
              await this.saveBlob(blobs, fileName);
            }
            progressManager.completeDownload(downloadId);
            logger.info('Video download completed', fileName);
          }

        } catch (error) {
          logger.error('Download error:', fileName, error.message);
          progressManager.errorDownload(downloadId, error.message);
        }
      };

      // Try to use File System Access API
      if (this.supportsFileSystemAccess()) {
        try {
          const handle = await window.showSaveFilePicker({
            suggestedName: fileName,
            types: [{
              description: 'Video files',
              accept: { 'video/*': ['.mp4', '.webm', '.mkv'] }
            }]
          });

          const writable = await handle.createWritable();
          await fetchChunk(writable);
        } catch (error) {
          if (error.name !== 'AbortError') {
            logger.error('File System Access API error:', fileName, error.message);
            await fetchChunk(); // Fallback to blob method
          }
        }
      } else {
        await fetchChunk();
      }
    }

    async downloadAudio(url, customFileName = null) {
      const downloadId = Utils.generateId();
      const fileName = customFileName || Utils.extractFileName(url, 'ogg');

      logger.info(`Starting audio download: ${url}`, fileName);
      progressManager.createProgressCard(downloadId, fileName);

      try {
        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const contentType = response.headers.get('Content-Type')?.split(';')[0];
        if (!contentType?.startsWith('audio/')) {
          throw new Error(`Invalid content type: ${contentType}`);
        }

        const blob = await response.blob();
        await this.saveBlob([blob], fileName);
        progressManager.completeDownload(downloadId);

        logger.info('Audio download completed', fileName);
      } catch (error) {
        logger.error('Audio download error:', fileName, error.message);
        progressManager.errorDownload(downloadId, error.message);
      }
    }

    async downloadImage(url, customFileName = null) {
      const fileName = customFileName || Utils.extractFileName(url, 'jpg');

      logger.info(`Downloading image: ${url}`, fileName);

      try {
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.style.display = 'none';

        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        // Show quick notification
        this.showNotification('Image download started', fileName);
        logger.info('Image download triggered', fileName);
      } catch (error) {
        logger.error('Image download error:', fileName, error.message);
        this.showNotification('Image download failed', error.message, 'error');
      }
    }

    async saveBlob(blobs, fileName) {
      logger.info(`Saving ${blobs.length} blobs`, fileName);

      const totalBlob = new Blob(blobs);
      const url = URL.createObjectURL(totalBlob);

      try {
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.style.display = 'none';

        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        logger.info(`Blob saved: ${Utils.formatBytes(totalBlob.size)}`, fileName);
      } finally {
        URL.revokeObjectURL(url);
      }
    }

    supportsFileSystemAccess() {
      return 'showSaveFilePicker' in window && window.self === window.top;
    }

    showNotification(title, message, type = 'info') {
      // Try to use Greasemonkey notification first
      if (typeof GM_notification !== 'undefined') {
        GM_notification({
          title,
          text: message,
          timeout: CONFIG.NOTIFICATION_TIMEOUT,
          onclick: () => {}
        });
      } else {
        // Fallback to browser notification
        if (Notification.permission === 'granted') {
          new Notification(title, {
            body: message,
            icon: 'https://img.icons8.com/color/452/telegram-app--v5.png'
          });
        }
      }
    }
  }

  const downloader = new MediaDownloader();

  // ================== ENHANCED UI MANAGER ==================
  class UIManager {
    constructor() {
      this.observer = null;
      this.buttonCache = new WeakMap();
      this.debouncedUpdate = Utils.debounce(() => this.updateUI(), CONFIG.REFRESH_DELAY);
      this.init();
    }

    init() {
      this.setupObserver();
      this.requestNotificationPermission();
      logger.info('UI Manager initialized');
    }

    setupObserver() {
      this.observer = new MutationObserver(this.debouncedUpdate);
      this.observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['src', 'class']
      });
    }

    updateUI() {
      try {
        this.handleMediaViewer();
        this.handleStories();
        this.handleAudioElements();
      } catch (error) {
        logger.error('UI update error:', null, error.message);
      }
    }

    handleMediaViewer() {
      const mediaContainer = document.querySelector(SELECTORS.MEDIA_VIEWER);
      const mediaActions = document.querySelector(SELECTORS.MEDIA_ACTIONS);

      if (!mediaContainer || !mediaActions) return;

      const videoPlayer = mediaContainer.querySelector(SELECTORS.VIDEO_PLAYER);
      const image = mediaContainer.querySelector(SELECTORS.IMAGE);

      if (videoPlayer?.src && !this.hasDownloadButton(mediaActions, videoPlayer.src)) {
        this.addDownloadButton(mediaActions, () => {
          downloader.downloadVideo(videoPlayer.src);
        }, 'video');
      }

      if (image?.src && !this.hasDownloadButton(mediaActions, image.src)) {
        this.addDownloadButton(mediaActions, () => {
          downloader.downloadImage(image.src);
        }, 'image');
      }
    }

    handleStories() {
      const storiesContainer = document.querySelector(SELECTORS.STORIES_CONTAINER);
      if (!storiesContainer) return;

      const video = storiesContainer.querySelector(SELECTORS.VIDEO_PLAYER);
      const image = storiesContainer.querySelector(SELECTORS.IMAGE);

      const headerSelector = storiesContainer.id === 'StoryViewer'
        ? '.GrsJNw3y, .DropdownMenu'
        : '[class^="_ViewerStoryHeaderRight"], [class^="_ViewerStoryFooterRight"]';

      const header = storiesContainer.querySelector(headerSelector);

      if (header && !header.querySelector('.tel-download')) {
        const downloadBtn = this.createDownloadButton(() => {
          if (video?.src) {
            downloader.downloadVideo(video.src);
          } else if (image?.src) {
            downloader.downloadImage(image.src);
          }
        }, 'story');

        header.insertBefore(downloadBtn, header.firstChild);
      }
    }

    handleAudioElements() {
      const audioElements = document.querySelectorAll('audio-element');
      audioElements.forEach(audioElement => {
        const bubble = audioElement.closest('.bubble');
        if (!bubble || bubble.querySelector('.tel-download')) return;

        const audio = audioElement.audio;
        if (audio?.src) {
          const downloadBtn = this.createDownloadButton(() => {
            if (audio instanceof HTMLAudioElement) {
              downloader.downloadAudio(audio.src);
            } else {
              downloader.downloadVideo(audio.src);
            }
          }, 'audio');

          bubble.appendChild(downloadBtn);
        }
      });
    }

    createDownloadButton(onClick, type = 'default') {
      const button = document.createElement('button');
      button.className = `tel-download btn-icon ${this.getButtonClass(type)}`;
      button.innerHTML = this.getButtonHTML(type);
      button.setAttribute('type', 'button');
      button.setAttribute('title', 'Download');
      button.setAttribute('aria-label', 'Download');
      button.onclick = (e) => {
        e.stopPropagation();
        e.preventDefault();
        onClick();
      };

      // Add hover effects
      button.style.transition = 'all 0.2s ease';
      button.onmouseenter = () => {
        button.style.transform = 'scale(1.1)';
        button.style.opacity = '0.8';
      };
      button.onmouseleave = () => {
        button.style.transform = 'scale(1)';
        button.style.opacity = '1';
      };

      return button;
    }

    getButtonClass(type) {
      const classes = {
        video: 'tgico-download translucent-white round',
        image: 'tgico-download translucent-white round',
        story: 'rp',
        audio: 'tgico-download',
        default: 'tgico-download'
      };
      return classes[type] || classes.default;
    }

    getButtonHTML(type) {
      if (type === 'story') {
        return `<span class="tgico">${CONFIG.ICONS.DOWNLOAD}</span><div class="c-ripple"></div>`;
      }
      return `<span class="tgico button-icon">${CONFIG.ICONS.DOWNLOAD}</span>`;
    }

    hasDownloadButton(container, url) {
      const existingBtn = container.querySelector('.tel-download');
      if (!existingBtn) return false;

      const cachedUrl = this.buttonCache.get(existingBtn);
      if (cachedUrl === url) return true;

      // Update button for new URL
      this.buttonCache.set(existingBtn, url);
      return false;
    }

    addDownloadButton(container, onClick, type) {
      // Remove existing custom button if official one exists
      const officialBtn = container.querySelector('button[title="Download"]:not(.tel-download)');
      const customBtn = container.querySelector('.tel-download');

      if (officialBtn && customBtn) {
        customBtn.remove();
        return;
      }

      if (!officialBtn && !customBtn) {
        const downloadBtn = this.createDownloadButton(onClick, type);
        container.prepend(downloadBtn);
      }
    }

    requestNotificationPermission() {
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
      }
    }

    destroy() {
      if (this.observer) {
        this.observer.disconnect();
      }
    }
  }

  // ================== SETTINGS MANAGER ==================
  class SettingsManager {
    constructor() {
      this.settings = this.loadSettings();
      this.createSettingsUI();
    }

    loadSettings() {
      const defaultSettings = {
        autoDownload: false,
        downloadPath: 'Downloads',
        fileNaming: 'hash', // 'hash', 'timestamp', 'original'
        showNotifications: true,
        downloadQuality: 'original', // 'original', 'compressed'
        theme: 'auto' // 'auto', 'light', 'dark'
      };

      try {
        const saved = GM_getValue('tel_downloader_settings', '{}');
        return { ...defaultSettings, ...JSON.parse(saved) };
      } catch (error) {
        logger.warn('Failed to load settings, using defaults');
        return defaultSettings;
      }
    }

    saveSettings() {
      try {
        GM_setValue('tel_downloader_settings', JSON.stringify(this.settings));
        logger.info('Settings saved');
      } catch (error) {
        logger.error('Failed to save settings:', null, error.message);
      }
    }

    createSettingsUI() {
      // Wait for DOM to be ready before creating UI
      this.waitForDOM().then(() => {
        const settingsBtn = document.createElement('div');
        settingsBtn.id = 'tel-settings-trigger';
        settingsBtn.style.cssText = `
          position: fixed;
          top: 20px;
          right: 20px;
          width: 40px;
          height: 40px;
          background: ${Utils.isDarkMode() ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'};
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          z-index: 9999;
          backdrop-filter: blur(10px);
          transition: all 0.3s ease;
          font-size: 20px;
          color: ${Utils.isDarkMode() ? '#ffffff' : '#000000'};
        `;
        settingsBtn.innerHTML = '⚙️';
        settingsBtn.title = 'Telegram Downloader Settings';

        settingsBtn.onclick = () => this.showSettingsModal();

        settingsBtn.onmouseenter = () => {
          settingsBtn.style.transform = 'scale(1.1)';
          settingsBtn.style.background = Utils.isDarkMode() ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)';
        };

        settingsBtn.onmouseleave = () => {
          settingsBtn.style.transform = 'scale(1)';
          settingsBtn.style.background = Utils.isDarkMode() ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
        };

        if (document.body) {
          document.body.appendChild(settingsBtn);
        }
      });
    }

    async waitForDOM() {
      return new Promise(resolve => {
        if (document.body) {
          resolve();
          return;
        }

        const checkDOM = () => {
          if (document.body) {
            resolve();
          } else {
            setTimeout(checkDOM, 10);
          }
        };

        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', resolve);
        } else {
          checkDOM();
        }
      });
    }

    showSettingsModal() {
      const modal = document.createElement('div');
      modal.id = 'tel-settings-modal';
      modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.7);
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
        animation: fadeIn 0.3s ease;
      `;

      const modalContent = document.createElement('div');
      modalContent.style.cssText = `
        background: ${Utils.isDarkMode() ? '#2a2a2a' : '#ffffff'};
        border-radius: 16px;
        padding: 24px;
        width: 90%;
        max-width: 500px;
        max-height: 80vh;
        overflow-y: auto;
        color: ${Utils.isDarkMode() ? '#ffffff' : '#000000'};
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      `;

      modalContent.innerHTML = `
        <h2 style="margin: 0 0 20px 0; font-size: 24px; font-weight: 600;">Telegram Downloader Pro Settings</h2>

        <div class="setting-group" style="margin-bottom: 20px;">
          <label style="display: block; margin-bottom: 8px; font-weight: 500;">File Naming Convention</label>
          <select id="fileNaming" style="width: 100%; padding: 8px; border-radius: 8px; border: 1px solid #ccc; background: ${Utils.isDarkMode() ? '#3a3a3a' : '#ffffff'}; color: ${Utils.isDarkMode() ? '#ffffff' : '#000000'};">
            <option value="hash">Hash-based (default)</option>
            <option value="timestamp">Timestamp</option>
            <option value="original">Original filename (if available)</option>
          </select>
        </div>

        <div class="setting-group" style="margin-bottom: 20px;">
          <label style="display: flex; align-items: center; cursor: pointer;">
            <input type="checkbox" id="showNotifications" style="margin-right: 8px;">
            <span>Show download notifications</span>
          </label>
        </div>

        <div class="setting-group" style="margin-bottom: 20px;">
          <label style="display: flex; align-items: center; cursor: pointer;">
            <input type="checkbox" id="autoDownload" style="margin-right: 8px;">
            <span>Auto-download on media view (experimental)</span>
          </label>
        </div>

        <div class="setting-group" style="margin-bottom: 20px;">
          <label style="display: block; margin-bottom: 8px; font-weight: 500;">Download Quality</label>
          <select id="downloadQuality" style="width: 100%; padding: 8px; border-radius: 8px; border: 1px solid #ccc; background: ${Utils.isDarkMode() ? '#3a3a3a' : '#ffffff'}; color: ${Utils.isDarkMode() ? '#ffffff' : '#000000'};">
            <option value="original">Original Quality</option>
            <option value="compressed">Compressed (smaller file)</option>
          </select>
        </div>

        <div style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 24px;">
          <button id="cancelBtn" style="padding: 10px 20px; border: none; border-radius: 8px; background: #6c757d; color: white; cursor: pointer; font-size: 14px;">Cancel</button>
          <button id="saveBtn" style="padding: 10px 20px; border: none; border-radius: 8px; background: #007bff; color: white; cursor: pointer; font-size: 14px;">Save Settings</button>
        </div>
      `;

      // Populate current settings
      modalContent.querySelector('#fileNaming').value = this.settings.fileNaming;
      modalContent.querySelector('#showNotifications').checked = this.settings.showNotifications;
      modalContent.querySelector('#autoDownload').checked = this.settings.autoDownload;
      modalContent.querySelector('#downloadQuality').value = this.settings.downloadQuality;

      // Event handlers
      modalContent.querySelector('#cancelBtn').onclick = () => modal.remove();
      modalContent.querySelector('#saveBtn').onclick = () => {
        this.settings.fileNaming = modalContent.querySelector('#fileNaming').value;
        this.settings.showNotifications = modalContent.querySelector('#showNotifications').checked;
        this.settings.autoDownload = modalContent.querySelector('#autoDownload').checked;
        this.settings.downloadQuality = modalContent.querySelector('#downloadQuality').value;

        this.saveSettings();
        modal.remove();

        downloader.showNotification('Settings saved', 'Your preferences have been updated successfully');
      };

      modal.onclick = (e) => {
        if (e.target === modal) modal.remove();
      };

      modal.appendChild(modalContent);
      document.body.appendChild(modal);

      // Add animation
      const style = document.createElement('style');
      style.textContent = `
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `;
      document.head.appendChild(style);
    }

    getSetting(key) {
      return this.settings[key];
    }

    setSetting(key, value) {
      this.settings[key] = value;
      this.saveSettings();
    }
  }

  // ================== ANALYTICS & USAGE TRACKING ==================
  class Analytics {
    constructor() {
      this.stats = this.loadStats();
    }

    loadStats() {
      try {
        const saved = GM_getValue('tel_downloader_stats', '{}');
        return {
          totalDownloads: 0,
          videoDownloads: 0,
          imageDownloads: 0,
          audioDownloads: 0,
          totalBytes: 0,
          lastUsed: null,
          ...JSON.parse(saved)
        };
      } catch (error) {
        logger.warn('Failed to load stats');
        return {
          totalDownloads: 0,
          videoDownloads: 0,
          imageDownloads: 0,
          audioDownloads: 0,
          totalBytes: 0,
          lastUsed: null
        };
      }
    }

    saveStats() {
      try {
        GM_setValue('tel_downloader_stats', JSON.stringify(this.stats));
      } catch (error) {
        logger.error('Failed to save stats:', null, error.message);
      }
    }

    recordDownload(type, bytes = 0) {
      this.stats.totalDownloads++;
      this.stats.lastUsed = Date.now();
      this.stats.totalBytes += bytes;

      switch (type) {
        case 'video':
          this.stats.videoDownloads++;
          break;
        case 'image':
          this.stats.imageDownloads++;
          break;
        case 'audio':
          this.stats.audioDownloads++;
          break;
      }

      this.saveStats();
      logger.info(`Download recorded: ${type}, Total: ${this.stats.totalDownloads}`);
    }

    getStats() {
      return { ...this.stats };
    }
  }

  // ================== MAIN APPLICATION ==================
  class TelegramDownloaderPro {
    constructor() {
      this.uiManager = null;
      this.settingsManager = null;
      this.analytics = null;
      this.isInitialized = false;
    }

    async init() {
      if (this.isInitialized) return;

      try {
        logger.info('Initializing Telegram Downloader Pro v2.0.0');

        // Wait for DOM to be ready with better timing
        await this.waitForPageReady();

        // Initialize components in proper order
        this.settingsManager = new SettingsManager();
        this.analytics = new Analytics();

        // Ensure progress manager is ready before UI manager
        await progressManager.ensureContainer();

        this.uiManager = new UIManager();

        // Enhance downloader with analytics
        this.enhanceDownloaderWithAnalytics();

        this.isInitialized = true;
        logger.info('Telegram Downloader Pro initialized successfully');

        // Show welcome message for first-time users
        this.showWelcomeMessage();

      } catch (error) {
        logger.error('Initialization failed:', null, error.message);
      }
    }

    async waitForPageReady() {
      return new Promise(resolve => {
        const checkReady = () => {
          if (document.body && (document.readyState === 'complete' || document.readyState === 'interactive')) {
            resolve();
          } else {
            setTimeout(checkReady, 50);
          }
        };

        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', checkReady);
          // Backup timeout in case DOMContentLoaded doesn't fire
          setTimeout(checkReady, 3000);
        } else {
          checkReady();
        }
      });
    }

    enhanceDownloaderWithAnalytics() {
      const originalDownloadVideo = downloader.downloadVideo.bind(downloader);
      const originalDownloadAudio = downloader.downloadAudio.bind(downloader);
      const originalDownloadImage = downloader.downloadImage.bind(downloader);

      downloader.downloadVideo = async (url, fileName) => {
        this.analytics.recordDownload('video');
        return originalDownloadVideo(url, fileName);
      };

      downloader.downloadAudio = async (url, fileName) => {
        this.analytics.recordDownload('audio');
        return originalDownloadAudio(url, fileName);
      };

      downloader.downloadImage = async (url, fileName) => {
        this.analytics.recordDownload('image');
        return originalDownloadImage(url, fileName);
      };
    }

    showWelcomeMessage() {
      if (this.analytics.getStats().totalDownloads === 0) {
        setTimeout(() => {
          downloader.showNotification(
            'Telegram Downloader Pro',
            'Enhanced downloader is ready! Click the gear icon to access settings.'
          );
        }, 2000);
      }
    }

    destroy() {
      if (this.uiManager) {
        this.uiManager.destroy();
      }
      logger.info('Telegram Downloader Pro destroyed');
    }
  }

  // ================== BOOTSTRAP ==================
  const app = new TelegramDownloaderPro();

  // Safe initialization with multiple fallbacks
  const initApp = () => {
    if (document.body) {
      app.init().catch(error => {
        logger.error('App initialization failed:', null, error.message);
      });
    } else {
      // Retry after short delay
      setTimeout(initApp, 100);
    }
  };

  // Multiple initialization triggers
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
    // Backup timer in case DOMContentLoaded doesn't fire
    setTimeout(initApp, 2000);
  } else {
    // DOM is already ready
    setTimeout(initApp, 100);
  }

  // Additional safety net for late initialization
  window.addEventListener('load', () => {
    if (!app.isInitialized) {
      initApp();
    }
  });

  // Cleanup on page unload
  window.addEventListener('beforeunload', () => app.destroy());

  // Global error handler
  window.addEventListener('error', (event) => {
    logger.error('Global error:', null, event.error?.message || event.message);
  });

  // Handle unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    logger.error('Unhandled promise rejection:', null, event.reason);
  });

  // Expose API for debugging (only if unsafeWindow is available)
  try {
    if (typeof unsafeWindow !== 'undefined') {
      unsafeWindow.TelegramDownloaderPro = {
        version: '2.0.0',
        logger,
        downloader,
        progressManager,
        app,
        utils: Utils
      };
    }
  } catch (error) {
    // Ignore if unsafeWindow is not available
  }

  logger.info('Telegram Downloader Pro script loaded successfully');

})();
