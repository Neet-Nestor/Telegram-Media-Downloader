// ==UserScript==
// @name         Telegram Media Downloader
// @name:zh-CN   Telegram下载器
// @version      1.02
// @namespace    https://github.com/Neet-Nestor/Telegram-Media-Downloader
// @description  Used to download images, GIFs and videos on Telegram webapp even from channels restricting downloading and saving content
// @description:zh-cn 从禁止下载的Telegram频道中下载图片和视频
// @author       Nestor Qin
// @license      GNU GPLv3
// @website      https://github.com/Neet-Nestor/Telegram-Media-Downloader
// @match        https://web.telegram.org/*
// @match        https://webk.telegram.org/*
// @match        https://webz.telegram.org/*
// @icon         https://img.icons8.com/color/452/telegram-app--v5.png
// @grant        none
// ==/UserScript==

(function () {
  const logger = {
    info: (message) => {
      console.log("[Tel Download] " + message);
    },
    error: (message) => {
      console.error("[Tel Download] " + message);
    },
  };
  const contentRangeRegex = /^bytes (\d+)-(\d+)\/(\d+)$/;
  const REFRESH_DELAY = 500;

  const tel_download_video = (url) => {
    let _blobs = [];
    let _next_offset = 0;
    let _total_size = null;
    let _file_extension = "mp4";

    const fetchNextPart = () => {
      fetch(url, {
        method: "GET",
        headers: {
          Range: `bytes=${_next_offset}-`,
        },
      })
        .then((res) => {
          logger.info("get response ", res);
          if (![200, 206].includes(res.status)) {
            logger.error("Non 200/206 response was received: " + res.status);
            return;
          }

          const mime = res.headers.get("Content-Type").split(";")[0];
          if (!mime.startsWith("video/")) {
            logger.error("Get non video response with MIME type " + mime);
            throw "Get non video response with MIME type " + mime;
          }
          _file_extension = mime.split("/")[1];

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

          logger.info(
            `Get response: ${res.headers.get(
              "Content-Length"
            )} bytes data from ${res.headers.get("Content-Range")}`
          );
          logger.info(
            `Progress: ${((_next_offset * 100) / _total_size).toFixed(0)}%`
          );
          return res.blob();
        })
        .then((resBlob) => {
          _blobs.push(resBlob);
        })
        .then(() => {
          if (_next_offset < _total_size) {
            fetchNextPart();
          } else {
            save();
          }
        })
        .catch((reason) => {
          logger.error(reason);
        });
    };

    const save = () => {
      logger.info("Finish downloading blobs");
      logger.info("Concatenating blobs and downloading...");

      let fileName =
        (Math.random() + 1).toString(36).substring(2, 10) +
        "." +
        _file_extension;

      // Some video src is in format:
      // 'stream/{"dcId":5,"location":{...},"size":...,"mimeType":"video/mp4","fileName":"xxxx.MP4"}'
      try {
        const metadata = JSON.parse(
          decodeURIComponent(url.split("/")[url.split("/").length - 1])
        );
        logger.info(metadata);
        if (metadata.fileName) {
          fileName = metadata.fileName;
        }
      } catch (e) {
        // Invalid JSON string, pass extracting filename
      }

      const blob = new Blob(_blobs, { type: "video/mp4" });
      const blobUrl = window.URL.createObjectURL(blob);

      logger.info("Final blob size: " + blob.size + " bytes");

      const a = document.createElement("a");
      document.body.appendChild(a);
      a.href = blobUrl;
      a.download = fileName;
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(blobUrl);

      logger.info("Download triggered");
    };

    fetchNextPart();
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

    logger.info("Download triggered");
  };

  logger.info("Initialized");

  // For webz /a/ webapp
  setInterval(() => {
    // All media opened are located in .media-viewer-movers > .media-viewer-aspecter
    const mediaContainer = document.querySelector("#MediaViewer .MediaViewerSlide--active");
    if (!mediaContainer) return;
    const mediaViewerActions = document.querySelector(
      "#MediaViewer .MediaViewerActions"
    );
    if (!mediaViewerActions) return;

    const videoPlayer = mediaContainer.querySelector(".MediaViewerContent > .VideoPlayer");
    const img = mediaContainer.querySelector('.MediaViewerContent > div > img');
    // 1. Video player detected - Video or GIF
    // container > .MediaViewerSlides > .MediaViewerSlide > .MediaViewerContent > .VideoPlayer > video[src]
    if (videoPlayer) {
      const videoUrl = videoPlayer.querySelector("video").currentSrc;
      const downloadIcon = document.createElement("i");
      downloadIcon.className = "icon icon-download";
      const downloadButton = document.createElement("button");
      downloadButton.className =
        "Button smaller translucent-white round tel-download";
      downloadButton.setAttribute("type", "button");
      downloadButton.setAttribute("title", "Download");
      downloadButton.setAttribute("aria-label", "Download");
      downloadButton.setAttribute("data-tel-download-url", videoUrl);
      downloadButton.appendChild(downloadIcon);
      downloadButton.onclick = () => {
        tel_download_video(videoUrl);
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
            tel_download_video(videoUrl);
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
      const downloadIcon = document.createElement("i");
      downloadIcon.className = "icon icon-download";
      const downloadButton = document.createElement("button");
      downloadButton.className =
        "Button smaller translucent-white round tel-download";
      downloadButton.setAttribute("type", "button");
      downloadButton.setAttribute("title", "Download");
      downloadButton.setAttribute("aria-label", "Download");
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

    // If the download button is hidden, we can simply unhide it
    if (mediaButtons.querySelector(".btn-icon.tgico-download")) {
      const button = mediaButtons.querySelector(
        "button.btn-icon.tgico-download"
      );
      if (button.classList.contains("hide")) {
        button.classList.remove("hide");
      }
    }
    // If forward button is hidden, we can simply unhide it too
    if (mediaButtons.querySelector("button.btn-icon.tgico-forward")) {
      const button = mediaButtons.querySelector(
        "button.btn-icon.tgico-forward"
      );
      if (button.classList.contains("hide")) {
        button.classList.remove("hide");
      }
    }

    if (mediaAspecter.querySelector(".ckin__player")) {
      // 1. Video player detected - Video and it has finished initial loading
      // container > .ckin__player > video[src]

      // add download button to videos
      const controls = mediaAspecter.querySelector(
        ".default__controls.ckin__controls"
      );
      const videoUrl = mediaAspecter.querySelector("video").src;

      if (controls && !controls.querySelector(".tel-download")) {
        const brControls = controls.querySelector(
          ".bottom-controls .right-controls"
        );
        const downloadButton = document.createElement("button");
        downloadButton.className =
          "btn-icon default__button tgico-download tel-download";
        downloadButton.setAttribute("type", "button");
        downloadButton.setAttribute("title", "Download");
        downloadButton.setAttribute("aria-label", "Download");
        downloadButton.onclick = () => {
          tel_download_video(videoUrl);
        };
        brControls.prepend(downloadButton);
      }
    } else if (
      mediaAspecter.querySelector("video") &&
      mediaAspecter.querySelector("video") &&
      !mediaButtons.querySelector("button.btn-icon.tgico-download")
    ) {
      // 2. Video HTML element detected, could be either GIF or unloaded video
      // container > video[src]
      const videoUrl = mediaAspecter.querySelector("video").src;
      const downloadButton = document.createElement("button");
      downloadButton.className = "btn-icon tgico-download tel-download";
      downloadButton.setAttribute("type", "button");
      downloadButton.setAttribute("title", "Download");
      downloadButton.setAttribute("aria-label", "Download");
      downloadButton.onclick = () => {
        tel_download_video(videoUrl);
      };
      mediaButtons.prepend(downloadButton);
    } else if (!mediaButtons.querySelector("button.btn-icon.tgico-download")) {
      // 3. Image without download button detected
      // container > img.thumbnail
      const imageUrl = mediaAspecter.querySelector("img.thumbnail").src;
      const downloadButton = document.createElement("button");
      downloadButton.className = "btn-icon tgico-download tel-download";
      downloadButton.setAttribute("type", "button");
      downloadButton.setAttribute("title", "Download");
      downloadButton.setAttribute("aria-label", "Download");
      downloadButton.onclick = () => {
        tel_download_image(imageUrl);
      };
      mediaButtons.prepend(downloadButton);
    }
  }, REFRESH_DELAY);
})();
