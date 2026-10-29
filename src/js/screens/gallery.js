import { h, toast, modal, confirmBox } from '../ui.js';
import { state, go, topbar, driveLabel } from '../state.js';

export async function render(root) {
  let sessions = await window.api.sessions.list();
  const grid = h('div', { class: 'gal' });
  const info = h('span', { class: 'muted' });
  const search = h('input', { type: 'text', placeholder: 'Cari ID sesi…', style: { width: '220px' }, oninput: draw });
  let obs = null;
  let offDrive = null;

  const syncBtn = h('button', { class: 'btn small', onclick: async () => {
    syncBtn.disabled = true;
    try {
      const st = await window.api.drive.status();
      if (!st.connected) { toast('Hubungkan Google Drive di Pengaturan dulu', 'warn'); return; }
      toast('Sinkron ke Drive…');
      const r = await window.api.drive.sync();
      toast(r.ok ? `Sinkron selesai (${r.done || 0} sesi)` : 'Sebagian gagal: ' + r.error, r.ok ? 'ok' : 'err', 5000);
      sessions = await window.api.sessions.list(); draw();
    } catch (e) { toast(e.message, 'err'); } finally { syncBtn.disabled = false; }
  } }, '☁ Sinkron Drive');

  root.append(
    topbar('Galeri', { actions: [search, syncBtn, h('button', { class: 'btn small', onclick: () => window.api.sessions.openLibrary() }, '📁 Buka folder')] }),
    h('div', { class: 'page' }, info, h('div', { style: { height: '12px' } }), grid));

  function draw() {
    if (obs) obs.disconnect();
    const q = search.value.trim().toLowerCase();
    const list = sessions.filter((x) => !q || x.id.toLowerCase().includes(q));
    info.textContent = `${list.length} sesi`;
    grid.replaceChildren();
    if (!list.length) { grid.appendChild(h('div', { class: 'empty', style: { gridColumn: '1/-1' } }, 'Belum ada foto. Mulai photobooth dulu 📸')); return; }
    obs = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        obs.unobserve(e.target);
        const el = e.target;
        window.api.sessions.read(el.dataset.id, 'print').then((src) => { if (src) el.replaceChildren(h('img', { src })); });
      }
    }, { root: root.querySelector('.page'), rootMargin: '200px' });
    for (const rec of list) {
      const [txt, cls] = driveLabel(rec.drive.status);
      const im = h('div', { class: 'im', 'data-id': rec.id }, '…');
      grid.appendChild(h('div', { class: 'gitem', onclick: () => detail(rec.id) }, im,
        h('div', { class: 'meta' },
          h('span', {}, new Date(rec.createdAt).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })),
          h('span', { class: 'pill ' + cls, title: txt }, '☁'))));
      obs.observe(im);
    }
  }

  async function detail(id) {
    let rec = await window.api.sessions.get(id);
    if (!rec) return;
    const [printSrc, gifSrc] = await Promise.all([
      window.api.sessions.read(id, 'print'),
      rec.files.animated ? window.api.sessions.read(id, 'animated') : null,
    ]);
    const originals = h('div', { class: 'originals' });
    rec.files.original.forEach((_, i) => window.api.sessions.read(id, 'original', i).then((src) => src && originals.appendChild(h('img', { src }))));
    const [txt, cls] = driveLabel(rec.drive.status);
    const body = h('div', {},
      h('div', { class: 'detail' },
        h('div', {}, h('small', {}, 'Siap cetak (5×15 cm)'), h('br'), h('img', { src: printSrc })),
        gifSrc ? h('div', {}, h('small', {}, 'GIF animasi'), h('br'), h('img', { src: gifSrc, style: { maxHeight: '40vh' } })) : null),
      h('div', { style: { marginTop: '12px' } }, h('small', {}, 'Foto asli'), originals),
      h('p', {}, h('small', {}, `${rec.id} · ${rec.mode} foto · dicetak ${rec.printed || 0}×`), ' ',
        h('span', { class: 'pill ' + cls }, '☁ ' + txt), rec.drive.error ? h('small', { class: 'err-msg' }, ' ' + rec.drive.error) : null));

    modal({
      title: 'Detail sesi', body, wide: true,
      actions: [
        { label: '🖨 Cetak', kind: 'primary', close: false, onClick: async () => { try { await window.api.printers.print(id, {}); toast('Dikirim ke printer ✓', 'ok'); } catch (e) { toast(e.message, 'err', 6000); } return false; } },
        { label: '☁ Upload ke Drive', close: false, onClick: async () => {
          try {
            if (!(await window.api.drive.status()).connected) { toast('Hubungkan Google Drive di Pengaturan dulu', 'warn'); return false; }
            const r = await window.api.drive.resync(id);
            toast(r.ok ? 'Terunggah ✓' : 'Gagal: ' + r.error, r.ok ? 'ok' : 'err', 5000);
            sessions = await window.api.sessions.list(); draw();
          } catch (e) { toast(e.message, 'err'); }
          return false;
        } },
        { label: '📁 Folder', close: false, onClick: () => { window.api.sessions.openFolder(id); return false; } },
        { label: '🗑 Hapus', kind: 'danger', close: false, onClick: async (close) => {
          if (!(await confirmBox('Hapus sesi ini dari komputer? File di Google Drive tidak ikut terhapus.', 'Hapus'))) return false;
          await window.api.sessions.remove(id);
          sessions = await window.api.sessions.list(); draw(); close(); return false;
        } },
        { label: 'Tutup' },
      ],
    });
  }

  offDrive = window.api.drive.onProgress(async () => { sessions = await window.api.sessions.list(); });
  draw();
  return () => { if (obs) obs.disconnect(); if (offDrive) offDrive(); };
}
