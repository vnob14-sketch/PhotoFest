const { BrowserWindow } = require('electron');

/**
 * Cetak gambar strip 5x15 cm.
 * opts.paper: 'strip'  -> kertas 50x150 mm (1 strip)
 *             'double' -> kertas 100x150 mm (4x6 inci), 2 strip berdampingan (potong tengah)
 * opts.silent: cetak langsung tanpa dialog. opts.name: nama printer ('' = bawaan)
 */
function printImage(buf, opts = {}) {
  const double = opts.paper === 'double';
  const pageW = double ? 100 : 50;
  const dataUrl = 'data:image/jpeg;base64,' + Buffer.from(buf).toString('base64');
  const img = `<img src="${dataUrl}">`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: ${pageW}mm 150mm; margin: 0; }
    html, body { margin: 0; padding: 0; width: ${pageW}mm; height: 150mm; background: #fff; }
    .row { display: flex; width: ${pageW}mm; height: 150mm; }
    img { width: 50mm; height: 150mm; display: block; }
  </style></head><body><div class="row">${img}${double ? img : ''}</div></body></html>`;

  return new Promise((resolve, reject) => {
    const w = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
    const done = (fn, v) => { try { w.destroy(); } catch {} fn(v); };
    w.webContents.once('did-fail-load', (_e, _c, desc) => done(reject, new Error('Gagal memuat halaman cetak: ' + desc)));
    w.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        w.webContents.print({
          silent: opts.silent !== false,
          deviceName: opts.name || '',
          printBackground: true,
          margins: { marginType: 'none' },
          pageSize: { width: pageW * 1000, height: 150 * 1000 },
          copies: Math.max(1, Math.min(20, Number(opts.copies) || 1)),
        }, (ok, reason) => (ok ? done(resolve, true) : done(reject, new Error('Cetak gagal: ' + (reason || 'printer tidak merespons')))));
      }, 400);
    });
    w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  });
}

module.exports = { printImage };
