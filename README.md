<div align="center">

# Telegram Video Downloader / Telegram Media Downloader

**Unlock Telegram: Download Anything You Like.**

![GitHub License](https://img.shields.io/github/license/Neet-Nestor/Telegram-Media-Downloader)
![Greasy Fork Version](https://img.shields.io/greasyfork/v/446342-telegram-media-downloader)
![Greasy Fork Downloads](https://img.shields.io/greasyfork/dt/446342-telegram-media-downloader)

</div>

## Overview
This script unlocks and enables download of images, GIFs, audios, and videos in Telegram webapps from chats, stories, and even private channels where downloading is disabled or restricted.

(Note: some features are only available for specific Telegram webapp version. e.g. Audio message download is only available for the K webapp version.)

## Installation
### Greasy Fork
1. Install [Tampermonkey](https://www.tampermonkey.net/) or [Userscripts](https://apps.apple.com/us/app/userscripts/id1463298887), or other equivalent user script manager browser extensions.

    (Note, If you are using Tampermonkey extension in a Chrome-based browser, following [instructions](https://www.tampermonkey.net/faq.php#Q209) to enable Developer Mode.)

3. Install this script by visiting Greasy Fork:
    https://greasyfork.org/en/scripts/446342-telegram-media-downloader

### Manual Installation
1. Install [Tampermonkey](https://www.tampermonkey.net/) or other user script browser extensions.

    (Note, If you are using Tampermonkey extension in a Chrome-based browser, following [instructions](https://www.tampermonkey.net/faq.php#Q209) to enable Developer Mode.)
2. Open Tampermonkey Dashboard, drag & drop src/tel_download.js into it and clicks the "install" button

## How to Use
This script only works on Telegram Webapp.

For channels and chats that allow saving content, this script will have no effect. Please just use the official download button provided by the telegram webapp instead.

For channels and chats that disable downloading and restrict saving content, this script will add the download button back for images, GIFs and videos.

![Image Download](https://media2.giphy.com/media/v1.Y2lkPTc5MGI3NjExY2VjNmU2ZDM0YTFlOWY4YTMzZDZmNjVlMDE2ODQ4OGY4N2E3MDFkNSZlcD12MV9pbnRlcm5hbF9naWZzX2dpZklkJmN0PWc/lqCVcw0pCd2VA3zqoE/giphy.gif)
![GIF Download](https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExMzYwMzM3ZTMzYmI1MzA4M2EyYmY0NTFlOTg4OWFhNjhjNDk5YTkzYiZlcD12MV9pbnRlcm5hbF9naWZzX2dpZklkJmN0PWc/wnYzW4vwpPdeuo62nQ/giphy.gif)
![Video Download](https://media1.giphy.com/media/v1.Y2lkPTc5MGI3NjExMXcxYnJxaXMxcW05YW5rZ2YzZzE0bTU4aTBwYXI1N3pmdnVzbDFrdSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/EEPbblwmSpteAmwLls/giphy.gif)
![Story Download](https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExZ3Z5Y2VzM2QzbW1xc3ZwNTQ2N3Q0a3lnanpxdW55c2Qzajl5NXZsaCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/xJFjBGi8isHPR5cuHl/giphy.gif)

For videos, a progress bar will show on the bottom-right corder after you started downloading. For images and audios, there won't be a progress bar.

### Supported Webapp Versions
There are 2 different versions of telegram webapps:
- https://webk.telegram.org / https://web.telegram.org/k/
- https://webz.telegram.org / https://web.telegram.org/a/

This script should work on both versions of webapp. If you are using another different version of webapp and find this script does not work, please raise an issue to our [GitHub repo](https://github.com/Neet-Nestor/Telegram-Media-Downloader/issues). 

### Check Downloading Progress
A progress bar will show on the bottom-right of the screen for videos. You can also check [DevTools console](https://developer.chrome.com/docs/devtools/open/) for logs.

## Support Author
If you like this script, you can support me via [Venmo](https://venmo.com/u/NeetNestor) or [buy me a coffee](https://ko-fi.com/neetnestor) :)
