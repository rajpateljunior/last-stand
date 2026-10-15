// Renders the app icons from the game's emblem (skull in crosshairs on a shield, crossed rifles) over a dark red glow.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const src = ['core.js', 'data.js', 'art.js'].map((f) => fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8')).join('\n');
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const shots = [['icon-180.png', 180, 0], ['icon-192.png', 192, 0], ['icon-512.png', 512, 0], ['icon-maskable-512.png', 512, 1], ['favicon-64.png', 64, 0]];
  for (const [name, size, mask] of shots) {
    const p = await b.newPage({ viewport: { width: size, height: size } });
    const html = `<html><body style="margin:0;background:#000"><div id=i></div><script>${src}
      const emb = emblemSVG({ raw: true });
      const k = ${mask} ? 0.74 : 0.96;
      document.getElementById('i').innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 400 400">'+
      '<defs><radialGradient id="bgx" cx="50%" cy="45%" r="70%"><stop offset="0" stop-color="#4a0d0a"/><stop offset=".55" stop-color="#1a0605"/><stop offset="1" stop-color="#050505"/></radialGradient></defs>'+
      '<rect width="400" height="400" fill="url(#bgx)"/>'+
      '<g transform="translate(' + (200 - 200 * k) + ',' + (200 - 200 * k + 4) + ') scale(' + k + ')">' + emb + '</g></svg>';
    </script></body></html>`;
    await p.setContent(html); await p.waitForTimeout(150);
    await p.screenshot({ path: path.join(__dirname, '..', 'icons', name), clip: { x: 0, y: 0, width: size, height: size } });
    await p.close();
  }
  await b.close();
  console.log('icons written');
})();
