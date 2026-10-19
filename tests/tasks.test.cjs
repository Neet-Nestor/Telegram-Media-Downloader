const { test, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { launch, openPage } = require('./helpers.cjs');
let browser;
let page;
before(async () => { browser = await launch(); });
after(async () => { await browser?.close(); });
afterEach(async () => { await page?.close(); });

test('duplicate clicks share one download and can restore a dismissed card', async () => {
  page = await openPage(browser);
  const result = await page.evaluate(async () => {
    let respond, calls = 0;
    fetch = () => { calls++; return new Promise(resolve => { respond = resolve; }); };
    const first = downloads.video('https://test.invalid/video');
    document.querySelector('[data-action="dismiss"]').click();
    const second = downloads.video('https://test.invalid/video');
    const cards = document.querySelectorAll('.tel-task').length;
    respond(response('video/mp4', 'bytes 0-2/3'));
    await first;
    return { same: first === second, calls, cards, saved: saved.length, errors };
  });
  assert.deepEqual(result, { same: true, calls: 1, cards: 1, saved: 1, errors: [] });
});

test('cancelling a streamed download aborts the request and unfinished file', async () => {
  page = await openPage(browser);
  const result = await page.evaluate(async () => {
    let stream, aborted = 0, closed = 0, cancelledBody = 0;
    window.showSaveFilePicker = async () => ({ createWritable: async () => ({
      write: async () => {}, close: async () => { closed++; }, abort: async () => { aborted++; },
    }) });
    fetch = async () => new Response(new ReadableStream({
      start(controller) { stream = controller; }, cancel() { cancelledBody++; },
    }), { status: 206, headers: { 'Content-Type': 'video/mp4', 'Content-Range': 'bytes 0-5/6' } });
    const done = downloads.video('https://test.invalid/video');
    await settle();
    stream.enqueue(new Uint8Array([1, 2, 3]));
    await settle();
    document.querySelector('[data-action="cancel"]').click();
    await done;
    return { aborted, closed, cancelledBody, saved: saved.length, state: document.querySelector('.tel-task').dataset.state, errors };
  });
  assert.deepEqual(result, { aborted: 1, closed: 0, cancelledBody: 1, saved: 0, state: 'cancelled', errors: [] });
});

test('only two downloads run at once and completing one starts the next', async () => {
  page = await openPage(browser);
  const result = await page.evaluate(async () => {
    const responders = [];
    fetch = (url) => { requests.push(url); return new Promise(resolve => responders.push(resolve)); };
    const done = [1, 2, 3].map(id => downloads.video(`https://test.invalid/${id}.mp4`));
    const initial = { requests: requests.length, queued: document.querySelectorAll('[data-state="queued"]').length };
    responders[0](response('video/mp4', 'bytes 0-2/3'));
    await settle();
    const afterFirst = requests.length;
    responders[1](response('video/mp4', 'bytes 0-2/3'));
    responders[2](response('video/mp4', 'bytes 0-2/3'));
    await Promise.all(done);
    return { initial, afterFirst, saved: saved.length, errors };
  });
  assert.deepEqual(result, { initial: { requests: 2, queued: 1 }, afterFirst: 3, saved: 3, errors: [] });
});

test('queued tasks can be cancelled without starting a request', async () => {
  page = await openPage(browser);
  const result = await page.evaluate(async () => {
    const responders = [];
    fetch = url => { requests.push(url); return new Promise(resolve => responders.push(resolve)); };
    const done = [1, 2, 3].map(id => downloads.video(`https://test.invalid/${id}.mp4`));
    document.querySelector('[data-state="queued"] [data-action="cancel"]').click();
    responders.forEach(resolve => resolve(response('video/mp4', 'bytes 0-2/3')));
    await Promise.all(done);
    return { requests: requests.length, saved: saved.length, cancelled: document.querySelectorAll('[data-state="cancelled"]').length, errors };
  });
  assert.deepEqual(result, { requests: 2, saved: 2, cancelled: 1, errors: [] });
});

test('failed tasks expose an error and retry starts a fresh successful task', async () => {
  page = await openPage(browser);
  const result = await page.evaluate(async () => {
    let calls = 0;
    fetch = async () => ++calls === 1 ? response('video/mp4', null, 'error', 500) : response('video/mp4', 'bytes 0-2/3');
    await downloads.video('https://test.invalid/video');
    const error = document.querySelector('.tel-task-error').textContent;
    document.querySelector('[data-action="retry"]').click();
    await settle();
    return { calls, error, saved: saved.length, state: document.querySelector('.tel-task').dataset.state };
  });
  assert.equal(result.calls, 2);
  assert.match(result.error, /HTTP 500/);
  assert.equal(result.saved, 1);
  assert.equal(result.state, 'handedOff');
});

test('unknown totals show indeterminate progress and hiding the panel keeps downloading', async () => {
  page = await openPage(browser);
  const result = await page.evaluate(async () => {
    let stream;
    fetch = async () => new Response(new ReadableStream({ start(controller) { stream = controller; } }), { headers: { 'Content-Type': 'video/mp4' } });
    const done = downloads.video('https://test.invalid/video');
    await settle();
    stream.enqueue(new Uint8Array([1, 2, 3]));
    await settle();
    const progress = document.querySelector('.progress');
    const partial = { percent: progress.getAttribute('aria-valuenow'), details: document.querySelector('.tel-task-details').textContent };
    document.querySelector('.tel-panel-toggle').click();
    const hidden = document.querySelector('.tel-task-list').hidden;
    stream.close();
    await done;
    return { partial, hidden, saved: saved.length, state: document.querySelector('.tel-task').dataset.state, errors };
  });
  assert.equal(result.partial.percent, null);
  assert.match(result.partial.details, /3 B/);
  assert.equal(result.hidden, true);
  assert.equal(result.saved, 1);
  assert.equal(result.state, 'handedOff');
  assert.deepEqual(result.errors, []);
});
