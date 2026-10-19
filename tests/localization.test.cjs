const { test, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { launch, openPage, installScript, media } = require('./helpers.cjs');
let browser;
let page;
before(async () => { browser = await launch(); });
after(async () => { await browser?.close(); });
afterEach(async () => { await page?.close(); });
const panel = '#tel-downloader-progress-bar-container';
const languageSelect = '#tel-download-language';
const image = '<img class="thumbnail" src="https://test.invalid/photo.jpg">';
const chooseLanguage = async value => {
  if (!await page.locator(languageSelect).isVisible()) await page.locator('.tel-settings-toggle').click();
  await page.selectOption(languageSelect, value);
};

test('language settings stay out of the task layout and support keyboard and outside dismissal', async () => {
  page = await openPage(browser);
  await page.evaluate(async () => {
    window.escaped = 0;
    document.addEventListener('keydown', event => { if (event.key === 'Escape') escaped++; });
    await downloads.image('https://test.invalid/photo.jpg');
  });
  const toggle = page.getByRole('button', { name: 'Settings', exact: true });
  assert.equal(await page.locator(languageSelect).isVisible(), false);
  assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
  const gap = await page.evaluate(() => document.querySelector('.tel-task').getBoundingClientRect().top
    - document.querySelector('.tel-panel-heading').getBoundingClientRect().bottom);
  assert.equal(gap, 0);
  await toggle.focus();
  await page.keyboard.press('Enter');
  assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
  assert.equal(await page.locator(languageSelect).evaluate(node => node === document.activeElement), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator(languageSelect).isVisible(), false);
  assert.equal(await toggle.evaluate(node => node === document.activeElement), true);
  assert.equal(await page.evaluate(() => escaped), 0);
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => escaped), 1);
  await page.keyboard.press('Space');
  await chooseLanguage('zh-CN');
  assert.equal(await page.locator('.tel-settings-toggle').getAttribute('aria-label'), '设置');
  assert.equal(await page.locator('.tel-settings-toggle').getAttribute('title'), '设置');
  await page.locator('.tel-panel-title').click();
  assert.equal(await page.locator(languageSelect).isVisible(), false);
  assert.equal(await page.locator('.tel-settings-toggle').getAttribute('aria-expanded'), 'false');
  assert.equal(await page.locator('.progress p').textContent(), '已交给浏览器');
  assert.deepEqual(await page.evaluate(() => ({ requests: requests.length, saved: saved.length, errors })), {
    requests: 1, saved: 1, errors: [],
  });
});

test('collapsing or dismissing the panel closes settings without resetting the language', async () => {
  page = await openPage(browser);
  await page.evaluate(() => downloads.image('https://test.invalid/photo.jpg'));
  await chooseLanguage('ru');
  await page.locator('.tel-panel-toggle').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('.tel-task-list').isVisible(), false);
  assert.equal(await page.locator(languageSelect).isVisible(), false);
  await page.locator('.tel-settings-toggle').click();
  assert.equal(await page.locator('.tel-task-list').isVisible(), false);
  assert.equal(await page.locator(languageSelect).inputValue(), 'ru');
  await page.locator('.tel-panel-toggle').click();
  assert.equal(await page.locator('.tel-task-list').isVisible(), true);
  await page.locator('.tel-settings-toggle').click();
  await page.locator('[data-action="dismiss"]').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator(panel).isVisible(), false);
  await page.evaluate(() => downloads.image('https://test.invalid/next.jpg'));
  assert.equal(await page.locator(languageSelect).isVisible(), false);
  assert.equal(await page.locator('.tel-settings-toggle').getAttribute('aria-expanded'), 'false');
  assert.equal(await page.locator(languageSelect).inputValue(), 'ru');
});

test('translation catalogs have every message and preserve interpolation parameters', async () => {
  page = await openPage(browser);
  const { messages, languages } = await page.evaluate(() => downloadI18n);
  const keys = Object.keys(messages.en).sort();
  const placeholders = text => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
  assert.deepEqual(Object.keys(messages).sort(), Object.keys(languages).sort());
  for (const [locale, catalog] of Object.entries(messages)) {
    assert.deepEqual(Object.keys(catalog).sort(), keys, locale);
    for (const key of keys) {
      assert.ok(typeof catalog[key] === 'string' && catalog[key].trim(), `${locale}.${key}`);
      assert.deepEqual(placeholders(catalog[key]), placeholders(messages.en[key]), `${locale}.${key}`);
    }
  }
  assert.equal(await page.evaluate(() => {
    delete downloadI18n.messages.ru.downloadsCount;
    return downloadI18n.translate('ru', 'downloadsCount', { count: 3 });
  }), 'Downloads (3)');
});

test('browser language detection handles regions, Chinese scripts, and English fallback', async () => {
  for (const [locale, expected, label] of [
    ['en-GB', 'en', 'Download'], ['ru-RU', 'ru', 'Скачать'], ['my-MM', 'my', 'ဒေါင်းလုဒ်လုပ်ရန်'],
    ['zh-CN', 'zh-CN', '下载'], ['zh-SG', 'zh-CN', '下载'],
    ['zh-TW', 'zh-TW', '下載'], ['zh-HK', 'zh-TW', '下載'], ['zh-MO', 'zh-TW', '下載'],
    ['zh-Hant-CN', 'zh-TW', '下載'], ['zh-Hans-HK', 'zh-CN', '下载'], ['fr-FR', 'en', 'Download'],
  ]) {
    page = await openPage(browser, media(image), '/k/', { locale });
    assert.equal(await page.locator(panel).getAttribute('lang'), expected, locale);
    assert.equal(await page.locator('.tel-download').getAttribute('aria-label'), label, locale);
    assert.equal(await page.locator('.tel-download').getAttribute('title'), label, locale);
    await page.close();
  }
});

test('automatic mode tries the browser language preference list in order', async () => {
  page = await openPage(browser, '', '/k/', {
    beforeScript: () => Object.defineProperty(navigator, 'languages', { value: ['fr-FR', 'ru-RU', 'en-US'] }),
  });
  assert.equal(await page.locator(panel).getAttribute('lang'), 'ru');
});

test('switching language during a download updates controls without restarting or expanding it', async () => {
  page = await openPage(browser, media(image));
  await page.evaluate(async () => {
    fetch = url => {
      requests.push(url);
      return Promise.resolve(new Response(new ReadableStream({ start(controller) { window.stream = controller; } }), {
        headers: { 'Content-Type': 'video/mp4', 'Content-Length': '4096' },
      }));
    };
    window.done = downloads.video('https://test.invalid/movie.mp4');
    await settle();
    stream.enqueue(new Uint8Array(1024));
  });
  await page.locator('.tel-panel-toggle').click();
  await chooseLanguage('ru');
  assert.equal(await page.locator('.tel-panel-title').textContent(), 'Загрузки (1)');
  assert.equal(await page.locator('.tel-panel-toggle').textContent(), 'Развернуть');
  assert.equal(await page.locator('.tel-task-list').evaluate(node => node.hidden), true);
  assert.equal(await page.locator('.tel-task-state').textContent(), 'Загрузка');
  assert.equal(await page.locator('.progress').getAttribute('aria-label'), 'Ход загрузки');
  assert.equal(await page.locator('.progress').getAttribute('aria-valuenow'), '25');
  assert.equal(await page.locator('[data-action="cancel"]').textContent(), 'Отменить');
  assert.equal(await page.locator('[data-action="dismiss"]').getAttribute('aria-label'), 'Убрать карточку загрузки');
  assert.match(await page.locator('.tel-task-details').textContent(), /1,0 KB \/ 4,0 KB.*\/с/);
  assert.equal(await page.locator('.tel-download').getAttribute('aria-label'), 'Скачать');
  await page.evaluate(async () => { stream.enqueue(new Uint8Array(3072)); stream.close(); await done; });
  assert.equal(await page.locator('.progress p').textContent(), 'Передано браузеру');
  assert.deepEqual(await page.evaluate(() => ({ requests: requests.length, saved: saved.length, errors })), {
    requests: 1, saved: 1, errors: [],
  });
});

test('manual preference survives reload and browser changes; automatic mode can be restored', async () => {
  page = await openPage(browser, media(image), '/a/', { locale: 'zh-TW' });
  await page.evaluate(() => downloads.image('https://test.invalid/photo.jpg'));
  await chooseLanguage('ru');
  await page.reload();
  await installScript(page);
  assert.equal(await page.locator(panel).getAttribute('lang'), 'ru');
  assert.equal(await page.locator(languageSelect).inputValue(), 'ru');
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'languages', { configurable: true, value: ['zh-CN'] });
    window.dispatchEvent(new Event('languagechange'));
  });
  assert.equal(await page.locator(panel).getAttribute('lang'), 'ru');
  // No tasks remain after reload, so change the hidden setting programmatically.
  await page.locator(languageSelect).evaluate(select => { select.value = 'auto'; select.dispatchEvent(new Event('change')); });
  assert.equal(await page.locator(panel).getAttribute('lang'), 'zh-CN');
  assert.equal(await page.evaluate(() => localStorage.getItem('tel-media-downloader-language')), null);
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'languages', { value: ['zh-HK'] });
    window.dispatchEvent(new Event('languagechange'));
  });
  assert.equal(await page.locator(panel).getAttribute('lang'), 'zh-TW');
});

test('invalid or unavailable storage does not prevent downloading or in-session language changes', async () => {
  for (const blocked of [false, true]) {
    page = await openPage(browser, '', '/k/', { locale: 'zh-CN', beforeScript: blocked
      ? () => Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Blocked', 'SecurityError'); } })
      : () => localStorage.setItem('tel-media-downloader-language', 'constructor'),
    });
    assert.equal(await page.locator(panel).getAttribute('lang'), 'zh-CN');
    await page.evaluate(() => downloads.image('https://test.invalid/photo.jpg'));
    await chooseLanguage('en');
    assert.equal(await page.locator('.progress p').textContent(), 'Sent to browser');
    assert.deepEqual(await page.evaluate(() => ({ saved: saved.length, errors })), { saved: 1, errors: [] });
    await page.close();
  }
});

test('language preferences synchronize across tabs on the same origin', async () => {
  const context = await browser.newContext({ locale: 'en-US' });
  try {
    page = await openPage(browser, media(image), '/k/', { context });
    await page.evaluate(() => downloads.image('https://test.invalid/photo.jpg'));
    const other = await context.newPage();
    await other.route('**/*', route => route.fulfill({ contentType: 'text/html', body: '' }));
    await other.goto('https://web.telegram.org/a/');
    await other.evaluate(() => localStorage.setItem('tel-media-downloader-language', 'zh-TW'));
    await page.waitForFunction(() => document.querySelector('#tel-downloader-progress-bar-container').lang === 'zh-TW');
    assert.equal(await page.locator(languageSelect).inputValue(), 'zh-TW');
    assert.equal(await page.locator('.progress p').textContent(), '已交給瀏覽器');
    await other.evaluate(() => localStorage.removeItem('tel-media-downloader-language'));
    await page.waitForFunction(() => document.querySelector('#tel-downloader-progress-bar-container').lang === 'en');
    assert.equal(await page.locator(languageSelect).inputValue(), 'auto');
    assert.equal(await page.evaluate(() => saved.length), 1);
  } finally {
    await context.close();
  }
});

test('existing errors translate on demand and retry still downloads successfully', async () => {
  page = await openPage(browser, '', '/k/', { locale: 'zh-CN' });
  await page.evaluate(async () => {
    fetch = async () => response('video/mp4', null, 'error', 500);
    await downloads.video('https://test.invalid/video');
  });
  assert.equal(await page.locator('.tel-task-error').textContent(), '下载请求失败（HTTP 500）');
  await chooseLanguage('zh-TW');
  assert.equal(await page.locator('.tel-task-error').textContent(), '下載請求失敗（HTTP 500）');
  assert.equal(await page.locator('.progress p').textContent(), '失敗');
  await page.evaluate(() => { fetch = async () => response('video/mp4', 'bytes 0-2/3'); });
  await page.getByRole('button', { name: '重試', exact: true }).click();
  await page.waitForSelector('[data-state="handedOff"]');
  assert.equal(await page.locator('.progress p').textContent(), '已交給瀏覽器');
  assert.equal(await page.evaluate(() => saved.length), 1);
});

test('localized validation and browser errors preserve useful diagnostics as text', async () => {
  page = await openPage(browser, '', '/k/', { locale: 'zh-CN' });
  await page.evaluate(async () => {
    fetch = async () => new Response('not a video');
    await downloads.video('https://test.invalid/wrong-type');
  });
  assert.equal(await page.locator('.tel-task-error').textContent(), '预期为视频，实际收到 text/plain');
  await page.evaluate(async () => {
    fetch = async () => { throw new Error('<img src=x onerror=alert(1)>'); };
    await downloads.video('https://test.invalid/network-error');
  });
  assert.equal(await page.locator('.tel-task-error').first().textContent(), '下载失败：<img src=x onerror=alert(1)>');
  assert.equal(await page.locator(`${panel} img`).count(), 0);
});

test('WebA and WebK stories and pinned controls use the chosen language as they mount', async () => {
  for (const pathname of ['/a/', '/k/']) {
    page = await openPage(browser, '', pathname, { locale: 'zh-TW' });
    await page.evaluate(path => {
      document.body.insertAdjacentHTML('beforeend', path === '/a/'
        ? '<div id="StoryViewer"><div class="GrsJNw3y"></div></div>'
        : '<div id="stories-viewer"><div class="_ViewerStoryHeaderRight_test"></div><div class="_ViewerStoryFooterRight_test"></div></div><div class="pinned-audio"><div class="pinned-container-wrapper-utils"></div></div>');
      refresh();
    }, pathname);
    const buttons = await page.locator('button.tel-download').evaluateAll(nodes => nodes.map(node => ({ title: node.title, label: node.getAttribute('aria-label') })));
    assert.equal(buttons.length, pathname === '/a/' ? 1 : 2);
    assert.ok(buttons.every(button => button.title === '下載' && button.label === '下載'));
    if (pathname === '/k/') {
      assert.equal(await page.locator('._tel_download_button_pinned_container').getAttribute('aria-label'), '媒體正在載入');
    }
    assert.deepEqual(await page.evaluate(() => errors), []);
    await page.close();
  }
});

test('all language choices fit a narrow screen and keep controls reachable in dark mode', async () => {
  page = await openPage(browser);
  await page.setViewportSize({ width: 320, height: 568 });
  await page.evaluate(async () => {
    document.documentElement.classList.add('night');
    document.documentElement.dir = 'rtl';
    fetch = async () => response('video/mp4', null, 'error', 500);
    await downloads.video('https://test.invalid/video');
  });
  for (const locale of ['en', 'zh-CN', 'zh-TW', 'ru', 'my']) {
    await chooseLanguage(locale);
    const layout = await page.locator(panel).evaluate(node => {
      const rect = node.getBoundingClientRect();
      return {
        left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
        fits: node.scrollWidth <= node.clientWidth,
        childrenFit: Array.from(node.querySelectorAll('.tel-task-list, .tel-task, .progress p')).every(child => child.scrollWidth <= child.clientWidth),
        direction: getComputedStyle(node).direction,
      };
    });
    assert.ok(layout.left >= 0 && layout.right <= 320 && layout.top >= 0 && layout.bottom <= 568, locale);
    assert.ok(layout.fits && layout.childrenFit, locale);
    assert.equal(layout.direction, 'ltr');
    assert.ok(await page.getByRole('button', { name: await page.locator('[data-action="retry"]').textContent(), exact: true }).isVisible());
  }
});
