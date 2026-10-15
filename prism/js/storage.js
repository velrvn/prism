/* ============================================================
   PRISM — storage.js
   localStorage layer: user preferences (selected translation),
   favorites, and saved scriptures. Everything is guarded
   against quota/privacy-mode failures.
   ============================================================ */

window.PRISM_STORAGE = (() => {

  const PREFS_KEY = 'PRISM_prefs_v1';
  const FAVS_KEY = 'shelf-favs';           // kept for migration compatibility
  const SAVED_KEY = 'PRISM_saved';

  /* ---------- preferences ---------- */
  let prefs = { version: (window.PRISM && PRISM.DEFAULT_VERSION) || 'EnglishKJBible' };
  try {
    prefs = Object.assign(prefs, JSON.parse(localStorage.getItem(PREFS_KEY) || '{}'));
  } catch (e) { /* corrupted prefs — use defaults */ }

  const persistPrefs = () => {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (e) {}
  };
  const getPref = k => prefs[k];
  const setPref = (k, v) => { prefs[k] = v; persistPrefs(); };

  /* ---------- favorites ---------- */
  let favs = new Set();
  try {
    const raw = JSON.parse(localStorage.getItem(FAVS_KEY) || '[]');
    const names = (window.PRISM && PRISM.BOOK_NAMES) || [];
    raw.forEach(f => {
      if (typeof f === 'number' && f >= 0 && f < 66) favs.add(f);
      else if (typeof f === 'string') {
        const idx = names.findIndex(n => n && n.toLowerCase() === f.toLowerCase());
        if (idx >= 0) favs.add(idx);
      }
    });
  } catch (e) { favs = new Set(); }

  const saveFavs = () => {
    try { localStorage.setItem(FAVS_KEY, JSON.stringify([...favs])); } catch (e) {}
  };

  /* ---------- saved scriptures ---------- */
  let saved = [];
  try { saved = JSON.parse(localStorage.getItem(SAVED_KEY) || '[]'); } catch (e) { saved = []; }

  const persistSaved = () => {
    try { localStorage.setItem(SAVED_KEY, JSON.stringify(saved)); return true; }
    catch (e) { return false; }
  };

  return {
    getPref, setPref,
    favs, saveFavs,
    getSaved: () => saved,
    persistSaved,
    addSaved: item => { saved.push(item); return persistSaved(); },
    removeSaved: id => { saved = saved.filter(s => s.id !== id); return persistSaved(); },
    findSaved: id => saved.find(s => s.id === id)
  };
})();