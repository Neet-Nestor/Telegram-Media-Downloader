const { test, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { launch, openPage } = require('./helpers.cjs');
let browser;
let page;
before(async () => { browser = await launch(); });
after(async () => { await browser?.close(); });
afterEach(async () => { await page?.close(); });

test('audio errors never produce a downloaded file', async () => {
  for (const sample of [
    { status: 500, range: null },
    { status: 206, range: 'bytes 5-7/8' },
    { status: 206, range: 'invalid' },
  ]) {
    page = await openPage(browser);
    const result = await page.evaluate(async sample => {
      fetch = async () => response('audio/ogg', sample.range, 'abc', sample.status);
      downloads.audio('https://test.invalid/audio');
      await settle();
      return { saved: saved.length, errors };
    }, sample);
    assert.equal(result.saved, 0);
    assert.ok(result.errors.length > 0);
    await page.close();
  }
});

test('valid audio still downloads', async () => {
  page = await openPage(browser);
  const result = await page.evaluate(async () => {
    fetch = async () => response('audio/ogg', 'bytes 0-2/3');
    downloads.audio('https://test.invalid/audio');
    await settle();
    return { saved: saved.length, body: await blobs[0]?.text(), errors };
  });
  assert.deepEqual(result, { saved: 1, body: 'abc', errors: [] });
});

test('disk failures abort the output and never report completion', async () => {
  for (const kind of ['video', 'audio']) {
    for (const stage of ['write', 'close']) {
      page = await openPage(browser);
      const result = await page.evaluate(async ({ kind, stage }) => {
        let aborted = 0;
        fetch = async () => response(kind === 'video' ? 'video/mp4' : 'audio/ogg', 'bytes 0-2/3');
        window.showSaveFilePicker = async () => ({ createWritable: async () => ({
          write: async () => { if (stage === 'write') throw new Error('Disk full'); },
          close: async () => { if (stage === 'close') throw new Error('Cannot commit file'); },
          abort: async () => { aborted++; },
        }) });
        downloads[kind]('https://test.invalid/media');
        await settle();
        return { aborted, status: document.querySelector('.progress p')?.textContent, errors };
      }, { kind, stage });
      assert.equal(result.aborted, 1);
      assert.notEqual(result.status, 'Completed');
      assert.equal(result.errors.length, 1);
      await page.close();
    }
  }
});

test('disk completion waits for write and close', async () => {
  page = await openPage(browser);
  const result = await page.evaluate(async () => {
    const events = [];
    let finishWrite, finishClose;
    window.showSaveFilePicker = async () => ({ createWritable: async () => ({
      write: () => new Promise(resolve => { events.push('write'); finishWrite = resolve; }),
      close: () => new Promise(resolve => { events.push('close'); finishClose = resolve; }),
      abort: async () => {},
    }) });
    downloads.video('https://test.invalid/video');
    await settle();
    const beforeWrite = [...events];
    finishWrite();
    await settle();
    const beforeClose = document.querySelector('.progress p').textContent;
    finishClose();
    await settle();
    return { beforeWrite, beforeClose, final: document.querySelector('.progress p').textContent, errors };
  });
  assert.deepEqual(result.beforeWrite, ['write']);
  assert.notEqual(result.beforeClose, 'Completed');
  assert.equal(result.final, 'Completed');
  assert.deepEqual(result.errors, []);
});
