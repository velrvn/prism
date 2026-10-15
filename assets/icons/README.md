# App icons

Add two PNG files here:

- `icon-192.png` — 192×192
- `icon-512.png` — 512×512 (also used as the maskable icon)

Both should show the PRISM conic-gradient circle on a `#f2f1ee` background.

Quick way to generate them: open `index.html` in a browser, paste this in the
console, and save the downloaded image as `icon-512.png` (then downscale to 192):

    const c = document.createElement('canvas'); c.width = c.height = 512;
    const x = c.getContext('2d');
    x.fillStyle = '#f2f1ee'; x.fillRect(0,0,512,512);
    const g = x.createConicGradient ? x.createConicGradient(Math.PI,256,256) : null;
    if (g) { g.addColorStop(0,'#7db4d8'); g.addColorStop(.25,'#e0608f'); g.addColorStop(.5,'#c9a15a'); g.addColorStop(.75,'#8fb07a'); g.addColorStop(1,'#7db4d8'); x.fillStyle = g; }
    x.beginPath(); x.arc(256,256,150,0,Math.PI*2); x.fill();
    x.strokeStyle='rgba(255,255,255,.9)'; x.lineWidth=10; x.stroke();
    const a = document.createElement('a'); a.download = 'icon-512.png'; a.href = c.toDataURL('image/png'); a.click();