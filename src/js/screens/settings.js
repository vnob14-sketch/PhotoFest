import { h, toast, field, toggle, modal } from '../ui.js';
import { state, go, topbar, saveSettings, activeLayout } from '../state.js';
import { listCameras, startCamera, stopCamera } from '../camera.js';
import { FILTERS, TRANSITIONS, composeStrip, canvasToBlob, blobToBytes, samplePhoto } from '../render.js';

export async function render(root) {
  const s = () => state.settings;
  let testVideo = null;
  const wrap = h('div', { class: 'settings' });
  root.append(topbar('Pengaturan'), h('div', { class: 'page' }, wrap));

  const save = async (patch) => { try { await saveSettings(patch); } catch (e) { toast(e.message, 'err'); } };
  const sel = (opts, value, onChange) => h('select', { onchange: (e) => onChange(e.target.value) },
    ...opts.map(([v, l]) => h('option', { value: v, selected: String(v) === String(value) }, l)));
  const numInput = (value, min, max, onChange, step = 1) => h('input', { type: 'number', min, max, step, value, onchange: (e) => { const v = Math.max(min, Math.min(max, +e.target.value || min)); e.target.value = v; onChange(v); } });
  const textInput = (value, onChange, type = 'text', ph = '') => h('input', { type, value, placeholder: ph, onchange: (e) => onChange(e.target.value.trim()) });

  // ---- Akun ----
  const accountCard = () => {
    const name = textInput(state.user.name, async (v) => { try { state.user = await window.api.auth.rename(v); toast('Nama diperbarui', 'ok'); } catch (e) { toast(e.message, 'err'); } });
    return h('div', { class: 'card' }, h('h3', {}, '👤 Akun'),
      h('p', { class: 'muted' }, `Username: ${state.user.username}`),
      field('Nama tampilan', name),
      h('div', { class: 'row tight' },
        h('button', { class: 'btn', onclick: changePw }, 'Ganti password'),
        h('button', { class: 'btn danger', onclick: async () => { await window.api.auth.logout(); state.user = null; go('auth'); } }, 'Keluar')));
  };
  function changePw() {
    const o = h('input', { type: 'password' }), n = h('input', { type: 'password' }), err = h('div', { class: 'err-msg' });
    modal({ title: 'Ganti password', body: h('div', {}, field('Password lama', o), field('Password baru', n), err),
      actions: [{ label: 'Batal' }, { label: 'Simpan', kind: 'primary', onClick: async () => {
        try { await window.api.auth.changePassword(o.value, n.value); toast('Password diganti ✓', 'ok'); } catch (e) { err.textContent = e.message; return false; }
      } }] });
  }

  // ---- Booth & penyimpanan ----
  const boothCard = () => {
    const libLabel = h('small', { class: 'hint' }, s().libraryDir || 'Bawaan: Dokumen/PhotoFest/' + state.user.username);
    return h('div', { class: 'card' }, h('h3', {}, '🎛 Booth & Penyimpanan'),
      field('Nama folder utama / nama acara', textInput(s().eventName, (v) => save({ eventName: v || 'PhotoFest' }), 'text', 'PhotoFest'),
        'Dipakai sebagai folder utama di komputer & Google Drive (berisi animated, original, print) dan teks {event} pada layout.'),
      h('div', { class: 'grid2' },
        field('Hitung mundur (detik)', numInput(s().booth.countdown, 1, 10, (v) => save({ booth: { countdown: v } }))),
        field('Jeda antar foto (ms)', numInput(s().booth.pauseBetween, 300, 5000, (v) => save({ booth: { pauseBetween: v } }), 100))),
      field('Filter awal (opsional)', sel(Object.entries(FILTERS).map(([k, f]) => [k, f.name]), s().booth.defaultFilter, (v) => save({ booth: { defaultFilter: v } }))),
      toggle('Efek vignette bawaan', s().booth.vignette, (v) => save({ booth: { vignette: v } })),
      toggle('Efek flash layar saat foto', s().booth.flash, (v) => save({ booth: { flash: v } })),
      toggle('Mode layar penuh (kiosk)', s().booth.kiosk, (v) => save({ booth: { kiosk: v } })),
      field('Lokasi penyimpanan di komputer', h('div', { class: 'row tight' },
        h('button', { class: 'btn small', onclick: async () => {
          const p = await window.api.app.pickFolder(); if (!p) return;
          await save({ libraryDir: p }); libLabel.textContent = p; toast('Folder penyimpanan diganti', 'ok');
        } }, 'Pilih folder…'),
        h('button', { class: 'btn small', onclick: () => window.api.sessions.openLibrary() }, 'Buka folder'),
        h('button', { class: 'btn small', onclick: async () => { await save({ libraryDir: '' }); libLabel.textContent = 'Bawaan: Dokumen/PhotoFest/' + state.user.username; } }, 'Bawaan')), ''),
      libLabel);
  };

  // ---- Kamera ----
  const cameraCard = () => {
    const camSel = h('select', { onchange: (e) => { save({ camera: { deviceId: e.target.value } }); restart(); } });
    const prev = h('div', { class: 'cam-prev' }, testVideo = h('video', { class: s().camera.mirror ? 'mirror' : '', style: s().camera.mirror ? { transform: 'scaleX(-1)' } : {} }));
    const status = h('small', { class: 'hint' }, 'Mencari kamera…');
    const restart = async () => {
      try { await startCamera(testVideo, { deviceId: s().camera.deviceId, resolution: s().camera.resolution }); status.textContent = `Kamera aktif ${testVideo.videoWidth}×${testVideo.videoHeight}`; }
      catch (e) { status.textContent = '⚠ ' + e.message; }
    };
    const load = async () => {
      try {
        const cams = await listCameras();
        camSel.replaceChildren(h('option', { value: '' }, 'Kamera bawaan'), ...cams.map((c) => h('option', { value: c.id, selected: c.id === s().camera.deviceId }, c.label)));
        status.textContent = cams.length ? `${cams.length} kamera ditemukan` : 'Tidak ada kamera terdeteksi';
        if (cams.length) restart();
      } catch (e) { status.textContent = '⚠ ' + e.message; }
    };
    load();
    return h('div', { class: 'card' }, h('h3', {}, '📷 Kamera'),
      field('Pilih kamera', camSel, 'Webcam, atau kamera DSLR/mirrorless lewat HDMI capture card / aplikasi webcam utility dari pabrikan.'),
      h('div', { class: 'grid2' },
        field('Resolusi', sel([['720', '720p'], ['1080', '1080p (Full HD)'], ['4k', '4K']], s().camera.resolution, (v) => { save({ camera: { resolution: v } }).then(restart); })),
        h('div', {}, toggle('Cerminkan (mirror)', s().camera.mirror, (v) => { save({ camera: { mirror: v } }); testVideo.style.transform = v ? 'scaleX(-1)' : ''; }),
          h('button', { class: 'btn small', onclick: load }, '↻ Muat ulang kamera'))),
      prev, status);
  };

  // ---- Printer ----
  const printerCard = () => {
    const pSel = h('select', { onchange: (e) => save({ printer: { name: e.target.value } }) }, h('option', { value: '' }, 'Memuat…'));
    const loadP = async () => {
      try {
        const list = await window.api.printers.list();
        pSel.replaceChildren(h('option', { value: '' }, 'Printer bawaan Windows'), ...list.map((p) => h('option', { value: p.name, selected: p.name === s().printer.name }, p.displayName + (p.isDefault ? ' (bawaan)' : ''))));
      } catch (e) { toast(e.message, 'err'); }
    };
    loadP();
    return h('div', { class: 'card' }, h('h3', {}, '🖨 Printer'),
      field('Printer', pSel),
      field('Kertas', sel([['strip', 'Strip 5 × 15 cm (1 strip per lembar)'], ['double', '10 × 15 cm / 4R (2 strip berdampingan, dipotong tengah)']], s().printer.paper, (v) => save({ printer: { paper: v } })),
        'Pilih ukuran kertas yang sama di pengaturan driver printer (Preferensi Cetak) agar hasil pas tanpa margin.'),
      h('div', { class: 'grid2' }, field('Jumlah cetak bawaan', numInput(s().printer.copies, 1, 10, (v) => save({ printer: { copies: v } })))),
      toggle('Cetak langsung tanpa dialog (silent)', s().printer.silent, (v) => save({ printer: { silent: v } })),
      toggle('Cetak otomatis setelah foto selesai', s().printer.autoPrint, (v) => save({ printer: { autoPrint: v } })),
      h('div', { class: 'row tight' },
        h('button', { class: 'btn', onclick: loadP }, '↻ Muat ulang printer'),
        h('button', { class: 'btn', onclick: async (e) => {
          const b = e.currentTarget; b.disabled = true;
          try {
            const l = activeLayout(3);
            const cv = await composeStrip(l, [0, 1, 2].map((i) => samplePhoto(i, 800, 600)), { event: s().eventName });
            await window.api.printers.printBytes(await blobToBytes(await canvasToBlob(cv, 'image/jpeg', 0.95)), {});
            toast('Cetak tes dikirim ✓', 'ok');
          } catch (err) { toast(err.message, 'err', 6000); } finally { b.disabled = false; }
        } }, 'Cetak tes')));
  };

  // ---- GIF ----
  const gifCard = () => h('div', { class: 'card' }, h('h3', {}, '🎞 GIF Animasi'),
    h('p', { class: 'muted' }, 'GIF berisi foto 1, transisi, foto 2 (dan seterusnya) — disimpan di folder "animated".'),
    toggle('Buat GIF otomatis', s().gif.enabled, (v) => save({ gif: { enabled: v } })),
    h('div', { class: 'grid2' },
      field('Transisi', sel(Object.entries(TRANSITIONS), s().gif.transition, (v) => save({ gif: { transition: v } }))),
      field('Lebar GIF (px)', sel([[360, '360 (ringan)'], [480, '480'], [640, '640 (besar)']], s().gif.width, (v) => save({ gif: { width: +v } }))),
      field('Lama tiap foto (ms)', numInput(s().gif.hold, 300, 4000, (v) => save({ gif: { hold: v } }), 100)),
      field('Kehalusan transisi (frame)', numInput(s().gif.steps, 3, 16, (v) => save({ gif: { steps: v } })))),
    toggle('Ulang terus (loop) dan kembali ke foto 1', s().gif.loop, (v) => save({ gif: { loop: v } })));

  // ---- Drive ----
  const driveCard = () => {
    const box = h('div');
    const draw = async () => {
      const st = await window.api.drive.status().catch(() => ({ connected: false }));
      const busy = h('small', { class: 'hint' });
      box.replaceChildren(
        h('div', { class: 'row tight', style: { marginBottom: '12px' } },
          h('span', { class: 'pill ' + (st.connected ? 'ok' : 'warn') }, h('i', { class: 'dot' }), st.connected ? 'Terhubung' + (st.email ? ': ' + st.email : '') : 'Belum terhubung'),
          st.connected ? h('button', { class: 'btn small', onclick: async () => { await window.api.drive.disconnect(); draw(); } }, 'Putuskan') : null,
          st.connected ? h('button', { class: 'btn small', onclick: async (e) => {
            e.currentTarget.disabled = true; toast('Sinkron…');
            const r = await window.api.drive.sync().catch((er) => ({ ok: false, error: er.message }));
            toast(r.ok ? `Selesai (${r.done || 0} sesi diunggah)` : 'Gagal: ' + r.error, r.ok ? 'ok' : 'err', 5000); e.currentTarget.disabled = false;
          } }, 'Sinkron sekarang') : null),
        toggle('Aktifkan Google Drive', s().drive.enabled, (v) => save({ drive: { enabled: v } })),
        toggle('Upload otomatis setelah tiap sesi', s().drive.autoUpload, (v) => save({ drive: { autoUpload: v } })),
        h('div', { class: 'grid2' },
          field('Client ID', textInput(s().drive.clientId, (v) => save({ drive: { clientId: v } }), 'text', 'xxxx.apps.googleusercontent.com')),
          field('Client Secret', textInput(s().drive.clientSecret, (v) => save({ drive: { clientSecret: v } }), 'password'))),
        !st.connected ? h('button', { class: 'btn primary', onclick: async (e) => {
          const b = e.currentTarget; b.disabled = true; busy.textContent = 'Menunggu login Google di browser…';
          try { await window.api.drive.connect(); toast('Google Drive terhubung ✓', 'ok'); } catch (er) { toast(er.message, 'err', 7000); }
          draw();
        } }, 'Hubungkan Google Drive') : null,
        busy,
        h('details', { style: { marginTop: '14px' } }, h('summary', { class: 'muted', style: { cursor: 'pointer' } }, 'Cara mendapatkan Client ID & Secret (sekali saja)'),
          h('div', { class: 'stepsbox' }, h('ol', {},
            h('li', {}, 'Buka console.cloud.google.com → buat project baru.'),
            h('li', {}, 'Menu "APIs & Services" → "Library" → aktifkan Google Drive API.'),
            h('li', {}, '"OAuth consent screen": pilih External, isi nama app, tambahkan emailmu di "Test users".'),
            h('li', {}, '"Credentials" → "Create credentials" → "OAuth client ID" → jenis "Desktop app".'),
            h('li', {}, 'Salin Client ID dan Client Secret ke kolom di atas, lalu klik Hubungkan.')))),
        h('p', { class: 'hint' }, `Struktur di Drive: ${s().eventName} / animated · original · print`));
    };
    draw();
    return h('div', { class: 'card' }, h('h3', {}, '☁ Google Drive'), box);
  };

  wrap.append(accountCard(), boothCard(), cameraCard(), printerCard(), gifCard(), driveCard());
  return () => { if (testVideo) stopCamera(testVideo); };
}
