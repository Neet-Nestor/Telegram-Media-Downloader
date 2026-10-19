const { test, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { launch, openPage } = require('./helpers.cjs');
const { nativeApi } = require('./native-helpers.cjs');
let browser;
let page;
before(async () => { browser = await launch(); });
after(async () => { await browser?.close(); });
afterEach(async () => { await page?.close(); });

async function openBatch() {
  page = await openPage(browser, '', '/k/', { beforeScript: nativeApi });
  await page.evaluate(() => {
    window.selectionReads = 0;
    window.selectionCancels = 0;
    window.selectedMessages = [makeMessage(1), makeMessage(2)];
    document.body.insertAdjacentHTML('beforeend', '<div class="selection-wrapper"><div class="selection-container"><button id="native-forward">Forward</button></div></div>');
    window.appImManager = { chat: { selection: {
      selectionInputWrapper: document.querySelector('.selection-wrapper'),
      getSelectedMessages() { selectionReads++; return Promise.resolve([...selectedMessages]); },
      cancelSelection() { selectionCancels++; },
    } } };
    refresh();
  });
}

test('batch selection snapshots supported media, deduplicates it and skips text', async () => {
  await openBatch();
  const result = await page.evaluate(async () => {
    selectedMessages = [makeMessage(1), makeMessage(2, -1001, 'image'), makeMessage(3, -1001, 'audio'), makeMessage(1), { _: 'message', message: 'text' }];
    selectedMessages.push({ media: { document: { _: 'document', id: 9, mime_type: 'application/pdf' } } });
    const button = document.querySelector('.tel-selection-download');
    button.click();
    button.click();
    await settle();
    const initial = { calls: nativeCalls.length, queued: document.querySelectorAll('[data-state="queued"]').length, reads: selectionReads };
    // Changing the visible chat and selection must not change already queued jobs.
    appImManager.chat = { selection: { getSelectedMessages: () => Promise.resolve([makeMessage(99)]) } };
    for (let i = 0; i < 3; i++) { nativeCalls[i].resolve(); await settle(); }
    return {
      initial, ids: nativeCalls.map(call => call.media.id), requests, saved, selectionCancels,
      status: document.querySelector('.tel-batch-notice p').textContent,
      states: [...document.querySelectorAll('.tel-task')].map(card => card.dataset.state), errors,
    };
  });
  assert.deepEqual(result.initial, { calls: 1, queued: 2, reads: 1 });
  assert.deepEqual(result.ids, ['1', '2', '3']);
  assert.match(result.status, /Added 3 downloads.*Skipped 3/);
  assert.deepEqual(result.states, ['handedOff', 'handedOff', 'handedOff']);
  assert.deepEqual(result.requests, []);
  assert.deepEqual(result.saved, []);
  assert.equal(result.selectionCancels, 0);
  assert.deepEqual(result.errors, []);
});

test('repeating a selection reuses active transfers and reports skipped duplicates', async () => {
  await openBatch();
  const result = await page.evaluate(async () => {
    document.querySelector('.tel-selection-download').click();
    await settle();
    document.querySelector('.tel-selection-download').click();
    await settle();
    const status = document.querySelector('.tel-batch-notice p').textContent;
    nativeCalls[0].resolve(); await settle(); nativeCalls[1].resolve(); await settle();
    return { status, calls: nativeCalls.length, cards: document.querySelectorAll('.tel-task').length, errors };
  });
  assert.match(result.status, /Added 0 downloads.*Skipped 2/);
  assert.equal(result.calls, 2);
  assert.equal(result.cards, 2);
  assert.deepEqual(result.errors, []);
});

test('a failed batch item stays visible and the next item still downloads', async () => {
  await openBatch();
  const result = await page.evaluate(async () => {
    document.querySelector('.tel-selection-download').click(); await settle();
    nativeCalls[0].reject(new Error('Native file missing')); await settle();
    nativeCalls[1].resolve(); await settle();
    return { calls: nativeCalls.length, states: [...document.querySelectorAll('.tel-task')].map(card => card.dataset.state).sort(), error: document.querySelector('[data-state="failed"] .tel-task-error').textContent, requests };
  });
  assert.deepEqual(result.states, ['failed', 'handedOff']);
  assert.match(result.error, /Native file missing/);
  assert.equal(result.calls, 2);
  assert.deepEqual(result.requests, []);
});

test('cancel all aborts the active native transfer and cancels every queued item', async () => {
  await openBatch();
  const result = await page.evaluate(async () => {
    selectedMessages.push(makeMessage(3));
    document.querySelector('.tel-selection-download').click(); await settle();
    document.querySelector('.tel-cancel-all').click(); await settle();
    return { calls: nativeCalls.length, cancelled: nativeCalls[0].cancelled, states: [...document.querySelectorAll('.tel-task')].map(card => card.dataset.state), hidden: document.querySelector('.tel-cancel-all').hidden, errors };
  });
  assert.deepEqual(result, { calls: 1, cancelled: 1, states: ['cancelled', 'cancelled', 'cancelled'], hidden: true, errors: [] });
});

test('cancel all invalidates a pending selection snapshot before it can enqueue anything', async () => {
  await openBatch();
  const result = await page.evaluate(async () => {
    let resolve;
    appImManager.chat.selection.getSelectedMessages = () => new Promise(done => { resolve = done; });
    const button = document.querySelector('.tel-selection-download');
    button.click();
    const disabled = button.disabled;
    document.querySelector('.tel-cancel-all').click();
    resolve([makeMessage(1)]); await settle();
    return { disabled, enabledAgain: !button.disabled, calls: nativeCalls.length, cards: document.querySelectorAll('.tel-task').length, status: document.querySelector('.tel-batch-notice p').textContent, errors };
  });
  assert.deepEqual(result, { disabled: true, enabledAgain: true, calls: 0, cards: 0, status: 'Selection download cancelled', errors: [] });
});

test('selection lookup errors are visible and allow another attempt', async () => {
  await openBatch();
  const result = await page.evaluate(async () => {
    appImManager.chat.selection.getSelectedMessages = () => Promise.reject(new Error('Selection unavailable'));
    document.querySelector('.tel-selection-download').click(); await settle();
    const notice = document.querySelector('.tel-batch-notice p').textContent;
    const enabled = !document.querySelector('.tel-selection-download').disabled;
    const shown = !document.querySelector('#tel-downloader-progress-bar-container').hidden;
    appImManager.chat.selection.getSelectedMessages = () => Promise.resolve([makeMessage(1)]);
    document.querySelector('.tel-selection-download').click(); await settle();
    nativeCalls[0].resolve(); await settle();
    return { notice, enabled, shown, calls: nativeCalls.length, errors };
  });
  assert.match(result.notice, /Selection unavailable/);
  assert.equal(result.enabled, true);
  assert.equal(result.shown, true);
  assert.equal(result.calls, 1);
  assert.deepEqual(result.errors, []);
});

test('an asynchronous snapshot keeps the originally selected chat without clearing the new selection', async () => {
  await openBatch();
  const result = await page.evaluate(async () => {
    let resolve;
    appImManager.chat.selection.getSelectedMessages = () => new Promise(done => { resolve = done; });
    document.querySelector('.tel-selection-download').click();
    appImManager.chat = { selection: { getSelectedMessages: () => Promise.resolve([makeMessage(99)]), cancelSelection: () => selectionCancels++ } };
    resolve([makeMessage(7, -2002)]); await settle();
    nativeCalls[0].resolve(); await settle();
    return { id: nativeCalls[0].media.id, selectionCancels, errors };
  });
  assert.deepEqual(result, { id: '7', selectionCancels: 0, errors: [] });
});

test('batch controls mount on nested DOM additions without polling and disappear if capabilities are lost', async () => {
  page = await openPage(browser, '', '/k/', { beforeScript: nativeApi });
  await page.evaluate(() => {
    appImManager = { chat: { selection: { getSelectedMessages: () => Promise.resolve([]) } } };
    document.body.insertAdjacentHTML('beforeend', '<main><div class="selection-wrapper"><div class="selection-container"><button id="native-forward">Forward</button></div></div></main>');
  });
  await page.waitForSelector('.tel-selection-download');
  assert.equal(await page.locator('#native-forward').count(), 1);
  const result = await page.evaluate(() => {
    refresh(); refresh();
    const count = document.querySelectorAll('.tel-selection-download').length;
    appDownloadManager = {};
    refresh();
    return { count, remaining: document.querySelectorAll('.tel-selection-download').length, errors };
  });
  assert.deepEqual(result, { count: 1, remaining: 0, errors: [] });
});

test('right-click downloads the exact restricted album item and updates a reused context menu', async () => {
  page = await openPage(browser, '<div class="bubble no-forwards" data-peer-id="-1001" data-mid="1"><div class="grouped-item" data-mid="2"><img id="album-photo"></div></div><div class="bubble no-forwards" data-peer-id="-2002" data-mid="1"><img id="second-chat"></div>', '/k/', { beforeScript: nativeApi });
  await page.evaluate(() => {
    // The second chat has the same message ID, but a different photo ID.
    apiManagerProxy = { getMessageByPeer: (peer, mid) => {
      const message = makeMessage(mid, Number(peer), 'image');
      message.media.photo.id = peer === '-2002' ? '101' : String(mid);
      return message;
    } };
    document.querySelector('#album-photo').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, button: 2 }));
    document.body.insertAdjacentHTML('beforeend', '<section><div id="bubble-contextmenu"><div class="btn-menu-items"><div class="btn-menu-item" id="native-copy">Copy</div></div></div></section>');
  });
  await page.waitForSelector('.tel-context-download');
  await page.getByRole('menuitem', { name: 'Download', exact: true }).press('Enter');
  const result = await page.evaluate(async () => {
    nativeCalls[0].resolve(); await settle();
    document.querySelector('#second-chat').dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 2 }));
    document.querySelector('.tel-context-download').click();
    nativeCalls[1].resolve(); await settle();
    return { ids: nativeCalls.map(call => call.media.id), count: document.querySelectorAll('.tel-context-download').length, nativeCopy: !!document.querySelector('#native-copy'), requests, errors };
  });
  assert.deepEqual(result, { ids: ['2', '101'], count: 1, nativeCopy: true, requests: [], errors: [] });
});

test('context action never carries a previous target into text, unrestricted or unrelated menus', async () => {
  page = await openPage(browser, '<div class="bubble no-forwards" data-peer-id="-1001" data-mid="1" id="restricted"></div><div class="bubble" data-peer-id="-1001" data-mid="2" id="normal"></div><div class="bubble no-forwards" data-peer-id="-1001" data-mid="3" id="text"></div><div id="bubble-contextmenu"><div class="btn-menu-item">Copy</div></div>', '/k/', { beforeScript: nativeApi });
  const result = await page.evaluate(() => {
    apiManagerProxy = { getMessageByPeer: (peer, mid) => mid === 3 ? { mid, peerId: Number(peer), message: 'text' } : makeMessage(mid, Number(peer)) };
    const counts = [];
    for (const target of ['restricted', 'normal', 'restricted', 'text', 'restricted', 'body']) {
      (document.getElementById(target) || document.body).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, button: 2 }));
      counts.push(document.querySelectorAll('.tel-context-download').length);
    }
    return { counts, calls: nativeCalls.length, errors };
  });
  assert.deepEqual(result, { counts: [1, 0, 1, 0, 1, 0], calls: 0, errors: [] });
});

test('new controls and batch results follow language changes', async () => {
  await openBatch();
  const result = await page.evaluate(async () => {
    selectedMessages = [{ message: 'text' }];
    document.querySelector('.tel-selection-download').click(); await settle();
    const language = document.querySelector('#tel-download-language');
    language.value = 'zh-CN'; language.dispatchEvent(new Event('change'));
    return { selectedLabel: document.querySelector('.tel-selection-download').getAttribute('aria-label'), cancelLabel: document.querySelector('.tel-cancel-all').getAttribute('aria-label'), status: document.querySelector('.tel-batch-notice p').textContent, errors };
  });
  assert.equal(result.selectedLabel, '下载选中媒体');
  assert.equal(result.cancelLabel, '取消全部下载');
  assert.equal(result.status, '已添加 0 个下载，跳过 1 条文字、不支持或重复的内容。');
  assert.deepEqual(result.errors, []);
});

test('WebA does not receive WebK message actions', async () => {
  page = await openPage(browser, '<div class="selection-wrapper"><div class="selection-container"></div></div>', '/a/', { beforeScript: nativeApi });
  const result = await page.evaluate(() => {
    appImManager = { chat: { selection: { getSelectedMessages: () => Promise.resolve([makeMessage(1)]) } } };
    refresh();
    return { path: location.pathname, actions: document.querySelectorAll('.tel-selection-download, .tel-context-download').length, errors };
  });
  assert.deepEqual(result, { path: '/a/', actions: 0, errors: [] });
});

test('the selection action fits beside Telegram\'s column-oriented wrapper on a narrow screen', async () => {
  await openBatch();
  await page.setViewportSize({ width: 360, height: 640 });
  const result = await page.evaluate(() => {
    // Telegram's chat-input-wrapper uses flex-direction: column. Adding a
    // sibling without adapting that layout would put the button on a new row.
    const style = document.createElement('style');
    style.textContent = '.chat-input-wrapper { display:flex; flex-direction:column; width:336px; align-items:center; } .selection-container { display:flex; width:100%; height:48px; align-items:center; } .btn-icon { width:40px; height:40px; }';
    document.head.append(style);
    document.querySelector('.selection-wrapper').classList.add('chat-input-wrapper');
    const bar = document.querySelector('.selection-container').getBoundingClientRect();
    const button = document.querySelector('.tel-selection-download').getBoundingClientRect();
    return { onSameRow: button.top >= bar.top && button.bottom <= bar.bottom, beside: button.left >= bar.right, fits: button.right <= innerWidth };
  });
  assert.deepEqual(result, { onSameRow: true, beside: true, fits: true });
});
