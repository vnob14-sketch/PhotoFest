import { h, toast, sleep } from '../ui.js';
import { state, go, activeLayout, driveLabel, saveSettings } from '../state.js';
import { startCamera, stopCamera, grabFrame } from '../camera.js';
import { FILTERS, composeStrip, canvasToBlob, blobToBytes, makeGif, samplePhoto, makeCanvas } from '../render.js';

export async function render(root) {
  const s = state.settings;
  const view = h('div', { class: 'booth' });
  root.appendChild(view);

  const st = {
    mode: 0, layout: null, filter: s.booth.defaultFilter || 'none', vignette: !!s.booth.vignette,
    shots: [], dead: false, running: false,
    pick: { 2: activeLayout(2)?.id, 3: activeLayout(3)?.id },
  };
  let video = null;
  let offDrive = null;
  const urls = [];
  const url = (blob) => { const u = URL.createObjectURL(blob); urls.push(u); return u; };

  const onKey = (e) => {
    if (e.key === 'Escape' && !st.running) exit();
  };
  window.addEventListener('keydown', onKey);

  function exit() { go('home'); }
  const cleanup = () => {
    st.dead = true;
    window.removeEventListener('keydown', onKey);
    if (offDrive) offDrive();
    if (video) stopCamera(video);
    urls.forEach((u) => URL.revokeObjectURL(u));
  };

  const top = (title, extra) => h('div', { class: 'booth-top' },
    h('button', { class: 'btn small', disabled: st.running, onclick: exit }, '← Beranda'),
    h('div', { class: 'grow brand', style: { textAlign: 'center', fontSize: '1.3rem' } }, '📸 ' + (title || s.eventName)),
    extra || h('span', { style: { width: '90px' } }));
  const show = (...nodes) => view.replaceChildren(...nodes);

  // ---------- 1. pilih mode ----------
  const thumbCache = new Map();
  async function layoutThumb(l) {
    const key = JSON.stringify(l);
    if (!thumbCache.has(key)) {
      const photos = l.slots.map((_, i) => samplePhoto(i, 320, 240));
      const cv = await composeStrip(l, photos, { event: s.eventName });
      const t = makeCanvas(92, 276);
      t.getContext('2d').drawImage(cv, 0, 0, 92, 276);
      thumbCache.set(key, t);
    }
    const src = thumbCache.get(key);
    const c = makeCanvas(92, 276); c.getContext('2d').drawImage(src, 0, 0);
    return c;
  }

  async function showMode() {
    if (video) { stopCamera(video); video = null; }
    st.shots = [];
    const card = async (n) => {
      const layouts = state.layouts.filter((l) => l.mode === n);
      const thumbs = h('div', { class: 'thumbs' });
      const draw = async () => {
        thumbs.replaceChildren();
        for (const l of layouts) {
          const cv = await layoutThumb(l);
          thumbs.appendChild(h('div', {
            class: 'lthumb' + (st.pick[n] === l.id ? ' on' : ''), title: l.name,
            onclick: (e) => { e.stopPropagation(); st.pick[n] = l.id; draw(); },
          }, cv));
        }
      };
      await draw();
      return h('div', { class: 'mode-card', onclick: () => startMode(n) },
        h('div', { class: 'num brand' }, n),
        h('h2', {}, `${n} Foto`),
        h('small', {}, 'Pilih desain, lalu ketuk kartu'),
        thumbs);
    };
    show(top(), h('div', { class: 'booth-body', style: { flexDirection: 'column' } },
      h('h1', {}, 'Mau berapa foto?'),
      h('div', { class: 'mode-pick' }, await card(2), await card(3))));
  }

  function startMode(n) {
    st.mode = n;
    st.layout = state.layouts.find((l) => l.id === st.pick[n]) || activeLayout(n);
    st.shots = [];
    showCapture();
  }

  // ---------- 2. kamera & hitung mundur ----------
  async function showCapture(retakeIndex = null) {
    const n = st.mode;
    const cd = h('div', { class: 'count' });
    const flash = h('div', { class: 'flash' });
    video = h('video', { class: s.camera.mirror ? 'mirror' : '' });
    const side = h('div', { class: 'shot-side' });
    const slotEls = Array.from({ length: n }, (_, i) => h('div', { class: 'slot' }, `Foto ${i + 1}`));
    slotEls.forEach((e) => side.appendChild(e));
    const refreshSlots = (cur) => slotEls.forEach((el, i) => {
      el.classList.toggle('cur', i === cur);
      el.replaceChildren(st.shots[i] ? thumbOf(st.shots[i]) : `Foto ${i + 1}`);
    });

    const filterBar = h('div', { class: 'filterbar' }, Object.entries(FILTERS).map(([k, f]) =>
      h('div', { class: 'chip' + (st.filter === k ? ' on' : ''), onclick: (e) => {
        st.filter = k; video.style.filter = f.css || 'none';
        filterBar.querySelectorAll('.chip').forEach((c) => c.classList.remove('on')); e.currentTarget.classList.add('on');
      } }, f.name)));
    video.style.filter = FILTERS[st.filter].css || 'none';

    const startBtn = h('button', { class: 'btn primary big', onclick: () => run() }, retakeIndex !== null ? `Ulang Foto ${retakeIndex + 1}` : '▶ Mulai Foto (Spasi)');
    const startbar = h('div', { class: 'startbar' }, startBtn);
    const stage = h('div', { class: 'stage' }, video, cd, flash, startbar, filterBar);

    show(top(`${n} Foto`), h('div', { class: 'booth-body' }, stage, side));
    refreshSlots(retakeIndex !== null ? retakeIndex : 0);

    try {
      await startCamera(video, { deviceId: s.camera.deviceId, resolution: s.camera.resolution });
    } catch (e) {
      stage.replaceChildren(h('div', { class: 'empty' }, h('h2', {}, '⚠️ ' + e.message),
        h('p', {}, 'Pastikan kamera tersambung, lalu pilih kamera di Pengaturan.'),
        h('div', { class: 'row tight', style: { justifyContent: 'center' } },
          h('button', { class: 'btn', onclick: () => showCapture(retakeIndex) }, 'Coba lagi'),
          h('button', { class: 'btn', onclick: () => go('settings') }, 'Pengaturan'))));
      return;
    }

    const kd = (e) => { if ((e.key === ' ' || e.key === 'Enter') && !st.running && view.contains(startBtn)) { e.preventDefault(); run(); } };
    window.addEventListener('keydown', kd);
    const prevCleanup = view._off; view._off = () => { window.removeEventListener('keydown', kd); prevCleanup && prevCleanup(); };

    async function run() {
      if (st.running) return;
      st.running = true; startBtn.disabled = true; filterBar.style.display = 'none'; startbar.style.display = 'none';
      const idxs = retakeIndex !== null ? [retakeIndex] : Array.from({ length: n }, (_, i) => i);
      const seconds = Math.max(1, Math.min(10, +s.booth.countdown || 3));
      try {
        for (const i of idxs) {
          refreshSlots(i);
          for (let c = seconds; c >= 1; c--) {
            if (st.dead) return;
            cd.textContent = c; cd.classList.remove('pop'); void cd.offsetWidth; cd.classList.add('pop');
            await sleep(1000);
          }
          cd.textContent = '';
          if (s.booth.flash) { flash.classList.remove('go'); void flash.offsetWidth; flash.classList.add('go'); }
          st.shots[i] = grabFrame(video, s.camera.mirror);
          refreshSlots(i + 1);
          await sleep(+s.booth.pauseBetween || 1200);
        }
      } catch (e) {
        toast(e.message, 'err'); st.running = false; showCapture(retakeIndex); return;
      }
      st.running = false;
      if (st.dead) return;
      window.removeEventListener('keydown', kd);
      showReview();
    }
  }

  const thumbOf = (cv) => { const c = makeCanvas(240, 180); const x = c.getContext('2d'); const r = Math.max(240 / cv.width, 180 / cv.height); x.drawImage(cv, (240 - cv.width * r) / 2, (180 - cv.height * r) / 2, cv.width * r, cv.height * r); return c; };

  // ---------- 3. tinjau, filter, ulang ----------
  async function showReview() {
    if (video) { stopCamera(video); video = null; }
    const stripBox = h('div', { class: 'strip' });
    let token = 0;
    const update = async () => {
      const my = ++token;
      const cv = await composeStrip(st.layout, st.shots, { filter: st.filter, vignette: st.vignette, event: s.eventName });
      const blob = await canvasToBlob(cv, 'image/jpeg', 0.8);
      if (my !== token || st.dead) return;
      stripBox.replaceChildren(h('img', { src: url(blob) }));
    };

    const chips = h('div', { class: 'grid4' });
    const drawChips = () => chips.replaceChildren(...Object.entries(FILTERS).map(([k, f]) =>
      h('div', { class: 'chip' + (st.filter === k ? ' on' : ''), style: { textAlign: 'center' }, onclick: () => { st.filter = k; drawChips(); update(); } }, f.name)));
    drawChips();

    const vg = h('label', { class: 'switch' },
      h('input', { type: 'checkbox', checked: st.vignette, onchange: (e) => { st.vignette = e.target.checked; update(); } }),
      h('span', { class: 'slider' }), h('span', {}, 'Efek vignette (tepi gelap)'));

    const retakes = h('div', { class: 'retakes' }, st.shots.map((cv, i) =>
      h('div', { class: 'retake', title: 'Ulang foto ini', onclick: () => showCapture(i).then(() => {}) }, thumbOf(cv), h('span', {}, `Ulang ${i + 1}`))));

    show(top('Cek hasilmu'), h('div', { class: 'booth-body' }, h('div', { class: 'review' },
      stripBox,
      h('div', { class: 'side' },
        h('h2', {}, 'Suka hasilnya?'),
        h('small', {}, 'Filter & efek bersifat opsional.'),
        chips, vg,
        h('small', {}, 'Ketuk foto untuk mengulang satu foto saja:'), retakes,
        h('button', { class: 'btn primary big', onclick: finish }, '✓ Selesai & Proses'),
        h('button', { class: 'btn', onclick: () => { st.shots = []; showCapture(); } }, '↺ Ulang semua foto')))));
    update();
  }

  // ---------- 4. proses ----------
  async function finish() {
    const bar = h('i'); const label = h('div', {}, 'Menyusun layout…');
    show(h('div', { class: 'booth-body' }, h('div', { class: 'proc' }, h('div', { class: 'spinner' }), h('h2', {}, 'Sebentar ya…'), label, h('div', { class: 'bar' }, bar))));
    const setP = (t, p) => { label.textContent = t; bar.style.width = Math.round(p * 100) + '%'; };
    try {
      const opts = { filter: st.filter, vignette: st.vignette, event: s.eventName };
      setP('Menyusun layout 5×15 cm…', 0.05);
      const printBlob = await canvasToBlob(await composeStrip(st.layout, st.shots, opts), 'image/jpeg', 0.95);
      setP('Menyiapkan foto asli…', 0.2);
      const originals = [];
      for (const cv of st.shots) originals.push(await blobToBytes(await canvasToBlob(cv, 'image/jpeg', 0.95)));
      let gifBytes = null;
      if (s.gif.enabled && st.shots.length > 1) {
        setP('Membuat GIF animasi…', 0.3);
        gifBytes = await makeGif(st.shots, st.layout, { ...s.gif, ...opts }, (p) => setP('Membuat GIF animasi…', 0.3 + p * 0.6));
      }
      setP('Menyimpan…', 0.95);
      const rec = await window.api.sessions.save({
        mode: st.mode, layoutId: st.layout.id, filter: st.filter,
        originals, print: await blobToBytes(printBlob), gif: gifBytes,
      });
      setP('Selesai', 1);
      showResult(rec, printBlob, gifBytes);
    } catch (e) {
      console.error(e);
      toast('Gagal memproses: ' + e.message, 'err', 6000);
      showReview();
    }
  }

  // ---------- 5. hasil ----------
  function showResult(rec, printBlob, gifBytes) {
    let copies = Math.max(1, +s.printer.copies || 1);
    const status = h('span', { class: 'pill' });
    const setStatus = (st2) => { const [t, c] = driveLabel(st2); status.className = 'pill ' + c; status.replaceChildren(h('i', { class: 'dot' }), '☁ ' + t); };
    const driveOn = s.drive.enabled && s.drive.autoUpload;
    setStatus(driveOn ? rec.drive.status : 'none');
    if (!driveOn) status.replaceChildren('☁ Drive: tidak otomatis');
    offDrive = window.api.drive.onProgress((e) => { if (e.id === rec.id && driveOn) setStatus(e.status); });

    const cnt = h('b', {}, String(copies));
    const printBtn = h('button', { class: 'btn primary big', onclick: () => doPrint() }, '🖨 Cetak');
    async function doPrint() {
      printBtn.disabled = true; printBtn.textContent = 'Mencetak…';
      try { await window.api.printers.print(rec.id, { copies }); toast('Dikirim ke printer ✓', 'ok'); }
      catch (e) { toast(e.message, 'err', 6000); }
      printBtn.disabled = false; printBtn.textContent = '🖨 Cetak lagi';
    }

    show(top('Foto kamu sudah jadi!'), h('div', { class: 'booth-body' }, h('div', { class: 'review' },
      h('div', { class: 'strip' }, h('img', { src: url(printBlob) })),
      h('div', { class: 'side' },
        gifBytes ? h('div', {}, h('small', {}, 'Animasi GIF'), h('img', { class: 'gifprev', src: url(new Blob([gifBytes], { type: 'image/gif' })) })) : null,
        h('div', { class: 'row tight' }, h('span', {}, 'Jumlah cetak:'),
          h('button', { class: 'btn small', onclick: () => { copies = Math.max(1, copies - 1); cnt.textContent = copies; } }, '−'), cnt,
          h('button', { class: 'btn small', onclick: () => { copies = Math.min(10, copies + 1); cnt.textContent = copies; } }, '+')),
        printBtn,
        h('div', {}, status),
        h('small', {}, `Tersimpan: ${rec.id}`),
        h('button', { class: 'btn', onclick: () => { st.shots = []; showMode(); } }, '📸 Sesi baru'),
        h('button', { class: 'btn', onclick: exit }, 'Selesai')))));

    if (s.printer.autoPrint) doPrint();
  }

  await showMode();
  return () => { if (view._off) view._off(); cleanup(); };
}
