const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');

const source = fs.readFileSync(path.join(__dirname, '../src/tel_download.js'), 'utf8')
  .replace('logger.info("Completed script setup.");',
    'window.downloads = { video: tel_download_video, audio: tel_download_audio, image: tel_download_image };');

exports.launch = () => chromium.launch({
  headless: true,
  ...(process.env.TEL_TEST_BROWSER ? { executablePath: process.env.TEL_TEST_BROWSER } : {}),
});

exports.openPage = async (browser, html = '', pathname = '/k/') => {
  const page = await browser.newPage();
  await page.route('**/*', route => route.request().isNavigationRequest()
    ? route.fulfill({ contentType: 'text/html', body: html })
    : route.abort());
  await page.goto('https://web.telegram.org' + pathname);
  await page.evaluate(() => {
    window.ticks = [];
    window.setInterval = fn => ticks.push(fn);
    window.refresh = () => ticks.forEach(fn => fn());
    window.unsafeWindow = window;
    delete window.showSaveFilePicker;
    window.saved = [];
    window.blobs = [];
    window.requests = [];
    window.errors = [];
    window.console.error = (...args) => errors.push(args.map(String).join(' '));
    window.addEventListener('unhandledrejection', event => {
      errors.push(String(event.reason));
      event.preventDefault();
    });
    window.addEventListener('error', event => {
      errors.push(event.message);
      event.preventDefault();
    });
    HTMLAnchorElement.prototype.click = function () {
      saved.push({ name: this.download, href: this.href });
    };
    URL.createObjectURL = blob => { blobs.push(blob); return 'blob:test'; };
    URL.revokeObjectURL = () => {};
    window.response = (type, range, body = 'abc', status = 206) => new Response(body, {
      status,
      headers: { 'Content-Type': type, ...(range ? { 'Content-Range': range } : {}) },
    });
    window.fetch = async (url, options) => {
      requests.push({ url, range: options?.headers?.Range });
      return response(/\.(jpg|jpeg|png)$/.test(url) ? 'image/jpeg' : 'video/mp4', 'bytes 0-2/3');
    };
    window.settle = () => new Promise(resolve => setTimeout(resolve, 50));
  });
  await page.addScriptTag({ content: source });
  return page;
};

exports.media = content => `<div class="media-viewer-whole"><div class="media-viewer-movers"><div class="media-viewer-aspecter">${content}</div></div><div class="media-viewer-topbar"><div class="media-viewer-buttons"></div></div></div>`;
