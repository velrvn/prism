const SHARE_W = 1080, SHARE_H = 1920;

function drawPRISMLogo(ctx, x, y, r) {
    if (ctx.createConicGradient) { const grad = ctx.createConicGradient(Math.PI * 1.16, x, y); grad.addColorStop(0, '#7db4d8'); grad.addColorStop(0.25, '#e0608f'); grad.addColorStop(0.5, '#c9a15a'); grad.addColorStop(0.75, '#8fb07a'); grad.addColorStop(1, '#7db4d8'); ctx.fillStyle = grad; } else { ctx.fillStyle = '#c9a15a'; }
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 4; ctx.stroke();
}

function drawFooter(ctx) {
    ctx.fillStyle = '#1d1d1f'; ctx.font = '600 36px -apple-system, BlinkMacSystemFont, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('PRISM', SHARE_W / 2, 1720); drawPRISMLogo(ctx, SHARE_W / 2, 1800, 28);
}

export function generateVerseShareImage(bookName, chapterName, versesText) {
    const canvas = document.createElement('canvas'); canvas.width = SHARE_W; canvas.height = SHARE_H;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, SHARE_W, SHARE_H);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#1d1d1f';
    ctx.font = '700 52px -apple-system, BlinkMacSystemFont, sans-serif'; ctx.fillText(bookName, SHARE_W / 2, 240);
    ctx.font = '500 38px -apple-system, BlinkMacSystemFont, sans-serif'; ctx.fillStyle = 'rgba(29,29,31,0.6)'; ctx.fillText(chapterName, SHARE_W / 2, 310);
    const availableHeight = 1680 - 360, marginX = 120, maxWidth = SHARE_W - (marginX * 2);
    let fontSize = 42, lineHeight = 76, gapBetweenVerses = 40, warning = false;
    const getWrappedLines = (text) => {
        let words = text.split(' '), lines = [], currentLine = '';
        for (let n = 0; n < words.length; n++) {
            let word = words[n], testLine = currentLine === '' ? word : currentLine + ' ' + word;
            if (ctx.measureText(testLine).width > maxWidth && currentLine !== '') {
                lines.push(currentLine); currentLine = word;
                if (ctx.measureText(currentLine).width > maxWidth) {
                    let charLines = [], charLine = '';
                    for (let i = 0; i < currentLine.length; i++) {
                        let char = currentLine[i], testCharLine = charLine + char;
                        if (ctx.measureText(testCharLine).width > maxWidth && charLine !== '') { charLines.push(charLine); charLine = char; } else { charLine = testCharLine; }
                    }
                    if (charLine) charLines.push(charLine);
                    for (let i = 0; i < charLines.length - 1; i++) lines.push(charLines[i]);
                    currentLine = charLines[charLines.length - 1] || '';
                }
            } else { currentLine = testLine; }
        }
        if (currentLine) lines.push(currentLine); return lines;
    };
    const calcHeight = () => { let h = 0; versesText.forEach((verseStr, idx) => { h += getWrappedLines(verseStr).length * lineHeight; if (idx < versesText.length - 1) h += gapBetweenVerses; }); return h; };
    while (fontSize > 24) { ctx.font = `400 ${fontSize}px ui-serif, Georgia, serif`; if (calcHeight() <= availableHeight) break; fontSize -= 2; lineHeight -= 4; gapBetweenVerses -= 2; }
    if (calcHeight() > availableHeight) warning = true;
    ctx.textAlign = 'center'; ctx.font = `400 ${fontSize}px ui-serif, Georgia, serif`; ctx.fillStyle = '#1d1d1f';
    let currentY = 360 + (availableHeight - calcHeight()) / 2;
    versesText.forEach((verseStr, idx) => { getWrappedLines(verseStr).forEach(line => { ctx.fillText(line, SHARE_W / 2, currentY); currentY += lineHeight; }); if (idx < versesText.length - 1) currentY += gapBetweenVerses; });
    drawFooter(ctx);
    return { dataURL: canvas.toDataURL('image/png'), warning };
}
