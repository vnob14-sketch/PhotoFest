// State bersama + navigasi antar layar.
import { h } from './ui.js';

export const state = { user: null, settings: null, layouts: [], router: null };

export const go = (name, params) => state.router(name, params);

export async function reloadSettings() { state.settings = await window.api.settings.get(); return state.settings; }
export async function reloadLayouts() { state.layouts = await window.api.layouts.list(); return state.layouts; }

export async function saveSettings(patch) {
  state.settings = await window.api.settings.set(patch);
  return state.settings;
}

/** Layout aktif untuk mode (2 atau 3 foto). */
export function activeLayout(mode) {
  const id = state.settings.activeLayout[mode];
  return state.layouts.find((l) => l.id === id && l.mode === mode) || state.layouts.find((l) => l.mode === mode);
}

export function topbar(title, { back = 'home', actions = [] } = {}) {
  return h('div', { class: 'topbar' },
    back ? h('button', { class: 'btn small', onclick: () => go(back) }, '← Kembali') : null,
    h('h2', {}, title),
    ...actions);
}

export function driveLabel(status) {
  return ({
    none: ['Belum diunggah', ''], pending: ['Antri upload', 'warn'], uploading: ['Mengunggah…', 'warn'],
    done: ['Tersimpan di Drive', 'ok'], error: ['Gagal upload', 'err'],
  })[status] || ['-', ''];
}
