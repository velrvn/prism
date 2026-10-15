/* ============================================================
   PRISM — data.js
   BibleDataService: fetching, parsing, and durable storage of
   translations.

   Storage strategy:
   - Parsed Bibles live in Cache Storage ("prism-bible-data-v1")
     which comfortably holds many full Bibles (no 5MB limit).
   - Legacy localStorage caches are migrated automatically.
   - Downloads try the primary CDN, then a mirror.
   ============================================================ */

window.PRISM_DATA = (() => {

  const CACHE_NAME = 'prism-bible-data-v1';
  const LEGACY_PREFIX = 'bible_cache_v3flat_';
  const DATA_HOST = 'https://prism.local';          // virtual origin for cache keys
  const dataUrl = id => `${DATA_HOST}/bible/${id}.json`;
  const metaUrl = id => `${DATA_HOST}/meta/${id}.json`;

  const cacheAvailable = () => ('caches' in window);

  /* ---------- validation ---------- */
  const isValid = list =>
    Array.isArray(list) && list.length >= 66 &&
    list.every(b => b && b.t && Array.isArray(b.ch) && b.ch.length &&
      Array.isArray(b.ch[0].v) && b.ch[0].v.length > 0);

  /* ---------- XML parsing ---------- */
  function parse(xmlText) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
    if (xmlDoc.querySelector('parsererror')) throw new Error('XML parsing failed');
    if (!xmlDoc.querySelector('bible')) throw new Error('Invalid XML format: missing <bible> root');

    const out = [];
    xmlDoc.querySelectorAll('testament').forEach(testament => {
      const testName = testament.getAttribute('name');
      testament.querySelectorAll('book').forEach(book => {
        const bookNum = parseInt(book.getAttribute('number'), 10);
        const bookName = book.getAttribute('name') || book.getAttribute('bookname') ||
          book.getAttribute('book') ||
          ((bookNum >= 1 && bookNum <= 66) ? PRISM.BOOK_NAMES[bookNum - 1] : `Book ${bookNum}`);

        const chs = [];
        book.querySelectorAll('chapter').forEach(ch => {
          const chNum = parseInt(ch.getAttribute('number'), 10);
          const texts = [];
          ch.querySelectorAll('verse').forEach(v => texts.push(v.textContent.trim()));
          if (texts.length > 0) chs.push({ n: chNum, title: `Chapter ${chNum}`, v: texts });
        });
        if (bookName && chs.length > 0) {
          out.push({
            t: bookName,
            origNum: bookNum,
            test: testName === 'Old' ? 'Old Testament' : 'New Testament',
            ch: chs
          });
        }
      });
    });
    return out;
  }

  /* ---------- cache storage (primary) ---------- */
  async function getFromCache(versionId) {
    if (!cacheAvailable()) return null;
    try {
      const cache = await caches.open(CACHE_NAME);
      const res = await cache.match(dataUrl(versionId));
      if (!res) return null;
      return await res.json();
    } catch (e) { return null; }
  }

  async function saveToCache(versionId, data) {
    if (!cacheAvailable()) return false;
    try {
      const json = JSON.stringify(data);
      const cache = await caches.open(CACHE_NAME);
      await cache.put(dataUrl(versionId), new Response(json, {
        headers: { 'Content-Type': 'application/json' }
      }));
      await cache.put(metaUrl(versionId), new Response(JSON.stringify({
        bytes: json.length * 2, savedAt: Date.now()
      }), { headers: { 'Content-Type': 'application/json' } }));
      return true;
    } catch (e) { return false; }
  }

  async function getMeta(versionId) {
    if (!cacheAvailable()) return null;
    try {
      const cache = await caches.open(CACHE_NAME);
      const res = await cache.match(metaUrl(versionId));
      return res ? await res.json() : null;
    } catch (e) { return null; }
  }

  async function deleteFromCache(versionId) {
    if (!cacheAvailable()) return;
    try {
      const cache = await caches.open(CACHE_NAME);
      await cache.delete(dataUrl(versionId));
      await cache.delete(metaUrl(versionId));
    } catch (e) {}
  }

  /* ---------- legacy localStorage (migration only) ---------- */
  function getLegacy(versionId) {
    try {
      const raw = localStorage.getItem(LEGACY_PREFIX + versionId);
      if (!raw) return null;
      const list = JSON.parse(raw);
      return isValid(list) ? list : null;
    } catch (e) { return null; }
  }
  function removeLegacy(versionId) {
    try { localStorage.removeItem(LEGACY_PREFIX + versionId); } catch (e) {}
  }
  /* Clean very old cache formats from previous app versions */
  function purgeLegacyPrefixes() {
    try {
      const dead = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('bible_cache_') && !k.startsWith(LEGACY_PREFIX)) dead.push(k);
      }
      dead.forEach(k => localStorage.removeItem(k));
    } catch (e) {}
  }

  /* ---------- network ---------- */
  async function fetchXml(versionId, timeoutMs = 45000) {
    let lastErr = null;
    for (const source of PRISM.XML_SOURCES) {
      try {
        const ctl = new AbortController();
        const to = setTimeout(() => ctl.abort(), timeoutMs);
        const res = await fetch(source(versionId), { signal: ctl.signal });
        clearTimeout(to);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.text();
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('All sources failed');
  }

  /* ---------- public API ---------- */

  /**
   * Load a translation. Cache-first; downloads and persists when missing.
   * @returns {{data:Array, source:'cache'|'network', persisted:boolean}}
   */
  async function load(versionId, { onStatus } = {}) {
    onStatus && onStatus('Checking local library…');

    const cached = await getFromCache(versionId);
    if (cached && isValid(cached)) return { data: cached, source: 'cache', persisted: true };

    const legacy = getLegacy(versionId);
    if (legacy) {
      await saveToCache(versionId, legacy);
      removeLegacy(versionId);
      return { data: legacy, source: 'cache', persisted: true };
    }

    onStatus && onStatus('Downloading translation…');
    const xmlText = await fetchXml(versionId);

    onStatus && onStatus('Processing…');
    const list = parse(xmlText);
    if (!isValid(list)) throw new Error('Incomplete data received');

    const persisted = await saveToCache(versionId, list);
    return { data: list, source: 'network', persisted };
  }

  /** Alias used by flows that must guarantee local availability. */
  const ensure = (versionId, onStatus) => load(versionId, { onStatus });

  /** Quick status for the translation menu: {cached, bytes, savedAt} */
  async function status(versionId) {
    const meta = await getMeta(versionId);
    if (meta) return { cached: true, bytes: meta.bytes, savedAt: meta.savedAt };
    if (getLegacy(versionId)) return { cached: true, bytes: 0, savedAt: 0, legacy: true };
    return { cached: false, bytes: 0, savedAt: 0 };
  }

  /** Statuses for many ids at once (translation menu). */
  async function statuses(ids) {
    const out = {};
    for (const id of ids) out[id] = await status(id);
    return out;
  }

  /** Delete every stored translation except the ones listed. */
  async function purgeExcept(keepIds = []) {
    if (!cacheAvailable()) return;
    try {
      const cache = await caches.open(CACHE_NAME);
      const keys = await cache.keys();
      const keep = new Set(keepIds);
      for (const req of keys) {
        const m = req.url.match(/\/bible\/(.+)\.json$/);
        if (m && !keep.has(m[1])) {
          await cache.delete(req);
          await cache.delete(metaUrl(m[1]));
        }
      }
    } catch (e) {}
  }

  purgeLegacyPrefixes();

  return { load, ensure, parse, isValid, status, statuses, purgeExcept, deleteFromCache, CACHE_NAME };
})();