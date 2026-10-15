/* ============================================================
   PRISM — app.js
   Main application: 3D book stage, reader, saved library,
   navigation, search, comparison, install & offline boot.
   ============================================================ */

(() => {
  if (window.PRISM_APP) return;
  window.PRISM_APP = true;

  const P = window.PRISM;
  const U = window.PRISM_UTILS;
  const STORAGE = window.PRISM_STORAGE;
  const DATA = window.PRISM_DATA;
  const SHARE = window.PRISM_SHARE;

  const PAL = P.PAL;
  const CATEGORIES = P.CATEGORIES;
  const BOOK_NAMES = P.BOOK_NAMES;
  const VERSIONS = P.VERSIONS;
  const ICON_CLOSE = P.ICONS.CLOSE;
  const ICON_BACK = P.ICONS.BACK;
  const getUIText = U.getUIText;

  /* ============================================================
     State
     ============================================================ */
  let currentVersion = (STORAGE.getPref('version') && VERSIONS.some(v => v.id === STORAGE.getPref('version')))
    ? STORAGE.getPref('version') : P.DEFAULT_VERSION;

  let vpCurrentVersion = currentVersion;
  let activeCompareVersion = null;
  let compareCache = {};
  let vpCache = {};
  let versionStatus = {};                 // id → {cached, bytes, savedAt}
  const downloadingVersions = new Set();  // ids currently being force-downloaded
  const sortAZ = false;
  const infiniteLoop = false;

  let savedScriptures = STORAGE.getSaved();
  const saveSavedScriptures = () => STORAGE.persistSaved();

  let savedMode = false;
  let savedReaderOpen = false;
  let currentSavedCategory = null;
  let inlineEditState = null;

  let isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  addEventListener('touchstart', () => { isTouchDevice = true; }, { once: true, passive: true });

  /* ============================================================
     DOM references
     ============================================================ */
  const world = document.getElementById('world'), front = document.getElementById('frontStage');
  const side = document.getElementById('side'), reader = document.getElementById('reader');
  const rBook = document.getElementById('rBook'), rTest = document.getElementById('rTest');
  const rTestament = document.getElementById('rTestament'), rBookTitle = document.getElementById('rBookTitle');
  const rChaps = document.getElementById('rChaps'), rVhead = document.getElementById('rVhead'), rVerses = document.getElementById('rVerses');
  const rSave = document.getElementById('rSave'), rBack = document.getElementById('rBack');
  const rFavStar = document.getElementById('rFavStar');
  const rPrevB = document.getElementById('rPrevB'), rNextB = document.getElementById('rNextB');
  const rPrevC = document.getElementById('rPrevC'), rNextC = document.getElementById('rNextC');
  const rNow = document.getElementById('rNow'), rNowTxt = document.getElementById('rNowTxt');
  const cmpBtn = document.getElementById('cmpBtn'), cmpLabel = document.getElementById('cmpLabel'),
        cmpClear = document.getElementById('cmpClear'), cmpLoading = document.getElementById('cmpLoading');
  const cmpMenu = document.getElementById('cmpMenu'), cmpList = document.getElementById('cmpList'),
        cmpSearch = document.getElementById('cmpSearch'), cmpClose = document.getElementById('cmpClose');
  const chapModal = document.getElementById('chapModal'), cmList = document.getElementById('cmList'),
        cmTitle = document.getElementById('cmTitle'), cmClose = document.getElementById('cmClose');
  const dotsEl = document.getElementById('dots');
  const hint = document.getElementById('hint'), topbar = document.getElementById('top'), sub = document.getElementById('sub');
  const info = document.getElementById('info'), infoT = info.querySelector('.t'), infoD = info.querySelector('.d'), infoM = info.querySelector('.m');
  const q = document.getElementById('q'), sres = document.getElementById('sres');
  const favBtn = document.getElementById('favBtn');
  const saveLibBtn = document.getElementById('saveLibBtn');
  const settingsBtn = document.getElementById('settingsBtn'), settingsMenu = document.getElementById('settingsMenu');
  const mmenu = document.getElementById('mmenu');
  const vSearch = document.getElementById('vSearch'), vmList = document.getElementById('vmList'), vmClose = document.getElementById('vmClose');
  const loadingOverlay = document.getElementById('loadingOverlay');
  const saveModal = document.getElementById('saveModal'),
        smDesc = document.getElementById('smDesc'), smVerses = document.getElementById('smVerses'),
        smAddVerse = document.getElementById('smAddVerse'), smCats = document.getElementById('smCats'),
        smCancel = document.getElementById('smCancel'), smSave = document.getElementById('smSave'),
        smTitle = document.getElementById('smTitle'), smVersionLabel = document.getElementById('smVersionLabel'),
        smNavBtn = document.getElementById('smNavBtn'),
        smViewSave = document.getElementById('smViewSave'), smViewPicker = document.getElementById('smViewPicker'),
        vpBreadcrumb = document.getElementById('vpBreadcrumb'), vpBody = document.getElementById('vpBody'),
        vpConfirm = document.getElementById('vpConfirm'),
        vpSelectBtn = document.getElementById('vpSelectBtn'), vpSelectList = document.getElementById('vpSelectList'),
        vpSelectLabel = document.getElementById('vpSelectLabel');
  const confirmModal = document.getElementById('confirmModal'), cfTitle = document.getElementById('cfTitle'),
        cfMessage = document.getElementById('cfMessage'), cfCancel = document.getElementById('cfCancel'),
        cfConfirm = document.getElementById('cfConfirm');
  const installBtn = document.getElementById('installBtn'), installModal = document.getElementById('installModal'),
        instText = document.getElementById('instText'), instClose = document.getElementById('instClose');
  const toast = document.getElementById('toast');
  const rFootActions = document.getElementById('rFootActions');
  const rClearSel = document.getElementById('rClearSel');
  const rSaveFoot = document.getElementById('rSaveFoot');
  const rShareFoot = document.getElementById('rShareFoot');

  let smView = 'save', smContext = 'save', pendingAddVerseCallback = null;
  let vpState = { step: 'books', bookIdx: null, chapIdx: null, selectedVerses: new Set() };
  let toastTimer = 0;

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('on'), 2500);
  }

  /* ============================================================
     Navigation stack (history integration)
     ============================================================ */
  const navStack = [];
  let historyUsable = true;
  let suppressPop = 0;
  let lastRootBack = 0;
  let stageAnimating = false;

  try { history.replaceState({ PRISM: 'boot' }, ''); history.pushState({ PRISM: 'root' }, ''); }
  catch (e) { historyUsable = false; }

  function navPush(id) {
    navStack.push(id);
    if (historyUsable) { try { history.pushState({ PRISM: id }, ''); } catch (e) { historyUsable = false; } }
  }
  function navInternalRemove(id) {
    const i = navStack.lastIndexOf(id);
    if (i < 0) return;
    navStack.splice(i, 1);
    if (historyUsable) { suppressPop++; try { history.back(); } catch (e) { suppressPop--; } }
  }
  function uiBack() {
    if (historyUsable && navStack.length > 0) history.back();
    else fallbackBack();
  }
  function tryCloseLayer(id) {
    switch (id) {
      case 'shareOverlay': if (document.getElementById('shareOverlay').classList.contains('on')) { closeShareOverlay(); return true; } return false;
      case 'confirm': if (confirmModal.classList.contains('on')) { dismissConfirm(); return true; } return false;
      case 'saveModal': if (saveModal.classList.contains('on')) { closeSaveModal(); return true; } return false;
      case 'chapModal': if (chapModal.classList.contains('on')) { closeChapModal(); return true; } return false;
      case 'install': if (installModal.classList.contains('on')) { installModal.classList.remove('on'); return true; } return false;
      case 'savedCategory': if (savedReaderOpen) { closeSavedReaderInternal(); return true; } return false;
      case 'reader': if (focused >= 0) { closeReaderInternal(); return true; } return false;
      case 'savedMode': if (savedMode) { setSavedMode(false); return true; } return false;
    }
    return false;
  }
  function fallbackBack() {
    if (closeAllMenusIfOpen()) return;
    const order = ['shareOverlay', 'confirm', 'saveModal', 'chapModal', 'install', 'savedCategory', 'reader', 'savedMode'];
    for (const id of order) { if (tryCloseLayer(id)) return; }
  }
  function onPopState() {
    if (suppressPop > 0) { suppressPop--; return; }
    while (navStack.length) {
      const id = navStack.pop();
      if (tryCloseLayer(id)) return;
    }
    const now = Date.now();
    if (lastRootBack && now - lastRootBack < 2500) {
      lastRootBack = 0;
      try { history.back(); } catch (e) {}
      return;
    }
    lastRootBack = now;
    if (historyUsable) { try { history.pushState({ PRISM: 'root' }, ''); } catch (e) { historyUsable = false; } }
    showToast(getUIText('toast_back_exit'));
  }
  addEventListener('popstate', onPopState);

  /* ============================================================
     PWA: install prompt + service worker
     ============================================================ */
  let deferredPrompt = null;
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; });
  addEventListener('appinstalled', () => { deferredPrompt = null; showToast('PRISM ✓'); });

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /android/i.test(navigator.userAgent);

  function installInstructions() {
    if (isIOS) return 'Install PRISM:<br><br>1. In <b>Safari</b>, tap <b>Share</b><br>2. Choose <b>"Add to Home Screen"</b><br>3. Tap <b>Add</b>';
    if (isAndroid) return 'Install PRISM:<br><br>1. Tap browser menu <b>⋮</b><br>2. Choose <b>"Install app"</b><br>3. Confirm';
    return 'Install PRISM:<br><br>1. Open browser menu <b>⋮</b><br>2. Choose <b>"Install PRISM"</b><br>3. Confirm';
  }

  installBtn.addEventListener('click', async () => {
    closeAllMenus();
    if (matchMedia('(display-mode: standalone)').matches || navigator.standalone) { showToast(getUIText('toast_install_already')); return; }
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const ch = await deferredPrompt.userChoice;
      deferredPrompt = null;
      showToast(ch && ch.outcome === 'accepted' ? getUIText('toast_install_installing') : getUIText('toast_install_dismissed'));
      return;
    }
    instText.innerHTML = installInstructions();
    if (!installModal.classList.contains('on')) navPush('install');
    installModal.classList.add('on');
  });
  instClose.addEventListener('click', () => uiBack());
  installModal.addEventListener('click', e => { if (e.target === installModal) uiBack(); });

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    addEventListener('load', async () => {
      try {
        const reg = await navigator.serviceWorker.register('./sw.js');
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener('statechange', () => {
            if (nw.state === 'installed' && navigator.serviceWorker.controller) {
              showToast(getUIText('toast_update_available'));
            }
          });
        });
      } catch (e) { console.warn('SW registration failed:', e); }
    });
  }

  /* ============================================================
     Settings menu & filters
     ============================================================ */
  settingsBtn.addEventListener('click', e => {
    e.stopPropagation();
    sres.classList.remove('on');
    settingsMenu.classList.toggle('on');
  });

  document.getElementById('openTranslationsBtn').addEventListener('click', e => {
    e.stopPropagation();
    settingsMenu.classList.remove('on');
    sres.classList.remove('on');
    vmList.innerHTML = '';
    mmenu.classList.toggle('on');
    if (mmenu.classList.contains('on')) {
      vSearch.value = '';
      renderVersionList();
      if (!narrow) setTimeout(() => vSearch.focus(), 50);
    }
  });

  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const newFilter = btn.dataset.f;
      if (savedMode) setSavedMode(false);
      tFilter = newFilter;
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.toggle('on', b.dataset.f === tFilter));
      applyFilter();
      updateTopBarStates();
      settingsMenu.classList.remove('on');
    });
  });

  /* ============================================================
     Saved mode (horizontal "library" view)
     ============================================================ */
  function setSavedMode(on) {
    if (savedMode === on) return;
    savedMode = on;
    if (on && tFilter === 'fav') {
      tFilter = 'all';
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.toggle('on', b.dataset.f === 'all'));
      applyFilter();
    }
    closeAllMenus();
    inlineEditState = null;
    if (on) {
      if (focused >= 0) { closeReaderInternal(); navInternalRemove('reader'); }
      savedReaderOpen = false; currentSavedCategory = null;
      restoreReaderUI();
      buildCategoryLibrary();
    } else {
      savedReaderOpen = false; currentSavedCategory = null;
      restoreReaderUI();
      if (BIBLE_BOOKS.length > 0) { BOOKS_DATA = BIBLE_BOOKS; buildLibrary(BIBLE_BOOKS); }
      navInternalRemove('savedMode');
      navInternalRemove('savedCategory');
    }
    updateTopBarStates();
  }
  function exitSavedModeSilent() { if (!savedMode) return; setSavedMode(false); }
  function getHorizontalState() {
    if (savedMode) return 'saved';
    if (tFilter === 'fav') return 'favorites';
    return 'home';
  }
  function getViewLoop() { return favs.size > 0 ? ['home', 'saved', 'favorites'] : ['home', 'saved']; }
  function clearSlideClasses() {
    B.forEach(b => { b.el.classList.remove('slide-in-left', 'slide-in-right', 'slide-out-left', 'slide-out-right'); b.el.style.removeProperty('--slide-delay'); });
  }
  function triggerHorizontalSlide(direction, newState) {
    if (stageAnimating) return;
    stageAnimating = true;
    closeAllMenus();
    hint.classList.add('gone');
    const STAGGER = 26, MAX_OFFSET = 3, OUT_DUR = 230, IN_DUR = 340;
    const outClass = direction > 0 ? 'slide-out-left' : 'slide-out-right';
    const inClass = direction > 0 ? 'slide-in-left' : 'slide-in-right';
    try {
      B.forEach(b => {
        if (b.pos < 0) return;
        const offset = Math.abs(b.pos - activePos);
        if (offset > MAX_OFFSET) return;
        b.el.style.setProperty('--slide-delay', ((MAX_OFFSET - offset) * STAGGER) + 'ms');
        b.el.classList.add(outClass);
      });
    } catch (err) { console.error(err); }
    const swapTime = MAX_OFFSET * STAGGER + OUT_DUR + 20;
    const cleanupTime = MAX_OFFSET * STAGGER + IN_DUR + 90;
    const failSafe = setTimeout(() => { stageAnimating = false; clearSlideClasses(); }, swapTime + cleanupTime + 700);
    setTimeout(() => {
      try {
        if (newState === 'saved') { if (!savedMode) setSavedMode(true); }
        else {
          if (savedMode) setSavedMode(false);
          tFilter = (newState === 'favorites') ? 'fav' : 'all';
          applyFilter();
        }
        document.querySelectorAll('.filter-btn').forEach(o => o.classList.toggle('on', o.dataset.f === tFilter));
        updateTopBarStates();
        B.forEach(b => b.el.classList.remove('slide-out-left', 'slide-out-right'));
        B.forEach(b => {
          if (b.pos < 0) return;
          const offset = Math.abs(b.pos);
          if (offset > MAX_OFFSET) return;
          b.el.style.setProperty('--slide-delay', (offset * STAGGER) + 'ms');
          b.el.classList.add(inClass);
        });
        setTimeout(() => { clearSlideClasses(); stageAnimating = false; clearTimeout(failSafe); }, cleanupTime);
      } catch (err) {
        console.error(err);
        clearSlideClasses(); stageAnimating = false; clearTimeout(failSafe);
      }
    }, swapTime);
  }
  function gotoViewState(target) {
    if (stageAnimating) return;
    const views = getViewLoop();
    const cur = getHorizontalState();
    let ci = views.indexOf(cur); if (ci < 0) ci = views.indexOf('home');
    let ti = views.indexOf(target); if (ti < 0) ti = 0;
    if (ci === ti) return;
    const n = views.length;
    const fwd = (ti - ci + n) % n;
    const direction = fwd <= n - fwd ? 1 : -1;
    triggerHorizontalSlide(direction, target);
  }

  /* ============================================================
     Save flow state & favorites
     ============================================================ */
  let currentSaveVerses = [];
  let currentSaveCategory = 'notes';
  let favs = STORAGE.favs;
  const saveFavs = () => STORAGE.saveFavs();

  /* ============================================================
     Library data
     ============================================================ */
  let BOOKS_DATA = [], BIBLE_BOOKS = [], B = [], V = [];
  let focused = -1, ge = 0, activeIdx = 0, activePos = 0, lastInfo = -1;
  let tFilter = 'all', manyMode = false, lastDotKey = '';
  let ghostEl = null;

  const testOf = bi => { const d = BOOKS_DATA[bi]; if (!d || d._isCategory) return 'OT'; return (d.test || '').startsWith('Old') ? 'OT' : 'NT'; };
  const passFilter = bi => { const d = BOOKS_DATA[bi]; if (d && d._isCategory) return true; if (tFilter === 'all') return true; if (tFilter === 'fav') return favs.has(bi); return testOf(bi) === tFilter; };
  const mod = U.mod;
  const clampScroll = v => infiniteLoop ? v : Math.max(0, Math.min((Math.max(1, V.length) - 1) * SP, v));
  function getDW(pos, u) {
    if (!infiniteLoop) return pos - u;
    const Vn = V.length; if (Vn <= 1) return 0;
    let d = (pos - u) % Vn;
    if (d > Vn / 2) d -= Vn;
    if (d < -Vn / 2) d += Vn;
    return d;
  }
  function nearestScrollForPos(pos) {
    if (!infiniteLoop) return clampScroll(pos * SP);
    const Vn = V.length, period = Vn * SP;
    if (Vn <= 1 || period <= 0) return 0;
    const base = pos * SP;
    const k = Math.round((scrollT - base) / period);
    return base + k * period;
  }
  function getCategory(i) {
    const d = BOOKS_DATA[i]; if (!d) return '';
    const n = typeof d.origNum === 'number' ? d.origNum : i + 1;
    if (n <= 5) return 'The Law'; if (n <= 17) return 'History'; if (n <= 22) return 'Poetry & Wisdom';
    if (n <= 39) return 'The Prophets'; if (n <= 43) return 'The Gospels'; if (n === 44) return 'Church History';
    if (n <= 65) return 'The Letters'; return 'Prophecy';
  }
  function normalizeBooks(list) {
    list.forEach((d, i) => {
      if (d._isCategory) return;
      const p = PAL[i % PAL.length]; d.ink = p.ink; d.art = p.art;
      if (typeof d.origNum !== 'number') d.origNum = i + 1;
      if (!d.test) d.test = i < 39 ? 'Old Testament' : 'New Testament';
      d.t = U.getBookTitle(i, currentVersion);
      const first = (d.ch && d.ch[0] && Array.isArray(d.ch[0].v) && d.ch[0].v[0]) ? String(d.ch[0].v[0]) : '';
      d.desc = first.slice(0, 110);
    });
  }
  function resetCardCache(b) { b.k1 = b.k2 = b.k3 = b.k4 = b.k5 = b.k6 = b.k7 = b.k8 = NaN; }

  /* ============================================================
     Sharing (delegates to share.js)
     ============================================================ */
  function openShareOverlay() { /* handled inside SHARE */ }
  function closeShareOverlay() { SHARE.close(); }

  function triggerVerseShareForBlocks(blocksToShare) {
    if (navigator.vibrate) navigator.vibrate(50);
    const d = BOOKS_DATA[focused];
    const c = d.ch[B[focused].cur];
    const versesText = [];
    blocksToShare.forEach(b => {
      const vi = parseInt(b.dataset.v, 10);
      versesText.push(`${vi + 1}. ${c.v[vi]}`);
    });
    SHARE.openWith({ bookName: d.t, chapterName: `Chapter ${c.n}`, versesText });
  }

  function triggerVerseShare(block) {
    if (navigator.vibrate) navigator.vibrate(50);
    let bookName = '', chapterName = '', versesText = [];
    if (block.classList.contains('verse-block')) {
      const selectedBlocks = rVerses.querySelectorAll('.verse-block.selected-verse');
      const blocksToShare = selectedBlocks.length > 0 ? selectedBlocks : [block];
      if (blocksToShare.length > 5) { showToast('Please select up to 5 verses to share'); return; }
      const d = BOOKS_DATA[focused];
      const c = d.ch[B[focused].cur];
      bookName = d.t; chapterName = `Chapter ${c.n}`;
      blocksToShare.forEach(b => {
        const vi = parseInt(b.dataset.v, 10);
        versesText.push(`${vi + 1}. ${c.v[vi]}`);
      });
    } else if (block.classList.contains('saved-item')) {
      const id = block.dataset.id;
      const item = savedScriptures.find(s => s.id === id);
      if (!item) return;
      bookName = (item.verses[0] && item.verses[0].bookName) || 'Saved Notes';
      chapterName = item.category || 'Notes';
      if (item.description) versesText.push(item.description);
      item.verses.forEach(v => versesText.push(`${v.bookName} ${v.chapterNum}:${v.verseNum} - "${v.text}"`));
    }
    SHARE.openWith({ bookName, chapterName, versesText });
  }

  /* ============================================================
     Book cards
     ============================================================ */
  function makeBook(d, i) {
    const el = document.createElement('article');
    const isFav = !d._isCategory && favs.has(i);
    el.className = 'book' + (isFav ? ' faved' : '') + (d._isCategory ? ' cat-card' : '');
    el.style.setProperty('--c-ink', d.ink);
    const verLabel = d._isCategory ? getUIText('category') : ((VERSIONS.find(v => v.id === currentVersion) || {}).label || currentVersion);
    const favStarHtml = !d._isCategory ? `<div class="book-fav-star${isFav ? ' is-fav' : ''}" data-book="${i}"><svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg></div>` : '';
    el.innerHTML = `<div class="pane" style="background:${d.art}">${favStarHtml}<span class="ptitle">${d.t}</span><span class="ctitle">${d.t}</span><span class="cver">${verLabel}</span></div>`;
    world.appendChild(el);
    const b = { el, i, pos: i, lp: i, vis: 1, tilt: 0, cur: 0, hover: 0, hoverT: 0, act: 0, press: 0, pressT: 0, dot: null, gonePrev: false, wasActive: false, tOn: false, prevOn: false };
    resetCardCache(b);
    el.addEventListener('pointerenter', () => { if (b.pos >= 0 && !isTouchDevice) b.hoverT = 1; });
    el.addEventListener('pointerleave', () => { b.hoverT = 0; clearTimeout(el._lpTimer); });
    const favStar = el.querySelector('.book-fav-star');
    if (favStar) {
      favStar.addEventListener('pointerdown', e => { e.stopPropagation(); }, { passive: true });
      favStar.addEventListener('pointerup', e => { e.stopPropagation(); }, { passive: true });
      favStar.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); toggleFavorite(parseInt(favStar.dataset.book, 10)); });
    }
    el.addEventListener('click', e => {
      if (el._isLongPress) { el._isLongPress = false; return; }
      if (e.target.closest('.book-fav-star')) return;
      if (stageAnimating || moved || b.pos < 0) return;
      if (savedMode && d._isCategory) openCategorySaved(d._catId);
      else if (!d._isCategory) { focused === i ? close() : open(i); }
    });
    return b;
  }

  function finishFavRemoval() {
    if (favs.size === 0) {
      tFilter = 'all';
      document.querySelectorAll('.filter-btn').forEach(o => o.classList.toggle('on', o.dataset.f === 'all'));
    }
    applyFilter();
    updateTopBarStates();
  }

  function toggleFavorite(bookIndex) {
    const wasFav = favs.has(bookIndex);
    if (wasFav) { favs.delete(bookIndex); showToast(getUIText('toast_removed_fav')); }
    else { favs.add(bookIndex); showToast(getUIText('toast_added_fav')); }
    saveFavs();
    B.forEach(b => {
      const star = b.el.querySelector('.book-fav-star');
      if (star && parseInt(star.dataset.book, 10) === bookIndex) star.classList.toggle('is-fav', favs.has(bookIndex));
      if (b.dot && !BOOKS_DATA[b.i]._isCategory) b.dot.classList.toggle('fav', favs.has(b.i));
    });
    if (focused >= 0 && focused === bookIndex) updateReaderFavStar();
    if (wasFav && tFilter === 'fav' && !savedMode) {
      const b = B[bookIndex];
      if (b && b.el) {
        b.el.classList.add('fav-out');
        setTimeout(() => { b.el.classList.remove('fav-out'); finishFavRemoval(); }, 380);
      } else finishFavRemoval();
      return;
    }
    updateFavFilter();
  }

  function updateReaderFavStar() {
    if (focused < 0 || savedMode || !BOOKS_DATA[focused] || BOOKS_DATA[focused]._isCategory) { rFavStar.style.display = 'none'; return; }
    rFavStar.style.display = '';
    rFavStar.classList.toggle('is-fav', favs.has(focused));
  }
  rFavStar.addEventListener('click', e => { e.stopPropagation(); if (focused < 0 || savedMode) return; toggleFavorite(focused); });

  function updateFavFilter() {
    const hasFavs = favs.size > 0;
    if (!hasFavs && tFilter === 'fav') {
      tFilter = 'all';
      document.querySelectorAll('.filter-btn').forEach(o => { o.classList.toggle('on', o.dataset.f === 'all'); });
      applyFilter();
    }
    updateTopBarStates();
  }

  function updateTopBarStates() {
    const hasFavs = favs.size > 0;
    favBtn.disabled = !hasFavs;
    favBtn.classList.toggle('disabled', !hasFavs);
    favBtn.classList.toggle('on', tFilter === 'fav' && hasFavs && !savedMode);
    saveLibBtn.classList.toggle('on', savedMode);
  }

  function updateTransBtnLabel() {
    const ver = VERSIONS.find(v => v.id === currentVersion);
    const el = document.getElementById('transBtnLabel');
    if (el) el.textContent = `Translations · ${ver ? ver.label : ''}`;
  }

  favBtn.addEventListener('click', e => {
    e.stopPropagation();
    if (favs.size === 0 || stageAnimating) return;
    closeAllMenus();
    if (getHorizontalState() === 'favorites') gotoViewState('home');
    else gotoViewState('favorites');
  });
  saveLibBtn.addEventListener('click', e => {
    e.stopPropagation();
    closeAllMenus();
    if (stageAnimating) return;
    if (savedMode) gotoViewState('home');
    else gotoViewState('saved');
  });

  function makeGhost() {
    ghostEl = document.createElement('article');
    ghostEl.className = 'book ghost';
    ghostEl.innerHTML = '<div class="pane"></div>';
    world.appendChild(ghostEl);
  }

  function updateSP() {
    const Vn = Math.max(1, V.length);
    SP = BH * SS * (narrow ? 0.58 : 0.52);
    fadeDist = Math.min(vh * .55, (Vn / 2) * SP * .95);
    CULL = 5;
  }

  function applyFilter() {
    V = B.filter(b => passFilter(b.i));
    if (sortAZ) V.sort((a, b) => BOOKS_DATA[a.i].t.localeCompare(BOOKS_DATA[b.i].t, undefined, { sensitivity: 'base' }));
    B.forEach(b => { b.pos = -1; b.dot = null; b.gonePrev = false; resetCardCache(b); });
    V.forEach((b, p) => { b.pos = p; b.lp = p; });
    dotsEl.innerHTML = '';
    if (!manyMode && !savedMode) {
      V.forEach((b, p) => {
        const dot = document.createElement('div');
        dot.className = 'dot' + ((!BOOKS_DATA[b.i]._isCategory && favs.has(b.i)) ? ' fav' : '');
        dot.addEventListener('click', () => { if (!BOOKS_DATA[b.i]._isCategory) open(b.i); });
        dotsEl.appendChild(dot);
        b.dot = dot;
      });
    }
    if (focused >= 0 && B[focused] && B[focused].pos < 0 && !savedReaderOpen) close();
    if (SS) updateSP();
    if (infiniteLoop && V.length && SP) {
      const period = V.length * SP;
      scroll = ((scroll % period) + period) % period;
      scrollT = scroll;
    } else { scrollT = clampScroll(scrollT); scroll = scrollT; }
    lastDotKey = '';
  }

  function buildLibrary(list) {
    world.innerHTML = ''; front.innerHTML = ''; dotsEl.innerHTML = '';
    B = []; V = []; focused = -1; lastInfo = -1; ge = 0;
    list.forEach((d, i) => B.push(makeBook(d, i)));
    makeGhost();
    manyMode = B.length > 15;
    dotsEl.style.display = (manyMode || savedMode) ? 'none' : 'flex';
    document.body.classList.toggle('many', manyMode);
    applyFilter();
    scroll = scrollT = 0; vel = 0; resize(); setInfo(0, true);
    if (narrow) requestAnimationFrame(() => { info.classList.remove('is-scrolling'); info.classList.add('visible'); });
  }

  function buildCategoryLibrary() {
    world.innerHTML = ''; front.innerHTML = ''; dotsEl.innerHTML = '';
    B = []; V = []; focused = -1; lastInfo = -1; ge = 0;
    const catData = [];
    CATEGORIES.forEach((cat, i) => {
      catData[i] = { t: cat.label, _catId: cat.id, _isCategory: true, art: cat.color, ink: '#fff', test: 'Saved', ch: [{ n: 1, title: 'Saved', v: [''] }], desc: 'Saved scriptures' };
    });
    BOOKS_DATA = catData;
    CATEGORIES.forEach((cat, i) => B.push(makeBook(BOOKS_DATA[i], i)));
    makeGhost(); manyMode = false; dotsEl.style.display = 'none'; applyFilter();
    scroll = scrollT = 0; vel = 0; resize();
    if (B[0]) setInfo(0, true);
  }

  /* ============================================================
     Reader
     ============================================================ */
  function renderReader(i) {
    const d = BOOKS_DATA[i], b = B[i];
    if (rTestament) rTestament.textContent = d.test || '';
    if (rBookTitle) rBookTitle.textContent = d.t;
    rBook.textContent = d.t; rTest.textContent = d.test || '';
    rChaps.innerHTML = d.ch.map((c, ci) => `<button class="chbtn${ci === b.cur ? ' on' : ''}" data-ci="${ci}"><span class="n">${c.n}</span><span class="t">${c.title}</span></button>`).join('');
    rChaps.querySelectorAll('.chbtn').forEach(btn => btn.addEventListener('click', () => {
      b.cur = +btn.dataset.ci; renderReader(i); rVerses.scrollTop = 0;
      setTimeout(() => { const on = rChaps.querySelector('.chbtn.on'); if (on) on.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 50);
    }));
    const c = d.ch[b.cur];
    let cleanTitle = c.title.replace(new RegExp(`^chapter\\s+${c.n}[\\s\\-–—:]*`, 'i'), '').trim();
    if (cleanTitle === '' || cleanTitle.toLowerCase() === 'chapter ' + c.n.toLowerCase()) cleanTitle = '';
    rVhead.textContent = `${getUIText('chapters')} ${c.n}${cleanTitle ? ' — ' + cleanTitle : ''}`;
    const cmpVer = activeCompareVersion ? VERSIONS.find(v => v.id === activeCompareVersion) : null;
    const cmpData = activeCompareVersion ? compareCache[activeCompareVersion] : null;
    const cmpBook = cmpData ? cmpData.find(bk => bk.origNum === d.origNum) : null;
    const cmpChap = cmpBook ? cmpBook.ch.find(ch => ch.n === c.n) : null;
    rVerses.innerHTML = c.v.map((v, vi) => {
      const verseNum = vi + 1;
      let cmpText = '';
      if (cmpChap && cmpChap.v[vi]) cmpText = `<div class="v-cmp"><span class="cmp-badge">${cmpVer.label.split('(')[0].trim()}</span>${cmpChap.v[vi]}</div>`;
      return `<div data-v="${vi}" class="verse-block"><sup>${verseNum}</sup><span class="v-primary">${v}</span>${cmpText}</div>`;
    }).join('');
    updateVerseHighlightUI(); updateReaderFavStar();
    rSave.classList.remove('show', 'saving');
    rNowTxt.textContent = `${getUIText('chapters')} ${b.cur + 1} / ${d.ch.length}`;
    rPrevC.toggleAttribute('disabled', b.cur <= 0); rNextC.toggleAttribute('disabled', b.cur >= d.ch.length - 1);
    const currentPos = B[i] ? B[i].pos : 0;
    const hasPrev = infiniteLoop ? V.length > 1 : currentPos > 0;
    const hasNext = infiniteLoop ? V.length > 1 : currentPos < V.length - 1;
    rPrevB.style.visibility = hasPrev ? 'visible' : 'hidden'; rPrevB.style.pointerEvents = hasPrev ? 'auto' : 'none';
    rNextB.style.visibility = hasNext ? 'visible' : 'hidden'; rNextB.style.pointerEvents = hasNext ? 'auto' : 'none';
    setTimeout(() => { const on = rChaps.querySelector('.chbtn.on'); if (on) on.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 100);
  }

  /* ============================================================
     Saved library rendering & inline editing
     ============================================================ */
  function buildNormalItemHtml(item, cat) {
    const versesHtml = item.verses.map(v => `<div class="si-verse"><sup>${v.verseNum || (v.verseIdx + 1)}</sup><span class="si-verse-text">${U.escapeHtml(v.text)}</span>${v.versionLabel ? `<span class="si-verse-version">${U.escapeHtml(v.versionLabel)}</span>` : ''}<div class="si-ref">${v.bookName} ${v.chapterNum || (v.chapterIdx + 1)}:${v.verseNum || (v.verseIdx + 1)}</div></div>`).join('');
    return `<div class="saved-item" data-id="${item.id}"><div class="si-meta"><span class="si-cat">${cat.label}</span></div><div class="si-desc">${U.escapeHtml(item.description || '')}</div>${versesHtml}<button class="si-menu" title="More"><svg viewBox="0 0 4 16"><circle cx="2" cy="2" r="1.7"/><circle cx="2" cy="8" r="1.7"/><circle cx="2" cy="14" r="1.7"/></svg></button><div class="si-dropdown"><button data-action="edit">Edit</button><button data-action="delete" class="danger">Delete</button></div></div>`;
  }

  function buildEditItemHtml(item) {
    const catLabel = (CATEGORIES.find(c => c.id === item.category) || {}).label || item.category;
    const versesHtml = inlineEditState.verses.map((v, i) => `<div class="sie-verse" data-idx="${i}"><div class="sie-handle" title="Drag"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg></div><div class="sie-verse-body"><sup>${v.verseNum || (v.verseIdx + 1)}</sup><span class="sie-verse-text">${U.escapeHtml(v.text)}</span>${v.versionLabel ? `<span class="si-verse-version">${U.escapeHtml(v.versionLabel)}</span>` : ''}<div class="si-ref">${v.bookName} ${v.chapterNum || (v.chapterIdx + 1)}:${v.verseNum || (v.verseIdx + 1)}</div></div><div class="sie-tools"><button class="sie-tool del" data-act="del" data-idx="${i}" title="Remove">✕</button></div></div>`).join('');
    return `<div class="saved-item editing" data-id="${item.id}"><div class="si-meta"><span class="si-cat">${U.escapeHtml(catLabel)}</span></div><textarea class="sie-desc" placeholder="${getUIText('description_notes')}">${U.escapeHtml(inlineEditState.description)}</textarea><div class="sie-verses">${versesHtml}</div><button class="sie-add-verse">${getUIText('add_verse')}</button><div class="sie-actions"><button class="modal-btn secondary sie-cancel">${getUIText('cancel')}</button><button class="modal-btn primary sie-save">${getUIText('save')}</button></div></div>`;
  }

  let editDragState = null; let editAutoScrollRAF = null;

  function updateEditPlaceholder(clientY) {
    if (!editDragState) return;
    const container = editDragState.originalParent;
    if (!container || !container.isConnected) return;
    const siblings = Array.from(container.querySelectorAll('.sie-verse:not(.dragging)'));
    const target = siblings.find(sib => {
      const r = sib.getBoundingClientRect();
      return clientY < r.top + r.height / 2;
    });
    if (target) container.insertBefore(editDragState.placeholder, target);
    else container.appendChild(editDragState.placeholder);
  }

  function editAutoScrollLoop() {
    if (!editDragState) { editAutoScrollRAF = null; return; }
    const sc = document.getElementById('rVerses');
    if (sc) {
      const rect = sc.getBoundingClientRect();
      const threshold = 70, speed = 12;
      const y = editDragState.lastY;
      if (y !== undefined) {
        if (y < rect.top + threshold && sc.scrollTop > 0) { sc.scrollTop -= speed; updateEditPlaceholder(y); }
        else if (y > rect.bottom - threshold && sc.scrollTop < sc.scrollHeight - sc.clientHeight) { sc.scrollTop += speed; updateEditPlaceholder(y); }
      }
    }
    editAutoScrollRAF = requestAnimationFrame(editAutoScrollLoop);
  }
  function stopEditAutoScroll() { if (editAutoScrollRAF) { cancelAnimationFrame(editAutoScrollRAF); editAutoScrollRAF = null; } }

  function wireEditItem(rootEl) {
    const desc = rootEl.querySelector('.sie-desc');
    desc.addEventListener('input', () => { inlineEditState.description = desc.value; });

    rootEl.querySelectorAll('.sie-tool').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const idx = +btn.dataset.idx, act = btn.dataset.act;
        if (act === 'del') { inlineEditState.verses.splice(idx, 1); renderSavedCategoryReader(currentSavedCategory); }
      });
    });

    rootEl.querySelectorAll('.sie-handle').forEach(handle => {
      handle.addEventListener('pointerdown', e => {
        e.preventDefault(); e.stopPropagation();
        const verseEl = handle.closest('.sie-verse');
        if (!verseEl) return;
        const rect = verseEl.getBoundingClientRect();
        const originalParent = verseEl.parentElement;
        editDragState = {
          el: verseEl, idx: parseInt(verseEl.dataset.idx, 10),
          offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top,
          lastX: e.clientX, lastY: e.clientY, startY: e.clientY, moved: false,
          placeholder: document.createElement('div'), originalParent
        };
        editDragState.placeholder.className = 'sie-placeholder';
        editDragState.placeholder.style.height = rect.height + 'px';
        originalParent.insertBefore(editDragState.placeholder, verseEl);
        document.body.appendChild(verseEl);
        verseEl.classList.add('dragging');
        verseEl.style.position = 'fixed';
        verseEl.style.left = rect.left + 'px';
        verseEl.style.top = rect.top + 'px';
        verseEl.style.width = rect.width + 'px';
        verseEl.style.margin = '0';
        verseEl.style.zIndex = '1000';
        verseEl.style.pointerEvents = 'none';
        try { handle.setPointerCapture(e.pointerId); } catch (err) {}
        stopEditAutoScroll();
        editAutoScrollRAF = requestAnimationFrame(editAutoScrollLoop);
      });

      handle.addEventListener('pointermove', e => {
        if (!editDragState || editDragState.el !== handle.closest('.sie-verse')) return;
        e.preventDefault();
        editDragState.lastX = e.clientX; editDragState.lastY = e.clientY;
        if (!editDragState.moved && Math.abs(e.clientY - editDragState.startY) > 4) editDragState.moved = true;
        if (editDragState.moved) {
          editDragState.el.style.top = (e.clientY - editDragState.offsetY) + 'px';
          editDragState.el.style.left = (e.clientX - editDragState.offsetX) + 'px';
          updateEditPlaceholder(e.clientY);
        }
      });

      const endEditDrag = () => {
        if (!editDragState || editDragState.el !== handle.closest('.sie-verse')) return;
        const verseEl = editDragState.el;
        stopEditAutoScroll();
        verseEl.classList.remove('dragging');
        verseEl.style.position = ''; verseEl.style.left = ''; verseEl.style.top = '';
        verseEl.style.width = ''; verseEl.style.margin = ''; verseEl.style.zIndex = ''; verseEl.style.pointerEvents = '';
        const placeholder = editDragState.placeholder;
        const container = editDragState.originalParent;
        if (editDragState.moved && placeholder && placeholder.isConnected) {
          container.insertBefore(verseEl, placeholder);
          placeholder.remove();
          const newVerses = [];
          container.querySelectorAll('.sie-verse').forEach(el => {
            const oi = parseInt(el.dataset.idx, 10);
            if (!isNaN(oi) && inlineEditState.verses[oi]) newVerses.push(inlineEditState.verses[oi]);
          });
          inlineEditState.verses = newVerses;
          editDragState = null;
          renderSavedCategoryReader(currentSavedCategory);
        } else {
          if (placeholder && placeholder.isConnected) { container.insertBefore(verseEl, placeholder); placeholder.remove(); }
          else if (container) container.appendChild(verseEl);
          editDragState = null;
        }
      };
      handle.addEventListener('pointerup', endEditDrag);
      handle.addEventListener('pointercancel', endEditDrag);
    });

    rootEl.querySelector('.sie-add-verse').addEventListener('click', e => {
      e.stopPropagation();
      openPickerForInlineAdd(newVerses => {
        newVerses.forEach(nv => {
          if (!inlineEditState.verses.some(v => v.bookName === nv.bookName && v.chapterNum === nv.chapterNum && v.verseIdx === nv.verseIdx && v.versionId === nv.versionId)) {
            inlineEditState.verses.push(nv);
          }
        });
        renderSavedCategoryReader(currentSavedCategory);
      });
    });
    rootEl.querySelector('.sie-cancel').addEventListener('click', e => { e.stopPropagation(); cancelInlineEdit(); });
    rootEl.querySelector('.sie-save').addEventListener('click', e => { e.stopPropagation(); commitInlineEdit(); });
  }

  function enterInlineEdit(id) {
    const item = savedScriptures.find(s => s.id === id);
    if (!item) return;
    inlineEditState = { id, description: item.description || '', verses: item.verses.map(v => ({ ...v })), category: item.category };
    renderSavedCategoryReader(currentSavedCategory);
    setTimeout(() => {
      const el = rVerses.querySelector('.saved-item.editing');
      if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }, 50);
  }
  function commitInlineEdit() {
    if (!inlineEditState) return;
    const item = savedScriptures.find(s => s.id === inlineEditState.id);
    if (item) {
      item.description = inlineEditState.description;
      item.verses = inlineEditState.verses;
      item.updatedAt = Date.now();
      saveSavedScriptures();
    }
    inlineEditState = null;
    renderSavedCategoryReader(currentSavedCategory);
    showToast(getUIText('toast_updated'));
  }
  function cancelInlineEdit() { inlineEditState = null; renderSavedCategoryReader(currentSavedCategory); }

  function renderSavedCategoryReader(catId) {
    const cat = CATEGORIES.find(c => c.id === catId); if (!cat) return;
    document.body.classList.add('saved-reader');
    const items = savedScriptures.filter(s => s.category === catId);
    rBook.textContent = cat.label; rTest.textContent = 'Saved';
    if (rTestament) rTestament.textContent = 'Saved';
    if (rBookTitle) rBookTitle.textContent = cat.label;
    rChaps.innerHTML = ''; rNowTxt.textContent = '';
    rPrevC.style.display = 'none'; rNextC.style.display = 'none'; rNow.style.display = 'none';
    cmpBtn.style.display = 'none'; rSave.style.display = 'none'; rFavStar.style.display = 'none';
    rVhead.textContent = `${cat.label} — ${items.length}`;
    rPrevB.style.visibility = 'visible'; rPrevB.style.pointerEvents = 'auto';
    rNextB.style.visibility = 'visible'; rNextB.style.pointerEvents = 'auto';
    if (items.length === 0) {
      rVerses.innerHTML = `<div style="text-align: center; padding: 60px 20px; color: var(--muted);"><div style="font-size: 14px; font-weight: 600; margin-bottom: 6px;">${getUIText('no_verses_selected')}</div></div>`;
      return;
    }
    rVerses.innerHTML = items.map(item => inlineEditState && inlineEditState.id === item.id ? buildEditItemHtml(item) : buildNormalItemHtml(item, cat)).join('');
    rVerses.querySelectorAll('.saved-item:not(.editing)').forEach(el => {
      const id = el.dataset.id;
      const menu = el.querySelector('.si-menu');
      const dd = el.querySelector('.si-dropdown');
      menu.addEventListener('click', e => {
        e.stopPropagation();
        rVerses.querySelectorAll('.si-dropdown.on').forEach(d => { if (d !== dd) d.classList.remove('on'); });
        dd.classList.toggle('on');
      });
      dd.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          dd.classList.remove('on');
          const act = btn.dataset.action;
          if (act === 'edit') enterInlineEdit(id);
          else if (act === 'delete') confirmDelete(id, getUIText('confirm_delete_title'), getUIText('confirm_delete_msg'));
        });
      });
    });
    const editEl = rVerses.querySelector('.saved-item.editing');
    if (editEl) wireEditItem(editEl);
  }

  function restoreReaderUI() {
    document.body.classList.remove('saved-reader');
    cmpBtn.style.display = ''; rSave.style.display = 'none';
    rPrevC.style.display = ''; rNextC.style.display = ''; rNow.style.display = '';
    if (focused >= 0 && !savedMode) { rFavStar.style.display = ''; updateReaderFavStar(); }
  }
  function closeSiDropdowns() { rVerses.querySelectorAll('.si-dropdown.on').forEach(d => d.classList.remove('on')); }

  function dismissConfirm() { confirmModal.classList.remove('on'); cfConfirm.style.display = ''; navInternalRemove('confirm'); }
  function confirmDelete(id, title, msg) {
    cfTitle.textContent = title; cfMessage.textContent = msg;
    cfConfirm.style.display = ''; cfConfirm.textContent = getUIText('delete');
    if (!confirmModal.classList.contains('on')) navPush('confirm');
    confirmModal.classList.add('on');
    cfConfirm.onclick = () => {
      savedScriptures = savedScriptures.filter(s => s.id !== id);
      saveSavedScriptures();
      dismissConfirm();
      if (currentSavedCategory) renderSavedCategoryReader(currentSavedCategory);
      showToast(getUIText('toast_deleted'));
    };
    cfCancel.onclick = () => { uiBack(); };
  }

  /* ============================================================
     Open / close / navigate
     ============================================================ */
  function open(i, targetScroll) {
    if (savedMode && BOOKS_DATA[i] && BOOKS_DATA[i]._isCategory) { openCategorySaved(BOOKS_DATA[i]._catId); return; }
    const entering = focused === -1 && !savedReaderOpen;
    focused = i; vel = 0;
    scrollT = (targetScroll !== undefined ? targetScroll : nearestScrollForPos(B[i].pos));
    scroll = scrollT; lastInput = performance.now();
    if (entering) navPush('reader');
    closeAllMenus(); restoreReaderUI(); renderReader(i); rVerses.scrollTop = 0;
    hint.classList.add('gone');
    B.forEach(b => b.hoverT = 0);
  }

  function openCategorySaved(catId) {
    const entering = !savedReaderOpen;
    currentSavedCategory = catId; savedReaderOpen = true; inlineEditState = null;
    renderSavedCategoryReader(catId); rVerses.scrollTop = 0;
    hint.classList.add('gone');
    B.forEach(b => b.hoverT = 0);
    if (entering) navPush('savedCategory');
  }

  function closeReaderInternal() { focused = -1; vel = 0; closeChapModal(); }
  function closeSavedReaderInternal() { savedReaderOpen = false; currentSavedCategory = null; inlineEditState = null; restoreReaderUI(); }
  function close() { if (focused < 0) return; closeReaderInternal(); navInternalRemove('reader'); }

  function navBook(dir) {
    if (!V.length) return;
    if (savedMode && savedReaderOpen) {
      const catIds = CATEGORIES.map(c => c.id);
      const currentIdx = catIds.indexOf(currentSavedCategory);
      let newIdx = currentIdx + dir;
      if (newIdx < 0) newIdx = catIds.length - 1;
      if (newIdx >= catIds.length) newIdx = 0;
      openCategorySaved(catIds[newIdx]);
      const catBookIdx = B.findIndex(b => b.i === newIdx);
      if (catBookIdx >= 0 && V[catBookIdx]) {
        scrollT = clampScroll(catBookIdx * SP);
        scroll = scrollT;
      }
      return;
    }
    if (savedMode) return;
    if (focused === -1) {
      let raw = Math.round(scrollT / SP) + dir;
      if (!infiniteLoop) raw = Math.max(0, Math.min(V.length - 1, raw));
      scroll = scrollT = raw * SP; vel = 0; lastInput = performance.now();
      hint.classList.add('gone');
    } else {
      let raw = Math.round(scrollT / SP) + dir;
      if (!infiniteLoop) raw = Math.max(0, Math.min(V.length - 1, raw));
      const pos = infiniteLoop ? mod(raw, V.length) : raw;
      if (V[pos]) open(V[pos].i, raw * SP);
    }
  }

  function navChap(dir) {
    if (focused < 0 || savedMode) return;
    const b = B[focused], len = BOOKS_DATA[focused].ch.length;
    const nc = Math.max(0, Math.min(len - 1, b.cur + dir));
    if (nc === b.cur) return;
    b.cur = nc; renderReader(focused); rVerses.scrollTop = 0;
  }

  function openChapModal() {
    if (focused < 0 || savedMode) return;
    const d = BOOKS_DATA[focused], b = B[focused];
    cmTitle.textContent = `${d.t} — ${getUIText('chapters')}`;
    cmList.innerHTML = d.ch.map((c, ci) => `<button class="chbtn${ci === b.cur ? ' on' : ''}" data-ci="${ci}"><span class="n">${c.n}</span><span class="t">${c.title}</span></button>`).join('');
    cmList.querySelectorAll('.chbtn').forEach(btn => btn.addEventListener('click', () => {
      b.cur = +btn.dataset.ci; renderReader(focused); rVerses.scrollTop = 0; closeChapModal();
    }));
    if (!chapModal.classList.contains('on')) navPush('chapModal');
    chapModal.classList.add('on');
    requestAnimationFrame(() => { const on = cmList.querySelector('.on'); if (on) on.scrollIntoView({ block: 'center' }); });
  }
  function closeChapModal() {
    if (!chapModal.classList.contains('on')) return;
    chapModal.classList.remove('on');
    navInternalRemove('chapModal');
  }

  rNow.addEventListener('click', openChapModal);
  cmClose.addEventListener('click', () => uiBack());
  chapModal.querySelector('.cm-back').addEventListener('click', () => uiBack());
  rBack.addEventListener('click', () => uiBack());
  rPrevB.addEventListener('click', () => navBook(-1));
  rNextB.addEventListener('click', () => navBook(1));
  rPrevC.addEventListener('click', () => navChap(-1));
  rNextC.addEventListener('click', () => navChap(1));

  /* ============================================================
     Verse selection, saving & sharing hooks
     ============================================================ */
  rClearSel.addEventListener('click', () => {
    rVerses.querySelectorAll('.verse-block.selected-verse').forEach(b => b.classList.remove('selected-verse'));
    updateVerseHighlightUI();
  });
  rSaveFoot.addEventListener('click', () => { rSave.click(); });
  rShareFoot.addEventListener('click', () => {
    const selectedBlocks = rVerses.querySelectorAll('.verse-block.selected-verse');
    if (selectedBlocks.length > 0 && selectedBlocks.length <= 5) triggerVerseShareForBlocks(selectedBlocks);
  });

  rSave.addEventListener('click', () => {
    if (focused < 0 || savedMode) return;
    const selectedBlocks = rVerses.querySelectorAll('.verse-block.selected-verse');
    if (selectedBlocks.length === 0) { showToast(getUIText('toast_add_verse')); return; }
    currentSaveVerses = [];
    const d = BOOKS_DATA[focused];
    const c = d.ch[B[focused].cur];
    const verLabel = (VERSIONS.find(v => v.id === currentVersion) || {}).label || currentVersion;
    const cmpVer = activeCompareVersion ? VERSIONS.find(v => v.id === activeCompareVersion) : null;
    const cmpData = activeCompareVersion ? compareCache[activeCompareVersion] : null;
    const cmpBook = cmpData ? cmpData.find(bk => bk.origNum === d.origNum) : null;
    const cmpChap = cmpBook ? cmpBook.ch.find(ch => ch.n === c.n) : null;
    selectedBlocks.forEach(block => {
      const vi = parseInt(block.dataset.v, 10);
      currentSaveVerses.push({ bookName: d.t, bookIdx: focused, origNum: d.origNum, chapterIdx: B[focused].cur, chapterNum: c.n, verseIdx: vi, verseNum: vi + 1, text: c.v[vi], versionId: currentVersion, versionLabel: verLabel });
      if (cmpChap && cmpChap.v[vi] !== undefined) {
        currentSaveVerses.push({ bookName: d.t, bookIdx: focused, origNum: d.origNum, chapterIdx: B[focused].cur, chapterNum: c.n, verseIdx: vi, verseNum: vi + 1, text: cmpChap.v[vi], versionId: activeCompareVersion, versionLabel: cmpVer ? cmpVer.label : activeCompareVersion });
      }
    });
    currentSaveCategory = 'notes';
    rSave.classList.add('saving');
    setTimeout(() => openSaveModal(''), 240);
  });

  /* long-press → share */
  rVerses.addEventListener('pointerdown', e => {
    const block = e.target.closest('.verse-block, .saved-item');
    if (!block) return;
    clearTimeout(block._lpTimer);
    block._lpTimer = setTimeout(() => {
      rVerses._isLongPress = true;
      triggerVerseShare(block);
    }, 600);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(evt => {
    rVerses.addEventListener(evt, e => {
      const block = e.target.closest('.verse-block, .saved-item');
      if (block) clearTimeout(block._lpTimer);
    });
  });

  rVerses.addEventListener('click', e => {
    if (rVerses._isLongPress) { rVerses._isLongPress = false; return; }
    if (savedMode) return;
    const block = e.target.closest('.verse-block');
    if (!block || e.target.closest('.si-menu') || e.target.closest('.si-dropdown')) return;
    block.classList.toggle('selected-verse');
    updateVerseHighlightUI();
  });

  function updateVerseHighlightUI() {
    const allBlocks = rVerses.querySelectorAll('.verse-block');
    const selected = rVerses.querySelectorAll('.verse-block.selected-verse');
    if (selected.length) {
      allBlocks.forEach(b => b.classList.toggle('dimmed', !b.classList.contains('selected-verse')));
      rFootActions.classList.add('show');
      rShareFoot.disabled = selected.length > 5;
      if (selected.length > 5) {
        rShareFoot.title = 'Max 5 verses for sharing';
        rShareFoot.style.opacity = '0.4';
        rShareFoot.style.pointerEvents = 'none';
      } else {
        rShareFoot.title = 'Share';
        rShareFoot.style.opacity = '';
        rShareFoot.style.pointerEvents = '';
      }
    } else {
      allBlocks.forEach(b => b.classList.remove('dimmed'));
      rFootActions.classList.remove('show');
    }
    rSave.classList.remove('show', 'saving');
  }

  function setInfo(i, force) {
    if (i === lastInfo && !force) return;
    lastInfo = i;
    const d = BOOKS_DATA[i]; if (!d) return;
    if (d._isCategory) {
      infoT.textContent = d.t;
      const count = savedScriptures.filter(s => s.category === d._catId).length;
      infoD.textContent = `${count} ${getUIText('selected_verses').toLowerCase()}`;
      infoM.innerHTML = `${getUIText('category')}<span class="cat">Tap to view</span>`;
      return;
    }
    const cat = getCategory(i);
    infoT.textContent = d.t;
    infoD.textContent = d.desc || (d.ch[0].v[0] || '').slice(0, 110);
    const chapWord = d.ch.length === 1 ? getUIText('chapters').toLowerCase() : getUIText('chapters').toLowerCase() + 's';
    infoM.innerHTML = `${d.test} · ${d.ch.length} ${chapWord}` + (favs.has(i) ? ' · <span class="fv">★</span>' : '') + `<span class="cat">${cat}</span>`;
  }

  /* ============================================================
     Compare UI
     ============================================================ */
  cmpBtn.addEventListener('click', e => {
    e.stopPropagation();
    sres.classList.remove('on'); settingsMenu.classList.remove('on');
    const btnRect = cmpBtn.getBoundingClientRect();
    const menuWidth = Math.min(320, window.innerWidth * 0.85);
    let x = btnRect.left + btnRect.width / 2;
    x = Math.max(menuWidth / 2 + 8, Math.min(window.innerWidth - menuWidth / 2 - 8, x));
    document.documentElement.style.setProperty('--cmp-x', x + 'px');
    document.documentElement.style.setProperty('--cmp-y', (btnRect.bottom + 8) + 'px');
    cmpMenu.classList.toggle('on');
    if (cmpMenu.classList.contains('on')) {
      cmpSearch.value = '';
      renderCmpList();
      if (!narrow) setTimeout(() => cmpSearch.focus(), 50);
    }
  });
  cmpClear.addEventListener('click', e => {
    e.stopPropagation();
    activeCompareVersion = null; compareCache = {};
    cmpLabel.textContent = getUIText('compare');
    cmpClear.style.display = 'none'; cmpLoading.style.display = 'none';
    cmpBtn.classList.remove('on');
    if (focused >= 0) renderReader(focused);
  });

  /* ============================================================
     Translations menu — with forced download & offline status
     ============================================================ */
  async function refreshVersionStatuses() {
    versionStatus = await DATA.statuses(VERSIONS.map(v => v.id));
  }

  function setVersionRowState(verId, state, detail) {
    const tail = vmList.querySelector(`[data-tail="${verId}"]`);
    if (!tail) return;
    if (state === 'downloading') { tail.textContent = detail || 'downloading…'; tail.style.color = 'var(--ink)'; }
    else if (state === 'done') {
      const st = versionStatus[verId];
      tail.textContent = `✓ ${U.formatBytes(st && st.bytes) || 'saved'}`;
      tail.style.color = '';
    }
    else if (state === 'failed') { tail.textContent = 'failed — tap to retry'; tail.style.color = '#c4302b'; }
  }

  async function renderVersionList(filter = '') {
    const qf = U.fold(filter || '');
    vmList.innerHTML = '';
    if (!versionStatus || Object.keys(versionStatus).length === 0) await refreshVersionStatuses();

    VERSIONS.forEach(ver => {
      if (qf && !U.fold(ver.label).includes(qf) && !U.fold(ver.lang).includes(qf)) return;
      const btn = document.createElement('button');
      btn.className = 'fopt' + (ver.id === currentVersion ? ' on' : '');
      btn.dataset.v = ver.id;
      const st = versionStatus[ver.id] || { cached: false };
      const tailText = st.cached ? `✓ ${U.formatBytes(st.bytes) || 'saved'}` : 'tap to download';
      btn.innerHTML = `<span class="ck"><svg viewBox="0 0 10 10"><path d="M1.5 5.2 4 7.6 8.5 2.6"/></svg></span>${ver.label}<span class="tail" data-tail="${ver.id}">${tailText}</span>`;

      btn.addEventListener('click', async () => {
        if (ver.id === currentVersion) { mmenu.classList.remove('on'); return; }
        if (downloadingVersions.has(ver.id)) return;

        const status = versionStatus[ver.id];
        if (status && status.cached) {           // instant switch — already on device
          mmenu.classList.remove('on');
          await loadFull(ver.id);
          return;
        }

        // Forced download: the translation MUST be saved locally before switching
        downloadingVersions.add(ver.id);
        setVersionRowState(ver.id, 'downloading', 'downloading…');
        showToast(`Downloading ${ver.label}…`);
        try {
          await DATA.ensure(ver.id, msg => setVersionRowState(ver.id, 'downloading', msg));
          await refreshVersionStatuses();
          setVersionRowState(ver.id, 'done');
          downloadingVersions.delete(ver.id);
          mmenu.classList.remove('on');
          await loadFull(ver.id);                 // now resolves instantly from cache
        } catch (err) {
          console.error(err);
          downloadingVersions.delete(ver.id);
          setVersionRowState(ver.id, 'failed');
          showToast(getUIText('toast_load_fail'));
        }
      });
      vmList.appendChild(btn);
    });
  }

  vSearch.addEventListener('input', () => renderVersionList(vSearch.value));
  vmClose.addEventListener('click', () => mmenu.classList.remove('on'));

  /* ============================================================
     Compare list
     ============================================================ */
  function renderCmpList(filter = '') {
    const qf = U.fold(filter || '');
    cmpList.innerHTML = '';
    VERSIONS.forEach(ver => {
      if (ver.id === currentVersion) return;
      if (qf && !U.fold(ver.label).includes(qf) && !U.fold(ver.lang).includes(qf)) return;
      const btn = document.createElement('button');
      const isActive = activeCompareVersion === ver.id;
      btn.className = 'fopt' + (isActive ? ' on' : '');
      btn.dataset.cmp = ver.id;
      btn.innerHTML = `<span class="ck"><svg viewBox="0 0 10 10"><path d="M1.5 5.2 4 7.6 8.5 2.6"/></svg></span>${ver.label}<span class="tail">${ver.lang}</span>`;
      btn.addEventListener('click', () => {
        if (isActive) {
          activeCompareVersion = null; compareCache = {};
          cmpLabel.textContent = getUIText('compare');
          cmpClear.style.display = 'none'; cmpLoading.style.display = 'none';
          cmpBtn.classList.remove('on');
          if (focused >= 0) renderReader(focused);
        } else {
          activeCompareVersion = ver.id;
          cmpLabel.textContent = '...';
          cmpClear.style.display = 'none'; cmpLoading.style.display = 'inline-block';
          cmpBtn.classList.add('on');
          loadCompareVersion(ver.id);
        }
        cmpMenu.classList.remove('on');
      });
      cmpList.appendChild(btn);
    });
  }
  cmpSearch.addEventListener('input', () => renderCmpList(cmpSearch.value));
  cmpClose.addEventListener('click', () => cmpMenu.classList.remove('on'));

  async function loadCompareVersion(verId) {
    const ver = VERSIONS.find(v => v.id === verId);
    if (!ver) return;
    try {
      const { data } = await DATA.load(verId);     // also persisted for offline use
      compareCache[verId] = data;
      cmpLabel.textContent = ver.label.split('(')[0].trim();
      cmpLoading.style.display = 'none';
      cmpClear.style.display = 'inline';
      if (focused >= 0) renderReader(focused);
    } catch (e) {
      console.error(e);
      cmpLabel.textContent = getUIText('compare');
      cmpClear.style.display = 'none'; cmpLoading.style.display = 'none';
      cmpBtn.classList.remove('on');
      activeCompareVersion = null;
      showToast(getUIText('toast_load_fail'));
    }
  }

  /* ============================================================
     3D stage constants & variables
     ============================================================ */
  const BW = 640, BH = 430, TILT = 55, DEPTH = 3, PERS = 1600;
  const FRICTION = 0.0022, VMAX = 3.5;
  let CARD_WINDOW = 2.55, CARD_FADE = 1.8;
  let CULL = 5, fadeDist = 400, ghostOff = 280;
  let vw = 0, vh = 0, SS = .7, SP = 200, CY = 0, LIFT = 0, restC = 0, narrow = false, sideW = 0, baseCX = 0, stackOpenCX = 0, stackMulOpen = .6, infoLeft = 0, activeNudge = 0;
  let scroll = 0, scrollT = 0, vel = 0, lastInput = 0;
  let dragging = false, moved = false, lastY = 0, lastT = 0, activePointer = -1, startX = 0, startY = 0;
  let lastPointerActivity = 0, dragStartT = 0, dragStartScroll = 0;
  const clamp01 = U.clamp01;
  const lerp = U.lerp;

  function resize() {
    vw = innerWidth; vh = innerHeight; narrow = vw < 860;
    document.body.classList.toggle('narrow', narrow);
    const ss = narrow ? Math.min((vw * 0.78) / BW, (vh * 0.55) / BH, 0.65) : Math.min((vw * 0.62) / BW, (vh * 0.48) / BH, 0.74);
    SS = Math.max(narrow ? 0.45 : 0.34, ss);
    CY = vh * .5; LIFT = narrow ? vh * .02 : Math.min(90, vh * .03 + 15); restC = CY - LIFT;
    baseCX = narrow ? vw * .50 : vw * .44; activeNudge = 0;
    ghostOff = narrow ? vh * .36 : vh * .40;
    sideW = narrow ? 0 : Math.max(340, Math.min(vw * 0.32, 460));
    side.style.width = sideW + 'px'; reader.style.left = sideW + 'px';
    stackOpenCX = narrow ? -vw * .3 : Math.max(150, sideW * 0.5 - 22);
    let openFit = 0.8;
    if (!narrow && BW * SS > 0) {
      const maxActiveBoost = 1.28, shadowMargin = 110;
      openFit = (sideW - shadowMargin) / (BW * SS * maxActiveBoost);
    }
    stackMulOpen = narrow ? 0.80 : Math.max(0.34, Math.min(0.58, openFit));
    CARD_WINDOW = narrow ? 2.0 : 2.55;
    CARD_FADE = narrow ? 0.85 : 1.8;
    CULL = 5;
    updateSP();
    infoLeft = Math.min(vw - 360, baseCX + BW * SS * .62 + 20);
    info.style.left = infoLeft + 'px'; info.style.top = restC + 'px';
    B.forEach(resetCardCache);
    if (ghostEl) delete ghostEl.dataset.h;
  }
  addEventListener('resize', resize);

  /* ============================================================
     Input: wheel, drag, swipe, keyboard
     ============================================================ */
  addEventListener('wheel', e => {
    if (stageAnimating) return;
    if (e.target.closest('#reader,#sres,#top,#settingsMenu,#mmenu,#cmpMenu,#chapModal,.save-modal,.confirm-modal,#shareOverlay')) return;
    e.preventDefault();
    const d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    scrollT = clampScroll(scrollT + d);
    vel += d * .02;
    if (vel > VMAX) vel = VMAX; if (vel < -VMAX) vel = -VMAX;
    lastInput = performance.now();
    hint.classList.add('gone');
  }, { passive: false });

  function forceEndDrag() {
    dragging = false; activePointer = -1;
    document.body.classList.remove('dragging');
    B.forEach(b => { b.pressT = 0; });
    vel = 0;
  }
  addEventListener('blur', forceEndDrag);
  document.addEventListener('visibilitychange', () => { if (document.hidden) forceEndDrag(); });

  addEventListener('pointerdown', e => {
    if (stageAnimating) return;
    if (activePointer !== -1) {
      if (performance.now() - lastPointerActivity > 800) forceEndDrag();
      else return;
    }
    moved = false;
    if (e.target.closest('#reader,#sres,#top,#settingsMenu,#mmenu,#cmpMenu,#dots,#chapModal,.save-modal,.confirm-modal,#shareOverlay')) return;
    if (focused !== -1) return;
    activePointer = e.pointerId; dragging = true; vel = 0;
    lastY = e.clientY; lastT = performance.now(); lastPointerActivity = lastT;
    startX = e.clientX; startY = e.clientY; dragStartT = lastT; dragStartScroll = scrollT;
    B.forEach(b => b.hoverT = 0);
    document.body.classList.add('dragging');
  });

  addEventListener('pointermove', e => {
    if (!dragging || e.pointerId !== activePointer) return;
    const dy = e.clientY - lastY, now = performance.now(), dt = Math.max(8, now - lastT);
    lastPointerActivity = now;
    const tdx = e.clientX - startX, tdy = e.clientY - startY;
    if (!moved && (Math.abs(tdx) > 10 || Math.abs(tdy) > 10)) {
      moved = true;
      B.forEach(book => clearTimeout(book.el._lpTimer));
    }
    const horizDominant = Math.abs(tdx) > Math.abs(tdy) * 1.25 && Math.abs(tdx) > 20;
    if (!horizDominant) {
      scrollT = clampScroll(scrollT - dy);
      const rawVel = -dy / dt;
      vel = narrow ? (0.5 * vel + 0.5 * rawVel) : (0.75 * vel + 0.25 * rawVel);
      if (vel > VMAX) vel = VMAX; if (vel < -VMAX) vel = -VMAX;
    }
    lastY = e.clientY; lastT = now; lastInput = now;
    if (moved) hint.classList.add('gone');
  }, { passive: true });

  function endPointer(e) {
    if (!dragging || e.pointerId !== activePointer) return;
    dragging = false; activePointer = -1;
    document.body.classList.remove('dragging');
    B.forEach(b => { b.pressT = 0; });
    if (!moved) vel = 0;
    lastInput = performance.now();
    const dx = e.clientX - startX, dy = e.clientY - startY;
    const dur = performance.now() - dragStartT;
    const scDelta = Math.abs(scrollT - dragStartScroll);
    if (!stageAnimating && focused === -1 && !savedReaderOpen &&
        Math.abs(dx) > 84 && Math.abs(dx) > Math.abs(dy) * 2.1 && Math.abs(dy) < 70 &&
        dur < 650 && scDelta < SP * 0.6) {
      const views = getViewLoop();
      const cur = getHorizontalState();
      let ci = views.indexOf(cur); if (ci < 0) ci = views.indexOf('home');
      const ni = dx < 0 ? (ci - 1 + views.length) % views.length : (ci + 1) % views.length;
      const target = views[ni];
      if (target !== cur) triggerHorizontalSlide(dx < 0 ? 1 : -1, target);
    }
    setTimeout(() => moved = false, 0);
  }
  addEventListener('pointerup', endPointer, { passive: true });
  addEventListener('pointercancel', endPointer, { passive: true });

  function closeAllMenus() {
    sres.classList.remove('on'); settingsMenu.classList.remove('on');
    mmenu.classList.remove('on'); cmpMenu.classList.remove('on');
  }
  function closeAllMenusIfOpen() {
    const open = [sres, settingsMenu, mmenu, cmpMenu].filter(m => m.classList.contains('on'));
    if (!open.length) return false;
    open.forEach(m => m.classList.remove('on'));
    return true;
  }

  document.addEventListener('click', e => {
    if (!e.target.closest('#sres,#top')) sres.classList.remove('on');
    if (!e.target.closest('#settingsMenu,#settingsBtn')) settingsMenu.classList.remove('on');
    if (!e.target.closest('#mmenu,#openTranslationsBtn')) mmenu.classList.remove('on');
    if (!e.target.closest('#cmpMenu,#cmpBtn')) cmpMenu.classList.remove('on');
    closeSiDropdowns();
    if (!e.target.closest('#vpVersionSelect')) { vpSelectList.classList.remove('on'); vpSelectBtn.classList.remove('open'); }
  });

  addEventListener('keydown', e => {
    const ae = document.activeElement;
    const isTyping = ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA');
    if (isTyping) {
      if (e.key === 'Escape') { ae.blur(); closeAllMenusIfOpen(); }
      return;
    }
    if (e.key === 'Escape') {
      if (closeAllMenusIfOpen()) return;
      if (navStack.length > 0) uiBack();
      return;
    }
    if (e.key === '`') {
      e.preventDefault();
      const anyModal = saveModal.classList.contains('on') || confirmModal.classList.contains('on') || chapModal.classList.contains('on') || installModal.classList.contains('on');
      if (anyModal || stageAnimating) return;
      if (savedMode) gotoViewState('home'); else gotoViewState('saved');
      return;
    }
    if (savedReaderOpen) {
      if (e.key === 'PageUp') { e.preventDefault(); navBook(-1); }
      if (e.key === 'PageDown') { e.preventDefault(); navBook(1); }
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const items = rVerses.querySelectorAll('.saved-item');
        if (items.length === 0) return;
        let currentV = -1;
        items.forEach((v, i) => { if (v.classList.contains('selected-saved')) currentV = i; });
        if (currentV === -1) currentV = e.key === 'ArrowDown' ? -1 : items.length;
        let nextV = currentV + (e.key === 'ArrowDown' ? 1 : -1);
        nextV = Math.max(0, Math.min(items.length - 1, nextV));
        items.forEach(v => v.classList.remove('selected-saved'));
        items[nextV].classList.add('selected-saved');
        items[nextV].scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
      return;
    }
    if (savedMode && !savedReaderOpen) {
      if (e.key === 'ArrowUp' || e.key === 'PageUp') { e.preventDefault(); hint.classList.add('gone'); lastInput = performance.now(); scrollT = clampScroll(scrollT - SP); vel = 0; }
      if (e.key === 'ArrowDown' || e.key === 'PageDown') { e.preventDefault(); hint.classList.add('gone'); lastInput = performance.now(); scrollT = clampScroll(scrollT + SP); vel = 0; }
      if (e.key === 'Enter') { e.preventDefault(); if (V[activePos] && BOOKS_DATA[V[activePos].i] && BOOKS_DATA[V[activePos].i]._isCategory) openCategorySaved(BOOKS_DATA[V[activePos].i]._catId); }
      return;
    }
    if (focused >= 0 && !savedMode) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); navChap(-1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); navChap(1); }
      if (e.key === 'PageUp') { e.preventDefault(); navBook(-1); }
      if (e.key === 'PageDown') { e.preventDefault(); navBook(1); }
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const verses = rVerses.querySelectorAll('.verse-block');
        if (verses.length === 0) return;
        let currentV = -1;
        verses.forEach((v, i) => { if (v.classList.contains('selected-verse')) currentV = i; });
        if (currentV === -1) currentV = e.key === 'ArrowDown' ? -1 : verses.length;
        let nextV = currentV + (e.key === 'ArrowDown' ? 1 : -1);
        nextV = Math.max(0, Math.min(verses.length - 1, nextV));
        if (!e.shiftKey) verses.forEach(v => v.classList.remove('selected-verse'));
        verses[nextV].classList.toggle('selected-verse');
        updateVerseHighlightUI();
        verses[nextV].scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    } else if (!savedReaderOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault(); hint.classList.add('gone'); lastInput = performance.now();
        const dir = e.key === 'ArrowDown' ? 1 : -1;
        scrollT = clampScroll(scrollT + dir * SP); vel = 0;
      }
      if (e.key === 'PageUp' || e.key === 'PageDown') {
        e.preventDefault(); hint.classList.add('gone');
        navBook(e.key === 'PageDown' ? 1 : -1);
      }
    }
    if (e.key === 'Enter' && focused === -1 && V[activePos]) open(V[activePos].i);
  });

  /* ============================================================
     Search
     ============================================================ */
  let qTimer = 0;
  q.addEventListener('input', () => { clearTimeout(qTimer); qTimer = setTimeout(() => { exitSavedModeSilent(); runSearch(); }, 120); });
  q.addEventListener('focus', () => { if (q.value.trim().length > 1) runSearch(); });

  function runSearch() {
    const qf = U.fold(q.value.trim());
    if (qf.length < 2) { sres.classList.remove('on'); return; }
    const data = BIBLE_BOOKS.length > 0 ? BIBLE_BOOKS : BOOKS_DATA.filter(d => !d._isCategory);
    const pass = d => {
      if (!d || d._isCategory) return false;
      if (tFilter === 'all') return true;
      if (tFilter === 'fav') { const idx = data.indexOf(d); return idx >= 0 && favs.has(idx); }
      return ((d.test || '').startsWith(tFilter === 'OT' ? 'Old' : 'New'));
    };
    const out = [];
    for (let bi = 0; bi < data.length && out.length < 4; bi++) {
      const d = data[bi];
      if (pass(d) && U.fold(d.t).includes(qf)) out.push({ type: 'book', bi, label: d.t, kind: 'book', sub: `${d.test || ''} · ${d.ch.length} ${getUIText('chapters').toLowerCase()}` });
    }
    for (let bi = 0; bi < data.length && out.length < 8; bi++) {
      const d = data[bi]; if (!pass(d)) continue;
      for (let ci = 0; ci < d.ch.length && out.length < 8; ci++) {
        const c = d.ch[ci];
        if (/^\s*chapter\s*\d+\s*$/i.test(c.title)) continue;
        if (U.fold(c.title).includes(qf)) out.push({ type: 'chap', bi, ci, label: `${d.t} ${c.n}`, kind: 'chapter', sub: c.title });
      }
    }
    outer:
    for (let bi = 0; bi < data.length; bi++) {
      const d = data[bi]; if (!pass(d) || !d.ch) continue;
      for (let ci = 0; ci < d.ch.length; ci++) {
        const c = d.ch[ci]; if (!c.v) continue;
        for (let vi = 0; vi < c.v.length; vi++) {
          if (out.length >= 14) break outer;
          const text = c.v[vi] || '';
          const ref = `${d.t} ${c.n}:${vi + 1}`;
          if (U.fold(text).includes(qf) || U.fold(ref).includes(qf)) {
            out.push({ type: 'verse', bi, ci, vi, label: ref, kind: 'verse', sub: text });
          }
        }
      }
    }
    sres.innerHTML = out.length
      ? out.map((r, k) => `<button class="res" data-k="${k}"><b>${U.escapeHtml(r.label)}</b><span class="kind">${r.kind}</span><span>${U.escapeHtml(r.sub || '')}</span></button>`).join('')
      : `<div class="res"><span class="none">${getUIText('nothing_found')}</span></div>`;
    sres.classList.add('on');
    sres.querySelectorAll('.res[data-k]').forEach(btn => btn.addEventListener('click', () => {
      const r = out[+btn.dataset.k];
      sres.classList.remove('on'); q.blur(); exitSavedModeSilent();
      setTimeout(() => {
        if (!B[r.bi]) return;
        open(r.bi);
        if (r.type === 'chap') { B[r.bi].cur = r.ci; renderReader(r.bi); }
        if (r.type === 'verse') {
          B[r.bi].cur = r.ci; renderReader(r.bi);
          setTimeout(() => {
            const el = rVerses.querySelector(`.verse-block[data-v="${r.vi}"]`);
            if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1700); }
          }, 160);
        }
      }, 100);
    }));
  }

  /* ============================================================
     Splash & full-version loading
     ============================================================ */
  let splashReady = false;
  let dataReady = false;
  setTimeout(() => { splashReady = true; if (dataReady) hideSplash(); }, 2000);

  function hideSplash() {
    const splash = document.getElementById('splashScreen');
    if (splash && !splash.classList.contains('hidden')) splash.classList.add('hidden');
  }
  function showLoading(on, msg, submsg) {
    if (on) {
      loadingOverlay.classList.add('on');
      if (msg) loadingOverlay.querySelector('.msg').textContent = msg;
      if (submsg) loadingOverlay.querySelector('.submsg').textContent = submsg;
    } else loadingOverlay.classList.remove('on');
  }

  /**
   * Loads a translation (cache-first via PRISM_DATA), persists the
   * choice, and rebuilds the library.
   */
  async function loadFull(versionId) {
    const ver = VERSIONS.find(v => v.id === versionId) || VERSIONS[0];
    showLoading(true, getUIText('loading_scripture'), getUIText('fetching_data'));
    sub.textContent = `Loading ${ver.label}…`;
    world.style.opacity = '0'; front.style.opacity = '0';

    try {
      const { data, source, persisted } = await DATA.load(ver.id, {
        onStatus: msg => { loadingOverlay.querySelector('.submsg').textContent = msg; }
      });

      currentVersion = ver.id;
      STORAGE.setPref('version', currentVersion);   // ← persists across restarts

      normalizeBooks(data);
      BOOKS_DATA = data; BIBLE_BOOKS = data;
      buildLibrary(data);

      world.style.opacity = '1'; front.style.opacity = '1';
      showLoading(false);
      updateTransBtnLabel();
      refreshVersionStatuses().then(() => { if (mmenu.classList.contains('on')) renderVersionList(vSearch.value); });

      const size = versionStatus[ver.id] && versionStatus[ver.id].bytes;
      sub.textContent = `${data.length} books · ${ver.label} · ${source === 'cache' ? 'offline ready' : 'downloaded'}` + (size ? ` · ${U.formatBytes(size)}` : '');
      if (!persisted) showToast('Storage unavailable — this session only');

      dataReady = true;
      if (splashReady) hideSplash();
    } catch (e) {
      console.error('Bible load error:', e);
      showLoading(true);
      loadingOverlay.querySelector('.msg').textContent = 'Failed to Load';
      loadingOverlay.querySelector('.submsg').innerHTML =
        `${U.escapeHtml(e.message || 'Unknown error')}<br><br><button onclick="location.reload()" style="margin-top:12px;padding:10px 20px;border-radius:8px;border:0;background:var(--ink);color:#fff;cursor:pointer;font-weight:600">Retry</button>`;
      dataReady = true;
      if (splashReady) hideSplash();
    }
  }

  /* ============================================================
     Save modal & verse picker
     ============================================================ */
  function openSmOverlay() {
    if (!saveModal.classList.contains('on')) { navPush('saveModal'); saveModal.classList.add('on'); }
  }
  function closeSaveModal() {
    if (saveModal.classList.contains('on')) { saveModal.classList.remove('on'); navInternalRemove('saveModal'); }
    smContext = 'save'; smView = 'save'; pendingAddVerseCallback = null;
    currentSaveVerses = [];
    rSave.classList.remove('saving');
  }
  function showSmView(view) {
    smView = view;
    smViewSave.style.display = view === 'save' ? 'flex' : 'none';
    smViewPicker.style.display = view === 'picker' ? 'flex' : 'none';
    if (view === 'picker') renderPicker();
    updateSmNav();
  }
  function updateSmNav() {
    if (smView === 'save') { smNavBtn.innerHTML = ICON_CLOSE; smNavBtn.title = 'Close'; smTitle.textContent = getUIText('save_scripture'); }
    else { smNavBtn.innerHTML = ICON_BACK; smNavBtn.title = 'Back'; smTitle.textContent = pickerTitle(); }
  }
  function pickerTitle() {
    const list = vpCache[vpCurrentVersion] || BIBLE_BOOKS;
    if (vpState.step === 'books') return getUIText('choose_book');
    if (vpState.step === 'chapters') { const b = list[vpState.bookIdx]; return b ? b.t : getUIText('chapters'); }
    return getUIText('selected_verses');
  }
  function handleSmBack() {
    if (smView === 'picker') {
      if (vpState.step === 'verses') { vpState.step = 'chapters'; renderPicker(); }
      else if (vpState.step === 'chapters') { vpState.step = 'books'; renderPicker(); }
      else { if (smContext === 'save') showSmView('save'); else closeSaveModal(); }
    } else closeSaveModal();
  }
  smNavBtn.addEventListener('click', handleSmBack);
  saveModal.addEventListener('click', e => { if (e.target === saveModal) closeSaveModal(); });
  smCancel.addEventListener('click', () => closeSaveModal());

  function openSaveModal(desc = '') {
    smContext = 'save';
    smDesc.value = desc;
    const primaryVerLabel = (currentSaveVerses[0] && currentSaveVerses[0].versionLabel) || ((VERSIONS.find(v => v.id === currentVersion) || {}).label || currentVersion);
    smVersionLabel.textContent = primaryVerLabel;
    renderSaveVerses(); renderSaveCategories();
    openSmOverlay(); showSmView('save');
  }

  function renderSaveVerses() {
    smVerses.innerHTML = currentSaveVerses.map((v, i) => `<div class="sm-verse-item"><span class="ref">${v.bookName} ${v.chapterNum || (v.chapterIdx + 1)}:${v.verseNum || (v.verseIdx + 1)}</span><span class="txt">${U.escapeHtml((v.text || '').slice(0, 80))}</span><button class="remove" data-idx="${i}">×</button></div>`).join('');
    smVerses.querySelectorAll('.remove').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        currentSaveVerses.splice(parseInt(btn.dataset.idx, 10), 1);
        renderSaveVerses();
      });
    });
  }

  function renderSaveCategories() {
    smCats.innerHTML = CATEGORIES.map(cat => `<button class="sm-cat${currentSaveCategory === cat.id ? ' on' : ''}" data-cat="${cat.id}">${cat.label}</button>`).join('');
    smCats.querySelectorAll('.sm-cat').forEach(btn => {
      btn.addEventListener('click', () => { currentSaveCategory = btn.dataset.cat; renderSaveCategories(); });
    });
  }

  smSave.addEventListener('click', () => {
    if (currentSaveVerses.length === 0) { showToast(getUIText('toast_add_verse')); return; }
    savedScriptures.push({
      id: 'sv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      description: smDesc.value.trim(),
      category: currentSaveCategory,
      verses: [...currentSaveVerses],
      createdAt: Date.now()
    });
    saveSavedScriptures();
    closeSaveModal();
    showToast(getUIText('toast_saved'));
    if (focused >= 0 && !savedMode) {
      rVerses.querySelectorAll('.verse-block.selected-verse').forEach(b => b.classList.remove('selected-verse'));
      updateVerseHighlightUI();
    }
  });

  function resetPicker() {
    vpState = { step: 'books', bookIdx: null, chapIdx: null, selectedVerses: new Set() };
    vpCurrentVersion = currentVersion;
    buildTransDropdown();
    vpSelectLabel.textContent = (VERSIONS.find(v => v.id === vpCurrentVersion) || {}).label || vpCurrentVersion;
    updateTransActive();
  }

  function buildTransDropdown() {
    if (vpSelectList.children.length > 0) return;
    vpSelectList.innerHTML = VERSIONS.map(v => `<button type="button" class="vp-select-item${v.id === vpCurrentVersion ? ' on' : ''}" data-v="${v.id}"><span>${v.label}</span><span class="tail">${v.lang}</span></button>`).join('');
    vpSelectList.addEventListener('click', e => {
      e.stopPropagation();
      const item = e.target.closest('.vp-select-item');
      if (!item) return;
      vpSelectList.classList.remove('on');
      vpSelectBtn.classList.remove('open');
      loadVpVersion(item.dataset.v);
    });
  }
  function updateTransActive() {
    vpSelectList.querySelectorAll('.vp-select-item').forEach(it => it.classList.toggle('on', it.dataset.v === vpCurrentVersion));
  }
  vpSelectBtn.addEventListener('click', e => {
    e.stopPropagation();
    const isOpen = vpSelectList.classList.toggle('on');
    vpSelectBtn.classList.toggle('open', isOpen);
  });

  function renderPicker() {
    const bookList = vpCache[vpCurrentVersion] || (BIBLE_BOOKS.length > 0 ? BIBLE_BOOKS : BOOKS_DATA.filter(d => !d._isCategory));
    if (!bookList || !bookList.length) {
      vpBody.innerHTML = `<div style="text-align:center;padding:40px;color:var(--muted)">${getUIText('loading_books')}</div>`;
      updateSmNav();
      return;
    }
    updateSmNav();
    if (vpState.step === 'books') {
      vpBreadcrumb.innerHTML = `<span>${getUIText('all_books')}</span>`;
      vpConfirm.style.display = 'none';
      vpBody.innerHTML = `<div class="vp-books">${bookList.map((d, i) => `<button class="vp-book" data-bi="${i}">${d.t}<span class="test">${d.test || ''}</span></button>`).join('')}</div>`;
      vpBody.querySelectorAll('.vp-book').forEach(btn => btn.onclick = () => { vpState.bookIdx = +btn.dataset.bi; vpState.step = 'chapters'; renderPicker(); });
    } else if (vpState.step === 'chapters') {
      const book = bookList[vpState.bookIdx];
      if (!book) { vpState.step = 'books'; return renderPicker(); }
      vpBreadcrumb.innerHTML = `<span data-back="books">${getUIText('all_books')}</span><span class="sep">›</span><span style="cursor:default">${book.t}</span>`;
      vpConfirm.style.display = 'none';
      vpBody.innerHTML = `<div class="vp-chapters">${book.ch.map((c, ci) => `<button class="vp-chap" data-ci="${ci}">${c.n}</button>`).join('')}</div>`;
      vpBreadcrumb.querySelector('[data-back="books"]').onclick = () => { vpState.step = 'books'; renderPicker(); };
      vpBody.querySelectorAll('.vp-chap').forEach(btn => btn.onclick = () => { vpState.chapIdx = +btn.dataset.ci; vpState.step = 'verses'; renderPicker(); });
    } else {
      const book = bookList[vpState.bookIdx];
      if (!book || !book.ch[vpState.chapIdx]) { vpState.step = 'books'; return renderPicker(); }
      const chap = book.ch[vpState.chapIdx];
      vpBreadcrumb.innerHTML = `<span data-back="books">${getUIText('all_books')}</span><span class="sep">›</span><span data-back="chapters">${book.t}</span><span class="sep">›</span><span style="cursor:default">Ch. ${chap.n}</span>`;
      vpConfirm.style.display = '';
      vpConfirm.textContent = smContext === 'addVerse' ? getUIText('add_verse') : getUIText('confirm_selection');
      vpBody.innerHTML = `<div class="vp-verses">${chap.v.map((text, vi) => {
        const key = `${vpState.bookIdx}-${vpState.chapIdx}-${vi}`;
        const on = vpState.selectedVerses.has(key);
        return `<div class="vp-verse${on ? ' on' : ''}" data-key="${key}"><span class="num">${vi + 1}</span><span class="txt">${U.escapeHtml(text)}</span></div>`;
      }).join('')}</div>`;
      vpBreadcrumb.querySelector('[data-back="books"]').onclick = () => { vpState.step = 'books'; renderPicker(); };
      vpBreadcrumb.querySelector('[data-back="chapters"]').onclick = () => { vpState.step = 'chapters'; renderPicker(); };
      vpBody.querySelectorAll('.vp-verse').forEach(el => el.onclick = () => {
        const k = el.dataset.key;
        if (vpState.selectedVerses.has(k)) vpState.selectedVerses.delete(k);
        else vpState.selectedVerses.add(k);
        el.classList.toggle('on');
      });
    }
  }

  function collectPickerVerses() {
    const bookList = vpCache[vpCurrentVersion] || BIBLE_BOOKS;
    const book = bookList[vpState.bookIdx];
    if (!book || !book.ch[vpState.chapIdx]) return [];
    const chap = book.ch[vpState.chapIdx];
    const vpVer = VERSIONS.find(v => v.id === vpCurrentVersion);
    const verLabel = vpVer ? vpVer.label : vpCurrentVersion;
    const out = [];
    vpState.selectedVerses.forEach(key => {
      const vi = parseInt(key.split('-')[2], 10);
      out.push({ bookName: book.t, bookIdx: vpState.bookIdx, origNum: book.origNum, chapterIdx: vpState.chapIdx, chapterNum: chap.n, verseIdx: vi, verseNum: vi + 1, text: chap.v[vi], versionId: vpCurrentVersion, versionLabel: verLabel });
    });
    return out;
  }

  vpConfirm.addEventListener('click', () => {
    if (vpState.step !== 'verses') return;
    const newVerses = collectPickerVerses();
    if (smContext === 'save') {
      newVerses.forEach(nv => {
        if (!currentSaveVerses.some(v => v.bookName === nv.bookName && v.chapterNum === nv.chapterNum && v.verseIdx === nv.verseIdx && v.versionId === nv.versionId)) currentSaveVerses.push(nv);
      });
      renderSaveVerses();
      showSmView('save');
    } else {
      const cb = pendingAddVerseCallback;
      pendingAddVerseCallback = null;
      closeSaveModal();
      if (cb) cb(newVerses);
    }
  });

  smAddVerse.addEventListener('click', () => { smContext = 'save'; resetPicker(); showSmView('picker'); });
  function openPickerForInlineAdd(cb) { smContext = 'addVerse'; pendingAddVerseCallback = cb; resetPicker(); openSmOverlay(); showSmView('picker'); }

  async function loadVpVersion(verId) {
    vpSelectLabel.textContent = '...';
    if (vpCache[verId]) {
      vpCurrentVersion = verId;
      vpSelectLabel.textContent = (VERSIONS.find(v => v.id === verId) || {}).label || verId;
      updateTransActive(); renderPicker();
      return;
    }
    const ver = VERSIONS.find(v => v.id === verId);
    if (!ver) return;
    try {
      const { data } = await DATA.load(verId);    // also persisted for offline
      vpCache[verId] = data;
      vpCurrentVersion = verId;
      vpSelectLabel.textContent = ver.label;
      updateTransActive(); renderPicker();
    } catch (e) {
      console.error(e);
      vpSelectLabel.textContent = (VERSIONS.find(v => v.id === vpCurrentVersion) || {}).label || 'Failed';
      showToast(getUIText('toast_load_fail'));
    }
  }

  /* ============================================================
     UI language (i18n hook)
     ============================================================ */
  function applyUILanguage() {
    document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = getUIText(el.getAttribute('data-i18n')); });
    document.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = getUIText(el.getAttribute('data-i18n-ph')); });
    CATEGORIES.forEach(c => { c.label = c.id.charAt(0).toUpperCase() + c.id.slice(1); });
    renderSaveCategories();
    if (savedReaderOpen && currentSavedCategory) renderSavedCategoryReader(currentSavedCategory);
    if (BIBLE_BOOKS.length > 0) buildLibrary(BIBLE_BOOKS);
  }

  /* ============================================================
     Render loop
     ============================================================ */
  let prev = performance.now(), lastGeW = '';
  let frameErrLogged = false;

  function frame(now) {
    try { tick(now); }
    catch (err) { if (!frameErrLogged) { frameErrLogged = true; console.error('PRISM frame error:', err); } }
    requestAnimationFrame(frame);
  }

  function tick(now) {
    const dt = Math.min(48, now - prev); prev = now;
    const kF = 1 - Math.exp(-dt * .02), kH = 1 - Math.exp(-dt * .012), kV = 1 - Math.exp(-dt * .016);
    const kS = dragging ? (narrow ? (1 - Math.exp(-dt * 0.06)) : 0.85) : (1 - Math.exp(-dt * .025));
    const Vn = Math.max(1, V.length); const maxS = (Vn - 1) * SP;

    if (!dragging && focused === -1) {
      if (Math.abs(vel) > 0.002) {
        scrollT += vel * dt;
        if (!infiniteLoop) {
          if (scrollT < 0) { scrollT = 0; vel = 0; }
          else if (scrollT > maxS) { scrollT = maxS; vel = 0; }
        }
        vel *= Math.exp(-dt * FRICTION);
      }
      if (Math.abs(vel) < 0.2) {
        const target = Math.round(scrollT / SP) * SP;
        const diff = target - scrollT;
        if (Math.abs(diff) > 0.5) { scrollT += diff * (1 - Math.exp(-dt * 0.013)); vel = 0; }
        else { scrollT = target; vel = 0; }
      }
    }
    if (focused === -1 && !dragging && vel === 0 && (now - lastInput) > 260 && Math.abs(scrollT - scroll) < 6) {
      const target = Math.round(scroll / SP) * SP;
      scroll += (target - scroll) * (1 - Math.exp(-dt * .010));
      scrollT = scroll;
    }
    scroll += (scrollT - scroll) * kS;
    if (infiniteLoop && Vn > 1 && SP > 0) {
      const period = Vn * SP;
      if (Math.abs(scroll) > period * 10) {
        const shift = Math.floor(scroll / period) * period;
        scroll -= shift; scrollT -= shift;
      }
    }

    const u = scroll / SP;
    const rawActive = Math.round(u);
    activePos = infiniteLoop ? mod(rawActive, Vn) : Math.max(0, Math.min(Vn - 1, rawActive));
    activeIdx = V[activePos] ? V[activePos].i : 0;
    setInfo(activeIdx);

    if (dragging && moved && performance.now() - lastPointerActivity > 900) forceEndDrag();

    const readerShouldBeOpen = focused >= 0 || savedReaderOpen;
    if (!narrow) {
      const stackCenterPx = vw / 2;
      const readCenterPx = sideW / 2;
      const currentCenterPx = lerp(stackCenterPx, readCenterPx, ge);
      document.documentElement.style.setProperty('--menu-x', currentCenterPx + 'px');
      document.documentElement.style.setProperty('--menu-transform', 'translateX(-50%)');
      topbar.classList.toggle('read-mode', ge > 0.5);
      topbar.style.opacity = '1'; topbar.style.visibility = 'visible'; topbar.style.pointerEvents = 'auto';
    } else {
      document.documentElement.style.setProperty('--menu-x', '50%');
      document.documentElement.style.setProperty('--menu-transform', 'translateX(-50%)');
      topbar.style.opacity = (1 - ge).toFixed(3);
      topbar.style.visibility = ge > 0.5 ? 'hidden' : 'visible';
      topbar.style.pointerEvents = ge > 0.4 ? 'none' : '';
      topbar.classList.remove('read-mode');
    }

    if (narrow && ge < 0.1 && !savedReaderOpen) {
      const isScrolling = Math.abs(vel) > 0.05 || dragging || Math.abs(scrollT - scroll) > 0.5;
      if (isScrolling) {
        if (!info.classList.contains('is-scrolling')) { info.classList.add('is-scrolling'); info.classList.remove('visible'); }
      } else {
        if (!info.classList.contains('visible')) { info.classList.remove('is-scrolling'); info.classList.add('visible'); }
      }
    } else if (narrow && (ge >= 0.1 || savedReaderOpen)) {
      if (!info.classList.contains('is-scrolling')) { info.classList.remove('visible'); info.classList.add('is-scrolling'); }
    }

    ge += ((readerShouldBeOpen ? 1 : 0) - ge) * kF;
    if (ge < .001) ge = 0; if (ge > .999) ge = 1;
    const geW = ge.toFixed(3);
    if (geW !== lastGeW) {
      lastGeW = geW;
      if (!narrow) info.style.opacity = (1 - ge).toFixed(3); else info.style.opacity = '';
      dotsEl.style.opacity = (1 - ge).toFixed(3);
      dotsEl.style.pointerEvents = ge > .5 ? 'none' : '';
      side.style.opacity = ge.toFixed(3);
      side.style.visibility = ge <= .01 ? 'hidden' : 'visible';
      reader.style.opacity = geW;
      reader.style.transform = `translateX(${((1 - ge) * 46).toFixed(1)}px)`;
      reader.style.visibility = ge <= .01 ? 'hidden' : 'visible';
      reader.style.pointerEvents = ge > .6 ? 'auto' : 'none';
    }

    const dotKey = activeIdx + '|' + focused;
    if (dotKey !== lastDotKey) {
      lastDotKey = dotKey;
      B.forEach(b => { if (b.dot) b.dot.classList.toggle('on', b.i === (focused === -1 ? activeIdx : focused)); });
    }

    const stackCX = lerp(baseCX, stackOpenCX, ge);
    const stackMul = lerp(1, stackMulOpen, ge);
    const comp = lerp(1, .74, ge);
    const OX = vw / 2, OY = vh / 2;

    if (ghostEl && !ghostEl.dataset.h) { ghostEl.dataset.h = '1'; ghostEl.style.opacity = '0'; ghostEl.style.visibility = 'hidden'; }

    for (let i = 0; i < B.length; i++) {
      const b = B[i];
      const pos = b.pos >= 0 ? b.pos : b.lp;
      const dw = getDW(pos, u);
      const adw = Math.abs(dw);
      const filteredDone = (b.pos < 0 && b.vis < .02);
      const mustRender = adw <= CARD_WINDOW || i === activeIdx || i === focused;
      if (((!mustRender && adw > CULL) || filteredDone) && i !== activeIdx && i !== focused) {
        if (!b.gonePrev) { b.el.style.visibility = 'hidden'; b.gonePrev = true; }
        continue;
      }
      const wasGone = b.gonePrev; b.gonePrev = false;
      b.vis += (((b.pos >= 0) ? 1 : 0) - b.vis) * kV;
      const isActive = (i === activeIdx);
      const dist = Math.abs(dw);

      let op = dist <= CARD_WINDOW ? 1 : clamp01(1 - (dist - CARD_WINDOW) / CARD_FADE);
      op *= b.vis;
      if (isActive || i === focused) op = Math.max(op, b.vis);
      if (op <= .01 && !isActive && i !== focused) {
        if (!b.gonePrev) { b.el.style.visibility = 'hidden'; b.gonePrev = true; }
        continue;
      }

      if (isTouchDevice) b.hoverT = 0;
      b.hover += (b.hoverT - b.hover) * kH;
      if (!narrow) b.press += (b.pressT - b.press) * kH; else b.press = 0;
      b.act += ((isActive ? 1 : 0) - b.act) * kH;

      const tiltTarget = adw < .5 ? -10 : (dw < 0 ? -TILT : TILT);
      b.tilt += (tiltTarget - b.tilt) * kH;

      const tOn = !narrow || isActive || (Math.round(dw) === 1);
      const isPrev = dw < -0.35 && !isActive && i !== focused;
      if (isPrev !== b.prevOn) { b.prevOn = isPrev; b.el.classList.toggle('prev', isPrev); }

      const isActiveOrFocused = isActive || i === focused;
      const idleFreeze = narrow && readerShouldBeOpen;
      const idleAmount = idleFreeze ? 0 : (isActiveOrFocused ? 0.32 : (narrow ? 0 : 1));
      const mobileIdle = narrow ? 0 : 1;
      let idleFloatY = 0, idleSwayX = 0, idleRotY = 0, idleRotZ = 0, idleTilt = 0, idleBreath = 1;
      if (idleAmount > 0) {
        const ia = mobileIdle * idleAmount;
        const t1 = now * 0.00062 + i * 1.7;
        const t2 = now * 0.00045 + i * 2.1;
        const t3 = now * 0.00038 + i * 1.4;
        const t4 = now * 0.00031 + i * 1.9;
        idleFloatY = (Math.sin(t1) * 4.2 + Math.sin(t1 * 0.53 + 1.3) * 2.2) * ia;
        idleSwayX = (Math.sin(t2) * 5.0 + Math.sin(t2 * 0.67 + 0.7) * 2.6) * ia;
        idleRotY = (Math.sin(t3) * 1.6 + Math.sin(t2 * 0.8) * 0.7) * ia;
        idleRotZ = Math.sin(t4) * 0.55 * ia;
        idleTilt = Math.sin(now * 0.00026 + i * 2.2) * 1.4 * idleAmount;
        idleBreath = 1 + Math.sin(now * 0.0005 + i * 1.3) * (isActiveOrFocused ? 0.004 : 0.011) * idleAmount;
      }

      const proximity = clamp01(1 - Math.min(dist, 3.2) / 3.2);
      const minScale = narrow ? 0.86 : 0.72;
      const rangeScale = narrow ? 0.18 : 0.38;
      const activeBoost = (narrow ? 0.03 : 0.06) * b.act + (i === focused ? 0.02 : 0);
      const distanceScale = minScale + rangeScale * Math.pow(proximity, 1.55) + activeBoost;

      if (isActive !== b.wasActive) {
        b.wasActive = isActive;
        b.el.classList.toggle('is-active', isActive);
        const want = isActive ? front : world;
        if (b.el.parentElement !== want) want.appendChild(b.el);
      }
      if (tOn !== b.tOn) { b.tOn = tOn; b.el.classList.toggle('t-on', tOn); }

      const rawC = restC + dw * SP;
      const yC = CY + (rawC - CY) * comp + idleFloatY;
      const desX = stackCX + b.act * activeNudge + idleSwayX;
      const desY = yC;
      const s = SS * stackMul * distanceScale * idleBreath * (1 + .045 * b.hover - .02 * b.press);
      const zD = Math.max(0, Math.min(150, (4 - dw) * 16));
      const zL = 70 * b.hover + 70 * b.act;
      const z = zD + zL;
      const fD = (PERS - z) / PERS;
      const tx = (desX - OX) * fD;
      const ty = OY + (desY - OY) * fD - BH / 2;
      const rotX = b.tilt + idleTilt;

      const k1 = (tx * 8) | 0, k2 = (ty * 8) | 0, k3 = (z * 4) | 0, k4 = (rotX * 16) | 0,
            k5 = (idleRotY * 16) | 0, k6 = (idleRotZ * 16) | 0, k7 = (s * 4000) | 0, k8 = (op * 500) | 0;
      if (!wasGone && b.k1 === k1 && b.k2 === k2 && b.k3 === k3 && b.k4 === k4 && b.k5 === k5 && b.k6 === k6 && b.k7 === k7 && b.k8 === k8) continue;
      b.k1 = k1; b.k2 = k2; b.k3 = k3; b.k4 = k4; b.k5 = k5; b.k6 = k6; b.k7 = k7; b.k8 = k8;

      b.el.style.opacity = op.toFixed(3);
      b.el.style.visibility = 'visible';
      b.el.style.pointerEvents = (op < .35 || b.vis < .5) ? 'none' : '';
      b.el.style.transform = `translate3d(${tx.toFixed(2)}px, ${ty.toFixed(2)}px, ${z.toFixed(2)}px) rotateX(${rotX.toFixed(2)}deg) rotateY(${idleRotY.toFixed(2)}deg) rotateZ(${idleRotZ.toFixed(2)}deg) scale(${s.toFixed(4)})`;
    }
  }

  /* ============================================================
     Boot
     ============================================================ */
  function init() {
    SHARE.init({ navPush, navInternalRemove, showToast });
    registerServiceWorker();
    applyUILanguage();
    updateFavFilter();
    updateTopBarStates();
    updateTransBtnLabel();
    smNavBtn.innerHTML = ICON_CLOSE;
    refreshVersionStatuses();          // warm the "downloaded ✓" badges
    requestAnimationFrame(frame);
    loadFull(currentVersion);          // restores the saved translation choice
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();