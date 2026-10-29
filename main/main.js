const { app, BrowserWindow, ipcMain, dialog, shell, session, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const { Accounts } = require('./accounts');
const { Settings } = require('./settings');
const { Layouts } = require('./layouts');
const { Sessions } = require('./sessions');
const { Drive } = require('./drive');
const { printImage } = require('./printing');

let win = null;
let accounts, ctx = null; // ctx = state pengguna yang sedang login

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 980, minHeight: 640,
    backgroundColor: '#14131a', title: 'PhotoFest', icon: path.join(__dirname, '..', 'build', 'icon.png'), autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false },
  });
  win.loadFile(path.join(__dirname, '..', 'src', 'index.html'));
  win.on('closed', () => { win = null; });
}

function buildCtx(user) {
  const userDir = accounts.userDir(user.id);
  const settings = new Settings(userDir);
  const sessions = new Sessions(userDir, () => settings.get(), path.join(app.getPath('documents'), 'PhotoFest', user.username));
  const layouts = new Layouts(userDir);
  const drive = new Drive({
    userDir, sessions, safeStorage,
    getSettings: () => settings.get(),
    openExternal: (u) => shell.openExternal(u),
    onProgress: (e) => win && win.webContents.send('drive:progress', e),
  });
  return { user, userDir, settings, sessions, layouts, drive };
}

const need = () => { if (!ctx) throw new Error('Belum login'); return ctx; };
const handle = (ch, fn) => ipcMain.handle(ch, async (_e, ...a) => {
  try { return { ok: true, data: await fn(...a) }; }
  catch (err) { return { ok: false, error: String(err && err.message ? err.message : err) }; }
});

function applyKiosk(on) { if (win) { win.setFullScreen(!!on); win.setMenuBarVisibility(!on); } }

function registerIpc() {
  // ----- akun -----
  handle('auth:list', () => accounts.list());
  handle('auth:register', (p) => { const u = accounts.register(p); return u; });
  handle('auth:login', (username, password) => {
    const user = accounts.login(username, password);
    ctx = buildCtx(user);
    const s = ctx.settings.get();
    applyKiosk(s.booth.kiosk);
    ctx.layouts.list();
    ctx.drive.syncPending().catch(() => {});
    return user;
  });
  handle('auth:logout', () => { ctx = null; applyKiosk(false); });
  handle('auth:current', () => (ctx ? ctx.user : null));
  handle('auth:changePassword', (o, n) => accounts.changePassword(need().user.id, o, n));
  handle('auth:rename', (name) => { ctx.user = accounts.rename(need().user.id, name); return ctx.user; });

  // ----- settings & layout -----
  handle('settings:get', () => need().settings.get());
  handle('settings:set', (patch) => {
    const s = need().settings.set(patch);
    if (patch && patch.booth && 'kiosk' in patch.booth) applyKiosk(s.booth.kiosk);
    return s;
  });
  handle('layouts:list', () => need().layouts.list());
  handle('layouts:save', (l) => need().layouts.save(l));
  handle('layouts:remove', (id) => need().layouts.remove(id));
  handle('layouts:reset', () => need().layouts.reset());
  handle('assets:put', (buf, ext) => need().layouts.putAsset(buf, ext));
  handle('assets:get', (name) => need().layouts.getAsset(name));

  // ----- sesi foto -----
  handle('sessions:save', (p) => {
    const c = need();
    const rec = c.sessions.save(p);
    const s = c.settings.get();
    if (s.drive.enabled && s.drive.autoUpload && c.drive.status().connected) {
      c.drive.markPending(rec.id);
      c.drive.syncPending().catch(() => {});
    }
    return c.sessions.get(rec.id);
  });
  handle('sessions:list', () => need().sessions.list());
  handle('sessions:get', (id) => need().sessions.get(id));
  handle('sessions:read', (id, kind, idx) => {
    const buf = need().sessions.read(id, kind, idx);
    if (!buf) return null;
    const mime = kind === 'animated' ? 'image/gif' : 'image/jpeg';
    return `data:${mime};base64,${buf.toString('base64')}`;
  });
  handle('sessions:remove', (id) => need().sessions.remove(id));
  handle('sessions:openFolder', (id) => {
    const rec = need().sessions.get(id);
    return shell.openPath(rec ? rec.base : need().sessions.libraryRoot());
  });
  handle('sessions:openLibrary', () => shell.openPath(need().sessions.libraryRoot()));

  // ----- printer -----
  handle('printers:list', async () => {
    if (!win) return [];
    const list = await win.webContents.getPrintersAsync();
    return list.map((p) => ({ name: p.name, displayName: p.displayName || p.name, isDefault: !!p.isDefault }));
  });
  handle('printers:print', async (id, opts = {}) => {
    const c = need();
    const buf = c.sessions.read(id, 'print');
    if (!buf) throw new Error('File siap-cetak tidak ditemukan');
    const s = c.settings.get().printer;
    await printImage(buf, { ...s, ...opts });
    const rec = c.sessions.get(id);
    c.sessions.update(id, { printed: (rec.printed || 0) + (opts.copies || s.copies || 1) });
    return true;
  });
  handle('printers:printBytes', async (bytes, opts = {}) => {
    const s = need().settings.get().printer;
    await printImage(Buffer.from(bytes), { ...s, ...opts });
    return true;
  });

  // ----- Google Drive -----
  handle('drive:status', () => need().drive.status());
  handle('drive:connect', () => need().drive.connect());
  handle('drive:disconnect', () => need().drive.disconnect());
  handle('drive:sync', () => need().drive.syncPending());
  handle('drive:resync', (id) => {
    const c = need();
    c.drive.markPending(id);
    return c.drive.syncPending();
  });

  // ----- aplikasi -----
  handle('app:pickFolder', async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  });
  handle('app:fullscreen', (on) => { if (win) win.setFullScreen(on === undefined ? !win.isFullScreen() : !!on); return win ? win.isFullScreen() : false; });
  handle('app:quit', () => app.quit());
  handle('app:version', () => app.getVersion());
}

app.whenReady().then(() => {
  accounts = new Accounts(app.getPath('userData'));
  // izinkan kamera
  session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(['media', 'mediaKeySystem'].includes(perm)));
  session.defaultSession.setPermissionCheckHandler((_wc, perm) => ['media', 'mediaKeySystem'].includes(perm));
  registerIpc();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
