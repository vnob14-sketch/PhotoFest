const fs = require('fs');
const path = require('path');

function readJson(p, def) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return def; }
}

function writeJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, p);
}

function deepMerge(base, extra) {
  if (Array.isArray(base) || typeof base !== 'object' || base === null) return extra === undefined ? base : extra;
  const out = { ...base };
  if (extra && typeof extra === 'object' && !Array.isArray(extra)) {
    for (const k of Object.keys(extra)) out[k] = deepMerge(base[k], extra[k]);
  }
  return out;
}

// nama file/folder aman untuk Windows & Drive
function safeName(s, fallback = 'PhotoFest') {
  const v = String(s || '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '').trim().replace(/\.+$/, '');
  return v || fallback;
}

module.exports = { readJson, writeJson, deepMerge, safeName };
