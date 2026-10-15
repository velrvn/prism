import { BOOK_NAMES, BOOK_TITLES, UI_STRINGS, VERSIONS } from './config.js';
export const fold = s => s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export const escapeHtml = s => { if (!s) return ''; const div = document.createElement('div'); div.textContent = s; return div.innerHTML; };
export const getUIText = key => UI_STRINGS[key] || key;
export const getBookTitle = (index, currentVersion) => {
    const ver = VERSIONS.find(v => v.id === currentVersion);
    const lang = ver ? ver.lang : 'English';
    const list = BOOK_TITLES[lang] || BOOK_TITLES['English'];
    return list[index] || BOOK_NAMES[index];
};
