/* ============================================================
   PRISM — share.js
   Generates shareable verse images (1080×1920 canvas) and
   manages the share overlay UI.
   ============================================================ */

window.PRISM_SHARE = (() => {

  const SHARE_W = 1080;
  const SHARE_H = 1920;

  let hooks = { navPush: () => {}, navInternalRemove: () => {}, showToast: () => {} };

  function init(h) { hooks = Object.assign(hooks, h); wireOverlay(); }

  /* ---------- drawing helpers ---------- */
  function drawPRISMLogo(ctx, x, y, r) {
    if (ctx.createConicGradient) {
      const grad = ctx.createConicGradient(Math.PI * 1.16, x, y);
      grad.addColorStop(0, '#7db4d8'); grad.addColorStop(0.25, '#e0608f');
      grad.addColorStop(0.5, '#c9a15a'); grad.addColorStop(0.75, '#8fb07a');
      grad.addColorStop(1, '#7db4d8');
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = '#c9a15a';
    }
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 4; ctx.stroke();
  }

  function drawFooter(ctx) {
    const y = 1720;
    ctx.fillStyle = '#1d1d1f';
    ctx.font = '600 36px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('PRISM', SHARE_W / 2, y);
    drawPRISMLogo(ctx, SHARE_W / 2, y + 80, 28);
  }

  /**
   * @param {string} bookName
   * @param {string} chapterName
   * @param {string[]} versesText  pre-formatted lines
   * @returns {{dataURL:string, warning:boolean}}
   */
  function generateVerseShareImage(bookName, chapterName, versesText) {
    const canvas = document.createElement('canvas');
    canvas.width = SHARE_W; canvas.height = SHARE_H;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, SHARE_W, SHARE_H);

    // Header (centered)
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#1d1d1f';
    ctx.font = '700 52px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(bookName, SHARE_W / 2, 240);
    ctx.font = '500 38px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = 'rgba(29,29,31,0.6)';
    ctx.fillText(chapterName, SHARE_W / 2, 310);

    const headerEndY = 360, footerStartY = 1680;
    const availableHeight = footerStartY - headerEndY;
    const marginX = 120, maxWidth = SHARE_W - marginX * 2;

    let fontSize = 42, lineHeight = 76, gapBetweenVerses = 40, warning = false;

    const getWrappedLines = text => {
      const words = text.split(' ');
      const lines = [];
      let currentLine = '';
      for (const word of words) {
        const testLine = currentLine === '' ? word : currentLine + ' ' + word;
        if (ctx.measureText(testLine).width > maxWidth && currentLine !== '') {
          lines.push(currentLine);
          currentLine = word;
          if (ctx.measureText(currentLine).width > maxWidth) {
            let charLines = [], charLine = '';
            for (const char of currentLine) {
              const testCharLine = charLine + char;
              if (ctx.measureText(testCharLine).width > maxWidth && charLine !== '') {
                charLines.push(charLine); charLine = char;
              } else charLine = testCharLine;
            }
            if (charLine) charLines.push(charLine);
            for (let i = 0; i < charLines.length - 1; i++) lines.push(charLines[i]);
            currentLine = charLines[charLines.length - 1] || '';
          }
        } else currentLine = testLine;
      }
      if (currentLine) lines.push(currentLine);
      return lines;
    };

    const calcHeight = () => {
      let h = 0;
      versesText.forEach((verseStr, idx) => {
        h += getWrappedLines(verseStr).length * lineHeight;
        if (idx < versesText.length - 1) h += gapBetweenVerses;
      });
      return h;
    };

    while (fontSize > 24) {
      ctx.font = `400 ${fontSize}px ui-serif, Georgia, serif`;
      if (calcHeight() <= availableHeight) break;
      fontSize -= 2; lineHeight -= 4; gapBetweenVerses -= 2;
    }
    if (calcHeight() > availableHeight) warning = true;

    ctx.textAlign = 'center';
    ctx.font = `400 ${fontSize}px ui-serif, Georgia, serif`;
    ctx.fillStyle = '#1d1d1f';
    let currentY = headerEndY + (availableHeight - calcHeight()) / 2;
    versesText.forEach((verseStr, idx) => {
      getWrappedLines(verseStr).forEach(line => {
        ctx.fillText(line, SHARE_W / 2, currentY);
        currentY += lineHeight;
      });
      if (idx < versesText.length - 1) currentY += gapBetweenVerses;
    });

    drawFooter(ctx);
    return { dataURL: canvas.toDataURL('image/png'), warning };
  }

  /* ---------- overlay ---------- */
  function openWith({ bookName, chapterName, versesText }) {
    const result = generateVerseShareImage(bookName, chapterName, versesText);
    if (result.warning) hooks.showToast('Warning: Text is long and may not fit perfectly on the card.');
    const overlay = document.getElementById('shareOverlay');
    const img = document.getElementById('shareImg');
    img.src = result.dataURL;
    overlay.classList.add('on');
    hooks.navPush('shareOverlay');
  }

  function close() {
    document.getElementById('shareOverlay').classList.remove('on');
    hooks.navInternalRemove('shareOverlay');
  }

  function wireOverlay() {
    const overlay = document.getElementById('shareOverlay');
    overlay.querySelector('.share-backdrop').addEventListener('click', close);
    overlay.querySelector('.share-close-btn').addEventListener('click', close);

    document.getElementById('shareSaveBtn').addEventListener('click', () => {
      const img = document.getElementById('shareImg');
      const link = document.createElement('a');
      link.download = 'PRISM-share.png';
      link.href = img.src;
      link.click();
      hooks.showToast('Image saved');
    });

    document.getElementById('shareNativeBtn').addEventListener('click', async () => {
      const img = document.getElementById('shareImg');
      try {
        const res = await fetch(img.src);
        const blob = await res.blob();
        const file = new File([blob], 'PRISM-share.png', { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: 'PRISM', text: 'PRISM' });
        } else {
          document.getElementById('shareSaveBtn').click();
          hooks.showToast('Native share not supported, image saved');
        }
      } catch (err) {
        hooks.showToast('Share cancelled or failed');
      }
    });
  }

  return { init, openWith, close, generateVerseShareImage };
})();