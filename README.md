# Telegram Media Downloader
A Tampermonkey script allowing you to download images, GIFs and videos from Telegram web even if the group restricts downloading.

## Installation
### Greasy Fork
1. Install [Tampermonkey](https://www.tampermonkey.net/)
2. Install this script by visiting Greasy Fork:

    https://greasyfork.org/en/scripts/446342-telegram-media-downloader

### Manual Installation
1. Install [Tampermonkey](https://www.tampermonkey.net/)
2. Open Tampermonkey Dashboard, drag & drop src/tel_download.js into it and clicks "install" button

![Tampermonkey install button](./assets/tampermonkey_install.png)

## Usage
This script will add a download button for every image and video opened on [Telegram Web](https://web.telegram.org/) as shown below. Note that the download will only happens *after* the entire video has been loaded, so if you are downloading a large file it can take quite a while until you see the the file downloaded and that is expected. 

<img src="./assets/image_download_button.png" alt="Image download button" height="200"/>
<img src="./assets/video_download_button.png" alt="Video download button" height="200">

### Check Downloading Progress
If you would like to check the current downloading progress, you can [open browser DevTools -> console](https://developer.chrome.com/docs/devtools/open/) and check the text output.

![Console Progress Output](assets/console_output.png)