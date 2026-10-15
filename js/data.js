import { BOOK_NAMES, CACHE_PREFIX } from './config.js';

export function parseXMLBible(xmlText) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, "text/xml");
    if (xmlDoc.querySelector("parsererror")) throw new Error("XML parsing failed");
    const bible = xmlDoc.querySelector("bible");
    if (!bible) throw new Error("Invalid XML format: missing <bible> root");
    const out = [];
    xmlDoc.querySelectorAll("testament").forEach(testament => {
        const testName = testament.getAttribute("name");
        testament.querySelectorAll("book").forEach(book => {
            const bookNum = parseInt(book.getAttribute("number"));
            let bookName = book.getAttribute("name") || book.getAttribute("bookname") || book.getAttribute("book");
            if (!bookName) bookName = (bookNum >= 1 && bookNum <= 66) ? BOOK_NAMES[bookNum - 1] : `Book ${bookNum}`;
            const chs = [];
            book.querySelectorAll("chapter").forEach(ch => {
                const chNum = parseInt(ch.getAttribute("number"));
                const texts = [];
                ch.querySelectorAll("verse").forEach(v => texts.push(v.textContent.trim()));
                if (texts.length > 0) chs.push({ n: chNum, title: `Chapter ${chNum}`, v: texts });
            });
            if (bookName && chs.length > 0) out.push({ t: bookName, origNum: bookNum, test: testName === 'Old' ? 'Old Testament' : 'New Testament', ch: chs });
        });
    });
    return out;
}

export let vpCache = {};
export let compareCache = {};

export async function loadFull(versionId, callbacks) {
    const cacheKey = CACHE_PREFIX + versionId;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
        try {
            const list = JSON.parse(cached);
            const valid = Array.isArray(list) && list.length >= 66 && list.every(b => b && b.t && Array.isArray(b.ch) && b.ch.length && Array.isArray(b.ch[0].v) && b.ch[0].v.length > 0);
            if (valid) { callbacks.onSuccess(list, 'cached'); return; }
            else { localStorage.removeItem(cacheKey); }
        } catch (e) { localStorage.removeItem(cacheKey); }
    }
    callbacks.onLoading();
    try {
        const ctl = new AbortController();
        const to = setTimeout(() => ctl.abort(), 30000);
        const res = await fetch(`https://raw.githubusercontent.com/Beblia/Holy-Bible-XML-Format/master/${versionId}.xml`, { signal: ctl.signal });
        clearTimeout(to);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const list = parseXMLBible(await res.text());
        const valid = Array.isArray(list) && list.length >= 66 && list.every(b => b && b.t && Array.isArray(b.ch) && b.ch.length && Array.isArray(b.ch[0].v) && b.ch[0].v.length > 0);
        if (!valid) throw new Error(`Incomplete data.`);
        try { localStorage.setItem(cacheKey, JSON.stringify(list)); } catch (e) {}
        callbacks.onSuccess(list, 'online');
    } catch (e) { callbacks.onError(e); }
}

export async function loadCompareVersion(verId, callbacks) {
    try {
        const res = await fetch(`https://raw.githubusercontent.com/Beblia/Holy-Bible-XML-Format/master/${verId}.xml`);
        if (!res.ok) throw new Error('Failed');
        compareCache[verId] = parseXMLBible(await res.text());
        callbacks.onSuccess();
    } catch (e) { callbacks.onError(e); }
}

export async function loadVpVersion(verId, callbacks) {
    if (vpCache[verId]) { callbacks.onSuccess(); return; }
    try {
        const res = await fetch(`https://raw.githubusercontent.com/Beblia/Holy-Bible-XML-Format/master/${verId}.xml`);
        if (!res.ok) throw new Error('Failed');
        vpCache[verId] = parseXMLBible(await res.text());
        callbacks.onSuccess();
    } catch (e) { callbacks.onError(e); }
}
