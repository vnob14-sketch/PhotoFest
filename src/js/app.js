import { state, reloadSettings, reloadLayouts } from './state.js';
import { toast } from './ui.js';

const root = document.getElementById('app');
let cleanup = null;
let navToken = 0;

const SCREENS = {
  auth: () => import('./screens/auth.js'),
  home: () => import('./screens/home.js'),
  booth: () => import('./screens/booth.js'),
  gallery: () => import('./screens/gallery.js'),
  layouts: () => import('./screens/layouts.js'),
  settings: () => import('./screens/settings.js'),
};

async function route(name, params = {}) {
  const token = ++navToken;
  if (cleanup) { try { await cleanup(); } catch {} cleanup = null; }
  root.innerHTML = '';
  try {
    if (name !== 'auth' && !state.user) name = 'auth';
    if (name !== 'auth') { await reloadSettings(); await reloadLayouts(); }
    const mod = await SCREENS[name]();
    if (token !== navToken) return;
    cleanup = (await mod.render(root, params)) || null;
  } catch (e) {
    console.error(e);
    toast(e.message || String(e), 'err', 6000);
  }
}

state.router = route;

(async () => {
  try {
    state.user = await window.api.auth.current();
  } catch { state.user = null; }
  route(state.user ? 'home' : 'auth');
})();
