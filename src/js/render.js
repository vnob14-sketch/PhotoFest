// Penyusun gambar: layout strip 5x15 cm, filter/efek, dan animasi GIF transisi antar foto.
import { encodeGif } from './gif.js';

export const PX_PER_MM = 12;            // 12 px/mm ≈ 305 dpi
export const CANVAS_MM = { W: 50, H: 150 };

export const FILTERS = {
  none:    { name: 'Normal',  css: '' },
  bw:      { name: 'Hitam Putih', css: 'grayscale(1) contrast(1.1)' },
  sepia:   { name: 'Sepia',   css: 'sepia(.8) contrast(1.05)' },
  warm:    { name: 'Hangat',  css: 'sepia(.25) saturate(1.3) hue-rotate(-10deg) brightness(1.05)' },
  cool:    { name: 'Dingin',  css: 'saturate(1.1) hue-rotate(15deg) brightness(1.03)' },
  vivid:   { name: 'Cerah',   css: 'saturate(1.6) contrast(1.1)' },
  fade:    { name: 'Pudar',   css: 'contrast(.85) brightness(1.1) saturate(.8)' },
  vintage: { name: 'Vintage', css: 'sepia(.4) contrast(.9) saturate(1.2) brightness(1.05)' },
};

export const TRANSITIONS = { fade: 'Fade (pudar)', slide: 'Geser', wipe: 'Sapu (wipe)', zoom: 'Zoom' };

const assetCache = new Map();

/** Muat gambar aset layout (latar/frame) lewat IPC, dengan cache. */
export async function loadAsset(name) {
  if (!name) return null;
  if (assetCache.has(name)) return assetCache.get(name);
  const p = (async () => {
    const url = await window.api.assets.get(name);
    if (!url) return null;
    return new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = url; });
  })();
  assetCache.set(name, p);
  return p;
}
export function dropAssetCache(name) { assetCache.delete(name); }

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.round(w); c.height = Math.round(h);
  return c;
}

/** Gambar `src` ke kotak (x,y,w,h) dengan crop "cover" di tengah. */
export function drawCover(ctx, src, x, y, w, h, zoom = 1) {
  const sw = src.videoWidth || src.naturalWidth || src.width;
  const sh = src.videoHeight || src.naturalHeight || src.height;
  const s = Math.max(w / sw, h / sh) * zoom;
  const dw = sw * s, dh = sh * s;
  ctx.drawImage(src, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

function vignette(ctx, x, y, w, h) {
  const g = ctx.createRadialGradient(x + w / 2, y + h / 2, Math.min(w, h) * 0.3, x + w / 2, y + h / 2, Math.max(w, h) * 0.75);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,.55)');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
}

/** Gambar satu foto ke kotak dengan filter (+ vignette opsional). */
export function drawPhoto(ctx, photo, x, y, w, h, { filter = 'none', vignette: vg = false } = {}) {
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.filter = (FILTERS[filter] && FILTERS[filter].css) || 'none';
  drawCover(ctx, photo, x, y, w, h);
  ctx.filter = 'none';
  if (vg) vignette(ctx, x, y, w, h);
  ctx.restore();
}

export function fmtText(t, vars) {
  return String(t).replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : `{${k}}`));
}

/**
 * Susun strip lengkap sesuai layout.
 * @param layout objek layout (mm)
 * @param photos array canvas/image/video, urutan = urutan kotak foto
 * @param opts { filter, vignette, event, date, guides }
 */
export async function composeStrip(layout, photos, opts = {}) {
  const S = PX_PER_MM;
  const cv = makeCanvas(CANVAS_MM.W * S, CANVAS_MM.H * S);
  const ctx = cv.getContext('2d');
  ctx.fillStyle = layout.bgColor || '#fff';
  ctx.fillRect(0, 0, cv.width, cv.height);

  const bg = await loadAsset(layout.bgAsset);
  if (bg) drawCover(ctx, bg, 0, 0, cv.width, cv.height);

  layout.slots.forEach((s, i) => {
    const p = photos[i];
    if (!p) { ctx.fillStyle = 'rgba(128,128,128,.25)'; ctx.fillRect(s.x * S, s.y * S, s.w * S, s.h * S); return; }
    drawPhoto(ctx, p, s.x * S, s.y * S, s.w * S, s.h * S, opts);
  });

  const frame = await loadAsset(layout.frameAsset);
  if (frame) ctx.drawImage(frame, 0, 0, cv.width, cv.height);

  const vars = {
    event: opts.event || '',
    date: opts.date || new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }),
    time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
  };
  for (const t of layout.texts || []) {
    ctx.fillStyle = t.color || '#000';
    ctx.textAlign = t.align || 'center';
    ctx.textBaseline = 'middle';
    const label = fmtText(t.text, vars);
    const fam = t.font || 'Poppins, Segoe UI, Arial, sans-serif';
    let size = t.size * S;
    ctx.font = `${t.weight || 700} ${size}px ${fam}`;
    // teks panjang otomatis diperkecil supaya tidak terpotong di tepi strip (margin 2 mm)
    const room = (t.align === 'left' ? CANVAS_MM.W - t.x : t.align === 'right' ? t.x : 2 * Math.min(t.x, CANVAS_MM.W - t.x) ) - 2;
    const wpx = ctx.measureText(label).width;
    if (room > 0 && wpx > room * S) { size = Math.max(S * 1.5, size * (room * S) / wpx); ctx.font = `${t.weight || 700} ${size}px ${fam}`; }
    ctx.fillText(label, t.x * S, t.y * S);
  }
  return cv;
}

export function canvasToBlob(cv, type = 'image/jpeg', q = 0.93) {
  return new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('Gagal membuat gambar'))), type, q));
}
export const blobToBytes = async (blob) => new Uint8Array(await blob.arrayBuffer());

// ---------- GIF animasi transisi antar foto ----------
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

function drawTransition(ctx, A, B, t, type, W, H) {
  t = ease(t);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  if (type === 'slide') {
    ctx.drawImage(A, -t * W, 0, W, H);
    ctx.drawImage(B, (1 - t) * W, 0, W, H);
  } else if (type === 'wipe') {
    ctx.drawImage(A, 0, 0, W, H);
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W * t, H); ctx.clip();
    ctx.drawImage(B, 0, 0, W, H); ctx.restore();
  } else if (type === 'zoom') {
    ctx.drawImage(A, 0, 0, W, H);
    const s = 1.25 - 0.25 * t;
    ctx.globalAlpha = t;
    ctx.drawImage(B, (W - W * s) / 2, (H - H * s) / 2, W * s, H * s);
    ctx.globalAlpha = 1;
  } else { // fade
    ctx.drawImage(A, 0, 0, W, H);
    ctx.globalAlpha = t; ctx.drawImage(B, 0, 0, W, H); ctx.globalAlpha = 1;
  }
}

/**
 * Buat GIF: foto 1 -> transisi -> foto 2 (-> foto 3 ...), lalu kembali ke foto 1 bila loop.
 * @returns Uint8Array
 */
export async function makeGif(photos, layout, opts, onProgress) {
  const { width = 480, hold = 900, transition = 'fade', steps = 8, loop = true, filter = 'none', vignette: vg = false } = opts;
  const slot = layout.slots[0];
  const W = Math.round(width), H = Math.round(width * (slot.h / slot.w));
  const base = photos.map((p) => { // frame dasar (sudah crop + filter)
    const c = makeCanvas(W, H);
    drawPhoto(c.getContext('2d'), p, 0, 0, W, H, { filter, vignette: vg });
    return c;
  });
  const work = makeCanvas(W, H), wctx = work.getContext('2d', { willReadFrequently: true });
  const grab = () => wctx.getImageData(0, 0, W, H).data;
  const frames = [];
  const n = base.length;
  for (let i = 0; i < n; i++) {
    wctx.drawImage(base[i], 0, 0);
    frames.push({ data: grab(), delay: hold });
    const j = i + 1;
    if (j < n || (loop && n > 1)) {
      const next = base[j % n];
      for (let s = 1; s <= steps; s++) {
        drawTransition(wctx, base[i], next, s / (steps + 1), transition, W, H);
        frames.push({ data: grab(), delay: 60 });
      }
    }
  }
  return encodeGif(frames, W, H, { loop, onProgress, yieldFn: () => new Promise((r) => setTimeout(r, 0)) });
}

/** Foto contoh untuk pratinjau editor layout. */
export function samplePhoto(i = 0, w = 800, h = 600) {
  const c = makeCanvas(w, h), x = c.getContext('2d');
  const hues = [18, 200, 330, 120];
  const hue = hues[i % hues.length];
  const g = x.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, `hsl(${hue},80%,72%)`); g.addColorStop(1, `hsl(${hue + 40},70%,48%)`);
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  x.fillStyle = 'rgba(255,255,255,.55)';
  x.beginPath(); x.arc(w / 2, h * 0.4, h * 0.18, 0, Math.PI * 2); x.fill();
  x.beginPath(); x.ellipse(w / 2, h * 0.95, w * 0.26, h * 0.4, 0, 0, Math.PI * 2); x.fill();
  x.fillStyle = 'rgba(0,0,0,.35)'; x.font = `700 ${h * 0.1}px sans-serif`; x.textAlign = 'center';
  x.fillText('Foto ' + (i + 1), w / 2, h * 0.12);
  return c;
}
