// ==UserScript==
// @name         Telegram Media Downloader
// @name:en      Telegram Media Downloader
// @name:zh-CN   Telegram 受限图片视频下载器
// @name:zh-TW   Telegram 受限圖片影片下載器
// @name:ru      Telegram: загрузчик медиафайлов
// @version      2.0
// @namespace    https://github.com/Neet-Nestor/Telegram-Media-Downloader
// @description  Download images, GIFs, videos, and voice messages on the Telegram webapp from private channels that disable downloading and restrict saving content
// @description:en  Download images, GIFs, videos, and voice messages on the Telegram webapp from private channels that disable downloading and restrict saving content
// @description:ru Загружайте изображения, GIF-файлы, видео и голосовые сообщения в веб-приложении Telegram из частных каналов, которые отключили загрузку и ограничили сохранение контента
// @description:zh-CN 从禁止下载的Telegram频道中下载图片、视频及语音消息
// @description:zh-TW 從禁止下載的 Telegram 頻道中下載圖片、影片及語音訊息
// @author       Nestor Qin
// @license      GNU GPLv3
// @website      https://github.com/Neet-Nestor/Telegram-Media-Downloader
// @match        https://web.telegram.org/*
// @match        https://webk.telegram.org/*
// @match        https://webz.telegram.org/*
// @icon         https://img.icons8.com/color/452/telegram-app--v5.png
// ==/UserScript==


(function () {
  // Keep translations in the userscript so installation needs no extra files.
  const UI_LANGUAGES = {
    en: "English", "zh-CN": "简体中文", "zh-TW": "繁體中文", ru: "Русский", my: "မြန်မာ",
  };
  const UI_MESSAGES = {
    en: {
      downloads: "Downloads", downloadsCount: "Downloads ({count})", mediaDownloads: "Media downloads",
      download: "Download", loadingMedia: "Media is loading", hide: "Hide", show: "Show",
      dismiss: "Dismiss download", progress: "Download progress", cancel: "Cancel", retry: "Retry",
      settings: "Settings", language: "Interface language", automatic: "Browser language",
      preparing: "Preparing", queued: "Queued", downloading: "Downloading", saving: "Saving",
      completed: "Completed", handedOff: "Sent to browser", failed: "Failed", cancelled: "Cancelled",
      rate: "{speed}/s", video: "video", audio: "audio", image: "image", unknownType: "an unknown file type",
      errorHttp: "Download request failed (HTTP {status})",
      errorMime: "Expected {kind}, received {mime}",
      errorRangeMissing: "Missing or invalid Content-Range",
      errorRangeInconsistent: "Inconsistent media range; download stopped to avoid a corrupt file",
      errorRangeUnsupported: "Server stopped supporting partial downloads",
      errorLength: "Invalid Content-Length", errorEmpty: "Empty media response",
      errorTooLarge: "Media response exceeds the expected size",
      errorIncomplete: "Incomplete media response; received byte count does not match",
      errorTimeout: "No data received for 30 seconds. Please retry.",
      errorUnexpected: "Download failed: {message}",
      errorNativeUnavailable: "Telegram's download interface is unavailable. Reopen the media and try again.",
      nativeCancelUnavailable: "This Telegram download cannot be cancelled from this panel",
    },
    "zh-CN": {
      downloads: "下载", downloadsCount: "下载（{count}）", mediaDownloads: "媒体下载",
      download: "下载", loadingMedia: "媒体正在加载", hide: "收起", show: "展开",
      dismiss: "移除下载卡片", progress: "下载进度", cancel: "取消", retry: "重试",
      settings: "设置", language: "界面语言", automatic: "跟随浏览器",
      preparing: "准备中", queued: "排队中", downloading: "下载中", saving: "保存中",
      completed: "已完成", handedOff: "已交给浏览器", failed: "失败", cancelled: "已取消",
      rate: "{speed}/秒", video: "视频", audio: "音频", image: "图片", unknownType: "未知文件类型",
      errorHttp: "下载请求失败（HTTP {status}）",
      errorMime: "预期为{kind}，实际收到 {mime}",
      errorRangeMissing: "缺少 Content-Range，或其格式无效",
      errorRangeInconsistent: "媒体数据范围不一致；已停止下载，避免保存损坏的文件",
      errorRangeUnsupported: "服务器不再支持分段下载",
      errorLength: "Content-Length 无效", errorEmpty: "媒体响应为空",
      errorTooLarge: "收到的媒体数据超出预期大小",
      errorIncomplete: "媒体数据不完整；收到的字节数与预期不符",
      errorTimeout: "已连续 30 秒未收到数据，请重试。",
      errorUnexpected: "下载失败：{message}",
      errorNativeUnavailable: "Telegram 下载接口不可用，请重新打开媒体后重试。",
      nativeCancelUnavailable: "此 Telegram 下载无法从本面板取消",
    },
    "zh-TW": {
      downloads: "下載", downloadsCount: "下載（{count}）", mediaDownloads: "媒體下載",
      download: "下載", loadingMedia: "媒體正在載入", hide: "收合", show: "展開",
      dismiss: "移除下載卡片", progress: "下載進度", cancel: "取消", retry: "重試",
      settings: "設定", language: "介面語言", automatic: "跟隨瀏覽器",
      preparing: "準備中", queued: "排隊中", downloading: "下載中", saving: "儲存中",
      completed: "已完成", handedOff: "已交給瀏覽器", failed: "失敗", cancelled: "已取消",
      rate: "{speed}/秒", video: "影片", audio: "音訊", image: "圖片", unknownType: "未知檔案類型",
      errorHttp: "下載請求失敗（HTTP {status}）",
      errorMime: "預期為{kind}，實際收到 {mime}",
      errorRangeMissing: "缺少 Content-Range，或其格式無效",
      errorRangeInconsistent: "媒體資料範圍不一致；已停止下載，避免儲存損壞的檔案",
      errorRangeUnsupported: "伺服器不再支援分段下載",
      errorLength: "Content-Length 無效", errorEmpty: "媒體回應為空",
      errorTooLarge: "收到的媒體資料超出預期大小",
      errorIncomplete: "媒體資料不完整；收到的位元組數與預期不符",
      errorTimeout: "已連續 30 秒未收到資料，請重試。",
      errorUnexpected: "下載失敗：{message}",
      errorNativeUnavailable: "Telegram 下載介面無法使用，請重新開啟媒體後重試。",
      nativeCancelUnavailable: "此 Telegram 下載無法從本面板取消",
    },
    ru: {
      downloads: "Загрузки", downloadsCount: "Загрузки ({count})", mediaDownloads: "Загрузка медиа",
      download: "Скачать", loadingMedia: "Медиа загружается", hide: "Свернуть", show: "Развернуть",
      dismiss: "Убрать карточку загрузки", progress: "Ход загрузки", cancel: "Отменить", retry: "Повторить",
      settings: "Настройки", language: "Язык интерфейса", automatic: "Язык браузера",
      preparing: "Подготовка", queued: "В очереди", downloading: "Загрузка", saving: "Сохранение",
      completed: "Завершено", handedOff: "Передано браузеру", failed: "Ошибка", cancelled: "Отменено",
      rate: "{speed}/с", video: "видео", audio: "аудио", image: "изображение", unknownType: "неизвестный тип файла",
      errorHttp: "Ошибка запроса загрузки (HTTP {status})",
      errorMime: "Ожидалось: {kind}. Получено: {mime}",
      errorRangeMissing: "Заголовок Content-Range отсутствует или некорректен",
      errorRangeInconsistent: "Диапазоны данных не совпадают; загрузка остановлена во избежание повреждения файла",
      errorRangeUnsupported: "Сервер больше не поддерживает загрузку по частям",
      errorLength: "Некорректный Content-Length", errorEmpty: "Получен пустой ответ с медиа",
      errorTooLarge: "Размер полученных данных превышает ожидаемый",
      errorIncomplete: "Данные неполные; число полученных байтов не совпадает с ожидаемым",
      errorTimeout: "Нет данных в течение 30 секунд. Повторите попытку.",
      errorUnexpected: "Не удалось скачать: {message}",
      errorNativeUnavailable: "Интерфейс загрузки Telegram недоступен. Откройте медиа заново и повторите попытку.",
      nativeCancelUnavailable: "Эту загрузку Telegram нельзя отменить из этой панели",
    },
    my: {
      downloads: "ဒေါင်းလုဒ်များ", downloadsCount: "ဒေါင်းလုဒ်များ ({count})", mediaDownloads: "မီဒီယာဒေါင်းလုဒ်များ",
      download: "ဒေါင်းလုဒ်လုပ်ရန်", loadingMedia: "မီဒီယာကို ဖွင့်နေသည်", hide: "ဖျောက်ရန်", show: "ပြရန်",
      dismiss: "ဒေါင်းလုဒ်ကတ်ကို ဖယ်ရှားရန်", progress: "ဒေါင်းလုဒ်တိုးတက်မှု", cancel: "ပယ်ဖျက်ရန်", retry: "ထပ်စမ်းရန်",
      settings: "ဆက်တင်များ", language: "မျက်နှာပြင်ဘာသာစကား", automatic: "ဘရောက်ဇာဘာသာစကား",
      preparing: "ပြင်ဆင်နေသည်", queued: "စောင့်ဆိုင်းနေသည်", downloading: "ဒေါင်းလုဒ်လုပ်နေသည်", saving: "သိမ်းဆည်းနေသည်",
      completed: "ပြီးစီးပြီ", handedOff: "ဘရောက်ဇာသို့ လွှဲပေးပြီး", failed: "မအောင်မြင်ပါ", cancelled: "ပယ်ဖျက်ပြီး",
      rate: "{speed}/စက္ကန့်", video: "ဗီဒီယို", audio: "အသံ", image: "ပုံ", unknownType: "အမည်မသိ ဖိုင်အမျိုးအစား",
      errorHttp: "ဒေါင်းလုဒ်တောင်းဆိုမှု မအောင်မြင်ပါ (HTTP {status})",
      errorMime: "မျှော်လင့်ထားသည်မှာ {kind}၊ ရရှိသည်မှာ {mime}",
      errorRangeMissing: "Content-Range မရှိပါ သို့မဟုတ် မမှန်ကန်ပါ",
      errorRangeInconsistent: "မီဒီယာဒေတာအပိုင်းများ မကိုက်ညီပါ။ ဖိုင်မပျက်စီးစေရန် ဒေါင်းလုဒ်ကို ရပ်လိုက်သည်",
      errorRangeUnsupported: "ဆာဗာသည် အပိုင်းလိုက်ဒေါင်းလုဒ်ကို မပံ့ပိုးတော့ပါ",
      errorLength: "Content-Length မမှန်ကန်ပါ", errorEmpty: "မီဒီယာတုံ့ပြန်မှုတွင် ဒေတာမပါပါ",
      errorTooLarge: "ရရှိသော မီဒီယာဒေတာသည် မျှော်လင့်ထားသည့် ပမာဏထက် ကျော်လွန်နေသည်",
      errorIncomplete: "မီဒီယာဒေတာ မပြည့်စုံပါ။ ရရှိသော ဘိုက်အရေအတွက် မကိုက်ညီပါ",
      errorTimeout: "စက္ကန့် ၃၀ ကြာ ဒေတာမရရှိပါ။ ထပ်စမ်းပါ။",
      errorUnexpected: "ဒေါင်းလုဒ် မအောင်မြင်ပါ: {message}",
      errorNativeUnavailable: "Telegram ဒေါင်းလုဒ်စနစ် မရရှိနိုင်ပါ။ မီဒီယာကို ပြန်ဖွင့်ပြီး ထပ်စမ်းပါ။",
      nativeCancelUnavailable: "ဤ Telegram ဒေါင်းလုဒ်ကို ဤနေရာမှ ပယ်ဖျက်၍ မရပါ",
    },
  };
  const LANGUAGE_STORAGE_KEY = "tel-media-downloader-language";
  const matchLanguage = (tag) => {
    const parts = String(tag || "").toLowerCase().replace(/_/g, "-").split("-");
    if (parts[0] === "zh") {
      if (parts.includes("hant")) return "zh-TW";
      if (parts.includes("hans")) return "zh-CN";
      return parts.some(part => ["tw", "hk", "mo"].includes(part)) ? "zh-TW" : "zh-CN";
    }
    return Object.hasOwn(UI_LANGUAGES, parts[0]) ? parts[0] : null;
  };
  const readLanguagePreference = () => {
    try {
      const value = localStorage.getItem(LANGUAGE_STORAGE_KEY);
      return Object.hasOwn(UI_LANGUAGES, value) ? value : "auto";
    } catch {
      return "auto";
    }
  };
  let languagePreference = readLanguagePreference();
  const resolveLanguage = () => languagePreference !== "auto" ? languagePreference :
    (navigator.languages || [navigator.language]).map(matchLanguage).find(Boolean) || "en";
  let uiLanguage = resolveLanguage();
  const translate = (language, key, params = {}) =>
    (UI_MESSAGES[language]?.[key] ?? UI_MESSAGES.en[key] ?? key).replace(
      /\{(\w+)\}/g, (placeholder, name) => Object.hasOwn(params, name) ? String(params[name]) : placeholder
    );
  const t = (key, params) => translate(uiLanguage, key, params);
  let integerFormat = new Intl.NumberFormat(uiLanguage, { maximumFractionDigits: 0 });
  let decimalFormat = new Intl.NumberFormat(uiLanguage, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const downloadError = (key, params = {}, name = "Error") => {
    // Keep diagnostic messages stable; render the structured error in the current UI language.
    const diagnostic = { ...params };
    if (key === "errorMime") {
      diagnostic.kind = translate("en", params.kind);
      diagnostic.mime ||= translate("en", "unknownType");
    }
    return Object.assign(new Error(translate("en", key, diagnostic)), { name, translationKey: key, params });
  };
  const formatDownloadError = (error) => {
    if (!error) return "";
    if (!error.translationKey) return t("errorUnexpected", { message: error.message || String(error) });
    const params = { ...error.params };
    if (error.translationKey === "errorMime") {
      params.kind = t(params.kind);
      params.mime ||= t("unknownType");
    }
    return t(error.translationKey, params);
  };
  const localizeDownloadButton = (button, loading = false) => {
    const label = t(loading ? "loadingMedia" : "download");
    if (button.title !== label) button.title = label;
    if (button.getAttribute("aria-label") !== label) button.setAttribute("aria-label", label);
    if (button.lang !== uiLanguage) button.lang = uiLanguage;
  };
  const logger = {
    info: (message, fileName = null) => {
      console.log(
        `[Tel Download] ${fileName ? `${fileName}: ` : ""}${message}`
      );
    },
    error: (message, fileName = null) => {
      console.error(
        `[Tel Download] ${fileName ? `${fileName}: ` : ""}${message}`
      );
    },
  };
  // WebK's icon font code points change between releases. Only learn the
  // download glyph from native buttons in this page, never from our own buttons.
  const WEB_K_DOWNLOAD_BUTTON_SELECTOR = [
    "button.quality-download-options-button-menu",
    "button.tgico-download",
    'button[aria-label="Download"]',
    'button[title="Download"]',
  ].join(", ");
  const getWebKDownloadButtons = (container) =>
    Array.from(container.querySelectorAll(WEB_K_DOWNLOAD_BUTTON_SELECTOR)).filter(
      (button) =>
        !button.matches(".tel-download, ._tel_download_button_pinned_container")
    );
  const isUsableDownloadButton = (button) => {
    if (button.disabled || button.getAttribute("aria-disabled") === "true" ||
        button.hidden || button.classList.contains("hide") || button.closest("[inert]")) {
      return false;
    }
    const style = getComputedStyle(button);
    return style.visibility !== "hidden" && style.visibility !== "collapse" &&
      button.getClientRects().length > 0;
  };
  let webKDownloadGlyph = "";
  const createWebKDownloadIcon = (buttonIcon = false) =>
    `<span class="tgico tel-download-icon${buttonIcon ? " button-icon" : ""}" aria-hidden="true">${
      webKDownloadGlyph ||
      '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle" aria-hidden="true" focusable="false"><path d="M12 3v12m-5-5 5 5 5-5M5 16v4h14v-4"/></svg>'
    }</span>`;
  const refreshWebKDownloadIcon = () => {
    for (const button of getWebKDownloadButtons(document)) {
      const glyph = button.querySelector(":scope > .tgico")?.textContent.trim();
      // Ignore labels or menu contents; the icon must be one private-use glyph.
      if (!glyph || !/^[\uE000-\uF8FF]$/.test(glyph)) continue;
      if (glyph !== webKDownloadGlyph) {
        // Keep this in memory only: a new page load may use a different font.
        webKDownloadGlyph = glyph;
        document.querySelectorAll(".tel-download-icon").forEach((icon) => {
          icon.textContent = glyph;
        });
      }
      return;
    }
  };
  const contentRangeRegex = /^bytes (\d+)-(\d+)\/(\d+)$/;
  const REFRESH_DELAY = 2000;
  const DOWNLOAD_CHUNK_SIZE = 4 * 1024 * 1024;
  const fetchMediaPart = async (url, offset, total, kind, options = {}) => {
    const controller = new AbortController();
    const abort = () => controller.abort(options.signal.reason);
    let timer;
    let reader;
    const resetTimeout = () => {
      clearTimeout(timer);
      timer = setTimeout(() => controller.abort(
        downloadError("errorTimeout", {}, "TimeoutError")
      ), 30000);
    };
    const checkAborted = () => {
      if (controller.signal.aborted) throw controller.signal.reason;
    };
    if (options.signal?.aborted) abort();
    options.signal?.addEventListener("abort", abort, { once: true });
    resetTimeout();
    try {
      checkAborted();
      const res = await fetch(url, {
        headers: { Range: `bytes=${offset}-${offset + DOWNLOAD_CHUNK_SIZE - 1}` },
        signal: controller.signal,
      });
      if (res.status !== 200 && res.status !== 206) {
        throw downloadError("errorHttp", { status: res.status });
      }
      const mime = res.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase();
      if (!mime?.startsWith(`${kind}/`)) {
        throw downloadError("errorMime", { kind, mime });
      }
      let expectedSize;
      let totalSize;
      if (res.status === 206) {
        const match = res.headers.get("Content-Range")?.match(contentRangeRegex);
        if (!match) throw downloadError("errorRangeMissing");
        const [start, end, size] = match.slice(1).map(Number);
        if (![start, end, size].every(Number.isSafeInteger) ||
            start !== offset || end < start || size <= end ||
            (total !== null && total !== size)) {
          throw downloadError("errorRangeInconsistent");
        }
        expectedSize = end - start + 1;
        totalSize = size;
      } else {
        if (offset !== 0) throw downloadError("errorRangeUnsupported");
        const length = res.headers.get("Content-Length");
        if (length !== null && !res.headers.has("Content-Encoding")) {
          if (!/^\d+$/.test(length) || !Number.isSafeInteger(Number(length))) {
            throw downloadError("errorLength");
          }
          expectedSize = Number(length);
          totalSize = expectedSize;
        }
      }
      if (!res.body) throw downloadError("errorEmpty");
      reader = res.body.getReader();
      controller.signal.addEventListener("abort", () => {
        reader.cancel().catch(() => {});
      }, { once: true });
      const chunks = [];
      let received = 0;
      options.onProgress?.(offset, totalSize ?? null);
      while (true) {
        checkAborted();
        const { value, done } = await reader.read();
        checkAborted();
        if (done) break;
        received += value.byteLength;
        if (expectedSize !== undefined && received > expectedSize) {
          throw downloadError("errorTooLarge");
        }
        // Wait for disk writes before reading more data, so slow disks do not
        // cause an unbounded queue of writes or large in-memory responses.
        clearTimeout(timer);
        if (options.write) await options.write(value);
        else chunks.push(value);
        checkAborted();
        resetTimeout();
        options.onProgress?.(offset + received, totalSize ?? null);
      }
      if (!received || (expectedSize !== undefined && received !== expectedSize)) {
        throw downloadError("errorIncomplete");
      }
      return {
        blob: options.write ? null : new Blob(chunks, { type: mime }),
        mime, totalSize: totalSize ?? received, nextOffset: offset + received,
      };
    } catch (error) {
      controller.abort(error);
      throw controller.signal.reason || error;
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
      if (reader) {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
    }
  };
  const hashCode = (s) => {
    var h = 0,
      l = s.length,
      i = 0;
    if (l > 0) {
      while (i < l) {
        h = ((h << 5) - h + s.charCodeAt(i++)) | 0;
      }
    }
    return h >>> 0;
  };

  const getMediaMetadata = (url) => {
    try {
      return JSON.parse(decodeURIComponent(url.split("/").pop()));
    } catch {
      return {};
    }
  };
  const getDownloadFileName = (url, mime, kind, suggestedName) => {
    const extensions = {
      "video/mp4": ["mp4", "m4v"], "video/webm": ["webm"],
      "video/quicktime": ["mov"], "video/x-matroska": ["mkv"],
      "audio/ogg": ["ogg", "oga", "opus"], "audio/mpeg": ["mp3"],
      "audio/mp4": ["m4a"], "audio/webm": ["webm"], "audio/aac": ["aac"],
      "audio/wav": ["wav"], "audio/x-wav": ["wav"],
      "image/jpeg": ["jpg", "jpeg"], "image/png": ["png"],
      "image/webp": ["webp"], "image/gif": ["gif"], "image/avif": ["avif"],
      "image/heic": ["heic"], "image/bmp": ["bmp"], "image/svg+xml": ["svg"],
    };
    const metadata = getMediaMetadata(url);
    let name = typeof suggestedName === "string" ? suggestedName :
      typeof metadata?.fileName === "string" ? metadata.fileName : "";
    if (!name) {
      try {
        const basename = decodeURIComponent(new URL(url, location.href).pathname.split("/").pop());
        if (/\.[a-z0-9]{2,5}$/i.test(basename)) name = basename;
      } catch {
        // Some blob URLs do not carry a filename.
      }
    }
    name = (name || hashCode(url).toString(36)).replace(/[\x00-\x1f\x7f<>:"/\\|?*]/g, "_");
    const allowed = extensions[mime?.toLowerCase()] || (mime ? null :
      (kind === "video" ? ["mp4"] : kind === "audio" ? ["ogg"] : ["jpg"]));
    const dot = name.lastIndexOf(".");
    if (!allowed) return dot > 0 ? name : name + ".bin";
    if (dot > 0 && allowed.includes(name.slice(dot + 1).toLowerCase())) return name;
    return (dot > 0 ? name.slice(0, dot) : name) + "." + allowed[0];
  };
  const saveMediaBlob = (blob, fileName) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    // Let the browser consume the URL before releasing it.
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  // WebK exposes these objects to the page. They are private APIs, so every
  // entry point checks capabilities and leaves the URL backend available.
  const getWebKPage = () => {
    if (location.hostname !== "webk.telegram.org" && !location.pathname.startsWith("/k/")) return null;
    return typeof unsafeWindow === "undefined" ? window : unsafeWindow;
  };
  const getWebKMessageMedia = (message) => message?.media?.document || message?.media?.photo;
  const getWebKMessage = (peerId, mid) => {
    if (!peerId || !Number.isSafeInteger(Number(mid)) || !Number(mid)) return null;
    const page = getWebKPage();
    for (const source of [page?.apiManagerProxy, page?.mtprotoMessagePort, page?.appImManager?.chat]) {
      if (typeof source?.getMessageByPeer !== "function") continue;
      try {
        const message = source.getMessageByPeer(peerId, Number(mid));
        // Do not make an asynchronous lookup here: URL fallback may need the
        // original click's user activation for the save-file picker.
        if (message?.then) { Promise.resolve(message).catch(() => {}); continue; }
        if (message && String(message.peerId) === String(peerId) && Number(message.mid ?? message.id) === Number(mid)) return message;
      } catch { /* An older/newer WebK may expose a different lookup API. */ }
    }
    return null;
  };
  const getWebKDownload = (media) => {
    const manager = getWebKPage()?.appDownloadManager;
    if (typeof manager?.downloadToDisc !== "function" || !media?.id) return null;
    const mime = media._ === "photo" ? "image/jpeg" :
      typeof media.mime_type === "string" ? media.mime_type.toLowerCase() : "";
    const kind = mime?.split("/")[0];
    if (!["photo", "document"].includes(media._) || !["image", "video", "audio"].includes(kind)) return null;
    const name = media.file_name || (Array.isArray(media.attributes) &&
      media.attributes.find(attribute => attribute._ === "documentAttributeFilename")?.file_name);
    return {
      manager, media, kind, key: `webk:${media._}:${media.id}`,
      fileName: getDownloadFileName(String(media.id), mime, kind, name || `${kind}_${media.id}`),
    };
  };
  const getWebKViewerDownload = (viewer) => {
    try {
      const nativeViewer = getWebKPage()?.appMediaViewer;
      if (nativeViewer?.wholeDiv && nativeViewer.wholeDiv !== viewer) return null;
      const target = nativeViewer?.target;
      // Indexed rich/paid media need a separate resolver; never guess which
      // item the user is viewing from the enclosing message alone.
      if (!target || (typeof target.index === "number" && target.index >= 0)) return null;
      const embedded = target.message;
      const matches = embedded && (!target.peerId || String(embedded.peerId) === String(target.peerId)) &&
        (!target.mid || Number(embedded.mid ?? embedded.id) === Number(target.mid));
      const message = matches ? embedded : getWebKMessage(target.peerId, target.mid);
      return getWebKDownload(target.media || getWebKMessageMedia(message));
    } catch { return null; }
  };

  const downloadTasks = new Map();
  const activeDownloads = new Map();
  const downloadQueue = [];
  const MAX_CONCURRENT_DOWNLOADS = 2;
  let runningDownloads = 0;
  let runningNativeDownloads = 0;

  const formatBytes = (bytes) => {
    const units = ["B", "KB", "MB", "GB", "TB"];
    const index = Math.min(Math.floor(Math.log(Math.max(bytes, 1)) / Math.log(1024)), units.length - 1);
    return `${(index ? decimalFormat : integerFormat).format(bytes / (1024 ** index))} ${units[index]}`;
  };
  const updateTaskPanel = () => {
    const panel = document.getElementById("tel-downloader-progress-bar-container");
    if (!panel) return;
    panel.hidden = !panel.querySelector(".tel-task");
    if (panel.hidden) setSettingsOpen(false);
    panel.querySelector(".tel-panel-title").textContent = activeDownloads.size
      ? t("downloadsCount", { count: integerFormat.format(activeDownloads.size) }) : t("downloads");
  };
  const dismissTask = (task) => {
    document.getElementById("tel-downloader-progress-" + task.id)?.remove();
    if (task.finished) downloadTasks.delete(task.id);
    updateTaskPanel();
  };
  const showTask = (task) => {
    const panel = document.getElementById("tel-downloader-progress-bar-container");
    const list = panel.querySelector(".tel-task-list");
    list.hidden = false;
    const toggle = panel.querySelector(".tel-panel-toggle");
    toggle.textContent = t("hide");
    toggle.setAttribute("aria-expanded", "true");
    let card = document.getElementById("tel-downloader-progress-" + task.id);
    if (!card) {
      card = document.createElement("div");
      card.id = "tel-downloader-progress-" + task.id;
      card.className = "tel-task";
      card.tabIndex = -1;
      card.innerHTML = `
        <div class="tel-task-heading"><p class="filename" dir="auto"></p><button type="button" data-action="dismiss">&times;</button></div>
        <span class="tel-task-state" role="status" aria-live="polite"></span>
        <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100"><div></div><p></p></div>
        <p class="tel-task-details"></p><p class="tel-task-error"></p>
        <div class="tel-task-actions"><button type="button" data-action="cancel"></button><button type="button" data-action="retry" hidden></button></div>`;
      card.querySelector('[data-action="dismiss"]').onclick = () => dismissTask(task);
      card.querySelector('[data-action="cancel"]').onclick = () => {
        if (task.finished || task.state === "saving" || task.nativeCancelUnavailable) return;
        task.controller.abort(new DOMException("Download cancelled", "AbortError"));
        if (!task.running) finishTask(task, "cancelled");
      };
      card.querySelector('[data-action="retry"]').onclick = () => {
        dismissTask(task);
        downloadMedia(task.url, task.kind, task.native);
      };
      list.prepend(card);
    }
    renderTask(task);
    return card;
  };
  const renderTask = (task) => {
    const card = document.getElementById("tel-downloader-progress-" + task.id);
    if (!card) return;
    const label = t(task.state);
    card.dataset.state = task.state;
    const title = card.querySelector(".filename");
    title.textContent = task.fileName;
    title.title = task.fileName;
    const state = card.querySelector(".tel-task-state");
    if (state.textContent !== label) state.textContent = label;
    const progress = card.querySelector(".progress");
    progress.setAttribute("aria-label", t("progress"));
    card.querySelector('[data-action="dismiss"]').setAttribute("aria-label", t("dismiss"));
    const percent = task.total ? Math.min(100, Math.floor(task.received * 100 / task.total)) : null;
    progress.classList.toggle("tel-indeterminate", task.state === "downloading" && percent === null);
    if (percent === null) progress.removeAttribute("aria-valuenow");
    else progress.setAttribute("aria-valuenow", percent);
    progress.setAttribute("aria-valuetext", label);
    progress.querySelector("div").style.width = (percent ?? 0) + "%";
    progress.querySelector("p").textContent = task.state === "downloading" && percent !== null ? `${integerFormat.format(percent)}%` : label;
    const speed = task.received / Math.max((performance.now() - task.startedAt) / 1000, 0.1);
    card.querySelector(".tel-task-details").textContent =
      formatBytes(task.received) + (task.total !== null ? ` / ${formatBytes(task.total)}` : "") +
      (task.state === "downloading" && task.received ? ` · ${t("rate", { speed: formatBytes(speed) })}` : "");
    const error = card.querySelector(".tel-task-error");
    error.textContent = formatDownloadError(task.error);
    error.hidden = !task.error;
    const cancel = card.querySelector('[data-action="cancel"]');
    cancel.textContent = t("cancel");
    cancel.hidden = task.finished;
    cancel.disabled = task.state === "saving" || !!task.nativeCancelUnavailable;
    cancel.title = task.nativeCancelUnavailable ? t("nativeCancelUnavailable") : "";
    const retry = card.querySelector('[data-action="retry"]');
    retry.textContent = t("retry");
    retry.hidden = !["failed", "cancelled"].includes(task.state);
    task.renderedAt = performance.now();
    task.renderedBytes = task.received;
    updateTaskPanel();
  };
  const finishTask = (task, state, error) => {
    if (task.finished) return;
    task.finished = true;
    clearTimeout(task.progressTimer);
    task.state = state;
    task.error = error;
    if (activeDownloads.get(task.key) === task) activeDownloads.delete(task.key);
    if (error) logger.error(error, task.fileName);
    renderTask(task);
    if (!document.getElementById("tel-downloader-progress-" + task.id)) downloadTasks.delete(task.id);
    updateTaskPanel();
    task.resolve({ state, fileName: task.fileName, received: task.received });
  };
  const updateTaskProgress = (task, received, total) => {
    if (task.finished || task.controller.signal.aborted) return;
    if (!Number.isFinite(received) || received < 0) return;
    task.received = received;
    task.total = Number.isFinite(total) && total > 0 ? total : null;
    if ((!task.renderedBytes && received) || performance.now() - task.renderedAt >= 100 || received === total) {
      renderTask(task);
    } else if (!task.progressTimer) {
      task.progressTimer = setTimeout(() => {
        task.progressTimer = null;
        renderTask(task);
      }, 100);
    }
  };
  const runNativeTask = async (task) => {
    const { manager, media } = task.native;
    if (typeof manager.downloadToDisc !== "function") throw downloadError("errorNativeUnavailable");
    const operation = manager.downloadToDisc({ media });
    if (typeof operation?.then !== "function") throw downloadError("errorNativeUnavailable");
    task.nativeCancelUnavailable = typeof operation.cancel !== "function";
    renderTask(task);
    const abort = () => {
      try { operation.cancel?.(); } catch (error) { logger.error(error, task.fileName); }
    };
    const progress = (details) => updateTaskProgress(task, details?.done, details?.total);
    task.controller.signal.addEventListener("abort", abort, { once: true });
    try {
      // Progress is optional; a changed notification API must not start a
      // second transfer or turn a working native download into a failure.
      try { operation.addNotifyListener?.(progress); } catch { /* Indeterminate progress. */ }
      await operation;
      if (task.controller.signal.aborted) throw task.controller.signal.reason;
      // Telegram owns the final browser/SW hand-off, not the actual disk save.
      finishTask(task, "handedOff");
    } finally {
      task.controller.signal.removeEventListener("abort", abort);
      const index = operation.listeners?.indexOf(progress);
      if (index >= 0) operation.listeners.splice(index, 1);
    }
  };
  const runTask = async (task) => {
    const parts = [];
    let writable;
    const checkCancelled = () => {
      if (task.controller.signal.aborted) throw task.controller.signal.reason;
    };
    try {
      checkCancelled();
      task.state = "preparing";
      renderTask(task);
      if (task.handle) writable = await task.handle.createWritable();
      checkCancelled();
      task.state = "downloading";
      task.startedAt = performance.now();
      renderTask(task);
      if (task.native) {
        await runNativeTask(task);
        return;
      }
      let offset = 0;
      let total = null;
      let mime;
      do {
        const part = await fetchMediaPart(task.url, offset, total, task.kind, {
          signal: task.controller.signal,
          write: writable ? (chunk) => writable.write(chunk) : undefined,
          onProgress: (received, size) => updateTaskProgress(task, received, size),
        });
        checkCancelled();
        if (!writable) parts.push(part.blob);
        offset = part.nextOffset;
        total = part.totalSize;
        mime = part.mime;
        task.fileName = getDownloadFileName(task.url, mime, task.kind);
        task.received = offset;
        task.total = total;
        renderTask(task);
      } while (offset < total);
      checkCancelled();
      task.state = "saving";
      renderTask(task);
      if (writable) await writable.close();
      else saveMediaBlob(new Blob(parts, { type: mime }), task.fileName);
      finishTask(task, writable ? "completed" : "handedOff");
    } catch (error) {
      if (writable) {
        try { await writable.abort(); } catch { /* Already closed or errored. */ }
      }
      if (task.controller.signal.aborted || error?.name === "AbortError" || error?.type === "DOWNLOAD_CANCELED") finishTask(task, "cancelled");
      else finishTask(task, "failed", error);
    } finally {
      parts.length = 0;
      task.handle = null;
    }
  };
  const pumpDownloads = () => {
    while (runningDownloads < MAX_CONCURRENT_DOWNLOADS && downloadQueue.length) {
      // Serialize native Service Worker hand-offs, including large files. URL
      // transfers can still use the other slot while a native transfer runs.
      const index = downloadQueue.findIndex(task => task.finished || !task.native || !runningNativeDownloads);
      if (index < 0) break;
      const [task] = downloadQueue.splice(index, 1);
      if (task.finished) continue;
      runningDownloads++;
      if (task.native) runningNativeDownloads++;
      task.running = true;
      runTask(task).finally(() => {
        task.running = false;
        runningDownloads--;
        if (task.native) runningNativeDownloads--;
        pumpDownloads();
      });
    }
  };
  const downloadMedia = (url, kind, native = null) => {
    if (!native && (typeof url !== "string" || !url)) return Promise.resolve();
    const key = native?.key || `${kind}:${url}`;
    const existing = activeDownloads.get(key);
    if (existing) {
      const card = showTask(existing);
      card.scrollIntoView({ block: "nearest" });
      card.focus({ preventScroll: true });
      return existing.promise;
    }
    // Retain a small history without retaining media buffers.
    for (const previous of downloadTasks.values()) {
      if (downloadTasks.size < 20) break;
      if (previous.finished) dismissTask(previous);
    }
    const task = {
      id: Math.random().toString(36).slice(2) + Date.now().toString(36),
      key, url, kind, native, fileName: native?.fileName || getDownloadFileName(url, getMediaMetadata(url)?.mimeType, kind),
      state: "preparing", received: 0, total: null, controller: new AbortController(),
      startedAt: performance.now(), renderedAt: 0, finished: false,
    };
    task.promise = new Promise(resolve => { task.resolve = resolve; });
    downloadTasks.set(task.id, task);
    activeDownloads.set(key, task);
    showTask(task);
    const enqueue = (handle) => {
      if (task.finished) return;
      task.handle = handle;
      task.state = "queued";
      renderTask(task);
      downloadQueue.push(task);
      pumpDownloads();
    };
    try {
      const pageWindow = typeof unsafeWindow === "undefined" ? window : unsafeWindow;
      if (!native && kind !== "image" && typeof pageWindow.showSaveFilePicker === "function" &&
          pageWindow.self === pageWindow.top) {
        // Keep the picker inside the original click, before queueing or fetching.
        Promise.resolve(pageWindow.showSaveFilePicker({ suggestedName: task.fileName }))
          .then(enqueue, (error) => {
            if (error.name === "AbortError") finishTask(task, "cancelled");
            else finishTask(task, "failed", error);
          });
      } else enqueue(null);
    } catch (error) {
      finishTask(task, "failed", error);
    }
    return task.promise;
  };
  const tel_download_video = (url) => downloadMedia(url, "video");
  const tel_download_audio = (url) => downloadMedia(url, "audio");
  const tel_download_image = (url) => downloadMedia(url, "image");

  const getMediaSource = (media) =>
    media?.getAttribute("src") ? media.src :
      media?.currentSrc || media?.querySelector("source")?.src;

  const getPinnedMedia = () => {
    const pinned = document.querySelector(".pinned-audio");
    const mid = pinned?.getAttribute("data-mid");
    if (!mid) return null;
    const peer = pinned.getAttribute("data-peer-id");
    const native = getWebKDownload(getWebKMessageMedia(getWebKMessage(peer, mid)));
    const candidates = Array.from(document.querySelectorAll("audio-element")).filter(
      (element) => element.closest(".bubble") && element.getAttribute("data-mid") === mid &&
        (!peer || element.closest("[data-peer-id]")?.getAttribute("data-peer-id") === peer)
    );
    const element = candidates.length === 1 ? candidates[0] :
      candidates.find((candidate) => candidate.audio && !candidate.audio.paused);
    const url = getMediaSource(element?.audio);
    return native ? { url, kind: native.kind, native } :
      url ? { url, kind: element.audio.tagName === "AUDIO" ? "audio" : "video" } : null;
  };

  const downloadCurrentWebKMedia = () => {
    // The toolbar can outlive its media node. Resolve both at click time.
    const viewer = document.querySelector(".media-viewer-whole");
    if (!viewer) return;
    const buttons = viewer.querySelector(".media-viewer-topbar .media-viewer-buttons");
    const nativeDownload = buttons && getWebKDownloadButtons(buttons).find(
      (button) => isUsableDownloadButton(button) && !button.matches(
        '.quality-download-options-button-menu, .btn-menu-toggle, [aria-haspopup="menu"], [aria-haspopup="true"]'
      )
    );
    if (nativeDownload) {
      nativeDownload.click();
      return;
    }
    const media = viewer.querySelector(".media-viewer-movers .media-viewer-aspecter");
    const videoUrl = getMediaSource(media?.querySelector("video"));
    const imageUrl = getMediaSource(media?.querySelector("img.thumbnail"));
    const native = getWebKViewerDownload(viewer);
    if (native) downloadMedia(videoUrl || imageUrl, native.kind, native);
    else if (videoUrl) tel_download_video(videoUrl);
    else if (imageUrl) tel_download_image(imageUrl);
  };

  logger.info("Initialized");

  const createDownloadButton = (className, iconHTML, onClick) => {
    const button = document.createElement("button");
    button.className = className;
    button.innerHTML = iconHTML;
    button.type = "button";
    localizeDownloadButton(button);
    button.onclick = onClick;
    return button;
  };
  const getWebADownloadButtons = (container) =>
    Array.from(container.querySelectorAll("button")).filter((button) =>
      !button.classList.contains("tel-download") &&
      (button.querySelector(".icon-download") || button.title === "Download" ||
        button.getAttribute("aria-label") === "Download") && isUsableDownloadButton(button)
    );
  const downloadCurrentWebAMedia = () => {
    const media = document.querySelector("#MediaViewer .MediaViewerSlide--active");
    const videoUrl = getMediaSource(media?.querySelector(".VideoPlayer video"));
    const imageUrl = getMediaSource(media?.querySelector(".MediaViewerContent > div > img"));
    if (videoUrl) tel_download_video(videoUrl);
    else if (imageUrl) tel_download_image(imageUrl);
  };

  // WebA owns only media discovery and button placement.
  const refreshWebA = () => {
    const story = document.getElementById("StoryViewer");
    if (story) {
      const header = story.querySelector(".GrsJNw3y") || story.querySelector(".DropdownMenu")?.parentNode;
      if (header && !header.querySelector(".tel-download") && !getWebADownloadButtons(header).length) {
        header.prepend(createDownloadButton(
          "Button TkphaPyQ tiny translucent-white round tel-download",
          '<i class="icon icon-download" aria-hidden="true"></i>',
          () => {
            const current = document.getElementById("StoryViewer");
            const videoUrl = getMediaSource(current?.querySelector("video"));
            const images = current?.querySelectorAll("img.PVZ8TOWS");
            const imageUrl = getMediaSource(images?.[images.length - 1]);
            if (videoUrl) tel_download_video(videoUrl);
            else if (imageUrl) tel_download_image(imageUrl);
          }
        ));
      }
    }
    const media = document.querySelector("#MediaViewer .MediaViewerSlide--active");
    const actions = document.querySelector("#MediaViewer .MediaViewerActions");
    if (!media || !actions) return;
    const video = media.querySelector(".VideoPlayer video");
    const image = media.querySelector(".MediaViewerContent > div > img");
    if (!getMediaSource(video) && !getMediaSource(image)) return;
    const makeButton = () => createDownloadButton(
      "Button smaller translucent-white round tel-download",
      '<i class="icon icon-download" aria-hidden="true"></i>',
      downloadCurrentWebAMedia
    );
    if (getWebADownloadButtons(actions).length) {
      actions.querySelectorAll("button.tel-download").forEach((button) => button.remove());
    } else if (!actions.querySelector("button.tel-download")) {
      actions.prepend(makeButton());
    }
    const controls = media.querySelector(".VideoPlayerControls .buttons");
    if (video && controls && !controls.querySelector("button.tel-download")) {
      const spacer = controls.querySelector(".spacer");
      if (spacer) spacer.after(makeButton());
      else controls.appendChild(makeButton());
    }
  };

  // WebK owns only media discovery and button placement.
  const refreshWebK = () => {
    refreshWebKDownloadIcon();

    // Resolve the pinned media again on every click: its source may load after
    // the pinned message changes, and message IDs can repeat across chats.
    const pinnedAudio = document.querySelector(".pinned-audio");
    const pinnedUtils = pinnedAudio?.querySelector(".pinned-container-wrapper-utils");
    if (pinnedUtils) {
      let button = pinnedUtils.querySelector("._tel_download_button_pinned_container");
      if (!button) {
        button = document.createElement("button");
        button.className = "btn-icon tgico-download _tel_download_button_pinned_container";
        button.innerHTML = createWebKDownloadIcon(true);
        button.type = "button";
        button.onclick = (event) => {
          event.stopPropagation();
          const media = getPinnedMedia();
          if (!media) return;
          downloadMedia(media.url, media.kind, media.native);
        };
        pinnedUtils.appendChild(button);
      }
      const disabled = !getPinnedMedia();
      if (button.disabled !== disabled) button.disabled = disabled;
      localizeDownloadButton(button, disabled);
    }

    // Stories
    const storiesContainer = document.getElementById("stories-viewer");
    if (storiesContainer) {
      const createDownloadButton = () => {
        const downloadButton = document.createElement("button");
        downloadButton.className = "btn-icon rp tel-download";
        downloadButton.innerHTML = `${createWebKDownloadIcon()}<div class="c-ripple"></div>`;
        downloadButton.setAttribute("type", "button");
        localizeDownloadButton(downloadButton);
        downloadButton.onclick = () => {
          // 1. Story with video
          const video = storiesContainer.querySelector("video.media-video");
          const videoSrc =
            video?.src ||
            video?.currentSrc ||
            video?.querySelector("source")?.src;
          if (videoSrc) {
            tel_download_video(videoSrc);
          } else {
            // 2. Story with image
            const imageSrc =
              storiesContainer.querySelector("img.media-photo")?.src;
            if (imageSrc) tel_download_image(imageSrc);
          }
        };
        return downloadButton;
      };

      const storyHeader = storiesContainer.querySelector(
        "[class*='_ViewerStoryHeaderRight']"
      );
      if (storyHeader && !storyHeader.querySelector(".tel-download")) {
        storyHeader.prepend(createDownloadButton());
      }

      const storyFooter = storiesContainer.querySelector(
        "[class*='_ViewerStoryFooterRight']"
      );
      if (storyFooter && !storyFooter.querySelector(".tel-download")) {
        storyFooter.prepend(createDownloadButton());
      }
    }

    // All media opened are located in .media-viewer-movers > .media-viewer-aspecter
    const mediaContainer = document.querySelector(".media-viewer-whole");
    if (!mediaContainer) return;
    const mediaAspecter = mediaContainer.querySelector(
      ".media-viewer-movers .media-viewer-aspecter"
    );
    const mediaButtons = mediaContainer.querySelector(
      ".media-viewer-topbar .media-viewer-buttons"
    );
    if (!mediaAspecter || !mediaButtons) return;

    // Restore only identified download controls. Other hidden actions may be
    // unavailable for this media and should remain under Telegram's control.
    for (const button of getWebKDownloadButtons(mediaButtons)) {
      if (!button.disabled && button.getAttribute("aria-disabled") !== "true") {
        button.classList.remove("hide");
      }
    }

    // Recognize native downloads by their purpose, not their font code point.
    const nativeDownloadButtons = getWebKDownloadButtons(mediaButtons).filter(isUsableDownloadButton);
    if (nativeDownloadButtons.length > 0) {
      mediaButtons.querySelectorAll("button.tel-download").forEach((button) => {
        button.remove();
      });
    }
    const hasDownloadButton =
      nativeDownloadButtons.length > 0 ||
      mediaButtons.querySelector("button.tel-download");

    if (mediaAspecter.querySelector(".ckin__player")) {
      // 1. Video player detected - Video and it has finished initial loading
      // container > .ckin__player > video[src]

      // add download button to videos
      const controls = mediaAspecter.querySelector(
        ".default__controls.ckin__controls"
      );
      if (controls && !controls.querySelector(".tel-download")) {
        const brControls = controls.querySelector(
          ".bottom-controls .right-controls"
        );
        const downloadButton = document.createElement("button");
        downloadButton.className =
          "btn-icon default__button tgico-download tel-download";
        downloadButton.innerHTML = createWebKDownloadIcon();
        downloadButton.setAttribute("type", "button");
        localizeDownloadButton(downloadButton);
        downloadButton.onclick = downloadCurrentWebKMedia;
        brControls?.prepend(downloadButton);
      }
    } else if (
      mediaAspecter.querySelector("video") &&
      !hasDownloadButton
    ) {
      // 2. Video HTML element detected, could be either GIF or unloaded video
      // container > video[src]
      const downloadButton = document.createElement("button");
      downloadButton.className = "btn-icon tgico-download tel-download";
      downloadButton.innerHTML = createWebKDownloadIcon(true);
      downloadButton.setAttribute("type", "button");
      localizeDownloadButton(downloadButton);
      downloadButton.onclick = downloadCurrentWebKMedia;
      mediaButtons.prepend(downloadButton);
    } else if (!hasDownloadButton) {
      // 3. Image without download button detected
      // container > img.thumbnail
      if (!getWebKViewerDownload(mediaContainer) && !mediaAspecter.querySelector("img.thumbnail")?.src) {
        return;
      }
      const downloadButton = document.createElement("button");
      downloadButton.className = "btn-icon tgico-download tel-download";
      downloadButton.innerHTML = createWebKDownloadIcon(true);
      downloadButton.setAttribute("type", "button");
      localizeDownloadButton(downloadButton);
      downloadButton.onclick = downloadCurrentWebKMedia;
      mediaButtons.prepend(downloadButton);
    }
  };

  // The task panel is independent of Telegram's viewer and survives media changes.
  const panel = document.createElement("section");
  panel.id = "tel-downloader-progress-bar-container";
  panel.dir = "ltr";
  panel.hidden = true;
  panel.innerHTML = `
    <div class="tel-panel-heading">
      <strong class="tel-panel-title"></strong>
      <div class="tel-panel-tools">
        <button class="tel-settings-toggle" type="button" aria-expanded="false" aria-controls="tel-download-settings">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M10 2h4l.6 3 2 1.2 2.9-.9 2 3.4-2.3 2v2.6l2.3 2-2 3.4-2.9-.9-2 1.2L14 22h-4l-.6-3-2-1.2-2.9.9-2-3.4 2.3-2v-2.6l-2.3-2 2-3.4 2.9.9 2-1.2Z"/><circle cx="12" cy="12" r="3"/></svg>
        </button>
        <button class="tel-panel-toggle" type="button" aria-expanded="true" aria-controls="tel-task-list"></button>
      </div>
    </div>
    <div id="tel-download-settings" class="tel-language-setting" hidden><label for="tel-download-language"></label><select id="tel-download-language"></select></div>
    <div id="tel-task-list" class="tel-task-list"></div>`;
  const languageSelect = panel.querySelector("select");
  const settings = panel.querySelector("#tel-download-settings");
  const settingsToggle = panel.querySelector(".tel-settings-toggle");
  const setSettingsOpen = (open) => {
    const returnFocus = !open && settings.contains(document.activeElement);
    settings.hidden = !open;
    settingsToggle.setAttribute("aria-expanded", String(open));
    if (open) languageSelect.focus();
    else if (returnFocus && !panel.hidden) settingsToggle.focus();
  };
  settingsToggle.onclick = () => setSettingsOpen(settings.hidden);
  panel.addEventListener("keydown", event => {
    if (event.key === "Escape" && !settings.hidden) {
      event.preventDefault();
      event.stopPropagation();
      setSettingsOpen(false);
    }
  });
  // Wait for the click: closing settings moves this bottom-anchored panel,
  // which must not move a control between pointer-down and pointer-up.
  document.addEventListener("click", event => {
    if (!settings.hidden && !settings.contains(event.target) && !settingsToggle.contains(event.target)) {
      setSettingsOpen(false);
    }
  });
  for (const [value, label] of [["auto", ""], ...Object.entries(UI_LANGUAGES)]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    if (value !== "auto") option.lang = value;
    languageSelect.appendChild(option);
  }
  const refreshLanguage = () => {
    uiLanguage = resolveLanguage();
    integerFormat = new Intl.NumberFormat(uiLanguage, { maximumFractionDigits: 0 });
    decimalFormat = new Intl.NumberFormat(uiLanguage, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    panel.lang = uiLanguage;
    panel.setAttribute("aria-label", t("mediaDownloads"));
    settingsToggle.title = t("settings");
    settingsToggle.setAttribute("aria-label", t("settings"));
    panel.querySelector("label").textContent = t("language");
    languageSelect.querySelector('[value="auto"]').textContent = t("automatic");
    languageSelect.value = languagePreference;
    panel.querySelector(".tel-panel-toggle").textContent = t(panel.querySelector(".tel-task-list").hidden ? "show" : "hide");
    for (const task of downloadTasks.values()) renderTask(task);
    updateTaskPanel();
    document.querySelectorAll("button.tel-download, button._tel_download_button_pinned_container").forEach(button => {
      localizeDownloadButton(button, button.matches("._tel_download_button_pinned_container:disabled"));
    });
  };
  languageSelect.onchange = () => {
    languagePreference = Object.hasOwn(UI_LANGUAGES, languageSelect.value) ? languageSelect.value : "auto";
    try {
      if (languagePreference === "auto") localStorage.removeItem(LANGUAGE_STORAGE_KEY);
      else localStorage.setItem(LANGUAGE_STORAGE_KEY, languagePreference);
    } catch {
      // Storage can be disabled; the selected language still works for this tab.
    }
    refreshLanguage();
  };
  window.addEventListener("languagechange", () => {
    if (languagePreference === "auto") refreshLanguage();
  });
  window.addEventListener("storage", event => {
    if (event.key === LANGUAGE_STORAGE_KEY || event.key === null) {
      languagePreference = readLanguagePreference();
      refreshLanguage();
    }
  });
  panel.querySelector(".tel-panel-toggle").onclick = () => {
    const list = panel.querySelector(".tel-task-list");
    list.hidden = !list.hidden;
    if (list.hidden) setSettingsOpen(false);
    const toggle = panel.querySelector(".tel-panel-toggle");
    toggle.textContent = t(list.hidden ? "show" : "hide");
    toggle.setAttribute("aria-expanded", String(!list.hidden));
  };
  const style = document.createElement("style");
  style.textContent = `
    #tel-downloader-progress-bar-container {
      --tel-bg: #fff; --tel-fg: #202b36; --tel-muted: #556472; --tel-line: #d9e1e8;
      --tel-track: #e9eef3; --tel-accent: #1967b3; --tel-error: #b42318;
      box-sizing: border-box; position: fixed; right: max(12px, env(safe-area-inset-right)); bottom: max(12px, env(safe-area-inset-bottom));
      width: min(340px, calc(100vw - 24px)); max-height: calc(100vh - 24px); z-index: 2147483646;
      background: var(--tel-bg); color: var(--tel-fg); border: 1px solid var(--tel-line); border-radius: 12px;
      box-shadow: 0 6px 28px #0003; font: 13px/1.4 system-ui, sans-serif; overflow: hidden;
      display: flex; flex-direction: column; text-align: start;
    }
    html.night #tel-downloader-progress-bar-container, html.theme-dark #tel-downloader-progress-bar-container {
      --tel-bg: #202a35; --tel-fg: #f2f5f8; --tel-muted: #b0bdca; --tel-line: #455361;
      --tel-track: #394754; --tel-accent: #73b7ff; --tel-error: #ff9f97;
    }
    #tel-downloader-progress-bar-container [hidden], #tel-downloader-progress-bar-container[hidden] { display: none !important; }
    #tel-downloader-progress-bar-container * { box-sizing: border-box; }
    #tel-downloader-progress-bar-container p { margin: 0; }
    #tel-downloader-progress-bar-container .tel-panel-heading, #tel-downloader-progress-bar-container .tel-task-heading {
      display: flex; align-items: center; justify-content: space-between; gap: 8px;
    }
    #tel-downloader-progress-bar-container .tel-panel-heading { padding: 10px 12px; flex-shrink: 0; }
    #tel-downloader-progress-bar-container .tel-panel-title { min-width: 0; overflow-wrap: anywhere; }
    #tel-downloader-progress-bar-container .tel-panel-tools { display: flex; align-items: center; gap: 2px; flex-shrink: 0; }
    #tel-downloader-progress-bar-container .tel-language-setting { display: flex; align-items: center; gap: 8px; padding: 0 12px 10px; flex-shrink: 0; }
    #tel-downloader-progress-bar-container .tel-language-setting label { flex: 1; min-width: 0; color: var(--tel-muted); overflow-wrap: anywhere; }
    #tel-downloader-progress-bar-container select { width: 150px; max-width: 55%; min-width: 0; min-height: 32px; font: inherit; color: var(--tel-fg); background: var(--tel-bg); border: 1px solid var(--tel-line); border-radius: 6px; padding: 4px; }
    #tel-downloader-progress-bar-container .tel-task-list { min-height: 0; overflow-y: auto; max-height: 440px; overscroll-behavior: contain; }
    #tel-downloader-progress-bar-container .tel-task { padding: 12px; border-top: 1px solid var(--tel-line); }
    #tel-downloader-progress-bar-container .filename { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
    #tel-downloader-progress-bar-container button {
      appearance: none; background: transparent; color: var(--tel-accent); border: 1px solid transparent;
      font: inherit; border-radius: 6px; padding: 5px 8px; min-height: 32px; cursor: pointer; flex-shrink: 0;
    }
    #tel-downloader-progress-bar-container button:hover { background: var(--tel-track); }
    #tel-downloader-progress-bar-container .tel-settings-toggle { display: inline-flex; align-items: center; justify-content: center; width: 32px; padding: 5px; color: var(--tel-muted); }
    #tel-downloader-progress-bar-container .tel-settings-toggle:hover, #tel-downloader-progress-bar-container .tel-settings-toggle[aria-expanded="true"] { color: var(--tel-fg); background: var(--tel-track); }
    #tel-downloader-progress-bar-container button:focus-visible, #tel-downloader-progress-bar-container select:focus-visible, #tel-downloader-progress-bar-container .tel-task:focus-visible { outline: 2px solid var(--tel-accent); outline-offset: -2px; }
    #tel-downloader-progress-bar-container button:disabled { opacity: .5; cursor: default; }
    #tel-downloader-progress-bar-container [data-action="dismiss"] { color: var(--tel-muted); font-size: 20px; }
    #tel-downloader-progress-bar-container .progress { position: relative; min-height: 24px; margin: 8px 0; background: var(--tel-track); border-radius: 6px; overflow: hidden; }
    #tel-downloader-progress-bar-container .progress > div { position: absolute; height: 100%; background: var(--tel-accent); opacity: .35; }
    #tel-downloader-progress-bar-container .progress > p { position: relative; text-align: center; line-height: 1.5; padding: 3px 8px; overflow-wrap: anywhere; color: var(--tel-fg); }
    #tel-downloader-progress-bar-container .tel-task-details { color: var(--tel-muted); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
    #tel-downloader-progress-bar-container .tel-task-error { color: var(--tel-error); margin-top: 8px; overflow-wrap: anywhere; }
    #tel-downloader-progress-bar-container .tel-task-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 4px; margin-top: 4px; }
    #tel-downloader-progress-bar-container .tel-task-state { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
    #tel-downloader-progress-bar-container [data-state="failed"] .progress > div { background: var(--tel-error); }
    #tel-downloader-progress-bar-container .tel-indeterminate > div { width: 35% !important; animation: tel-download-progress 1.4s infinite ease-in-out; }
    @keyframes tel-download-progress { from { left: -35%; } to { left: 100%; } }
    @media (prefers-reduced-motion: reduce) { #tel-downloader-progress-bar-container .tel-indeterminate > div { animation: none; left: 32%; } }
  `;
  document.head.appendChild(style);
  document.body.appendChild(panel);
  refreshLanguage();

  const isWebK = location.hostname === "webk.telegram.org" || location.pathname.startsWith("/k/");
  const isWebA = location.hostname === "webz.telegram.org" || location.pathname.startsWith("/a/");
  const refreshApp = isWebK ? refreshWebK : isWebA ? refreshWebA : null;
  if (refreshApp) {
    const roots = isWebK
      ? ".media-viewer-whole, #stories-viewer, .pinned-audio, audio-element"
      : "#MediaViewer, #StoryViewer";
    let pending;
    const scheduleRefresh = () => {
      if (pending) return;
      pending = setTimeout(() => {
        pending = null;
        refreshApp();
      }, 100);
    };
    const observer = new MutationObserver((records) => {
      if (records.some((record) => {
        const target = record.target instanceof Element ? record.target : record.target.parentElement;
        if (target?.closest("#tel-downloader-progress-bar-container, .tel-download, ._tel_download_button_pinned_container")) return false;
        return target?.closest(roots) || Array.from(record.addedNodes).some((node) =>
          node instanceof Element && (node.matches(roots) || node.querySelector(roots))
        );
      })) scheduleRefresh();
    });
    observer.observe(document.body, {
      childList: true, subtree: true, attributes: true,
      attributeFilter: ["class", "src", "data-mid", "data-peer-id", "disabled", "aria-disabled", "hidden"],
    });
    // A fallback handles media source properties changed outside the DOM.
    setInterval(() => { if (!document.hidden) refreshApp(); }, REFRESH_DELAY);
    document.addEventListener("visibilitychange", scheduleRefresh);
    refreshApp();
  }

  logger.info("Completed script setup.");
})();
