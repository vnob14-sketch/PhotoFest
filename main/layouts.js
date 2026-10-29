const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { readJson, writeJson } = require('./util');

// Semua ukuran dalam milimeter. Kanvas = 50 x 150 mm (strip 5 x 15 cm).
const W = 50, H = 150;

function stack(n, top, h, gap) {
  return Array.from({ length: n }, (_, i) => ({ x: 4, y: top + i * (h + gap), w: 42, h }));
}

function defaults() {
  const txt = (text, y, size, color, extra = {}) => ({ text, x: 25, y, size, color, font: 'Poppins, Segoe UI, Arial', weight: '700', align: 'center', ...extra });
  return [
    { id: 'classic-3', name: 'Klasik 3 Foto', mode: 3, bgColor: '#ffffff', bgAsset: '', frameAsset: '',
      slots: stack(3, 4, 36, 3),
      texts: [txt('{event}', 124, 6, '#222222'), txt('{date}', 133, 3.2, '#777777', { weight: '400' })] },
    { id: 'dark-3', name: 'Gelap 3 Foto', mode: 3, bgColor: '#16151c', bgAsset: '', frameAsset: '',
      slots: stack(3, 4, 36, 3),
      texts: [txt('{event}', 124, 6, '#ff7a59'), txt('{date}', 133, 3.2, '#b9b7c4', { weight: '400' })] },
    { id: 'classic-2', name: 'Klasik 2 Foto', mode: 2, bgColor: '#ffffff', bgAsset: '', frameAsset: '',
      slots: stack(2, 4, 54, 4),
      texts: [txt('{event}', 124, 6.5, '#222222'), txt('{date}', 134, 3.2, '#777777', { weight: '400' })] },
    { id: 'peach-2', name: 'Peach 2 Foto', mode: 2, bgColor: '#ffd9c7', bgAsset: '', frameAsset: '',
      slots: stack(2, 6, 52, 6),
      texts: [txt('{event}', 126, 6.5, '#b3432a'), txt('{date}', 135, 3.2, '#b3432a', { weight: '400' })] },
  ];
}

class Layouts {
  constructor(userDir) {
    this.file = path.join(userDir, 'layouts.json');
    this.assetDir = path.join(userDir, 'assets');
  }
  list() {
    let data = readJson(this.file, null);
    if (!data) { data = { layouts: defaults() }; writeJson(this.file, data); }
    return data.layouts;
  }
  save(layout) {
    const all = this.list();
    layout = this._clean(layout);
    const i = all.findIndex((l) => l.id === layout.id);
    if (i >= 0) all[i] = layout; else all.push(layout);
    writeJson(this.file, { layouts: all });
    return layout;
  }
  remove(id) {
    const all = this.list();
    const target = all.find((l) => l.id === id);
    if (!target) return;
    if (all.filter((l) => l.mode === target.mode).length <= 1) throw new Error('Minimal harus ada 1 layout untuk tiap mode');
    writeJson(this.file, { layouts: all.filter((l) => l.id !== id) });
  }
  reset() { writeJson(this.file, { layouts: defaults() }); return this.list(); }

  _clean(l) {
    const mode = Number(l.mode) === 2 ? 2 : 3;
    const num = (v, d) => (Number.isFinite(+v) ? +v : d);
    const slots = (l.slots || []).slice(0, mode).map((s) => ({
      x: num(s.x, 0), y: num(s.y, 0), w: Math.max(5, num(s.w, 20)), h: Math.max(5, num(s.h, 20)),
    }));
    while (slots.length < mode) slots.push({ x: 4, y: 4 + slots.length * 40, w: 42, h: 36 });
    return {
      id: l.id || crypto.randomBytes(5).toString('hex'),
      name: String(l.name || 'Layout baru').slice(0, 40),
      mode,
      bgColor: /^#[0-9a-f]{3,8}$/i.test(l.bgColor) ? l.bgColor : '#ffffff',
      bgAsset: String(l.bgAsset || ''),
      frameAsset: String(l.frameAsset || ''),
      slots,
      texts: (l.texts || []).slice(0, 12).map((t) => ({
        text: String(t.text || '').slice(0, 80), x: num(t.x, W / 2), y: num(t.y, H - 10), size: Math.max(1, num(t.size, 5)),
        color: t.color || '#000000', font: t.font || 'Poppins, Segoe UI, Arial', weight: String(t.weight || '700'),
        align: ['left', 'center', 'right'].includes(t.align) ? t.align : 'center',
      })),
    };
  }

  putAsset(buf, ext = 'png') {
    ext = String(ext).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'png';
    fs.mkdirSync(this.assetDir, { recursive: true });
    const name = crypto.randomBytes(8).toString('hex') + '.' + ext;
    fs.writeFileSync(path.join(this.assetDir, name), Buffer.from(buf));
    return name;
  }
  getAsset(name) {
    const safe = path.basename(String(name || ''));
    const p = path.join(this.assetDir, safe);
    if (!safe || !fs.existsSync(p)) return null;
    const ext = path.extname(safe).slice(1).toLowerCase();
    const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'gif' ? 'image/gif' : ext === 'webp' ? 'image/webp' : 'image/png';
    return `data:${mime};base64,${fs.readFileSync(p).toString('base64')}`;
  }
}

module.exports = { Layouts, defaults, CANVAS_MM: { W, H } };
