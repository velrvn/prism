import { BOOK_NAMES, CACHE_PREFIX } from './config.js';
import { fold } from './utils.js';

export let savedScriptures = [];
try { savedScriptures = JSON.parse(localStorage.getItem('PRISM_saved') || '[]'); } catch(e) { savedScriptures = []; }
export const saveSavedScriptures = () => { try { localStorage.setItem('PRISM_saved', JSON.stringify(savedScriptures)); } catch(e) {} };

export let favs = new Set();
try {
    const rawFavs = JSON.parse(localStorage.getItem('shelf-favs') || '[]');
    const migrated = [];
    rawFavs.forEach(f => {
        if (typeof f === 'number' && f >= 0 && f < 66) migrated.push(f);
        else if (typeof f === 'string') { const idx = BOOK_NAMES.findIndex(n => fold(n) === fold(f)); if (idx >= 0) migrated.push(idx); }
    });
    favs = new Set(migrated);
} catch(e) { favs = new Set(); }
export const saveFavs = () => { try { localStorage.setItem('shelf-favs', JSON.stringify([...favs])); } catch(e) {} };

try { const oldKeys = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith('bible_cache_') && !k.startsWith(CACHE_PREFIX)) oldKeys.push(k); } oldKeys.forEach(k => localStorage.removeItem(k)); } catch(e) {}
