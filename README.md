# PRISM

**PRISM** stands for **Passages Rendered In Simple Minimalism**.

PRISM is an offline-first Bible reading Progressive Web App focused on clean typography, smooth navigation, and distraction-free scripture study. It allows users to download translations locally, read offline, compare versions, save verses, and share scripture cards.

[https://velrvn.github.io/prism](https://velrvn.github.io/prism)

---

## Overview

PRISM is built as a lightweight, installable web app. It loads Bible data from an XML source, stores downloaded translations locally, and remembers the user's selected translation across sessions.

The interface is intentionally minimal. The main view presents the books of the Bible as a navigable stack, while the reader view focuses on the text itself.

---

## Features

### Offline Reading

PRISM uses a Service Worker and Cache Storage to work offline after the app shell and selected translations have been downloaded.

Once a translation is downloaded, the user can open it instantly without an internet connection.

### Translation Downloads

When the user selects a translation, PRISM downloads and stores it locally.

This makes future switching instant and allows the app to function offline.

### Persistent Translation Selection

The selected translation is saved locally.

If the user closes the app, refreshes the page, or reopens it later, PRISM restores the previously selected translation.

### Multilingual Support

PRISM supports multiple Bible translations and languages.

Book titles can be localized by language inside `js/config.js`.

### Saved Scriptures

Users can save verses into categories such as:

- Notes
- Encouragement
- Obedience
- Sin
- Worship
- Memorize

Saved items can include descriptions and multiple verses.

### Verse Comparison

Users can compare the current passage with another translation.

### Verse Sharing

PRISM can generate a clean shareable image from selected verses using the Canvas API.

### Installable PWA

PRISM can be installed as a web app on supported browsers and devices.

---

## Project Structure

```txt
prism/
├── index.html
├── manifest.webmanifest
├── sw.js
├── offline.html
├── README.md
├── css/
│   └── styles.css
├── js/
│   ├── config.js
│   ├── utils.js
│   ├── storage.js
│   ├── data.js
│   ├── share.js
│   └── app.js
└── assets/
    └── icons/
        ├── icon-192.png
        └── icon-512.png
