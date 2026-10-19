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
