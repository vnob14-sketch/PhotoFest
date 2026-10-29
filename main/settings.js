const path = require('path');
const { readJson, writeJson, deepMerge } = require('./util');

const DEFAULTS = {
  eventName: 'PhotoFest',          // nama folder utama (lokal & Google Drive)
  libraryDir: '',                  // kosong = Dokumen/PhotoFest/<username>
  camera: { deviceId: '', mirror: true, resolution: '1080' },
  booth: { countdown: 3, flash: true, defaultFilter: 'none', vignette: false, kiosk: false, pauseBetween: 1200 },
  printer: { name: '', silent: true, copies: 1, paper: 'strip', autoPrint: false },
  gif: { enabled: true, width: 480, hold: 900, transition: 'fade', steps: 8, loop: true },
  drive: { enabled: true, autoUpload: true, clientId: '', clientSecret: '' },
  activeLayout: { 2: '', 3: '' },
};

class Settings {
  constructor(userDir) { this.file = path.join(userDir, 'settings.json'); }
  get() { return deepMerge(DEFAULTS, readJson(this.file, {})); }
  set(patch) {
    const next = deepMerge(this.get(), patch);
    writeJson(this.file, next);
    return next;
  }
}

module.exports = { Settings, DEFAULTS };
