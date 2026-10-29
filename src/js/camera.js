// Akses kamera (webcam / kamera DSLR via capture card / HDMI) memakai getUserMedia.
import { makeCanvas } from './render.js';

const RES = { '720': [1280, 720], '1080': [1920, 1080], '4k': [3840, 2160] };

export async function listCameras() {
  // minta izin dulu supaya label perangkat terbaca
  try { const s = await navigator.mediaDevices.getUserMedia({ video: true }); s.getTracks().forEach((t) => t.stop()); } catch (e) {
    if (e && e.name === 'NotAllowedError') throw new Error('Izin kamera ditolak');
  }
  const all = await navigator.mediaDevices.enumerateDevices();
  return all.filter((d) => d.kind === 'videoinput').map((d, i) => ({ id: d.deviceId, label: d.label || 'Kamera ' + (i + 1) }));
}

export async function startCamera(video, { deviceId = '', resolution = '1080' } = {}) {
  stopCamera(video);
  const [w, h] = RES[resolution] || RES['1080'];
  const base = { width: { ideal: w }, height: { ideal: h }, frameRate: { ideal: 30 } };
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: deviceId ? { ...base, deviceId: { exact: deviceId } } : base, audio: false });
  } catch (e) {
    if (deviceId) stream = await navigator.mediaDevices.getUserMedia({ video: base, audio: false }); // kamera tersimpan hilang -> pakai bawaan
    else throw new Error(e && e.name === 'NotFoundError' ? 'Kamera tidak ditemukan' : 'Tidak bisa membuka kamera: ' + (e.message || e.name));
  }
  video.srcObject = stream;
  video.muted = true; video.playsInline = true;
  await video.play();
  return stream;
}

export function stopCamera(video) {
  const s = video && video.srcObject;
  if (s) s.getTracks().forEach((t) => t.stop());
  if (video) video.srcObject = null;
}

/** Ambil satu frame penuh dari video sebagai canvas (opsional dicerminkan). */
export function grabFrame(video, mirror = true) {
  const w = video.videoWidth, h = video.videoHeight;
  if (!w || !h) throw new Error('Kamera belum siap');
  const c = makeCanvas(w, h), x = c.getContext('2d');
  if (mirror) { x.translate(w, 0); x.scale(-1, 1); }
  x.drawImage(video, 0, 0, w, h);
  return c;
}
