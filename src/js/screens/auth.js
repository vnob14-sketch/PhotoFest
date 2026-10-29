import { h, field } from '../ui.js';
import { state, go } from '../state.js';

export async function render(root) {
  let mode = 'login';
  const last = (() => { try { return localStorage.getItem('pf_last_user') || ''; } catch { return ''; } })();
  const wrap = h('div', { class: 'auth-wrap' });
  root.appendChild(wrap);

  const draw = () => {
    const err = h('div', { class: 'err-msg' });
    const user = h('input', { type: 'text', value: mode === 'login' ? last : '', autocomplete: 'username', placeholder: 'username' });
    const name = h('input', { type: 'text', placeholder: 'Nama tampilan (opsional)' });
    const pw = h('input', { type: 'password', autocomplete: mode === 'login' ? 'current-password' : 'new-password', placeholder: 'password' });
    const pw2 = h('input', { type: 'password', autocomplete: 'new-password', placeholder: 'ulangi password' });
    const btn = h('button', { class: 'btn primary big', style: { width: '100%' } }, mode === 'login' ? 'Masuk' : 'Buat Akun');

    const submit = async () => {
      err.textContent = '';
      btn.disabled = true;
      try {
        if (mode === 'register') {
          if (pw.value !== pw2.value) throw new Error('Password tidak sama');
          await window.api.auth.register({ username: user.value, name: name.value, password: pw.value });
        }
        state.user = await window.api.auth.login(user.value, pw.value);
        try { localStorage.setItem('pf_last_user', state.user.username); } catch {}
        go('home');
      } catch (e) { err.textContent = e.message; btn.disabled = false; }
    };
    btn.onclick = submit;
    wrap.onkeydown = (e) => { if (e.key === 'Enter') submit(); };

    wrap.replaceChildren(h('div', { class: 'auth card' },
      h('h1', { class: 'brand' }, '📸 PhotoFest'),
      h('div', { class: 'sub' }, 'Aplikasi photobooth'),
      h('div', { class: 'tabs' },
        h('button', { class: mode === 'login' ? 'on' : '', onclick: () => { mode = 'login'; draw(); } }, 'Masuk'),
        h('button', { class: mode === 'register' ? 'on' : '', onclick: () => { mode = 'register'; draw(); } }, 'Akun Baru')),
      field('Username', user),
      mode === 'register' ? field('Nama', name) : null,
      field('Password', pw),
      mode === 'register' ? field('Ulangi Password', pw2) : null,
      err, btn));
    (mode === 'login' && last ? pw : user).focus();
  };
  draw();
}
