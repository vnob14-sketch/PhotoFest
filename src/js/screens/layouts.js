import { h, toast, field, confirmBox, modal } from '../ui.js';
import { state, topbar, reloadLayouts, reloadSettings, saveSettings } from '../state.js';
import { composeStrip, samplePhoto, CANVAS_MM, PX_PER_MM } from '../render.js';

const FONTS = ['Poppins', 'Segoe UI', 'Arial', 'Georgia', 'Times New Roman', 'Courier New', 'Comic Sans MS', 'Impact', 'Trebuchet MS', 'Verdana', 'Segoe Script'];
const snap = (v) => Math.round(v * 2) / 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const clone = (o) => JSON.parse(JSON.stringify(o));

export async function render(root) {
  let cur = null;          // layout yang sedang diedit (salinan)
  let dirty = false;
  let sel = { type: 'slot', i: 0 };
  const sc = clamp((window.innerHeight - 170) / CANVAS_MM.H, 3.2, 6.4); // px per mm di layar
  const photos = Array.from({ length: 3 }, (_, i) => samplePhoto(i, 800, 600));

  const left = h('div'), right = h('div');
  const disp = h('canvas', { width: CANVAS_MM.W * PX_PER_MM, height: CANVAS_MM.H * PX_PER_MM });
  const ovBox = h('div', { style: { position: 'absolute', inset: 0 } });
  const box = h('div', { class: 'cv-box', style: { width: CANVAS_MM.W * sc + 'px', height: CANVAS_MM.H * sc + 'px' } }, disp, ovBox);
  const center = h('div', { class: 'canvas-wrap' }, box);

  root.append(
    topbar('Desain Layout (5 × 15 cm)', { actions: [h('small', { class: 'muted' }, 'Seret kotak untuk memindah, tarik sudut kanan-bawah untuk mengubah ukuran')] }),
    h('div', { class: 'page', style: { padding: '18px' } }, h('div', { class: 'editor' }, left, center, right)));

  // ---------- render pratinjau ----------
  let raf = 0;
  const repaint = () => {
    if (raf) return;
    raf = requestAnimationFrame(async () => {
      raf = 0;
      const cv = await composeStrip(cur, photos.slice(0, cur.mode), { event: state.settings.eventName });
      const x = disp.getContext('2d'); x.clearRect(0, 0, disp.width, disp.height); x.drawImage(cv, 0, 0);
    });
  };

  const measure = (t) => {
    const c = document.createElement('canvas').getContext('2d');
    c.font = `${t.weight} ${t.size * PX_PER_MM}px ${t.font}`;
    return c.measureText(t.text.replace(/\{\w+\}/g, '00000000')).width / PX_PER_MM;
  };

  // ---------- overlay interaktif ----------
  function drawOverlays() {
    ovBox.replaceChildren();
    cur.slots.forEach((s, i) => {
      const el = h('div', { class: 'ov' + (sel.type === 'slot' && sel.i === i ? ' sel' : ''), style: pos(s) },
        h('span', { class: 'tag' }, i + 1), h('i', { class: 'hd' }));
      el.addEventListener('pointerdown', (e) => startDrag(e, 'slot', i, e.target.classList.contains('hd') ? 'resize' : 'move'));
      ovBox.appendChild(el);
    });
    cur.texts.forEach((t, i) => {
      const w = measure(t), hh = t.size * 1.25;
      const left = t.align === 'center' ? t.x - w / 2 : t.align === 'right' ? t.x - w : t.x;
      const el = h('div', { class: 'tov' + (sel.type === 'text' && sel.i === i ? ' sel' : ''), style: { left: left * sc + 'px', top: t.y * sc + 'px', width: w * sc + 'px', height: hh * sc + 'px' } });
      el.addEventListener('pointerdown', (e) => startDrag(e, 'text', i, 'move'));
      ovBox.appendChild(el);
    });
  }
  const pos = (s) => ({ left: s.x * sc + 'px', top: s.y * sc + 'px', width: s.w * sc + 'px', height: s.h * sc + 'px' });

  function startDrag(e, type, i, how) {
    e.preventDefault(); e.stopPropagation();
    sel = { type, i };
    const o = type === 'slot' ? { ...cur.slots[i] } : { x: cur.texts[i].x, y: cur.texts[i].y };
    const sx = e.clientX, sy = e.clientY;
    drawOverlays(); drawPanel();
    const move = (ev) => {
      const dx = (ev.clientX - sx) / sc, dy = (ev.clientY - sy) / sc;
      if (type === 'slot') {
        const s = cur.slots[i];
        if (how === 'move') { s.x = snap(clamp(o.x + dx, 0, CANVAS_MM.W - s.w)); s.y = snap(clamp(o.y + dy, 0, CANVAS_MM.H - s.h)); }
        else { s.w = snap(clamp(o.w + dx, 8, CANVAS_MM.W - s.x)); s.h = snap(clamp(o.h + dy, 8, CANVAS_MM.H - s.y)); }
      } else {
        const t = cur.texts[i];
        t.x = snap(clamp(o.x + dx, 0, CANVAS_MM.W)); t.y = snap(clamp(o.y + dy, 0, CANVAS_MM.H));
      }
      dirty = true; drawOverlays(); syncInputs(); repaint();
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  }

  // ---------- panel kiri: daftar ----------
  function drawList() {
    left.replaceChildren();
    for (const n of [3, 2]) {
      left.appendChild(h('div', { class: 'sect' },
        h('h4', {}, `Layout ${n} foto`),
        ...state.layouts.filter((l) => l.mode === n).map((l) => h('div', { class: 'lay-item' + (cur && cur.id === l.id ? ' on' : ''), onclick: () => choose(l.id) },
          h('span', { class: 'nm' }, l.name), state.settings.activeLayout[n] === l.id ? h('span', { title: 'Layout aktif' }, '⭐') : null)),
        h('button', { class: 'btn small', onclick: () => addNew(n) }, `+ Layout ${n} foto`)));
    }
    left.appendChild(h('button', { class: 'btn small danger', onclick: async () => {
      if (!(await confirmBox('Kembalikan semua layout ke bawaan? Layout buatanmu akan hilang.', 'Reset'))) return;
      await window.api.layouts.reset(); await reloadLayouts(); cur = null; await choose(state.layouts[0].id, true);
    } }, 'Reset ke bawaan'));
  }

  async function choose(id, force) {
    if (!force && dirty && !(await confirmBox('Ada perubahan yang belum disimpan. Buang perubahan?', 'Buang'))) return;
    cur = clone(state.layouts.find((l) => l.id === id)); dirty = false; sel = { type: 'slot', i: 0 };
    drawList(); drawPanel(); drawOverlays(); repaint();
  }

  async function addNew(mode) {
    if (dirty && !(await confirmBox('Ada perubahan yang belum disimpan. Buang perubahan?', 'Buang'))) return;
    const base = state.layouts.find((l) => l.mode === mode);
    const l = clone(base); delete l.id; l.name = `Layout baru ${mode} foto`;
    const saved = await window.api.layouts.save(l);
    await reloadLayouts(); await choose(saved.id, true);
    toast('Layout baru dibuat dari salinan layout pertama', 'ok');
  }

  // ---------- panel kanan: properti ----------
  const inputs = {};
  const num = (key, label, get, set, step = 0.5, min = 0, max = 150) => {
    const inp = h('input', { type: 'number', step, min, max, value: get(), onchange: (e) => { set(clamp(+e.target.value || 0, min, max)); dirty = true; drawOverlays(); repaint(); } });
    inputs[key] = { inp, get };
    return field(label, inp);
  };
  const syncInputs = () => { for (const k of Object.keys(inputs)) { const { inp, get } = inputs[k]; if (document.activeElement !== inp) inp.value = get(); } };

  function assetBtn(label, key, hint) {
    const file = h('input', { type: 'file', accept: 'image/*', style: { display: 'none' }, onchange: async (e) => {
      const f = e.target.files[0]; if (!f) return;
      if (f.size > 15 * 1024 * 1024) { toast('Gambar maksimal 15 MB', 'warn'); return; }
      try {
        const ext = (f.name.split('.').pop() || 'png');
        cur[key] = await window.api.assets.put(new Uint8Array(await f.arrayBuffer()), ext);
        dirty = true; drawPanel(); repaint();
      } catch (err) { toast(err.message, 'err'); }
    } });
    return field(label, h('div', { class: 'row tight' },
      h('button', { class: 'btn small', onclick: () => file.click() }, cur[key] ? 'Ganti gambar' : 'Pilih gambar'),
      cur[key] ? h('button', { class: 'btn small', onclick: () => { cur[key] = ''; dirty = true; drawPanel(); repaint(); } }, 'Hapus') : null, file), hint);
  }

  function drawPanel() {
    for (const k of Object.keys(inputs)) delete inputs[k];
    right.replaceChildren();
    if (!cur) return;
    const n = cur.mode;
    const isActive = state.settings.activeLayout[n] === cur.id;
    const slot = sel.type === 'slot' ? cur.slots[sel.i] : null;
    const text = sel.type === 'text' ? cur.texts[sel.i] : null;

    right.append(
      h('div', { class: 'sect' },
        h('div', { class: 'row tight', style: { flexWrap: 'wrap' } },
          h('button', { class: 'btn primary', onclick: save }, '💾 Simpan'),
          h('button', { class: 'btn', disabled: isActive, onclick: async () => {
            if (dirty) await save();
            await saveSettings({ activeLayout: { [n]: cur.id } }); drawList(); drawPanel(); toast(`Dipakai untuk mode ${n} foto`, 'ok');
          } }, isActive ? '⭐ Aktif' : `Jadikan aktif (${n} foto)`),
          h('button', { class: 'btn danger', onclick: remove }, '🗑'))),

      h('div', { class: 'sect' },
        field('Nama layout', h('input', { type: 'text', value: cur.name, oninput: (e) => { cur.name = e.target.value; dirty = true; } })),
        h('div', { class: 'muted' }, `Mode: ${n} foto · ukuran 50 × 150 mm`)),

      h('div', { class: 'sect' }, h('h4', {}, 'Latar & frame'),
        field('Warna latar', h('div', { class: 'row tight' },
          h('input', { type: 'color', value: cur.bgColor.length === 7 ? cur.bgColor : '#ffffff', oninput: (e) => { cur.bgColor = e.target.value; dirty = true; repaint(); } }))),
        assetBtn('Gambar latar (opsional)', 'bgAsset'),
        assetBtn('Frame / overlay PNG transparan (opsional)', 'frameAsset', 'Tampil di atas foto. Ukuran ideal 600 × 1800 px, area foto dibuat transparan.')),

      h('div', { class: 'sect' }, h('h4', {}, 'Kotak foto'),
        h('div', { class: 'row tight', style: { marginBottom: '10px' } }, cur.slots.map((_, i) =>
          h('button', { class: 'btn small' + (sel.type === 'slot' && sel.i === i ? ' primary' : ''), onclick: () => { sel = { type: 'slot', i }; drawOverlays(); drawPanel(); } }, `Foto ${i + 1}`))),
        slot ? h('div', {},
          h('div', { class: 'grid2' },
            num('sx', 'X (mm)', () => slot.x, (v) => { slot.x = clamp(v, 0, CANVAS_MM.W - slot.w); }),
            num('sy', 'Y (mm)', () => slot.y, (v) => { slot.y = clamp(v, 0, CANVAS_MM.H - slot.h); }),
            num('sw', 'Lebar (mm)', () => slot.w, (v) => { slot.w = clamp(v, 8, CANVAS_MM.W - slot.x); }),
            num('sh', 'Tinggi (mm)', () => slot.h, (v) => { slot.h = clamp(v, 8, CANVAS_MM.H - slot.y); })),
          h('div', { class: 'row tight', style: { flexWrap: 'wrap' } },
            h('button', { class: 'btn small', onclick: () => { slot.x = snap((CANVAS_MM.W - slot.w) / 2); dirty = true; drawOverlays(); syncInputs(); repaint(); } }, 'Tengah ↔'),
            h('button', { class: 'btn small', onclick: () => { cur.slots.forEach((s) => { s.w = slot.w; s.h = slot.h; s.x = snap((CANVAS_MM.W - slot.w) / 2); }); dirty = true; drawOverlays(); syncInputs(); repaint(); } }, 'Samakan semua'))) : null),

      h('div', { class: 'sect' }, h('h4', {}, 'Teks'),
        h('div', { class: 'row tight', style: { flexWrap: 'wrap', marginBottom: '10px' } },
          cur.texts.map((t, i) => h('button', { class: 'btn small' + (sel.type === 'text' && sel.i === i ? ' primary' : ''), onclick: () => { sel = { type: 'text', i }; drawOverlays(); drawPanel(); } }, `T${i + 1}`)),
          h('button', { class: 'btn small', onclick: () => {
            if (cur.texts.length >= 12) return;
            cur.texts.push({ text: 'Teks baru', x: 25, y: 120, size: 5, color: '#222222', font: 'Poppins', weight: '700', align: 'center' });
            sel = { type: 'text', i: cur.texts.length - 1 }; dirty = true; drawOverlays(); drawPanel(); repaint();
          } }, '+ Teks')),
        text ? h('div', {},
          field('Isi teks', h('input', { type: 'text', value: text.text, oninput: (e) => { text.text = e.target.value; dirty = true; drawOverlays(); repaint(); } }), 'Variabel: {event} {date} {time}'),
          h('div', { class: 'grid2' },
            num('tx', 'X (mm)', () => text.x, (v) => { text.x = v; }, 0.5, 0, 50),
            num('ty', 'Y (mm)', () => text.y, (v) => { text.y = v; }, 0.5, 0, 150),
            num('ts', 'Ukuran (mm)', () => text.size, (v) => { text.size = v; }, 0.5, 1, 30),
            field('Warna', h('input', { type: 'color', value: text.color.length === 7 ? text.color : '#000000', oninput: (e) => { text.color = e.target.value; dirty = true; repaint(); } }))),
          field('Font', h('select', { onchange: (e) => { text.font = e.target.value; dirty = true; drawOverlays(); repaint(); } },
            ...FONTS.map((f) => h('option', { value: f, selected: text.font.split(',')[0].trim() === f }, f)))),
          h('div', { class: 'grid2' },
            field('Tebal', h('select', { onchange: (e) => { text.weight = e.target.value; dirty = true; drawOverlays(); repaint(); } },
              h('option', { value: '400', selected: String(text.weight) === '400' }, 'Normal'), h('option', { value: '700', selected: String(text.weight) !== '400' }, 'Tebal'))),
            field('Rata', h('select', { onchange: (e) => { text.align = e.target.value; dirty = true; drawOverlays(); repaint(); } },
              ...[['left', 'Kiri'], ['center', 'Tengah'], ['right', 'Kanan']].map(([v, l]) => h('option', { value: v, selected: text.align === v }, l))))),
          h('button', { class: 'btn small danger', onclick: () => { cur.texts.splice(sel.i, 1); sel = { type: 'slot', i: 0 }; dirty = true; drawOverlays(); drawPanel(); repaint(); } }, 'Hapus teks ini')) : null));
  }

  async function save() {
    try {
      const saved = await window.api.layouts.save(cur);
      await reloadLayouts();
      cur = clone(saved); dirty = false;
      drawList(); drawPanel(); toast('Layout tersimpan ✓', 'ok');
    } catch (e) { toast(e.message, 'err'); }
  }

  async function remove() {
    if (!(await confirmBox(`Hapus layout "${cur.name}"?`, 'Hapus'))) return;
    try {
      const mode = cur.mode, id = cur.id;
      await window.api.layouts.remove(id); await reloadLayouts();
      if (state.settings.activeLayout[mode] === id) await saveSettings({ activeLayout: { [mode]: '' } });
      await reloadSettings();
      await choose(state.layouts.find((l) => l.mode === mode).id, true);
    } catch (e) { toast(e.message, 'err'); }
  }

  const beforeUnload = (e) => { if (dirty) e.preventDefault(); };
  window.addEventListener('beforeunload', beforeUnload);

  const startId = state.settings.activeLayout[3] || state.layouts[0].id;
  await choose(startId, true);
  return () => { window.removeEventListener('beforeunload', beforeUnload); if (raf) cancelAnimationFrame(raf); };
}
