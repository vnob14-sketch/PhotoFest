const fs = require('fs');
const path = require('path');
const { readJson, writeJson, safeName } = require('./util');

const KINDS = ['animated', 'original', 'print'];

class Sessions {
  /**
   * @param userDir folder data akun
   * @param getSettings fungsi pengambil settings akun
   * @param defaultLibrary folder pustaka bawaan (Dokumen/PhotoFest/<username>)
   */
  constructor(userDir, getSettings, defaultLibrary) {
    this.file = path.join(userDir, 'sessions.json');
    this.getSettings = getSettings;
    this.defaultLibrary = defaultLibrary;
  }
  _load() { return readJson(this.file, { sessions: [] }).sessions; }
  _save(list) { writeJson(this.file, { sessions: list }); }

  libraryRoot() { return this.getSettings().libraryDir || this.defaultLibrary; }

  list() { return this._load().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)); }
  get(id) { return this._load().find((s) => s.id === id) || null; }

  stamp(d = new Date()) {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  }

  /** Simpan satu sesi foto ke folder: <pustaka>/<nama folder utama>/{animated,original,print} */
  save({ mode, layoutId, filter, originals, print, gif }) {
    const settings = this.getSettings();
    const eventName = safeName(settings.eventName);
    const base = path.join(this.libraryRoot(), eventName);
    for (const k of KINDS) fs.mkdirSync(path.join(base, k), { recursive: true });

    const list = this._load();
    let id = 'PF_' + this.stamp();
    for (let n = 2; list.some((s) => s.id === id); n++) id = `PF_${this.stamp()}_${n}`;

    const files = { original: [], print: null, animated: null };
    originals.forEach((buf, i) => {
      const name = `${id}_${i + 1}.jpg`;
      fs.writeFileSync(path.join(base, 'original', name), Buffer.from(buf));
      files.original.push(name);
    });
    files.print = `${id}_print.jpg`;
    fs.writeFileSync(path.join(base, 'print', files.print), Buffer.from(print));
    if (gif) {
      files.animated = `${id}.gif`;
      fs.writeFileSync(path.join(base, 'animated', files.animated), Buffer.from(gif));
    }

    const rec = {
      id, createdAt: new Date().toISOString(), eventName, base, mode, layoutId, filter: filter || 'none', files,
      printed: 0,
      drive: { status: 'none', uploaded: {}, error: '' },
    };
    list.push(rec);
    this._save(list);
    return rec;
  }

  update(id, patch) {
    const list = this._load();
    const rec = list.find((s) => s.id === id);
    if (!rec) return null;
    Object.assign(rec, patch);
    this._save(list);
    return rec;
  }

  /** Perbarui status Drive satu sesi (dipakai modul drive). */
  updateDrive(id, patch) {
    const list = this._load();
    const rec = list.find((s) => s.id === id);
    if (!rec) return null;
    rec.drive = { ...rec.drive, ...patch };
    this._save(list);
    return rec;
  }

  /** Daftar file sesi: [{kind, name, path}] */
  fileList(rec) {
    const out = [];
    rec.files.original.forEach((n) => out.push({ kind: 'original', name: n, path: path.join(rec.base, 'original', n) }));
    if (rec.files.print) out.push({ kind: 'print', name: rec.files.print, path: path.join(rec.base, 'print', rec.files.print) });
    if (rec.files.animated) out.push({ kind: 'animated', name: rec.files.animated, path: path.join(rec.base, 'animated', rec.files.animated) });
    return out;
  }

  /** Baca file sesi sebagai Buffer. kind: print | animated | original (index) */
  read(id, kind, index = 0) {
    const rec = this.get(id);
    if (!rec) return null;
    const f = this.fileList(rec).filter((x) => x.kind === kind)[index];
    if (!f || !fs.existsSync(f.path)) return null;
    return fs.readFileSync(f.path);
  }

  remove(id) {
    const list = this._load();
    const rec = list.find((s) => s.id === id);
    if (!rec) return;
    for (const f of this.fileList(rec)) { try { fs.unlinkSync(f.path); } catch {} }
    this._save(list.filter((s) => s.id !== id));
  }
}

module.exports = { Sessions, KINDS };
