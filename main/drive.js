const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { readJson, writeJson } = require('./util');

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif' };

const b64url = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

/**
 * Integrasi Google Drive (OAuth desktop + PKCE, scope drive.file).
 * Struktur di Drive:  <nama folder utama>/{animated, original, print}
 */
class Drive {
  /**
   * @param o.userDir folder akun
   * @param o.getSettings () => settings
   * @param o.sessions instance Sessions
   * @param o.openExternal (url) => void
   * @param o.safeStorage (opsional) electron.safeStorage
   * @param o.fetch (opsional) implementasi fetch (untuk tes)
   * @param o.onProgress (evt) => void
   */
  constructor(o) {
    this.o = o;
    this.tokenFile = path.join(o.userDir, 'drive-token.json');
    this.cacheFile = path.join(o.userDir, 'drive-folders.json');
    this.fetch = o.fetch || ((...a) => fetch(...a));
    this.busy = false;
    this.again = false;
  }

  emit(evt) { try { this.o.onProgress && this.o.onProgress(evt); } catch {} }

  // ---------- token ----------
  _readTok() {
    const d = readJson(this.tokenFile, null);
    if (!d) return null;
    if (d.enc && this.o.safeStorage) {
      try { return JSON.parse(this.o.safeStorage.decryptString(Buffer.from(d.data, 'base64'))); } catch { return null; }
    }
    return d.enc ? null : d;
  }
  _writeTok(tok) {
    const ss = this.o.safeStorage;
    if (ss && ss.isEncryptionAvailable && ss.isEncryptionAvailable()) {
      writeJson(this.tokenFile, { enc: true, data: ss.encryptString(JSON.stringify(tok)).toString('base64') });
    } else writeJson(this.tokenFile, tok);
  }

  status() {
    const t = this._readTok();
    return { connected: !!(t && t.refresh_token), email: t ? t.email || '' : '' };
  }

  disconnect() {
    try { fs.unlinkSync(this.tokenFile); } catch {}
    try { fs.unlinkSync(this.cacheFile); } catch {}
  }

  async _token() {
    const t = this._readTok();
    if (!t || !t.refresh_token) throw new Error('Google Drive belum terhubung');
    if (t.access_token && t.expiry && t.expiry > Date.now() + 60000) return t.access_token;
    const { clientId, clientSecret } = this.o.getSettings().drive;
    const r = await this.fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: t.refresh_token, grant_type: 'refresh_token' }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error('Gagal memperbarui token Drive: ' + (j.error_description || j.error || r.status));
    t.access_token = j.access_token;
    t.expiry = Date.now() + (j.expires_in || 3600) * 1000;
    this._writeTok(t);
    return t.access_token;
  }

  // ---------- OAuth ----------
  async connect() {
    const { clientId, clientSecret } = this.o.getSettings().drive;
    if (!clientId || !clientSecret) throw new Error('Isi Client ID dan Client Secret Google dulu di Pengaturan');
    const verifier = b64url(crypto.randomBytes(32));
    const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
    const state = b64url(crypto.randomBytes(12));

    const server = http.createServer();
    await new Promise((res, rej) => { server.once('error', rej); server.listen(0, '127.0.0.1', res); });
    const redirect = `http://127.0.0.1:${server.address().port}`;

    const codePromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Waktu login Google habis')), 180000);
      server.on('request', (req, res) => {
        const u = new URL(req.url, redirect);
        const code = u.searchParams.get('code');
        const err = u.searchParams.get('error');
        if (!code && !err) { res.writeHead(404); res.end(); return; }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<body style="font-family:sans-serif;text-align:center;padding:60px"><h2>${err ? 'Gagal terhubung' : 'PhotoFest terhubung ke Google Drive'}</h2><p>Kamu bisa menutup tab ini dan kembali ke PhotoFest.</p></body>`);
        clearTimeout(timer);
        if (err) reject(new Error('Login Google dibatalkan: ' + err));
        else if (u.searchParams.get('state') !== state) reject(new Error('State OAuth tidak cocok'));
        else resolve(code);
      });
    });

    const url = AUTH_URL + '?' + new URLSearchParams({
      client_id: clientId, redirect_uri: redirect, response_type: 'code', scope: SCOPE,
      code_challenge: challenge, code_challenge_method: 'S256', access_type: 'offline', prompt: 'consent', state,
    });
    this.o.openExternal(url);

    try {
      const code = await codePromise;
      const r = await this.fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, code_verifier: verifier, grant_type: 'authorization_code', redirect_uri: redirect }),
      });
      const j = await r.json();
      if (!r.ok || !j.refresh_token) throw new Error('Gagal menukar kode Google: ' + (j.error_description || j.error || 'tidak ada refresh token'));
      const tok = { refresh_token: j.refresh_token, access_token: j.access_token, expiry: Date.now() + (j.expires_in || 3600) * 1000, email: '' };
      this._writeTok(tok);
      try {
        const a = await this.fetch(`${API}/about?fields=user(emailAddress,displayName)`, { headers: { Authorization: 'Bearer ' + tok.access_token } });
        if (a.ok) { const u = (await a.json()).user || {}; tok.email = u.emailAddress || ''; this._writeTok(tok); }
      } catch {}
      return this.status();
    } finally {
      server.close();
    }
  }

  // ---------- folder & upload ----------
  async _api(url, opts = {}, retry = true) {
    const token = await this._token();
    const r = await this.fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: 'Bearer ' + token } });
    if (r.status === 401 && retry) {
      const t = this._readTok(); if (t) { t.expiry = 0; this._writeTok(t); }
      return this._api(url, opts, false);
    }
    return r;
  }

  async _ensureFolder(name, parentId) {
    const cache = readJson(this.cacheFile, {});
    const key = `${parentId || 'root'}/${name}`;
    if (cache[key]) return cache[key];
    const q = `name='${esc(name)}' and mimeType='${FOLDER_MIME}' and trashed=false and '${parentId || 'root'}' in parents`;
    const r = await this._api(`${API}/files?` + new URLSearchParams({ q, fields: 'files(id,name)', pageSize: '1', spaces: 'drive' }));
    if (!r.ok) throw new Error('Drive: gagal mencari folder (' + r.status + ')');
    let id = ((await r.json()).files || [])[0]?.id;
    if (!id) {
      const c = await this._api(`${API}/files?fields=id`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: parentId ? [parentId] : undefined }),
      });
      if (!c.ok) throw new Error('Drive: gagal membuat folder ' + name + ' (' + c.status + ')');
      id = (await c.json()).id;
    }
    cache[key] = id;
    writeJson(this.cacheFile, cache);
    return id;
  }

  async _folderPath(parts) {
    let parent = null;
    for (const p of parts) parent = await this._ensureFolder(p, parent);
    return parent;
  }

  _clearCache() { try { fs.unlinkSync(this.cacheFile); } catch {} }

  async _uploadFile(filePath, name, parentId) {
    const ext = path.extname(name).slice(1).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    const boundary = 'pf' + crypto.randomBytes(8).toString('hex');
    const meta = JSON.stringify({ name, parents: [parentId] });
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`),
      fs.readFileSync(filePath),
      Buffer.from(`\r\n--${boundary}--`),
    ]);
    const r = await this._api(`${UPLOAD}?uploadType=multipart&fields=id`, {
      method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body,
    });
    if (!r.ok) {
      const e = new Error(`Drive: upload ${name} gagal (${r.status})`);
      e.status = r.status;
      throw e;
    }
    return (await r.json()).id;
  }

  async uploadSession(rec) {
    const sessions = this.o.sessions;
    sessions.updateDrive(rec.id, { status: 'uploading', error: '' });
    this.emit({ id: rec.id, status: 'uploading' });
    const uploaded = { ...(rec.drive.uploaded || {}) };
    try {
      for (const f of sessions.fileList(rec)) {
        if (uploaded[f.name] || !fs.existsSync(f.path)) continue;
        let folderId = await this._folderPath([rec.eventName, f.kind]);
        let id;
        try { id = await this._uploadFile(f.path, f.name, folderId); }
        catch (e) {
          if (e.status === 404) { this._clearCache(); folderId = await this._folderPath([rec.eventName, f.kind]); id = await this._uploadFile(f.path, f.name, folderId); }
          else throw e;
        }
        uploaded[f.name] = id;
        sessions.updateDrive(rec.id, { uploaded });
      }
      sessions.updateDrive(rec.id, { status: 'done', uploaded, error: '' });
      this.emit({ id: rec.id, status: 'done' });
    } catch (e) {
      sessions.updateDrive(rec.id, { status: 'error', uploaded, error: String(e.message || e) });
      this.emit({ id: rec.id, status: 'error', error: String(e.message || e) });
      throw e;
    }
  }

  /** Upload semua sesi yang belum selesai. Aman dipanggil berulang. */
  async syncPending() {
    if (this.busy) { this.again = true; return { ok: true, queued: true }; }
    if (!this.status().connected) return { ok: false, error: 'Drive belum terhubung' };
    this.busy = true;
    let done = 0, failed = 0, lastError = '';
    try {
      do {
        this.again = false;
        const todo = this.o.sessions.list().filter((s) => s.drive.status !== 'done').reverse();
        for (const rec of todo) {
          try { await this.uploadSession(rec); done++; } catch (e) { failed++; lastError = String(e.message || e); if (/belum terhubung|token/i.test(lastError)) break; }
        }
      } while (this.again);
    } finally { this.busy = false; }
    return { ok: failed === 0, done, failed, error: lastError };
  }

  markPending(id) {
    this.o.sessions.updateDrive(id, { status: 'pending', error: '' });
    this.emit({ id, status: 'pending' });
  }
}

module.exports = { Drive };
