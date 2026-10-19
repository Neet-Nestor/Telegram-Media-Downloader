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

test('dismissing progress does not cancel a download or break error handling', async () => {
  for (const fail of [false, true]) {
    page = await openPage(browser);
    const result = await page.evaluate(async fail => {
      let respond;
      fetch = () => new Promise(resolve => { respond = resolve; });
      downloads.video('https://test.invalid/video');
      document.querySelector('#tel-downloader-progress-bar-container > div > div > div').click();
      respond(response('video/mp4', fail ? null : 'bytes 0-2/3', 'abc', fail ? 500 : 206));
      await settle();
      return { saved: saved.length, errors };
    }, fail);
    assert.equal(result.saved, fail ? 0 : 1);
    assert.equal(result.errors.length, fail ? 1 : 0);
    assert.ok(result.errors.every(error => !error.includes('null')));
    await page.close();
  }
});

test('complete HTTP 200 responses work for video and audio', async () => {
  for (const kind of ['video', 'audio']) {
    page = await openPage(browser);
    const result = await page.evaluate(async kind => {
      fetch = async () => response(kind === 'video' ? 'video/mp4' : 'audio/ogg', null, 'complete', 200);
      downloads[kind]('https://test.invalid/media');
      await settle();
      return { body: await blobs[0]?.text(), errors };
    }, kind);
    assert.deepEqual(result, { body: 'complete', errors: [] });
    await page.close();
  }
});

test('partial responses are validated and assembled in order', async () => {
  page = await openPage(browser);
  const result = await page.evaluate(async () => {
    fetch = async (url, options) => {
      requests.push(options.headers.Range);
      return requests.length === 1
        ? response('video/mp4', 'bytes 0-2/6', 'abc')
        : response('video/mp4', 'bytes 3-5/6', 'def');
    };
    downloads.video('https://test.invalid/video');
    await settle();
    return { body: await blobs[0]?.text(), requests, errors };
  });
  assert.equal(result.body, 'abcdef');
  assert.match(result.requests[0], /^bytes=0-\d+$/);
  assert.match(result.requests[1], /^bytes=3-\d+$/);
  assert.deepEqual(result.errors, []);
});

test('truncation, changing totals, overlapping ranges and ignored continuation ranges fail', async () => {
  for (const failure of ['truncated', 'changed-total', 'overlap', 'ignored-range', 'invalid-mime']) {
    page = await openPage(browser);
    const result = await page.evaluate(async failure => {
      let count = 0;
      fetch = async () => {
        count++;
        if (failure === 'truncated') return response('video/mp4', 'bytes 0-9/10', 'abc');
        if (failure === 'invalid-mime') return response('text/html', null, 'login', 200);
        if (count === 1) return response('video/mp4', 'bytes 0-2/6', 'abc');
        if (failure === 'ignored-range') return response('video/mp4', null, 'abcdef', 200);
        return response('video/mp4', failure === 'overlap' ? 'bytes 0-2/6' : 'bytes 3-5/9', 'def');
      };
      downloads.video('https://test.invalid/video');
      await settle();
      return { saved: saved.length, errors };
    }, failure);
    assert.equal(result.saved, 0, failure);
    assert.equal(result.errors.length, 1, failure);
    await page.close();
  }
});

test('filenames preserve dots and saved types follow the response MIME', async () => {
  for (const sample of [
    { kind: 'video', mime: 'video/mp4', name: 'holiday.2026.final.mp4', expected: 'holiday.2026.final.mp4' },
    { kind: 'video', mime: 'video/quicktime', name: 'movie.mp4', expected: 'movie.mov' },
    { kind: 'audio', mime: 'audio/mpeg', name: 'recording.ogg', expected: 'recording.mp3' },
    { kind: 'image', mime: 'image/png', name: 'photo.jpeg', expected: 'photo.png' },
    { kind: 'image', mime: 'image/tiff', name: 'scan.tiff', expected: 'scan.tiff' },
  ]) {
    page = await openPage(browser);
    const result = await page.evaluate(async sample => {
      fetch = async () => response(sample.mime, null, 'abc', 200);
      downloads[sample.kind]('https://test.invalid/stream/' + encodeURIComponent(JSON.stringify({ fileName: sample.name })));
      await settle();
      return { name: saved[0]?.name, mime: blobs[0]?.type, errors };
    }, sample);
    assert.deepEqual(result, { name: sample.expected, mime: sample.mime, errors: [] });
    await page.close();
  }
});

test('picker cancellation and writer creation failures do not start a request', async () => {
  for (const cancel of [false, true]) {
    page = await openPage(browser);
    const result = await page.evaluate(async cancel => {
      window.showSaveFilePicker = async () => {
        if (cancel) throw new DOMException('Cancelled', 'AbortError');
        return { createWritable: async () => { throw new Error('Permission denied'); } };
      };
      await downloads.video('https://test.invalid/video');
      return { requests: requests.length, saved: saved.length, errors };
    }, cancel);
    assert.equal(result.requests, 0);
    assert.equal(result.saved, 0);
    assert.equal(result.errors.length, cancel ? 0 : 1);
    await page.close();
  }
});

test('downloads work when the script manager does not expose unsafeWindow', async () => {
  page = await openPage(browser);
  const result = await page.evaluate(async () => {
    delete window.unsafeWindow;
    await downloads.video('https://test.invalid/video');
    return { saved: saved.length, errors };
  });
  assert.deepEqual(result, { saved: 1, errors: [] });
});

test('data is written and progress advances before the response finishes', async () => {
  page = await openPage(browser);
  const result = await page.evaluate(async () => {
    let stream;
    const writes = [];
    let closed = false;
    window.showSaveFilePicker = async () => ({ createWritable: async () => ({
      write: async bytes => { writes.push(...bytes); },
      close: async () => { closed = true; }, abort: async () => {},
    }) });
    fetch = async () => new Response(new ReadableStream({ start(controller) { stream = controller; } }), {
      status: 206, headers: { 'Content-Type': 'video/mp4', 'Content-Range': 'bytes 0-5/6' },
    });
    const done = downloads.video('https://test.invalid/video');
    await settle();
    stream.enqueue(new Uint8Array([1, 2, 3]));
    await settle();
    const partial = { written: writes.length, progress: document.querySelector('.progress p').textContent, closed };
    stream.enqueue(new Uint8Array([4, 5, 6]));
    stream.close();
    await done;
    return { partial, written: writes, closed, errors };
  });
  assert.deepEqual(result.partial, { written: 3, progress: '50%', closed: false });
  assert.deepEqual(result.written, [1, 2, 3, 4, 5, 6]);
  assert.equal(result.closed, true);
  assert.deepEqual(result.errors, []);
});

test('stalled response bodies time out instead of remaining pending', async () => {
  page = await openPage(browser);
  const result = await page.evaluate(async () => {
    const originalTimeout = window.setTimeout;
    window.setTimeout = (fn, delay, ...args) => originalTimeout(fn, delay === 30000 ? 10 : delay, ...args);
    fetch = async () => new Response(new ReadableStream({ start() {} }), { headers: { 'Content-Type': 'video/mp4' } });
    await downloads.video('https://test.invalid/video');
    return { saved: saved.length, errors };
  });
  assert.equal(result.saved, 0);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /30 seconds/);
});
