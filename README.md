# Telegram Media Downloader
A Tampermonkey script allowing you to download images and videos from Telegram web even if the group restricts downloading.

## Installation
1. Install [Tampermonkey](https://www.tampermonkey.net/)
2. Open Tampermonkey Dashboard, drag & drop src/tel_download.js into it and clicks "install" button

![Tampermonkey install button](./assets/tampermonkey_install.png)

## Usage
This script will add a download button for every image and video opened on [Telegram Web](https://web.telegram.org/) as shown below.

![Image download button](./assets/image_download_button.png)
![Video download button](./assets/video_download_button.png)

## Known issues to resolve
1. Not working for GIFs

   GIFs on web are actually presented as video. Need to handle GIFs specially.