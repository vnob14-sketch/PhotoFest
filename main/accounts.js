const crypto = require('crypto');
const path = require('path');
const { readJson, writeJson } = require('./util');

const pub = (a) => ({ id: a.id, username: a.username, name: a.name, created: a.created });

function hash(password, salt) {
  return crypto.scryptSync(String(password), salt, 64).toString('hex');
}

class Accounts {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.file = path.join(dataDir, 'accounts.json');
  }
  _load() { return readJson(this.file, { accounts: [] }); }
  _save(d) { writeJson(this.file, d); }

  list() { return this._load().accounts.map(pub); }

  userDir(id) { return path.join(this.dataDir, 'accounts', id); }

  register({ username, name, password }) {
    username = String(username || '').trim().toLowerCase();
    name = String(name || '').trim() || username;
    if (!/^[a-z0-9_.-]{3,24}$/.test(username)) throw new Error('Username 3-24 karakter (huruf, angka, . _ -)');
    if (String(password || '').length < 4) throw new Error('Password minimal 4 karakter');
    const d = this._load();
    if (d.accounts.some((a) => a.username === username)) throw new Error('Username sudah dipakai');
    const salt = crypto.randomBytes(16).toString('hex');
    const acc = {
      id: crypto.randomBytes(6).toString('hex'),
      username, name, salt,
      hash: hash(password, salt),
      created: new Date().toISOString(),
    };
    d.accounts.push(acc);
    this._save(d);
    return pub(acc);
  }

  login(username, password) {
    username = String(username || '').trim().toLowerCase();
    const acc = this._load().accounts.find((a) => a.username === username);
    const fake = '0'.repeat(128);
    const calc = acc ? hash(password, acc.salt) : fake;
    const ok = acc && crypto.timingSafeEqual(Buffer.from(calc), Buffer.from(acc.hash));
    if (!ok) throw new Error('Username atau password salah');
    return pub(acc);
  }

  changePassword(id, oldPw, newPw) {
    if (String(newPw || '').length < 4) throw new Error('Password baru minimal 4 karakter');
    const d = this._load();
    const acc = d.accounts.find((a) => a.id === id);
    if (!acc) throw new Error('Akun tidak ditemukan');
    if (hash(oldPw, acc.salt) !== acc.hash) throw new Error('Password lama salah');
    acc.salt = crypto.randomBytes(16).toString('hex');
    acc.hash = hash(newPw, acc.salt);
    this._save(d);
  }

  rename(id, name) {
    const d = this._load();
    const acc = d.accounts.find((a) => a.id === id);
    if (!acc) throw new Error('Akun tidak ditemukan');
    acc.name = String(name || '').trim() || acc.name;
    this._save(d);
    return pub(acc);
  }
}

module.exports = { Accounts };
