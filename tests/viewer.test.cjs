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

test('pinned audio recovers when its new source loads later', async () => {
  page = await openPage(browser, '<div class="pinned-audio" data-mid="1"><div class="pinned-container-wrapper-utils"></div></div><div class="bubble"><audio-element data-mid="1"></audio-element></div>');
  const result = await page.evaluate(async () => {
    const element = document.querySelector('audio-element');
    element.audio = document.createElement('audio');
    element.audio.src = 'https://test.invalid/first.ogg';
    refresh();
    document.querySelector('.pinned-audio').setAttribute('data-mid', '2');
    element.setAttribute('data-mid', '2');
    element.audio.removeAttribute('src');
    refresh();
    const button = document.querySelector('._tel_download_button_pinned_container');
    const loadingDisabled = button.disabled;
    element.audio.src = 'https://test.invalid/second.ogg';
    refresh();
    fetch = async url => { requests.push(url); return response('audio/ogg', 'bytes 0-2/3'); };
    button.click();
    await settle();
    return { loadingDisabled, readyDisabled: button.disabled, requests, errors };
  });
  assert.equal(result.loadingDisabled, true);
  assert.equal(result.readyDisabled, false);
  assert.deepEqual(result.requests, ['https://test.invalid/second.ogg']);
  assert.deepEqual(result.errors, []);
});

test('unavailable native buttons supply icons without replacing the fallback', async () => {
  for (const attribute of ['disabled', 'aria-disabled="true"', 'hidden']) {
    page = await openPage(browser, media('<img class="thumbnail" src="https://test.invalid/photo.jpg">'));
    const result = await page.evaluate(attribute => {
      document.querySelector('.media-viewer-buttons').innerHTML = `<button class="btn-icon" aria-label="Download" ${attribute}><span class="tgico">&#xe973;</span></button>`;
      refresh();
      const fallback = document.querySelector('.media-viewer-buttons .tel-download');
      const glyph = fallback?.textContent;
      const native = document.querySelector('.media-viewer-buttons button:not(.tel-download)');
      native.removeAttribute('disabled');
      native.removeAttribute('aria-disabled');
      native.removeAttribute('hidden');
      refresh();
      return { glyph, remaining: document.querySelectorAll('.media-viewer-buttons .tel-download').length };
    }, attribute);
    assert.equal(result.glyph, '\ue973');
    assert.equal(result.remaining, 0);
    await page.close();
  }
});

test('WebK icons fall back to SVG and follow native code point changes', async () => {
  page = await openPage(browser, '<div id="stories-viewer"><div class="_ViewerStoryHeaderRight_test"></div></div>');
  const result = await page.evaluate(() => {
    refresh();
    const fallback = !!document.querySelector('.tel-download-icon svg');
    document.body.insertAdjacentHTML('beforeend', '<button class="quality-download-options-button-menu" aria-label="下载"><span class="tgico">&#xe973;</span></button>');
    refresh();
    const initial = document.querySelector('.tel-download-icon').textContent;
    document.querySelector('.quality-download-options-button-menu .tgico').textContent = '\uea55';
    refresh();
    return { fallback, initial, updated: document.querySelector('.tel-download-icon').textContent };
  });
  assert.deepEqual(result, { fallback: true, initial: '\ue973', updated: '\uea55' });
});
