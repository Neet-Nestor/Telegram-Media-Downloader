const { test, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { launch, openPage, media } = require('./helpers.cjs');
let browser;
let page;
before(async () => { browser = await launch(); });
after(async () => { await browser?.close(); });
afterEach(async () => { await page?.close(); });

test('WebK toolbar follows a replacement media node', async () => {
  page = await openPage(browser, media('<img class="thumbnail" src="https://test.invalid/first.jpg">'));
  const result = await page.evaluate(() => {
    refresh();
    const replacement = document.createElement('div');
    replacement.className = 'media-viewer-aspecter';
    replacement.innerHTML = '<img class="thumbnail" src="https://test.invalid/second.jpg">';
    document.querySelector('.media-viewer-aspecter').replaceWith(replacement);
    refresh();
    document.querySelector('.media-viewer-buttons .tel-download').click();
    return saved[0]?.href;
  });
  assert.equal(result, 'https://test.invalid/second.jpg');
});

test('WebK toolbar follows an image-to-video transition', async () => {
  page = await openPage(browser, media('<img class="thumbnail" src="https://test.invalid/first.jpg">'));
  const result = await page.evaluate(async () => {
    refresh();
    document.querySelector('.media-viewer-aspecter').innerHTML = '<video src="https://test.invalid/second.mp4"></video>';
    refresh();
    document.querySelector('.media-viewer-buttons .tel-download').click();
    await settle();
    return { url: requests[0]?.url, errors };
  });
  assert.equal(result.url, 'https://test.invalid/second.mp4');
  assert.deepEqual(result.errors, []);
});
