import { h } from '../ui.js';
import { state, go, driveLabel } from '../state.js';

export async function render(root) {
  const s = state.settings;
  const [drive, sessions] = await Promise.all([
    window.api.drive.status().catch(() => ({ connected: false })),
    window.api.sessions.list().catch(() => []),
  ]);
  let cams = [];
  try { cams = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput'); } catch {}

  const today = new Date().toDateString();
  const todayCount = sessions.filter((x) => new Date(x.createdAt).toDateString() === today).length;
  const pending = sessions.filter((x) => x.drive.status !== 'done').length;

  const pill = (ok, text) => h('span', { class: 'pill ' + (ok ? 'ok' : 'warn') }, h('i', { class: 'dot' }), text);
  const tile = (ico, title, sub, to, cls = '') => h('button', { class: 'tile ' + cls, onclick: () => go(to) },
    h('div', { class: 'ico' }, ico), h('div', {}, h('h3', {}, title), h('small', {}, sub)));

  root.append(
    h('div', { class: 'topbar' },
      h('h2', {}, h('span', { class: 'brand' }, '📸 PhotoFest')),
      h('span', { class: 'muted' }, `Halo, ${state.user.name}`),
      h('button', { class: 'btn small', onclick: async () => { await window.api.auth.logout(); state.user = null; go('auth'); } }, 'Keluar')),
    h('div', { class: 'page' }, h('div', { class: 'home' },
      h('h1', {}, s.eventName),
      h('div', { class: 'status-row' },
        pill(cams.length > 0, cams.length ? `${cams.length} kamera terdeteksi` : 'Kamera belum terdeteksi'),
        pill(!!s.printer.name, s.printer.name ? 'Printer: ' + s.printer.name : 'Printer bawaan Windows'),
        pill(drive.connected && s.drive.enabled, drive.connected ? `Drive: ${drive.email || 'terhubung'}${pending ? ` · ${pending} antri` : ''}` : 'Drive belum terhubung'),
        h('span', { class: 'pill' }, `${todayCount} sesi hari ini`)),
      h('div', { class: 'tiles' },
        tile('🎬', 'Mulai Photobooth', 'Pilih 2 atau 3 foto, lalu ambil foto', 'booth', 'hero'),
        tile('🖼️', 'Galeri', `${sessions.length} sesi tersimpan`, 'gallery'),
        tile('🧩', 'Desain Layout', 'Atur kotak foto, latar & frame 5×15 cm', 'layouts'),
        tile('⚙️', 'Pengaturan', 'Kamera, printer, GIF, Google Drive', 'settings')))));
}
