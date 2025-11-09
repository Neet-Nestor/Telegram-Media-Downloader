<div align="center">

# Telegram Video Downloader / Telegram Media Downloader

**Unlock Telegram: Download Anything You Like.**

[![GitHub License](https://img.shields.io/github/license/Neet-Nestor/Telegram-Media-Downloader)](./LICENSE)
[![Greasy Fork Version](https://img.shields.io/greasyfork/v/446342-telegram-media-downloader)](https://greasyfork.org/scripts/446342-telegram-media-downloader)
[![Greasy Fork Downloads](https://img.shields.io/greasyfork/dt/446342-telegram-media-downloader)](https://greasyfork.org/scripts/446342-telegram-media-downloader)

</div>

---

## ⚠️ Proof-of-Concept Fork Status

**This is an experimental fork with bulk download functionality - UNSTABLE**

This fork adds experimental bulk/batch download features for automatically downloading multiple videos from Telegram chats. The feature is currently in proof-of-concept stage and has known reliability issues.

**⚠️ Known Bug - Workaround Required:**
To see the bulk download button, you must first **open any video in the chat and then close it**. The bulk download UI will not appear until you do this. This is a known initialization bug.

### Current Test Results

![Bulk Download Test Results](docs/screenshots/bulk-download-test-results.png)

**Latest test (v6.0.2-fork):**
- **Success Rate:** ~45% (25 out of 55 videos downloaded successfully)
- **Found:** 55 videos in test channel
- **Downloaded:** 25 successfully
- **Failed:** 30 failures

**Failure Analysis:**
- ~20 failures: Videos without accessible URLs (expected limitation - videos showing "pending.mp4" placeholder)
- ~10 failures: "Element not found in DOM" - due to Telegram's DOM virtualization removing elements before download could complete

**Known Limitations:**
- Telegram's webapp only keeps ~20 messages in DOM at once, causing timing-sensitive failures
- Success rate varies depending on chat size, scroll speed, and system performance
- Videos may be missed if scrolling moves too fast for DOM updates
- Some videos remain inaccessible due to Telegram's lazy-loading architecture

**Semi-Automation Workflow:**
Given the ~45% success rate, this fork now includes a **semi-automation layer** to streamline manual downloads of failed items:
- ✅ **Visual indicators on posts**: Each message shows a green ✓ badge for success or red ✗ badge with failure reason
- 🔗 **Clickable queue items**: Click any item in the download queue to jump directly to that message in chat
- 📋 **Failure reason display**: Queue shows specific error reasons (e.g., "Element not found", "No URL available")
- 🎯 **One-click navigation**: No hunting through chat needed - all failed items are clearly marked and easily accessible

This workflow maximizes efficiency: automation handles what it can, clear visual feedback shows what needs manual attention, and one-click navigation makes manual downloads quick and painless.

**Recommendation:** For production use, stick with the [original upstream version](https://github.com/Neet-Nestor/Telegram-Media-Downloader) which focuses on single-video downloads and has proven stability. This fork is suitable for testing and experimentation only.

---

## Overview
This user script unlocks and enables download of images, GIFs, audios, and videos in Telegram webapps from chats, stories, and even private channels where downloading is disabled or restricted.

(Note: some features are only available for specific Telegram webapp version. e.g. Audio message download is only available for the K webapp version.)

### What are user scripts?
User scripts put you in control of your  browsing experience. Once installed, they automatically make the sites you visit better by adding features, making them easier to use, or taking out the annoying bits. The user scripts on Greasy Fork were written by other users and posted to share with the world. They're free to install and easy to use.

## Installation
### Greasy Fork
1. install a user script manager

    To use user scripts you need to first install a user script manager. Which user script manager you can use depends on which browser you use.

    - Chrome: [Tampermonkey](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo) or [Violentmonkey](https://chrome.google.com/webstore/detail/violent-monkey/jinjaccalgkegednnccohejagnlnfdag)
    - Firefox: [Greasemonkey](https://addons.mozilla.org/firefox/addon/greasemonkey/), [Tampermonkey](https://addons.mozilla.org/firefox/addon/tampermonkey/), or [Violentmonkey](https://addons.mozilla.org/firefox/addon/violentmonkey/)
    - Safari: [Tampermonkey](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo) or [Userscripts](https://apps.apple.com/app/userscripts/id1463298887)
    - Microsoft Edge: [Tampermonkey](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo) or [Violentmonkey](https://chrome.google.com/webstore/detail/violent-monkey/jinjaccalgkegednnccohejagnlnfdag)
    - Opera: [Tampermonkey](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo) or [Violentmonkey](https://chrome.google.com/webstore/detail/violent-monkey/jinjaccalgkegednnccohejagnlnfdag)
    - Maxthon: [Violentmonkey](https://chrome.google.com/webstore/detail/violent-monkey/jinjaccalgkegednnccohejagnlnfdag)

    (Note, If you are using Tampermonkey extension in a Chrome-based browser, following [instructions](https://www.tampermonkey.net/faq.php#Q209) to enable Developer Mode.)

2. Install this script by visiting Greasy Fork:
    https://greasyfork.org/scripts/446342-telegram-media-downloader

### Manual Installation
1. install a user script manager

    To use user scripts you need to first install a user script manager. Which user script manager you can use depends on which browser you use.

    - Chrome: [Tampermonkey](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo) or [Violentmonkey](https://chrome.google.com/webstore/detail/violent-monkey/jinjaccalgkegednnccohejagnlnfdag)
    - Firefox: [Greasemonkey](https://addons.mozilla.org/firefox/addon/greasemonkey/), [Tampermonkey](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo), or [Violentmonkey](https://chrome.google.com/webstore/detail/violent-monkey/jinjaccalgkegednnccohejagnlnfdag)
    - Safari: [Tampermonkey](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo) or [Userscripts](https://apps.apple.com/app/userscripts/id1463298887)
    - Microsoft Edge: [Tampermonkey](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo) or [Violentmonkey](https://chrome.google.com/webstore/detail/violent-monkey/jinjaccalgkegednnccohejagnlnfdag)
    - Opera: [Tampermonkey](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo) or [Violentmonkey](https://chrome.google.com/webstore/detail/violent-monkey/jinjaccalgkegednnccohejagnlnfdag)
    - Maxthon: [Violentmonkey](https://chrome.google.com/webstore/detail/violent-monkey/jinjaccalgkegednnccohejagnlnfdag)

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

### Bulk Download (Experimental - Fork Only)

This fork includes experimental bulk download functionality with a semi-automated workflow:

1. **Open bulk download panel**:
   - First, open and close any video in the chat (required workaround for initialization bug)
   - Click the floating "Bulk Download" button that appears on the right side of the screen

2. **Scan the chat**:
   - Click "Start Scanning" to find all media in the current chat
   - The script will automatically scroll through the chat and collect all videos, images, and audio files

3. **Review the queue**:
   - All found media will appear in the download queue
   - Items are sorted chronologically (newest first by default)
   - Queue shows status icons: ⏳ (pending), ⏬ (downloading), ✓ (completed), ✗ (failed)

4. **Start bulk download**:
   - Click "Start Auto Download" to begin downloading all items
   - The script will attempt each download automatically
   - **Success rate ~45%** - many downloads will fail due to Telegram's architecture

5. **Handle failed items** (semi-automation):
   - After bulk download completes, check the chat for visual indicators:
     - **Green ✓ badges** = Successfully downloaded
     - **Red ✗ badges** = Failed (with specific error reason)
   - Click any queue item to jump directly to that message in chat
   - Manually download failed items using the individual download button on each post

6. **Export status** (optional):
   - Click "Copy Full Status" to export comprehensive debugging info
   - Includes success/failure breakdown with specific error reasons
   - Useful for troubleshooting or reporting issues

**Best Practices:**
- Let the scan complete fully before starting downloads
- Don't scroll manually while bulk download is running
- Use clickable queue items to quickly navigate to failed downloads
- Export status if you encounter unexpected behavior

### Supported Webapp Versions
There are 2 different versions of telegram webapps:
- https://webk.telegram.org / https://web.telegram.org/k/ (**Recommended**)
- https://webz.telegram.org / https://web.telegram.org/a/

This script should work on both versions of webapp, but some features are only available in the /k/ version (such as voice message downloads). If certain features are not working, switching to the /k/ version is recommended.

### Check Downloading Progress
A progress bar will show on the bottom-right of the screen for videos. You can also check [DevTools console](https://developer.chrome.com/docs/devtools/open/) for logs.

## Contributing

We welcome contributions from the community! If you’d like to contribute to Telegram Media Downloader, follow these steps:

### Reporting Issues
If you find a bug, compatibility issue, or have a feature request, please:

1. Check if the issue has already been reported in the Issues tab.
2. If not, create a new issue with a clear title and description. Attach screenshots or logs if applicable.

### Submitting Pull Requests

1. **Fork the repository**: Click on the "Fork" button in the top-right of the repo.

2. **Clone your fork**:

    ```bash
    git clone https://github.com/YOUR-USERNAME/Telegram-Media-Downloader.git
    cd Telegram-Media-Downloader
    ```

3. **Create a new branch** for your feature or bugfix:

    ```bash
    git checkout -b feature-or-bugfix-name
    ```

    Make your changes and ensure the script still works correctly on supported Telegram webapps.

4. **Make your changes** and ensure the script still works correctly on supported Telegram webapps.

5. **Commit your changes** with a descriptive message:

    ```bash
    git commit -m "Add feature/fix issue: Brief description"
    ```

6. **Push to your fork:**

    ```bash
    git push origin feature-or-bugfix-name
    ```

7. **Submit a Pull Request (PR):**

    - Go to the original repository: [Neet-Nestor/Telegram-Media-Downloader](https://github.com/Neet-Nestor/Telegram-Media-Downloader).

    - Click "New Pull Request" and select your branch.

    - Add a description of your changes and submit.

### Development Guidelines
- Keep your code clean and well-documented.
- Follow the existing coding style.
- Test your changes on both Telegram WebK and WebZ versions.
- Ensure compatibility with major user script managers like Tampermonkey and Violentmonkey.

### Help with Translations
We want Telegram Media Downloader to be accessible to users worldwide! If you’d like to help translate the script’s Greasy Fork page, follow these steps:

#### How to Contribute a Translation

Check for existing translations in the [`docs/greasyfork`](/docs/greasyfork/) folder of the repository.

Add a new file in docs/<language-code>.md, using the appropriate language code (e.g., docs/fr-FR.md for French, docs/de-DE.md for German).

Translate the content from [`docs/greasyfork/en-US.md`](/docs/greasyfork/en-US.md) into your language while keeping the formatting intact. Submit a Pull Request following the steps in the [Submitting Pull Requests](#submitting-pull-requests) section above.

#### Language Codes
Use standard IETF Language Tag (e.g., `es-ES` for Spanish, `ja-JP` for Japanese). You can find a full list of codes [here](https://docs.dyspatch.io/localization/supported_languages/).

## Support Author
If you like this script, you can support me via [Venmo](https://venmo.com/u/NeetNestor) or [buy me a coffee](https://ko-fi.com/neetnestor) :)
