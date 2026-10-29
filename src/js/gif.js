// Encoder GIF animasi mandiri (tanpa dependensi): palet global median-cut + LZW.

/** Bangun palet (maks 256 warna) dari histogram warna 15-bit (5-5-5). */
function buildPalette(hist, maxColors = 256) {
  const keys = [];
  for (let k = 0; k < 32768; k++) if (hist[k]) keys.push(k);
  const rgb = (k) => [(k >> 10) & 31, (k >> 5) & 31, k & 31];
  const pop = (cols) => { let n = 0; for (const k of cols) n += hist[k]; return n; };
  let boxes = [{ cols: keys, n: pop(keys) }];

  while (boxes.length < maxColors) {
    let bi = -1, best = 0;
    for (let i = 0; i < boxes.length; i++) if (boxes[i].cols.length > 1 && boxes[i].n > best) { best = boxes[i].n; bi = i; }
    if (bi < 0) break;
    const box = boxes[bi];
    let min = [31, 31, 31], max = [0, 0, 0];
    for (const k of box.cols) {
      const c = rgb(k);
      for (let j = 0; j < 3; j++) { if (c[j] < min[j]) min[j] = c[j]; if (c[j] > max[j]) max[j] = c[j]; }
    }
    const ch = [0, 1, 2].sort((a, b) => (max[b] - min[b]) - (max[a] - min[a]))[0];
    const sh = [10, 5, 0][ch];
    const sorted = box.cols.slice().sort((a, b) => ((a >> sh) & 31) - ((b >> sh) & 31));
    let acc = 0, cut = 0;
    const half = box.n / 2;
    for (; cut < sorted.length - 1; cut++) { acc += hist[sorted[cut]]; if (acc >= half) break; }
    const a = sorted.slice(0, cut + 1), b = sorted.slice(cut + 1);
    if (!b.length) { box.cols = sorted; box.n = pop(sorted); box.cols.length = 1; continue; }
    boxes.splice(bi, 1, { cols: a, n: pop(a) }, { cols: b, n: pop(b) });
  }

  const palette = new Uint8Array(256 * 3);
  boxes.forEach((box, i) => {
    let r = 0, g = 0, b = 0, n = 0;
    for (const k of box.cols) { const c = rgb(k), w = hist[k]; r += c[0] * w; g += c[1] * w; b += c[2] * w; n += w; }
    n = n || 1;
    const e = (v) => { const q = Math.round(v / n); return (q << 3) | (q >> 2); };
    palette[i * 3] = e(r); palette[i * 3 + 1] = e(g); palette[i * 3 + 2] = e(b);
  });
  return { palette, count: boxes.length };
}

/** Tabel nearest-color: untuk tiap warna 15-bit -> indeks palet. */
function buildLookup(palette, count) {
  const lut = new Uint8Array(32768);
  for (let k = 0; k < 32768; k++) {
    const r = (((k >> 10) & 31) << 3) | (((k >> 10) & 31) >> 2);
    const g = (((k >> 5) & 31) << 3) | (((k >> 5) & 31) >> 2);
    const b = ((k & 31) << 3) | ((k & 31) >> 2);
    let bi = 0, bd = 1e9;
    for (let i = 0; i < count; i++) {
      const dr = r - palette[i * 3], dg = g - palette[i * 3 + 1], db = b - palette[i * 3 + 2];
      const d = dr * dr * 2 + dg * dg * 4 + db * db * 3; // bobot persepsi kasar
      if (d < bd) { bd = d; bi = i; if (!d) break; }
    }
    lut[k] = bi;
  }
  return lut;
}

class ByteSink {
  constructor() { this.buf = new Uint8Array(1 << 16); this.n = 0; }
  push(b) { if (this.n >= this.buf.length) { const nb = new Uint8Array(this.buf.length * 2); nb.set(this.buf); this.buf = nb; } this.buf[this.n++] = b; }
  u16(v) { this.push(v & 255); this.push((v >> 8) & 255); }
  bytes(arr) { for (let i = 0; i < arr.length; i++) this.push(arr[i]); }
  out() { return this.buf.slice(0, this.n); }
}

/** Kompres satu frame (indeks palet) dengan LZW GIF, tulis sebagai sub-block. */
function lzwFrame(indices, minCode, sink, dict) {
  const clear = 1 << minCode, eoi = clear + 1;
  let codeSize = minCode + 1, maxcode = (1 << codeSize) - 1, next = eoi + 1;
  let cur = 0, curBits = 0;
  const block = [];
  const flush = () => { sink.push(block.length); for (const b of block) sink.push(b); block.length = 0; };
  const putByte = (b) => { block.push(b); if (block.length === 255) flush(); };
  const emit = (code, isClear) => {
    cur |= code << curBits; curBits += codeSize;
    while (curBits >= 8) { putByte(cur & 255); cur >>>= 8; curBits -= 8; }
    if (isClear) { codeSize = minCode + 1; maxcode = (1 << codeSize) - 1; }
    else if (next > maxcode && codeSize < 12) { codeSize++; maxcode = (1 << codeSize) - 1; }
  };

  dict.fill(-1);
  emit(clear, true);
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const key = prefix * 256 + k;
    const v = dict[key];
    if (v !== -1) { prefix = v; continue; }
    emit(prefix, false);
    if (next < 4096) dict[key] = next++;
    else { dict.fill(-1); next = eoi + 1; emit(clear, true); }
    prefix = k;
  }
  emit(prefix, false);
  emit(eoi, false);
  if (curBits > 0) putByte(cur & 255);
  if (block.length) flush();
  sink.push(0); // terminator
}

/**
 * @param frames [{ data: Uint8ClampedArray(RGBA), delay: ms }]
 * @param w,h ukuran frame
 * @param opts { loop: true|false, onProgress(0..1), yieldFn: async () => void }
 * @returns Uint8Array berisi file GIF
 */
export async function encodeGif(frames, w, h, opts = {}) {
  const { loop = true, onProgress, yieldFn } = opts;
  const hist = new Uint32Array(32768);
  // sampel piksel dari semua frame untuk palet global
  const step = Math.max(1, Math.floor((frames.length * w * h) / 400000));
  for (const f of frames) {
    const d = f.data;
    for (let p = 0; p < w * h; p += step) {
      const o = p * 4;
      hist[((d[o] >> 3) << 10) | ((d[o + 1] >> 3) << 5) | (d[o + 2] >> 3)]++;
    }
  }
  const { palette, count } = buildPalette(hist, 256);
  const lut = buildLookup(palette, count);

  const sink = new ByteSink();
  sink.bytes([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]); // GIF89a
  sink.u16(w); sink.u16(h);
  sink.push(0xf7); // GCT ada, 8 bit, 256 warna
  sink.push(0); sink.push(0);
  sink.bytes(palette);
  if (loop) { sink.bytes([0x21, 0xff, 0x0b]); sink.bytes(Array.from('NETSCAPE2.0', (c) => c.charCodeAt(0))); sink.bytes([3, 1, 0, 0, 0]); }

  const dict = new Int32Array(4096 * 256);
  const idx = new Uint8Array(w * h);
  for (let fi = 0; fi < frames.length; fi++) {
    const f = frames[fi], d = f.data;
    for (let p = 0, o = 0; p < w * h; p++, o += 4) idx[p] = lut[((d[o] >> 3) << 10) | ((d[o + 1] >> 3) << 5) | (d[o + 2] >> 3)];
    const delay = Math.max(2, Math.round((f.delay || 100) / 10));
    sink.bytes([0x21, 0xf9, 4, 0x04]); sink.u16(delay); sink.bytes([0, 0]); // GCE, disposal=1
    sink.push(0x2c); sink.u16(0); sink.u16(0); sink.u16(w); sink.u16(h); sink.push(0);
    sink.push(8);
    lzwFrame(idx, 8, sink, dict);
    if (onProgress) onProgress((fi + 1) / frames.length);
    if (yieldFn) await yieldFn();
  }
  sink.push(0x3b);
  return sink.out();
}
