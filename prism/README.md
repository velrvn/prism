# PRISM — Passages Rendered In Simple Minimalism

An offline-first, multilingual Bible reader PWA.

## Features
- 52 translations, downloaded on demand and stored locally (Cache Storage)
- Full offline support after install (Service Worker + cached translations)
- Remembers your selected translation across restarts
- Favorites, saved scripture library with categories, verse comparison, verse sharing

## Run locally
Serve the folder with any static server (Service Workers require `http(s)`, not `file://`):

    npx serve .
    # or
    python3 -m http.server 8000

## Deploy to GitHub Pages
1. Create a repository and push this folder to the root of the `main` branch.
2. Repo → **Settings → Pages → Source: Deploy from a branch → main / (root)** → Save.
3. Wait ~1 minute; your app is live at `https://<user>.github.io/<repo>/`.
4. HTTPS is automatic, so the PWA / Service Worker works out of the box.

## Adding a translation
1. Add an entry to `PRISM.VERSIONS` in `js/config.js`:
   `{ id: 'MyBibleFile', label: 'My Language (VER)', lang: 'My Language' }`
2. The XML file must exist at:
   `https://raw.githubusercontent.com/Beblia/Holy-Bible-XML-Format/master/MyBibleFile.xml`
3. Optionally add translated book names to `PRISM.BOOK_TITLES['My Language']` (66 entries).

## Storage model
| What                  | Where                                   |
|-----------------------|-----------------------------------------|
| App shell (HTML/CSS/JS)| Service Worker precache                 |
| Translation data      | Cache Storage (`prism-bible-data-v1`)   |
| Selected translation  | localStorage (`PRISM_prefs_v1`)         |
| Favorites / saved     | localStorage                            |

Cache Storage comfortably holds many full Bibles (unlike localStorage's ~5 MB limit),
and everything is served offline once downloaded.