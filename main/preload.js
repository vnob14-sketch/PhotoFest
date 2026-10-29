const { contextBridge, ipcRenderer } = require('electron');

const call = async (channel, ...args) => {
  const r = await ipcRenderer.invoke(channel, ...args);
  if (!r.ok) throw new Error(r.error);
  return r.data;
};

contextBridge.exposeInMainWorld('api', {
  auth: {
    list: () => call('auth:list'),
    register: (p) => call('auth:register', p),
    login: (u, pw) => call('auth:login', u, pw),
    logout: () => call('auth:logout'),
    current: () => call('auth:current'),
    changePassword: (o, n) => call('auth:changePassword', o, n),
    rename: (n) => call('auth:rename', n),
  },
  settings: { get: () => call('settings:get'), set: (p) => call('settings:set', p) },
  layouts: {
    list: () => call('layouts:list'),
    save: (l) => call('layouts:save', l),
    remove: (id) => call('layouts:remove', id),
    reset: () => call('layouts:reset'),
  },
  assets: { put: (buf, ext) => call('assets:put', buf, ext), get: (name) => call('assets:get', name) },
  sessions: {
    save: (p) => call('sessions:save', p),
    list: () => call('sessions:list'),
    get: (id) => call('sessions:get', id),
    read: (id, kind, idx) => call('sessions:read', id, kind, idx),
    remove: (id) => call('sessions:remove', id),
    openFolder: (id) => call('sessions:openFolder', id),
    openLibrary: () => call('sessions:openLibrary'),
  },
  printers: {
    list: () => call('printers:list'),
    print: (id, opts) => call('printers:print', id, opts),
    printBytes: (bytes, opts) => call('printers:printBytes', bytes, opts),
  },
  drive: {
    status: () => call('drive:status'),
    connect: () => call('drive:connect'),
    disconnect: () => call('drive:disconnect'),
    sync: () => call('drive:sync'),
    resync: (id) => call('drive:resync', id),
    onProgress: (cb) => {
      const fn = (_e, evt) => cb(evt);
      ipcRenderer.on('drive:progress', fn);
      return () => ipcRenderer.removeListener('drive:progress', fn);
    },
  },
  app: {
    pickFolder: () => call('app:pickFolder'),
    fullscreen: (on) => call('app:fullscreen', on),
    quit: () => call('app:quit'),
    version: () => call('app:version'),
  },
});
