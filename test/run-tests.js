// Tes logika sisi utama (tanpa Electron): akun, layout, sesi, dan Google Drive (dengan fetch palsu).
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Accounts } = require('../main/accounts');
const { Settings } = require('../main/settings');
const { Layouts } = require('../main/layouts');
const { Sessions } = require('../main/sessions');
const { Drive } = require('../main/drive');

let pass = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ✓', name); } catch (e) { console.error('  ✗', name, '\n   ', e.message); process.exitCode = 1; } };

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-test-'));
  const acc = new Accounts(dir);

  console.log('Akun');
  await t('daftar & login', () => {
    const u = acc.register({ username: 'Budi', name: 'Budi', password: 'rahasia' });
    assert.equal(u.username, 'budi');
    assert.equal(acc.login('BUDI', 'rahasia').id, u.id);
  });
  await t('password salah ditolak', () => assert.throws(() => acc.login('budi', 'salah'), /salah/));
  await t('username ganda ditolak', () => assert.throws(() => acc.register({ username: 'budi', password: 'abcd' }), /dipakai/));
  await t('password disimpan sebagai hash', () => assert(!fs.readFileSync(path.join(dir, 'accounts.json'), 'utf8').includes('rahasia')));
  await t('ganti password', () => { const u = acc.login('budi', 'rahasia'); acc.changePassword(u.id, 'rahasia', 'baru123'); acc.login('budi', 'baru123'); });

  const user = acc.login('budi', 'baru123');
  const userDir = acc.userDir(user.id);
  const settings = new Settings(userDir);
  const layouts = new Layouts(userDir);
  const lib = path.join(dir, 'lib');
  const sessions = new Sessions(userDir, () => ({ ...settings.get(), libraryDir: lib }), lib);

  console.log('Layout');
  await t('layout bawaan ada untuk mode 2 dan 3, ukuran dalam batas 50x150 mm', () => {
    const l = layouts.list();
    for (const m of [2, 3]) {
      const ls = l.filter((x) => x.mode === m);
      assert(ls.length >= 1);
      for (const x of ls) { assert.equal(x.slots.length, m); for (const s of x.slots) assert(s.x >= 0 && s.y >= 0 && s.x + s.w <= 50 && s.y + s.h <= 150, x.name); }
    }
  });
  await t('simpan layout: jumlah kotak dipaksa sesuai mode', () => {
    const base = JSON.parse(JSON.stringify(layouts.list().find((x) => x.mode === 3)));
    delete base.id; base.slots = base.slots.slice(0, 1);
    const saved = layouts.save(base);
    assert.equal(saved.slots.length, 3);
    layouts.remove(saved.id);
  });
  await t('tidak boleh menghapus layout terakhir sebuah mode', () => {
    const twos = layouts.list().filter((x) => x.mode === 2);
    for (const x of twos.slice(1)) layouts.remove(x.id);
    assert.throws(() => layouts.remove(twos[0].id), /Minimal/);
    layouts.reset();
  });
  await t('aset gambar tersimpan & terbaca', () => {
    const name = layouts.putAsset(Buffer.from([137, 80, 78, 71]), 'png');
    assert(layouts.getAsset(name).startsWith('data:image/png;base64,'));
    assert.equal(layouts.getAsset('../../etc/passwd'), null);
  });

  console.log('Sesi (folder utama + animated/original/print)');
  settings.set({ eventName: 'Pesta: Ulang/Tahun*' });
  let rec;
  await t('simpan sesi membuat 3 subfolder dan file', () => {
    rec = sessions.save({ mode: 3, layoutId: 'x', filter: 'bw', originals: [Buffer.from('a'), Buffer.from('b'), Buffer.from('c')], print: Buffer.from('p'), gif: Buffer.from('g') });
    assert.equal(rec.eventName, 'Pesta UlangTahun');
    for (const k of ['animated', 'original', 'print']) assert(fs.existsSync(path.join(lib, 'Pesta UlangTahun', k)), k);
    assert.equal(fs.readdirSync(path.join(lib, 'Pesta UlangTahun', 'original')).length, 3);
    assert.equal(sessions.read(rec.id, 'print').toString(), 'p');
    assert.equal(sessions.read(rec.id, 'animated').toString(), 'g');
  });
  await t('id sesi unik walau dibuat dalam detik yang sama', () => {
    const r2 = sessions.save({ mode: 2, layoutId: 'x', originals: [Buffer.from('a'), Buffer.from('b')], print: Buffer.from('p'), gif: null });
    assert.notEqual(r2.id, rec.id);
    sessions.remove(r2.id);
    assert.equal(sessions.get(r2.id), null);
  });

  console.log('Google Drive (fetch palsu)');
  const calls = [];
  const folders = {};
  let nextId = 1;
  const fakeFetch = async (url, opts = {}) => {
    url = String(url); calls.push({ url, method: opts.method || 'GET' });
    const json = (o, status = 200) => ({ ok: status < 400, status, json: async () => o });
    if (url.includes('oauth2.googleapis.com/token')) return json({ access_token: 'AT', expires_in: 3600 });
    if (url.includes('/drive/v3/files?q=') || url.includes('/drive/v3/files?') && (opts.method || 'GET') === 'GET') {
      const q = new URL(url).searchParams.get('q') || '';
      const nm = /name='(.*?)' and/.exec(q)[1].replace(/\\'/g, "'");
      const par = /'([^']+)' in parents/.exec(q)[1];
      const hit = folders[par + '/' + nm];
      return json({ files: hit ? [{ id: hit }] : [] });
    }
    if (url.includes('uploadType=multipart')) return json({ id: 'F' + nextId++ });
    if (url.includes('/drive/v3/files') && opts.method === 'POST') {
      const b = JSON.parse(opts.body);
      const id = 'D' + nextId++;
      folders[(b.parents ? b.parents[0] : 'root') + '/' + b.name] = id;
      return json({ id });
    }
    return json({}, 404);
  };
  settings.set({ drive: { clientId: 'cid', clientSecret: 'sec' } });
  const progress = [];
  const drive = new Drive({ userDir, sessions, getSettings: () => settings.get(), openExternal() {}, fetch: fakeFetch, onProgress: (e) => progress.push(e.status) });
  fs.writeFileSync(path.join(userDir, 'drive-token.json'), JSON.stringify({ refresh_token: 'RT', email: 'a@b.c' }));

  await t('status terhubung terbaca dari token', () => assert.deepEqual(drive.status(), { connected: true, email: 'a@b.c' }));
  await t('upload membuat <folder utama>/{original,print,animated} lalu mengunggah semua file', async () => {
    const r = await drive.syncPending();
    assert(r.ok && r.done === 1, JSON.stringify(r));
    const mainId = folders['root/Pesta UlangTahun'];
    assert(mainId, 'folder utama dibuat di root');
    for (const k of ['animated', 'original', 'print']) assert(folders[mainId + '/' + k], 'subfolder ' + k + ' di dalam folder utama');
    assert.equal(Object.keys(folders).length, 4);
    const uploads = calls.filter((c) => c.url.includes('uploadType=multipart')).length;
    assert.equal(uploads, 5); // 3 original + 1 print + 1 gif
    assert.equal(sessions.get(rec.id).drive.status, 'done');
  });
  await t('sinkron ulang tidak mengunggah dua kali & folder tidak dibuat ulang', async () => {
    const before = calls.length;
    const r = await drive.syncPending();
    assert(r.ok);
    assert.equal(calls.length, before);
  });
  await t('gagal upload ditandai error lalu bisa dicoba lagi', async () => {
    const r2 = sessions.save({ mode: 2, layoutId: 'x', originals: [Buffer.from('a'), Buffer.from('b')], print: Buffer.from('p'), gif: null });
    const real = drive.fetch;
    drive.fetch = async (u, o) => (String(u).includes('uploadType=multipart') ? { ok: false, status: 500, json: async () => ({}) } : real(u, o));
    const bad = await drive.syncPending();
    assert(!bad.ok);
    assert.equal(sessions.get(r2.id).drive.status, 'error');
    drive.fetch = real;
    const good = await drive.syncPending();
    assert(good.ok);
    assert.equal(sessions.get(r2.id).drive.status, 'done');
  });
  await t('tanpa koneksi Drive: tidak error, hanya ditolak sopan', async () => {
    drive.disconnect();
    assert.deepEqual(drive.status().connected, false);
    const r = await drive.syncPending();
    assert.equal(r.ok, false);
  });

  console.log(`\n${pass} tes lulus${process.exitCode ? ' (ada yang gagal)' : ''}`);
  fs.rmSync(dir, { recursive: true, force: true });
})();
