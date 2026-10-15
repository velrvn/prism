/* ============================================================
   PRISM — utils.js
   Pure helper functions. No state, no DOM mutations.
   ============================================================ */

window.PRISM_UTILS = (() => {

  /* Diacritic-insensitive lowercase (for search/filtering) */
  const fold = s => s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  /* Safe HTML escaping */
  const escapeHtml = s => {
    if (!s) return '';
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  };

  const clamp01 = v => Math.max(0, Math.min(1, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const mod = (n, m) => ((n % m) + m) % m;

  /* 1234567 → "1.2 MB" */
  const formatBytes = bytes => {
    if (!bytes && bytes !== 0) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  /* i18n lookup */
  const getUIText = key => (window.PRISM && PRISM.UI_STRINGS[key]) || key;

  /* Book title for an index, honoring the active translation's language */
  const getBookTitle = (index, currentVersion) => {
    const ver = PRISM.VERSIONS.find(v => v.id === currentVersion);
    const lang = ver ? ver.lang : 'English';
    const list = PRISM.BOOK_TITLES[lang] || PRISM.BOOK_TITLES['English'];
    return list[index] || PRISM.BOOK_NAMES[index];
  };

  const debounce = (fn, ms) => {
    let t = 0;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  };

  return { fold, escapeHtml, clamp01, lerp, mod, formatBytes, getUIText, getBookTitle, debounce };
})();