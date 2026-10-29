// Helper UI kecil: pembuat elemen, toast, modal, konfirmasi.

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked' || k === 'disabled' || k === 'selected') el[k] = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  const add = (c) => {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) c.forEach(add);
    else el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  };
  children.forEach(add);
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);

export function toast(msg, type = 'info', ms = 3200) {
  let box = $('#toasts');
  if (!box) { box = h('div', { id: 'toasts' }); document.body.appendChild(box); }
  const t = h('div', { class: 'toast ' + type }, msg);
  box.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, ms);
}

export function modal({ title, body, actions = [], wide = false, onClose }) {
  const close = () => { back.remove(); onClose && onClose(); };
  const back = h('div', { class: 'modal-back', onclick: (e) => { if (e.target === back) close(); } },
    h('div', { class: 'modal' + (wide ? ' wide' : '') },
      h('div', { class: 'modal-head' }, h('h3', {}, title || ''), h('button', { class: 'icon-btn', onclick: close, 'aria-label': 'Tutup' }, '✕')),
      h('div', { class: 'modal-body' }, body),
      actions.length ? h('div', { class: 'modal-actions' }, actions.map((a) =>
        h('button', { class: 'btn ' + (a.kind || ''), onclick: async () => { if (a.onClick) { const r = await a.onClick(close); if (r === false) return; } if (a.close !== false) close(); } }, a.label))) : null));
  document.body.appendChild(back);
  return { close, el: back };
}

export function confirmBox(message, okLabel = 'Ya', kind = 'danger') {
  return new Promise((resolve) => {
    let settled = false;
    const fin = (v) => { if (!settled) { settled = true; resolve(v); } };
    modal({
      title: 'Konfirmasi', body: h('p', {}, message), onClose: () => fin(false),
      actions: [{ label: 'Batal', onClick: () => fin(false) }, { label: okLabel, kind, onClick: () => fin(true) }],
    });
  });
}

export function field(label, input, hint) {
  return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), input, hint ? h('small', { class: 'hint' }, hint) : null);
}

export function toggle(label, checked, onChange) {
  const inp = h('input', { type: 'checkbox', checked, onchange: (e) => onChange(e.target.checked) });
  return h('label', { class: 'switch' }, inp, h('span', { class: 'slider' }), h('span', {}, label));
}

export function downloadBlob(blob, name) {
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.appendChild(a); a.click(); a.remove();
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
