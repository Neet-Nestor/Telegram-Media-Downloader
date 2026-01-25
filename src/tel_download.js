// ==UserScript==
// @name         Telegram Media Downloader
// @name:en      Telegram Media Downloader
// @name:zh-CN   Telegram 受限图片视频下载器
// @name:zh-TW   Telegram 受限圖片影片下載器
// @name:ru      Telegram: загрузчик медиафайлов
// @version      1.211
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


(function() {
  'use strict';

  const CONFIG = {
    SUPPORTED_STATUS: [200, 206],
    CHUNK_SIZE: 1024 * 1024,
    MAX_RETRIES: 3,
    RETRY_DELAY: 1000,
    RATE_LIMIT_DELAY: 100,

    ICONS: {
      DOWNLOAD: "\uE95A",
      FORWARD: "\uE976"
    },

    EXTENSIONS: {
      VIDEO: 'mp4',
      AUDIO: 'ogg',
      IMAGE: 'jpeg'
    },

    SELECTORS: {
      WEBZ: {
        STORIES: '#StoryViewer',
        MEDIA_CONTAINER: '#MediaViewer .MediaViewerSlide--active',
        MEDIA_ACTIONS: '#MediaViewer .MediaViewerActions'
      },
      WEBK: {
        STORIES: '#stories-viewer',
        MEDIA_CONTAINER: '.media-viewer-whole',
        MEDIA_ASPECTER: '.media-viewer-movers .media-viewer-aspecter',
        MEDIA_BUTTONS: '.media-viewer-topbar .media-viewer-buttons'
  };
  // Unicode values for icons (used in /k/ app)
  // https://github.com/morethanwords/tweb/blob/master/src/icons.ts
  const DOWNLOAD_ICON = "\ue977";
  const FORWARD_ICON = "\ue995";
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
  };

  const Logger = {
    info: (message, context = null) => {
      console.log(`[Tel Download] ${context ? `${context}: ` : ''}${message}`);
    },
    error: (message, context = null) => {
      console.error(`[Tel Download] ${context ? `${context}: ` : ''}${message}`);
    },
    warn: (message, context = null) => {
      console.warn(`[Tel Download] ${context ? `${context}: ` : ''}${message}`);
    }
  };

  const Utils = {
    hashCode: (str) => {
      let hash = 0;
      if (str.length === 0) return hash;
      for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
      return Math.abs(hash);
    },

    generateId: () => {
      return (Math.random() + 1).toString(36).substring(2, 10) + '_' + Date.now();
    },

    sanitizeFilename: (filename) => {
      return filename.replace(/[<>:"/\\|?*]/g, '_').substring(0, 255);
    },

    extractFilenameFromUrl: (url, defaultExt) => {
      try {
        const urlParts = url.split('/');
        const lastPart = decodeURIComponent(urlParts[urlParts.length - 1]);
        const metadata = JSON.parse(lastPart);
        if (metadata.fileName) {
          return Utils.sanitizeFilename(metadata.fileName);
        }
      } catch (e) {

      }

      return `${Utils.hashCode(url).toString(36)}.${defaultExt}`;
    },

    isDarkMode: () => {
      const html = document.querySelector('html');
      return html.classList.contains('night') || html.classList.contains('theme-dark');
    },

    sleep: (ms) => new Promise(resolve => setTimeout(resolve, ms))
  };

  const RateLimiter = {
    lastRequest: 0,
    async throttle() {
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequest;
      if (timeSinceLastRequest < CONFIG.RATE_LIMIT_DELAY) {
        await Utils.sleep(CONFIG.RATE_LIMIT_DELAY - timeSinceLastRequest);
      }
      this.lastRequest = Date.now();
    }
  };

  const ProgressManager = {
    container: null,

    init() {
      if (this.container) return;

      this.container = document.createElement('div');
      this.container.id = 'tel-downloader-progress-bar-container';
      Object.assign(this.container.style, {
        position: 'fixed',
        bottom: '0',
        right: '0',
        zIndex: location.pathname.startsWith('/k/') ? '4' : '1600'
      });
      document.body.appendChild(this.container);
    },

    create(downloadId, fileName) {
      this.init();

      const progressContainer = document.createElement('div');
      progressContainer.id = `tel-downloader-progress-${downloadId}`;
      Object.assign(progressContainer.style, {
        width: '20rem',
        marginTop: '0.4rem',
        padding: '0.6rem',
        backgroundColor: Utils.isDarkMode() ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.6)',
        borderRadius: '8px'
      });

      const headerDiv = document.createElement('div');
      Object.assign(headerDiv.style, {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '0.5rem'
      });

      const titleSpan = document.createElement('span');
      titleSpan.className = 'filename';
      Object.assign(titleSpan.style, {
        color: 'white',
        fontSize: '0.9rem',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        maxWidth: '15rem'
      });
      titleSpan.textContent = fileName;

      const closeButton = document.createElement('button');
      Object.assign(closeButton.style, {
        background: 'none',
        border: 'none',
        color: Utils.isDarkMode() ? '#8a8a8a' : 'white',
        fontSize: '1.2rem',
        cursor: 'pointer',
        padding: '0',
        width: '20px',
        height: '20px'
      });
      closeButton.innerHTML = '&times;';
      closeButton.onclick = () => this.remove(downloadId);

      const progressBarContainer = document.createElement('div');
      Object.assign(progressBarContainer.style, {
        backgroundColor: '#e2e2e2',
        position: 'relative',
        width: '100%',
        height: '1.6rem',
        borderRadius: '2rem',
        overflow: 'hidden'
      });

      const progressText = document.createElement('span');
      Object.assign(progressText.style, {
        position: 'absolute',
        zIndex: '5',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        color: 'black',
        fontSize: '0.8rem',
        fontWeight: 'bold'
      });
      progressText.textContent = '0%';

      const progressBar = document.createElement('div');
      Object.assign(progressBar.style, {
        position: 'absolute',
        height: '100%',
        width: '0%',
        backgroundColor: '#6093B5',
        transition: 'width 0.3s ease'
      });

      progressBarContainer.appendChild(progressText);
      progressBarContainer.appendChild(progressBar);
      headerDiv.appendChild(titleSpan);
      headerDiv.appendChild(closeButton);
      progressContainer.appendChild(headerDiv);
      progressContainer.appendChild(progressBarContainer);
      this.container.appendChild(progressContainer);
    },

    update(downloadId, fileName, progress, speed = null) {
      const container = document.getElementById(`tel-downloader-progress-${downloadId}`);
      if (!container) return;

      const titleSpan = container.querySelector('.filename');
      const progressText = container.querySelector('span');
      const progressBar = container.querySelector('div div');

      if (titleSpan) titleSpan.textContent = fileName;
      if (progressText) {
        progressText.textContent = speed ?
          `${progress}% (${speed})` :
          `${progress}%`;
      }
      if (progressBar) progressBar.style.width = `${progress}%`;
    },

    complete(downloadId) {
      const container = document.getElementById(`tel-downloader-progress-${downloadId}`);
      if (!container) return;

      const progressText = container.querySelector('span');
      const progressBar = container.querySelector('div div');

      if (progressText) progressText.textContent = 'Completed';
      if (progressBar) {
        progressBar.style.backgroundColor = '#B6C649';
        progressBar.style.width = '100%';
      }

      setTimeout(() => this.remove(downloadId), 3000);
    },

    error(downloadId, errorMessage = 'Failed') {
      const container = document.getElementById(`tel-downloader-progress-${downloadId}`);
      if (!container) return;

      const progressText = container.querySelector('span');
      const progressBar = container.querySelector('div div');

      if (progressText) progressText.textContent = errorMessage;
      if (progressBar) {
        progressBar.style.backgroundColor = '#D16666';
        progressBar.style.width = '100%';
      }
    },

    remove(downloadId) {
      const container = document.getElementById(`tel-downloader-progress-${downloadId}`);
      if (container && this.container) {
        this.container.removeChild(container);
      }
    }
  };

  class MediaDownloader {
    constructor(url, mediaType, options = {}) {
      this.url = url;
      this.mediaType = mediaType;
      this.downloadId = Utils.generateId();
      this.abortController = new AbortController();
      this.retryCount = 0;
      this.options = {
        showProgress: true,
        ...options
      };

      this.reset();
    }

    reset() {
      this.blobs = [];
      this.nextOffset = 0;
      this.totalSize = null;
      this.fileName = null;
      this.fileExtension = CONFIG.EXTENSIONS[this.mediaType.toUpperCase()];
    }

    async download() {
      try {
        this.fileName = Utils.extractFilenameFromUrl(this.url, this.fileExtension);
        Logger.info(`Starting download: ${this.url}`, this.fileName);

        if (this.options.showProgress) {
          ProgressManager.create(this.downloadId, this.fileName);
        }

        const supportsFileSystemAccess = this.checkFileSystemSupport();
        let writable = null;

        if (supportsFileSystemAccess) {
          try {
            const handle = await unsafeWindow.showSaveFilePicker({
              suggestedName: this.fileName
            });
            writable = await handle.createWritable();
          } catch (err) {
            if (err.name === 'AbortError') {
              return;
            }
            Logger.warn('File System Access failed, falling back to blob method', this.fileName);
          }
        }

        if (this.mediaType === 'image') {
          await this.downloadImage();
        } else {
          await this.downloadChunked(writable);
        }

        if (this.options.showProgress) {
          ProgressManager.complete(this.downloadId);
        }

        Logger.info('Download completed successfully', this.fileName);
      } catch (error) {
        Logger.error(`Download failed: ${error.message}`, this.fileName);
        if (this.options.showProgress) {
          ProgressManager.error(this.downloadId, 'Failed');
        }
        throw error;
      }
    }

    async downloadImage() {
      const a = document.createElement('a');
      a.href = this.url;
      a.download = this.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }

    async downloadChunked(writable = null) {
      const startTime = Date.now();
      let lastProgressTime = startTime;
      let lastProgressBytes = 0;

      while (this.nextOffset < (this.totalSize || Infinity)) {
        await RateLimiter.throttle();

        try {
          const response = await this.fetchChunk();
          const blob = await response.blob();

          if (writable) {
            await writable.write(blob);
          } else {
            this.blobs.push(blob);
          }

          if (this.options.showProgress && this.totalSize) {
            const progress = Math.round((this.nextOffset * 100) / this.totalSize);
            const now = Date.now();

            if (now - lastProgressTime > 1000) {
              const bytesDiff = this.nextOffset - lastProgressBytes;
              const timeDiff = (now - lastProgressTime) / 1000;
              const speed = this.formatSpeed(bytesDiff / timeDiff);

              ProgressManager.update(this.downloadId, this.fileName, progress, speed);
              lastProgressTime = now;
              lastProgressBytes = this.nextOffset;
            } else {
              ProgressManager.update(this.downloadId, this.fileName, progress);
            }
          }

          if (this.totalSize && this.nextOffset >= this.totalSize) {
            break;
          }
        } catch (error) {
          if (this.retryCount < CONFIG.MAX_RETRIES) {
            this.retryCount++;
            Logger.warn(`Retry ${this.retryCount}/${CONFIG.MAX_RETRIES}: ${error.message}`, this.fileName);
            await Utils.sleep(CONFIG.RETRY_DELAY * this.retryCount);
            continue;
          }
          throw error;
        }
      }

      if (writable) {
        await writable.close();
      } else {
        this.saveBlobToFile();
      }
    }

    async fetchChunk() {
      const response = await fetch(this.url, {
        method: 'GET',
        headers: {
          'Range': `bytes=${this.nextOffset}-`,
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/117.0'
        },
        signal: this.abortController.signal
      });

      if (!CONFIG.SUPPORTED_STATUS.includes(response.status)) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get('Content-Type')?.split(';')[0];
      const expectedType = this.mediaType === 'video' ? 'video/' : 'audio/';
      if (!contentType?.startsWith(expectedType)) {
        throw new Error(`Invalid content type: ${contentType}`);
      }

      if (contentType) {
        this.fileExtension = contentType.split('/')[1];
        const baseName = this.fileName.substring(0, this.fileName.lastIndexOf('.'));
        this.fileName = `${baseName}.${this.fileExtension}`;
      }

      const contentRange = response.headers.get('Content-Range');
      if (contentRange) {
        const match = contentRange.match(/^bytes (\d+)-(\d+)\/(\d+)$/);
        if (match) {
          const [, startStr, endStr, totalStr] = match;
          const start = parseInt(startStr);
          const end = parseInt(endStr);
          const total = parseInt(totalStr);

          if (start !== this.nextOffset) {
            throw new Error(`Offset mismatch: expected ${this.nextOffset}, got ${start}`);
          }

          if (this.totalSize && total !== this.totalSize) {
            throw new Error(`Total size mismatch: expected ${this.totalSize}, got ${total}`);
          }

          this.nextOffset = end + 1;
          this.totalSize = total;
        }
      }

      return response;
    }

    saveBlobToFile() {
      const mimeType = this.mediaType === 'video' ? 'video/mp4' : 'audio/ogg';
      const blob = new Blob(this.blobs, { type: mimeType });
      const blobUrl = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = this.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      URL.revokeObjectURL(blobUrl);
      this.blobs = [];
    }

    formatSpeed(bytesPerSecond) {
      const units = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
      let size = bytesPerSecond;
      let unitIndex = 0;

      while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
      }

      return `${size.toFixed(1)} ${units[unitIndex]}`;
    }

    checkFileSystemSupport() {
      return 'showSaveFilePicker' in unsafeWindow &&
        (() => {
          try {
            return unsafeWindow.self === unsafeWindow.top;
          } catch {
            return false;
          }
        })();
    }

    abort() {
      this.abortController.abort();
      if (this.options.showProgress) {
        ProgressManager.error(this.downloadId, 'Cancelled');
      }
    }
  }

  const ButtonCreator = {
    createDownloadButton(onClick, className = '', iconClass = 'icon-download') {
      const button = document.createElement('button');
      button.className = className;
      button.setAttribute('type', 'button');
      button.setAttribute('title', 'Download');
      button.setAttribute('aria-label', 'Download');
      button.onclick = onClick;

      const icon = document.createElement('i');
      icon.className = iconClass;
      button.appendChild(icon);

      return button;
    },

    createWebkDownloadButton(onClick) {
      const button = document.createElement('button');
      button.className = 'btn-icon tgico-download tel-download-custom-button-webk';
      button.innerHTML = `<span class="tgico button-icon">${CONFIG.ICONS.DOWNLOAD}</span>`;
      button.setAttribute('type', 'button');
      button.setAttribute('title', 'Download');
      button.setAttribute('aria-label', 'Download');
      button.onclick = onClick;
      return button;
    }
  };

  const TelegramHandlers = {
    handleWebZ() {
      const storiesContainer = document.querySelector(CONFIG.SELECTORS.WEBZ.STORIES);
      const storyHeader = storiesContainer?.querySelector('.GrsJNw3y') ||
                          storiesContainer?.querySelector('.DropdownMenu')?.parentNode;
      if (storyHeader && !storyHeader.querySelector('.tel-download-story-button')) {
        const createDownloadButton = () => {
          const button = ButtonCreator.createDownloadButton(() => {
            const video = storiesContainer.querySelector('video');
            const videoSrc = video?.src || video?.currentSrc || video?.querySelector('source')?.src;

            if (videoSrc) {
              new MediaDownloader(videoSrc, 'video').download();
            } else {
              const images = storiesContainer.querySelectorAll('img.PVZ8TOWS');
              if (images.length > 0) {
                const imageSrc = images[images.length - 1]?.src;
                if (imageSrc) new MediaDownloader(imageSrc, 'image').download();
              }
            }
          }, 'Button TkphaPyQ tiny translucent-white round tel-download tel-download-story-button');
          return button;
        };
        storyHeader.insertBefore(createDownloadButton(), storyHeader.querySelector('button'));
      }

      const mediaContainer = document.querySelector(CONFIG.SELECTORS.WEBZ.MEDIA_CONTAINER);
      const mediaActions = document.querySelector(CONFIG.SELECTORS.WEBZ.MEDIA_ACTIONS);

      if (!mediaContainer || !mediaActions) return;

      const videoPlayer = mediaContainer.querySelector('.MediaViewerContent > .VideoPlayer');
      const img = mediaContainer.querySelector('.MediaViewerContent > div > img');

      if (videoPlayer && !mediaActions.querySelector('.tel-download-media-viewer-button')) {
        const videoUrl = videoPlayer.querySelector('video')?.currentSrc;
        if (videoUrl) {
          const downloadButton = ButtonCreator.createDownloadButton(
            () => new MediaDownloader(videoUrl, 'video').download(),
            'Button smaller translucent-white round tel-download tel-download-media-viewer-button'
          );

          if (!mediaActions.querySelector('button[title="Download"]')) {
            mediaActions.prepend(downloadButton);
          }
        }
      } else if (img?.src && !mediaActions.querySelector('.tel-download-media-viewer-button')) {
        const downloadButton = ButtonCreator.createDownloadButton(
          () => new MediaDownloader(img.src, 'image').download(),
          'Button smaller translucent-white round tel-download tel-download-media-viewer-button'
        );

        if (!mediaActions.querySelector('button[title="Download"]')) {
          mediaActions.prepend(downloadButton);
        }
      }
    },

    handleWebK() {
      const storiesContainer = document.querySelector(CONFIG.SELECTORS.WEBK.STORIES);
      const storyHeader = storiesContainer?.querySelector("[class^='_ViewerStoryHeaderRight']");
      const storyFooter = storiesContainer?.querySelector("[class^='_ViewerStoryFooterRight']");
      const createStoryDownloadButton = () => {
          const button = document.createElement('button');
          button.className = 'btn-icon rp tel-download tel-download-story-button-webk';
          button.innerHTML = `<span class="tgico">${CONFIG.ICONS.DOWNLOAD}</span><div class="c-ripple"></div>`;
          button.setAttribute('type', 'button');
          button.setAttribute('title', 'Download');
          button.onclick = () => {
            const video = storiesContainer.querySelector('video.media-video');
            const videoSrc = video?.src || video?.currentSrc || video?.querySelector('source')?.src;

            if (videoSrc) {
              new MediaDownloader(videoSrc, 'video').download();
            } else {
              const imageSrc = storiesContainer.querySelector('img.media-photo')?.src;
              if (imageSrc) new MediaDownloader(imageSrc, 'image').download();
            }
          };
          return button;
      };
      if (storyHeader && !storyHeader.querySelector('.tel-download-story-button-webk')) {
        storyHeader.prepend(createStoryDownloadButton());
      }
      if (storyFooter && !storyFooter.querySelector('.tel-download-story-button-webk')) {
        storyFooter.prepend(createStoryDownloadButton());
      }
      const mediaContainer = document.querySelector(CONFIG.SELECTORS.WEBK.MEDIA_CONTAINER);
      if (!mediaContainer) return;

      const mediaAspecter = mediaContainer.querySelector(CONFIG.SELECTORS.WEBK.MEDIA_ASPECTER);
      const mediaButtons = mediaContainer.querySelector(CONFIG.SELECTORS.WEBK.MEDIA_BUTTONS);

      if (!mediaAspecter || !mediaButtons) return;

      const hiddenButtons = mediaButtons.querySelectorAll('button.btn-icon.hide');
      let useOfficialDownload = false;

      for (const btn of hiddenButtons) {
        btn.classList.remove('hide');
        if (btn.textContent === CONFIG.ICONS.DOWNLOAD) {
          btn.classList.add('tgico-download');
          useOfficialDownload = true;
        }
      }

      if (!useOfficialDownload && !mediaButtons.querySelector('.tel-download-custom-button-webk')) {
        if (mediaAspecter.querySelector('.ckin__player')) {
          const controls = mediaAspecter.querySelector('.default__controls.ckin__controls');
          if (controls) {
            const brControls = controls.querySelector('.bottom-controls .right-controls');
            const videoSrc = mediaAspecter.querySelector('video')?.src;
            if (videoSrc && brControls) {
              const downloadButton = ButtonCreator.createWebkDownloadButton(
                () => new MediaDownloader(videoSrc, 'video').download()
              );
              downloadButton.className = 'btn-icon default__button tgico-download tel-download-custom-button-webk';
              downloadButton.innerHTML = `<span class="tgico">${CONFIG.ICONS.DOWNLOAD}</span>`;
              brControls.prepend(downloadButton);
            }
          }
        } else if (mediaAspecter.querySelector('video')) {
          const videoSrc = mediaAspecter.querySelector('video')?.src;
          if (videoSrc) {
            const downloadButton = ButtonCreator.createWebkDownloadButton(
              () => new MediaDownloader(videoSrc, 'video').download()
            );
            mediaButtons.prepend(downloadButton);
          }
        } else if (mediaAspecter.querySelector('img.thumbnail')) {
          const imageSrc = mediaAspecter.querySelector('img.thumbnail')?.src;
          if (imageSrc) {
            const downloadButton = ButtonCreator.createWebkDownloadButton(
              () => new MediaDownloader(imageSrc, 'image').download()
            );
            mediaButtons.prepend(downloadButton);
          }
        }
      }
      const audioElements = document.querySelectorAll('audio-element');
      audioElements.forEach(audioElement => {
        const bubble = audioElement.closest('.bubble');
        if (!bubble || bubble.querySelector('._tel_download_button_pinned_container_custom')) return;

        const audioSrc = audioElement.audio?.getAttribute('src');
        if (audioSrc) {
          const downloadButton = document.createElement('button');
          downloadButton.className = 'btn-icon tgico-download _tel_download_button_pinned_container _tel_download_button_pinned_container_custom';
          downloadButton.innerHTML = `<span class="tgico button-icon">${CONFIG.ICONS.DOWNLOAD}</span>`;
          downloadButton.onclick = (e) => {
            e.stopPropagation();
            const isAudio = audioElement.audio instanceof HTMLAudioElement;
            new MediaDownloader(audioSrc, isAudio ? 'audio' : 'video').download();
          };

          const utilities = bubble.querySelector('.pinned-container-wrapper-utils');
          if (utilities) {
            utilities.appendChild(downloadButton);
          }
        }
      });
    }
  };

  function init() {
    Logger.info('Initializing Telegram Media Downloader...');

    ProgressManager.init();

    const observeDOM = () => {
        const observer = new MutationObserver((mutationsList, observer) => {
            TelegramHandlers.handleWebZ();
            TelegramHandlers.handleWebK();
        });
        observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    };

    TelegramHandlers.handleWebZ();
    TelegramHandlers.handleWebK();
    observeDOM();

    Logger.info('Telegram Media Downloader initialized successfully');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
