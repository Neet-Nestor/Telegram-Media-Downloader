const { test, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { launch, openPage, media } = require('./helpers.cjs');
const { nativeApi } = require('./native-helpers.cjs');
let browser;
let page;
before(async () => { browser = await launch(); });
after(async () => { await browser?.close(); });
afterEach(async () => { await page?.close(); });
const viewer = media('<video src="https://test.invalid/preview.mp4"></video>');
const openNative = () => openPage(browser, viewer, '/k/', { beforeScript: nativeApi });

test('WebK native downloads use media metadata, report bytes and hand off to the browser', async () => {
  page = await openNative();
  const result = await page.evaluate(async () => {
    let pickers = 0;
    showSaveFilePicker = () => { pickers++; throw new Error('Unexpected picker'); };
    document.querySelector('.media-viewer-buttons .tel-download').click();
    nativeCalls[0].progress(3, 6);
    const partial = {
      name: document.querySelector('.filename').textContent,
      percent: document.querySelector('.progress').getAttribute('aria-valuenow'),
      bytes: document.querySelector('.tel-task-details').textContent,
    };
    nativeCalls[0].resolve();
    await settle();
    return { partial, pickers, requests, saved, state: document.querySelector('.tel-task').dataset.state, listeners: nativeCalls[0].operation.listeners.length, errors };
  });
  assert.equal(result.partial.name, 'original.1.mp4');
  assert.equal(result.partial.percent, '50');
  assert.match(result.partial.bytes, /3 B \/ 6 B/);
  assert.deepEqual({ ...result, partial: undefined }, { partial: undefined, pickers: 0, requests: [], saved: [], state: 'handedOff', listeners: 0, errors: [] });
});

test('viewer clicks resolve the current message and retain queued media across chat changes', async () => {
  page = await openNative();
  const result = await page.evaluate(async () => {
    const button = document.querySelector('.media-viewer-buttons .tel-download');
    for (const id of [2, 3, 4]) {
      appMediaViewer.target = { message: makeMessage(id) };
      button.click();
    }
    const initial = { ids: nativeCalls.map(call => call.media.id), queued: document.querySelectorAll('[data-state="queued"]').length };
    appMediaViewer.target = { message: makeMessage(99, -2002) };
    nativeCalls[0].resolve();
    await settle();
    const ids = nativeCalls.map(call => call.media.id);
    nativeCalls[1].resolve();
    await settle();
    nativeCalls[2].resolve();
    await settle();
    return { initial, ids, finalIds: nativeCalls.map(call => call.media.id), errors };
  });
  assert.deepEqual(result, { initial: { ids: ['2'], queued: 2 }, ids: ['2', '3'], finalIds: ['2', '3', '4'], errors: [] });
});

test('repeated native clicks deduplicate and dismissing a card leaves the transfer running', async () => {
  page = await openNative();
  const result = await page.evaluate(async () => {
    const button = document.querySelector('.media-viewer-buttons .tel-download');
    button.click();
    document.querySelector('[data-action="dismiss"]').click();
    button.click();
    const count = document.querySelectorAll('.tel-task').length;
    nativeCalls[0].resolve();
    await settle();
    return { calls: nativeCalls.length, count, cancelled: nativeCalls[0].cancelled, state: document.querySelector('.tel-task').dataset.state };
  });
  assert.deepEqual(result, { calls: 1, count: 1, cancelled: 0, state: 'handedOff' });
});

test('native cancellation reaches Telegram and queued cancellation never starts a transfer', async () => {
  page = await openNative();
  const result = await page.evaluate(async () => {
    for (const id of [1, 2, 3]) {
      appMediaViewer.target = { message: makeMessage(id) };
      document.querySelector('.media-viewer-buttons .tel-download').click();
    }
    document.querySelector('[data-state="queued"] [data-action="cancel"]').click();
    document.querySelector('[data-state="downloading"] [data-action="cancel"]').click();
    await settle();
    nativeCalls.forEach(call => { if (!call.cancelled) call.resolve(); });
    await settle();
    return { calls: nativeCalls.length, cancelled: nativeCalls.reduce((n, call) => n + call.cancelled, 0), states: [...document.querySelectorAll('.tel-task')].map(card => card.dataset.state).sort(), errors };
  });
  assert.deepEqual(result, { calls: 2, cancelled: 1, states: ['cancelled', 'cancelled', 'handedOff'], errors: [] });
});

test('photo metadata can start a native download before the preview URL is ready', async () => {
  page = await openPage(browser, media('<img class="thumbnail">'), '/k/', { beforeScript: nativeApi });
  const result = await page.evaluate(async () => {
    appMediaViewer.target = { message: makeMessage(8, -1001, 'image'), index: null };
    refresh();
    document.querySelector('.media-viewer-buttons .tel-download').click();
    nativeCalls[0].resolve();
    await settle();
    return { kind: nativeCalls[0].media._, name: document.querySelector('.filename').textContent, requests, state: document.querySelector('.tel-task').dataset.state };
  });
  assert.deepEqual(result, { kind: 'photo', name: 'image_8.jpg', requests: [], state: 'handedOff' });
});

test('native failure is visible and retry does not silently duplicate a transfer through fetch', async () => {
  page = await openNative();
  const result = await page.evaluate(async () => {
    document.querySelector('.media-viewer-buttons .tel-download').click();
    nativeCalls[0].reject(new Error('Native transfer failed'));
    await settle();
    const failed = document.querySelector('.tel-task').dataset.state;
    const error = document.querySelector('.tel-task-error').textContent;
    document.querySelector('[data-action="retry"]').click();
    nativeCalls[1].resolve();
    await settle();
    return { failed, error, calls: nativeCalls.length, requests, state: document.querySelector('.tel-task').dataset.state };
  });
  assert.equal(result.failed, 'failed');
  assert.match(result.error, /Native transfer failed/);
  assert.equal(result.calls, 2);
  assert.deepEqual(result.requests, []);
  assert.equal(result.state, 'handedOff');
});

test('an ordinary native promise has indeterminate progress and disables unsupported cancellation', async () => {
  page = await openNative();
  const result = await page.evaluate(async () => {
    let resolve;
    appDownloadManager.downloadToDisc = () => new Promise(done => { resolve = done; });
    document.querySelector('.media-viewer-buttons .tel-download').click();
    const disabled = document.querySelector('[data-action="cancel"]').disabled;
    const percent = document.querySelector('.progress').getAttribute('aria-valuenow');
    resolve();
    await settle();
    return { disabled, percent, state: document.querySelector('.tel-task').dataset.state, errors };
  });
  assert.deepEqual(result, { disabled: true, percent: null, state: 'handedOff', errors: [] });
});

test('missing native capabilities and indexed media retain the URL backend', async () => {
  for (const scenario of ['manager', 'viewer', 'indexed']) {
    page = await openNative();
    const result = await page.evaluate(async scenario => {
      if (scenario === 'manager') appDownloadManager = {};
      if (scenario === 'viewer') appMediaViewer = {};
      if (scenario === 'indexed') appMediaViewer.target.index = 1;
      document.querySelector('.media-viewer-buttons .tel-download').click();
      await settle();
      return { native: nativeCalls.length, url: requests[0]?.url, saved: saved.length, errors };
    }, scenario);
    assert.deepEqual(result, { native: 0, url: 'https://test.invalid/preview.mp4', saved: 1, errors: [] });
    await page.close();
  }
});

test('pinned audio resolves by peer and message even before its URL loads', async () => {
  page = await openPage(browser, '<div class="pinned-audio" data-peer-id="-1001" data-mid="7"><div class="pinned-container-wrapper-utils"></div></div>', '/k/', { beforeScript: nativeApi });
  const result = await page.evaluate(async () => {
    // Exercise both the current proxy and older WebK naming, with a wrong-peer
    // result from the first resolver that must never be downloaded.
    apiManagerProxy = { getMessageByPeer: () => makeMessage(7, -2002, 'audio') };
    mtprotoMessagePort = { getMessageByPeer: () => makeMessage(7, -1001, 'audio') };
    refresh();
    const button = document.querySelector('._tel_download_button_pinned_container');
    const disabled = button.disabled;
    button.click();
    nativeCalls[0].resolve();
    await settle();
    return { disabled, id: nativeCalls[0].media.id, name: document.querySelector('.filename').textContent, requests, errors };
  });
  assert.deepEqual(result, { disabled: false, id: '7', name: 'original.7.m4a', requests: [], errors: [] });
});

test('WebA never uses the WebK backend or redirects even if its globals exist', async () => {
  const html = '<div id="MediaViewer"><div class="MediaViewerActions"></div><div class="MediaViewerSlide--active"><div class="MediaViewerContent"><div><img src="https://test.invalid/photo.jpg"></div></div></div></div>';
  page = await openPage(browser, html, '/a/', { beforeScript: nativeApi });
  const result = await page.evaluate(async () => {
    document.querySelector('.MediaViewerActions .tel-download').click();
    await settle();
    return { path: location.pathname, native: nativeCalls.length, saved: saved.length, errors };
  });
  assert.deepEqual(result, { path: '/a/', native: 0, saved: 1, errors: [] });
});
