import { BOOK_NAMES } from './config.js';

export function parseXMLBible(xmlText) {
    const parser = new DOMParser(); const xmlDoc = parser.parseFromString(xmlText, "text/xml"); if (xmlDoc.querySelector("parsererror")) throw new Error("XML parsing failed");
    const bible = xmlDoc.querySelector("bible"); if (!bible) throw new Error("Invalid XML format: missing <bible> root");
    const out = []; const testaments = xmlDoc.querySelectorAll("testament");
    testaments.forEach(testament => { const testName = testament.getAttribute("name"); const books = testament.querySelectorAll("book"); books.forEach(book => { const bookNum = parseInt(book.getAttribute("number")); const nameAttr = book.getAttribute("name") || book.getAttribute("bookname") || book.getAttribute("book"); let bookName = nameAttr; if (!bookName) bookName = (bookNum >= 1 && bookNum <= 66) ? BOOK_NAMES[bookNum - 1] : `Book ${bookNum}`; const chs = []; const chapters = book.querySelectorAll("chapter"); chapters.forEach(ch => { const chNum = parseInt(ch.getAttribute("number")); const verses = ch.querySelectorAll("verse"); const texts = []; verses.forEach(v => texts.push(v.textContent.trim())); if (texts.length > 0) chs.push({ n: chNum, title: `Chapter ${chNum}`, v: texts }); }); if (bookName && chs.length > 0) out.push({ t: bookName, origNum: bookNum, test: testName === 'Old' ? 'Old Testament' : 'New Testament', ch: chs }); }); });
    return out;
}

export let vpCache = {};
export let compareCache = {};
