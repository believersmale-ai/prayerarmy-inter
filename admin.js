/* =========================================================================
   PRAYER ARMY INTERNATIONAL - DEDICATED SITE MANAGER CONTROLLER
   ========================================================================= */

// Backend: the PHP/MySQL API in /api on this same Hostinger site. Every privileged action
// (save settings, upload/delete media, team, private requests) is re-checked on the server
// against the signed-in account's role before anything happens.
const SUPABASE_URL = `${location.origin}/api`;   // kept name for compatibility: this is now your own Hostinger PHP/MySQL API
const SUPABASE_ANON_KEY = "";                      // not used any more
const EDGE_BASE = `${SUPABASE_URL}/functions/v1`;
// Node-hosted staging uses cookie sessions; PHP token sessions remain supported elsewhere.
const NODE_SESSION_KEY = 'pai_node_admin_session';
const isNodeAdminSession = () => sessionStorage.getItem(NODE_SESSION_KEY) === 'true';

const getPasskey = () =>
  sessionStorage.getItem('pai_manager_passkey') || localStorage.getItem('pai_manager_passkey') || '';

const setStoredPasskey = (passkey) => {
  sessionStorage.setItem('pai_manager_passkey', passkey);
  localStorage.setItem('pai_manager_passkey', passkey);
};

const clearStoredPasskey = () => {
  sessionStorage.removeItem('pai_manager_passkey');
  localStorage.removeItem('pai_manager_passkey');
};

/* ---- Account sessions (own accounts) -------------------------------------
   An account session keeps its short-lived access token in the same slot the
   shared passkey used (getPasskey()), so every existing request keeps working.
   The token is refreshed automatically before it expires. */
const SESSION_KEYS = ['pai_manager_authenticated', 'pai_manager_passkey', 'pai_manager_refresh', 'pai_manager_expires', 'pai_manager_mode'];
const storeBoth = (k, v) => { sessionStorage.setItem(k, v); localStorage.setItem(k, v); };
const getStored = (k) => sessionStorage.getItem(k) || localStorage.getItem(k) || '';
const clearSession = () => SESSION_KEYS.forEach((k) => { sessionStorage.removeItem(k); localStorage.removeItem(k); });
const isAccountSession = () => getStored('pai_manager_mode') === 'account';
const saveTokens = (t) => {
  setStoredPasskey(t.access_token);
  storeBoth('pai_manager_refresh', t.refresh_token || '');
  storeBoth('pai_manager_expires', String(Date.now() + (Number(t.expires_in) || 3600) * 1000));
  storeBoth('pai_manager_mode', 'account');
  storeBoth('pai_manager_authenticated', 'true');
};

const _origFetch = window.fetch.bind(window);
let _refreshing = null;
const ensureFreshToken = async (force = false) => {
  if (!isAccountSession()) return false;
  if (!force && Number(getStored('pai_manager_expires') || 0) - Date.now() > 120000) return false;
  if (_refreshing) return _refreshing;
  _refreshing = (async () => {
    try {
      const r = await _origFetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
        body: JSON.stringify({ refresh_token: getStored('pai_manager_refresh') })
      });
      if (!r.ok) {
        // Another tab may have just refreshed (refresh tokens are single-use): adopt its newer tokens and retry once.
        const theirs = localStorage.getItem('pai_manager_refresh');
        if (theirs && theirs !== getStored('pai_manager_refresh')) {
          sessionStorage.setItem('pai_manager_refresh', theirs);
          sessionStorage.setItem('pai_manager_passkey', localStorage.getItem('pai_manager_passkey') || '');
          sessionStorage.setItem('pai_manager_expires', localStorage.getItem('pai_manager_expires') || '0');
          return Number(localStorage.getItem('pai_manager_expires') || 0) - Date.now() > 0;
        }
        return false;
      }
      saveTokens(await r.json());
      return true;
    } catch { return false; } finally { _refreshing = null; }
  })();
  return _refreshing;
};

// Every call to an server call gets a fresh token; one retry if the server says it expired.
const swapToken = (init, from, to) => {
  if (!from || !init || typeof init.body !== 'string') return init;
  try {
    const body = JSON.parse(init.body);
    for (const key of ['passkey', 'currentPasskey']) if (body[key] === from) body[key] = to;
    return { ...init, body: JSON.stringify(body) };
  } catch { return init; }
};
window.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : (input && input.url) || '';
  if (!url.includes('/functions/v1/')) return _origFetch(input, init);
  if (!isAccountSession()) {
    // Shared-passkey session: no refresh exists, so a 401 means the passkey was turned off or changed.
    const r = await _origFetch(input, init);
    if (r.status === 401 && (isNodeAdminSession() || getStored('pai_manager_authenticated') === 'true') && !url.endsWith('/verify-passkey')) signOutToLogin('Your session has ended. Please sign in again.');
    return r;
  }
  const before = getPasskey();
  const refreshed = await ensureFreshToken();
  if (refreshed) init = swapToken(init, before, getPasskey());
  let res = await _origFetch(input, init);
  if (res.status === 401 && !refreshed) {
    const stale = getPasskey();
    if (await ensureFreshToken(true)) { init = swapToken(init, stale, getPasskey()); res = await _origFetch(input, init); }
  }
  if (res.status === 401 && isAccountSession()) signOutToLogin('Your session has expired. Please sign in again.');
  return res;
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

let currentSettings = {};
let allMedia = [];
let currentMediaFilter = 'all';

// Toast Notification
const showToast = (message, type = 'success') => {
  const toast = $('#toast');
  if (!toast) return;
  toast.textContent = message;
  toast.className = `show ${type}`;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.className = '';
  }, type === 'error' ? 8000 : 3500);
};

/* One reusable, accessible edit dialog (native <dialog>: focus is trapped, Esc closes).
   fields: [{ name, label, type: 'text'|'textarea'|'checkbox'|'url', value, maxlength, required, list }] */
const openEditDialog = ({ title, fields, onSave }) => new Promise((resolve) => {
  const dlg = document.getElementById('edit-dialog');
  const form = document.getElementById('edit-dialog-form');
  const box = document.getElementById('edit-dialog-fields');
  const note = document.getElementById('edit-dialog-note');
  const saveBtn = document.getElementById('edit-dialog-save');
  document.getElementById('edit-dialog-title').textContent = title;
  note.textContent = ''; note.className = 'form-note';
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  box.innerHTML = fields.map((f, i) => {
    const id = `ed-${i}`;
    if (f.type === 'checkbox') return `<label class="check-line"><input type="checkbox" id="${id}" data-name="${f.name}"${f.value ? ' checked' : ''}> ${esc(f.label)}</label>`;
    const input = f.type === 'textarea'
      ? `<textarea id="${id}" data-name="${f.name}" rows="5" maxlength="${f.maxlength || 4000}">${esc(f.value)}</textarea>`
      : `<input id="${id}" data-name="${f.name}" type="text" maxlength="${f.maxlength || 300}" value="${esc(f.value)}"${f.list ? ` list="${f.list}"` : ''}>`;
    return `<div class="form-group"><label for="${id}">${esc(f.label)}${f.required ? ' *' : ''}</label>${input}</div>`;
  }).join('');
  const done = () => { dlg.close(); form.onsubmit = null; resolve(); };
  document.getElementById('edit-dialog-cancel').onclick = done;
  dlg.oncancel = () => resolve();
  form.onsubmit = async (e) => {
    e.preventDefault();
    const values = {};
    for (const f of fields) {
      const el = box.querySelector(`[data-name="${f.name}"]`);
      values[f.name] = f.type === 'checkbox' ? el.checked : el.value.trim();
      if (f.required && !values[f.name]) { note.textContent = `${f.label} is required.`; note.className = 'form-note err'; el.focus(); return; }
    }
    saveBtn.disabled = true; saveBtn.textContent = 'Saving…';
    try { await onSave(values); done(); }
    catch (err) { note.textContent = err.message || 'Could not save. Please try again.'; note.className = 'form-note err'; }
    saveBtn.disabled = false; saveBtn.textContent = 'Save';
  };
  dlg.showModal();
  box.querySelector('input,textarea')?.focus();
});

const escAttr = (v) => String(v ?? '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

/* =========================================================================
   GIVING — structured payment methods editor
   ========================================================================= */
let payMethods = [];
const PAY_TEMPLATES = {
  momo:   { title: 'Mobile Money',  rows: [['Network', 'MTN Mobile Money'], ['Number', ''], ['Account name', 'Prayer Army International']] },
  bank:   { title: 'Bank Transfer', rows: [['Bank', ''], ['Account name', 'Prayer Army International'], ['Account number', ''], ['Branch', ''], ['SWIFT / Sort code', '']] },
  online: { title: 'Online / Card', rows: [['Platform', ''], ['Link', 'https://']] },
  other:  { title: '',              rows: [['', '']] }
};
const PAY_TYPE_NAMES = { momo: 'Mobile Money', bank: 'Bank', online: 'Online', other: 'Other' };

const renderPayEditor = () => {
  const host = $('#pay-methods-editor');
  if (!host) return;
  host.innerHTML = '';
  if (!payMethods.length) {
    host.innerHTML = '<p class="pay-help" style="margin-bottom:14px">No payment methods yet — use the buttons below to add one.</p>';
  }
  payMethods.forEach((m, mi) => {
    const box = document.createElement('div');
    box.className = 'pay-editor';
    box.innerHTML = `
      <div class="pay-editor-head">
        <span class="pay-type-tag">${PAY_TYPE_NAMES[m.type] || 'Other'}</span>
        <input type="text" class="pay-title" placeholder="Card title, e.g. MTN Mobile Money" value="${escAttr(m.title)}">
      </div>
      <div class="pay-rows-host"></div>
      <div class="pay-editor-tools">
        <button type="button" class="btn-mini" data-act="row">+ Add line</button>
        <button type="button" class="btn-mini" data-act="up" ${mi === 0 ? 'disabled' : ''}>↑ Move up</button>
        <button type="button" class="btn-mini" data-act="down" ${mi === payMethods.length - 1 ? 'disabled' : ''}>↓ Move down</button>
        <button type="button" class="btn-mini danger" data-act="del">Remove card</button>
      </div>`;
    const rowsHost = $('.pay-rows-host', box);
    m.rows.forEach((r, ri) => {
      const row = document.createElement('div');
      row.className = 'pay-editor-row';
      row.innerHTML = `
        <input type="text" class="pay-label" placeholder="Label (e.g. Account number)" value="${escAttr(r.label)}">
        <input type="text" class="pay-value" placeholder="Value" value="${escAttr(r.value)}">
        <button type="button" class="btn-mini danger" aria-label="Remove line">✕</button>`;
      $('.pay-label', row).addEventListener('input', (e) => { r.label = e.target.value; });
      $('.pay-value', row).addEventListener('input', (e) => { r.value = e.target.value; });
      $('button', row).addEventListener('click', () => { m.rows.splice(ri, 1); renderPayEditor(); });
      rowsHost.appendChild(row);
    });
    $('.pay-title', box).addEventListener('input', (e) => { m.title = e.target.value; });
    box.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (!act) return;
      if (act === 'row') m.rows.push({ label: '', value: '' });
      if (act === 'del') { if (!confirm('Remove this payment card?')) return; payMethods.splice(mi, 1); }
      if (act === 'up' && mi > 0) [payMethods[mi - 1], payMethods[mi]] = [payMethods[mi], payMethods[mi - 1]];
      if (act === 'down' && mi < payMethods.length - 1) [payMethods[mi + 1], payMethods[mi]] = [payMethods[mi], payMethods[mi + 1]];
      renderPayEditor();
    });
    host.appendChild(box);
  });
  updateConvertButton();
};

const addPayMethod = (type) => {
  const t = PAY_TEMPLATES[type] || PAY_TEMPLATES.other;
  payMethods.push({ type, title: t.title, rows: t.rows.map(([label, value]) => ({ label, value })) });
  renderPayEditor();
};
$$('[data-add-pay]').forEach((b) => b.addEventListener('click', () => addPayMethod(b.dataset.addPay)));

const collectPayMethods = () => payMethods
  .map((m) => ({
    type: m.type || 'other',
    title: (m.title || '').trim(),
    rows: m.rows
      .map((r) => ({ label: (r.label || '').trim(), value: (r.value || '').trim() }))
      .filter((r) => r.value && r.value !== 'https://')
  }))
  .filter((m) => m.rows.length);

// Turn old free-text ("MTN Momo : 0592…\nBANK DETAILS: 105…") into editable cards
const updateConvertButton = () => {
  const btn = $('#btn-convert-momo');
  if (btn) btn.hidden = !($('#field-give-momo')?.value.trim() && !payMethods.length);
};
$('#field-give-momo')?.addEventListener('input', updateConvertButton);
$('#btn-convert-momo')?.addEventListener('click', () => {
  const lines = $('#field-give-momo').value.split('\n').map((l) => l.trim()).filter(Boolean);
  const rows = lines.map((line) => {
    const i = line.indexOf(':');
    return i > 0 && i < 32 ? { label: line.slice(0, i).trim(), value: line.slice(i + 1).trim() } : { label: '', value: line };
  });
  payMethods.push({ type: 'momo', title: 'Mobile Money & Bank', rows });
  $('#field-give-momo').value = '';
  renderPayEditor();
  showToast('Converted — review the card, split it into Mobile Money / Bank cards if you like, then Save', 'success');
});

// Format bytes
const formatBytes = (bytes) => {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

/* =========================================================================
   1. AUTHENTICATION & SESSION MANAGEMENT
   ========================================================================= */
const authScreen = $('#auth-screen');
const adminApp = $('#admin-app');
const authForm = $('#auth-form');
$('#auth-error')?.setAttribute('role', 'alert');
const passkeyInput = $('#passkey-input');
const emailInput = $('#email-input');
const accountPwInput = $('#account-pw-input');
const authError = $('#auth-error');
const togglePwBtn = $('#toggle-pw-btn');
const btnLogout = $('#btn-logout');

let me = null;               // who is signed in: { role, email, name, via, permissions }
let legacyEnabled = true;    // is the shared passkey still switched on?
const can = (perm) => !!me && me.permissions.includes(perm);
const ROLE_LABEL = { owner: 'System admin', editor: 'Editor', media: 'Media', care: 'Pastoral care', registrar: 'Church registrar', usher: 'Attendance usher' };

let authMode = 'account';
const setAuthMode = (mode) => {
  authMode = mode;
  const acct = mode === 'account';
  $('#auth-account-fields').hidden = !acct;
  $('#auth-passkey-fields').hidden = acct;
  emailInput.required = acct; accountPwInput.required = acct; passkeyInput.required = !acct;
  $('#auth-intro').textContent = acct ? 'Sign in with your own account to manage the website.' : 'Enter the shared passkey. A system admin can turn this off once everyone has their own account.';
  $('#auth-mode-toggle').textContent = acct ? 'Use the shared passkey instead' : 'Sign in with an account instead';
  authError.textContent = '';
  (acct ? emailInput : passkeyInput).focus();
};
$('#auth-mode-toggle')?.addEventListener('click', () => setAuthMode(authMode === 'account' ? 'passkey' : 'account'));

// Back to the sign-in screen (used on sign out, expired sessions and removed access)
function signOutToLogin(message) {
  clearSession();
  sessionStorage.removeItem(NODE_SESSION_KEY);
  me = null;
  // Drop everything the previous person could see so the next sign-in (maybe another role) never inherits it
  ['requests-admin-list', 'connect-admin-list', 'testimonies-admin-list', 'wall-admin-list', 'messages-admin-list', 'dash-body', 'analytics-body']
    .forEach((id) => { const el = document.getElementById(id); if (el) el.innerHTML = ''; });
  try { requestsCache = []; testimoniesCache = []; wallCache = []; messagesCache = []; messageCommentsCache = {}; } catch {}
  document.body.classList.remove('drawer-open');
  adminApp.style.display = 'none';
  authScreen.style.display = 'flex';
  passkeyInput.value = ''; accountPwInput.value = '';
  authError.textContent = message || '';
}

const loadMe = async () => {
  if (isNodeAdminSession()) {
    try {
      const res=await _origFetch(`${SUPABASE_URL}/admin/session`,{credentials:'same-origin',cache:'no-store'});
      if(!res.ok)return {error:'Your admin session has expired. Sign in again.'};
      const body=await res.json();
      me=body.user;
      legacyEnabled=!!body.legacy_enabled;
      return {me};
    }catch{return {error:'Could not reach the server. Please reload.',network:true};}
  }
  try {
    const res = await fetch(`${EDGE_BASE}/admin-users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify({ passkey: getPasskey(), action: 'whoami' })
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { error: body.error || 'Could not check your access.', network: res.status >= 500 };
    me = body.me; legacyEnabled = !!body.legacy_enabled;
    return { me };
  } catch { return { error: 'Could not reach the server. Check your connection and reload the page.', network: true }; }
};

// Show only the tabs this person's role allows
const VIEW_PERM = { 'view-dashboard': null, 'view-media': 'media', 'view-messages': 'messages', 'view-requests': 'care', 'view-connect': 'care',
  'view-testimonies': 'care', 'view-wall': 'care', 'view-analytics': 'analytics', 'view-team': 'team', 'view-security': null };
const applyRoleUI = () => {
  const permFor = (viewId) => (viewId in VIEW_PERM ? VIEW_PERM[viewId] : 'settings');
  let first = null, activeHidden = false;
  sidebarButtons.forEach((b) => {
    const perm = permFor(b.dataset.view);
    const allowed = !perm || can(perm);
    b.style.display = allowed ? '' : 'none';
    if (allowed && !first) first = b;
    if (!allowed && b.classList.contains('active')) activeHidden = true;
  });
  // hide group headings with nothing left under them
  $$('.nav-group-title').forEach((t) => {
    let n = t.nextElementSibling, any = false;
    while (n && !n.classList.contains('nav-group-title')) { if (n.style.display !== 'none') any = true; n = n.nextElementSibling; }
    t.style.display = any ? '' : 'none';
  });
  if (activeHidden && first) first.click();
  $('#btn-save-all') && ($('#btn-save-all').style.display = can('settings') ? '' : 'none');
  $('#btn-preview') && ($('#btn-preview').style.display = can('settings') ? '' : 'none');
  $('#live-broadcast-pill') && ($('#live-broadcast-pill').style.display = can('settings') ? '' : 'none');
  $('#legacy-card') && ($('#legacy-card').hidden = !can('security'));
  $('#tracking-card') && ($('#tracking-card').hidden = !can('security'));
  const backup = $('#btn-export-backup')?.closest('.card');
  if (backup) backup.hidden = !can('settings');
  const chip = $('#whoami-chip');
  if (chip) chip.textContent = `${me.name || me.email} · ${ROLE_LABEL[me.role] || me.role}`;
  const academyLink=document.getElementById('academy-management-link');
  if(academyLink)academyLink.hidden=!isNodeAdminSession()||!can('security');
  const academyCard=document.getElementById('academy-setup-card');
  if(academyCard)academyCard.hidden=!isNodeAdminSession()||!can('security');
  const churchLink=document.getElementById('church-management-link');
  if(churchLink)churchLink.hidden=!isNodeAdminSession()||!me.permissions.some(p=>['members','attendance','reports'].includes(p));
  $$('#team-role option').forEach(o=>{if(['registrar','usher'].includes(o.value)){o.hidden=!isNodeAdminSession();o.disabled=!isNodeAdminSession();}});
  renderAccountCard();
};

const showDashboard = async () => {
  const r = await loadMe();
  if (r.error) {
    if (r.network) {
      // Server unreachable: do NOT wipe a valid sign-in; just say so and let a reload retry.
      authScreen.style.display = 'flex'; adminApp.style.display = 'none';
      authError.textContent = r.error;
      return;
    }
    signOutToLogin(r.error); return;
  }
  authScreen.style.display = 'none';
  adminApp.style.display = 'flex';
  applyRoleUI();
  $('.sidebar-btn[data-view="view-dashboard"]')?.click();   // always start on the Dashboard for whoever just signed in
  window.__paiAdminReady = true;
  document.dispatchEvent(new CustomEvent('pai:admin-ready'));
  loadSettings();
  if (can('media') || can('messages')) loadMedia();
  if (can('messages')) loadMessagesAdmin();
  if (can('care')) { loadPrayerRequests(); loadConnectAdmin(); loadTestimoniesAdmin(); loadWallAdmin(); }
  if (can('team')) loadTeam();
};

const checkAuthSession = async () => {
  const isAuth = isNodeAdminSession() || ((sessionStorage.getItem('pai_manager_authenticated') === 'true' ||
                 localStorage.getItem('pai_manager_authenticated') === 'true') &&
                 getPasskey() !== '');
  if (isAuth) {
    showDashboard();
  } else {
    // Reuse the HttpOnly Node staff cookie when arriving from the church workspace.
    try {
      const response=await _origFetch(`${SUPABASE_URL}/admin/session`,{credentials:'same-origin',cache:'no-store'});
      if(response.ok){sessionStorage.setItem(NODE_SESSION_KEY,'true');await showDashboard();return;}
    } catch { /* Show the normal sign-in form when the backend is unavailable. */ }
    authScreen.style.display = 'flex';
    adminApp.style.display = 'none';
    setAuthMode('account');
  }
};

const wirePwToggle = (btn, input) => btn?.addEventListener('click', () => {
  const isPw = input.type === 'password';
  input.type = isPw ? 'text' : 'password';
  btn.textContent = isPw ? '🔒' : '👁';
});
wirePwToggle(togglePwBtn, passkeyInput);
wirePwToggle($('#toggle-account-pw-btn'), accountPwInput);

authForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  authError.textContent = '';
  const submitBtn = $('#btn-auth-submit');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Signing in...';

  try {
    const runtimeResponse = await _origFetch(`${SUPABASE_URL}/runtime`, { cache: 'no-store' });
    if (!runtimeResponse.ok) throw Error('Could not identify the hosting backend');
    const nodeProbe = (await runtimeResponse.json()).backend === 'node';
    if (authMode === 'account') {
      if(nodeProbe){
        const res=await _origFetch(`${SUPABASE_URL}/admin/login`,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:emailInput.value.trim().toLowerCase(),password:accountPwInput.value})});
        const body=await res.json().catch(()=>({}));
        if(!res.ok){authError.textContent=body.error||'Unable to sign in';return;}
        clearSession();
        sessionStorage.setItem(NODE_SESSION_KEY,'true');
        accountPwInput.value='';
        await showDashboard();
        return;
      }
      const res = await _origFetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
        body: JSON.stringify({ email: emailInput.value.trim().toLowerCase(), password: accountPwInput.value })
      });
      if (!res.ok) {
        authError.textContent = res.status === 429 ? 'Too many attempts. Please wait a few minutes and try again.' : 'Incorrect email or password.';
        accountPwInput.select();
        return;
      }
      saveTokens(await res.json());
      const r = await loadMe();
      if (r.error) { signOutToLogin(r.error); return; }
      accountPwInput.value = '';
      await showDashboard();
      showToast('Signed in', 'success');
    } else {
      const passkey = passkeyInput.value.trim();
      const res = await fetch(nodeProbe ? `${SUPABASE_URL}/verify-passkey` : `${EDGE_BASE}/verify-passkey`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
        body: JSON.stringify({ passkey })
      });
      if (res.ok) {
        if (nodeProbe) {
          clearSession();
          sessionStorage.setItem(NODE_SESSION_KEY, 'true');
          passkeyInput.value = '';
          await showDashboard();
          return;
        }
        sessionStorage.setItem('pai_manager_authenticated', 'true');
        localStorage.setItem('pai_manager_authenticated', 'true');
        storeBoth('pai_manager_mode', 'passkey');
        setStoredPasskey(passkey);
        await showDashboard();
        showToast('Unlocked Site Manager Console', 'success');
      } else {
        const body = await res.json().catch(() => ({}));
        authError.textContent = res.status === 429 || res.status === 401 && body.error?.includes('turned off')
          ? (body.error || 'Too many attempts. Please wait before trying again.')
          : 'Incorrect passkey. Please check and try again.';
        passkeyInput.select();
      }
    }
  } catch (err) {
    authError.textContent = 'Could not reach the server. Check your connection and try again.';
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Sign in';
  }
});

btnLogout?.addEventListener('click', async () => {
  if (isNodeAdminSession()) {
    await _origFetch(`${SUPABASE_URL}/admin/logout`,{method:'POST',credentials:'same-origin'}).catch(()=>{});
  } else if (isAccountSession()) {
    // best effort: also end the session on the server
    _origFetch(`${SUPABASE_URL}/auth/v1/logout`, { method: 'POST', headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${getPasskey()}` } }).catch(() => {});
  }
  signOutToLogin('');
  setAuthMode('account');
  showToast('Signed out of Site Manager', 'success');
});

/* =========================================================================
   2. TAB NAVIGATION
   ========================================================================= */
const sidebarButtons = $$('.sidebar-btn');
const tabViews = $$('.tab-view');

sidebarButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    sidebarButtons.forEach(b => b.classList.remove('active'));
    tabViews.forEach(v => v.classList.remove('active'));

    btn.classList.add('active');
    const viewId = btn.dataset.view;
    const targetView = $(`#${viewId}`);
    if (targetView) targetView.classList.add('active');
    if (viewId === 'view-analytics' && typeof loadAnalytics === 'function') loadAnalytics();
  });
});

/* =========================================================================
   3. SETTINGS DATA & DOM POPULATION
   ========================================================================= */
let nodeSettingsRevision = null;
const loadSettings = async () => {
  if(isNodeAdminSession()){
    try{
      const response=await _origFetch(`${SUPABASE_URL}/settings`,{cache:'no-store'});
      if(!response.ok)throw Error('Settings unavailable');
      currentSettings=await response.json();
      nodeSettingsRevision=Number(response.headers.get('X-Settings-Revision'));
      if(!Number.isSafeInteger(nodeSettingsRevision)||nodeSettingsRevision<1)throw Error('Settings revision unavailable');
      populateForm(currentSettings);
    }catch(err){showToast(err.message,'error');}
    return;
  }
  let defaults = {};
  try {
    const defaultsRes = await fetch('/site-settings.json', { cache: 'no-store' });
    if (defaultsRes.ok) defaults = await defaultsRes.json();
  } catch {}
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/site_settings?select=data&id=eq.1`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
    );
    if (res.ok) {
      const rows = await res.json();
      const stored = rows?.[0]?.data || {};
      currentSettings = { ...defaults, ...stored, content: { ...(defaults.content || {}), ...(stored.content || {}) } };
      populateForm(currentSettings);
    } else if (Object.keys(defaults).length) {
      currentSettings = defaults;
      populateForm(currentSettings);
    }
  } catch (err) {
    if (Object.keys(defaults).length) {
      currentSettings = defaults;
      populateForm(currentSettings);
    } else showToast('Failed to load settings from server', 'error');
  }
};


/* =========================================================================
   EVENTS (rolling) + WEEKLY ACTIVITIES EDITORS
   ========================================================================= */
const WEEK_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Every day'];
const isoToLocalValue = (iso) => { try { return new Date(iso).toISOString().slice(0, 16); } catch { return ''; } };
const localValueToIso = (v) => (v ? new Date(v + ':00Z').toISOString() : '');

const eventRowHtml = (ev = {}) => `
  <div class="repeat-row" data-kind="event">
    <div class="repeat-row-head"><span>Event</span><button type="button" class="btn-mini danger btn-remove-row">Remove</button></div>
    <div class="form-grid-2">
      <div class="form-group"><label>Title</label><input type="text" class="ev-title" value="${escAttr(ev.title)}" placeholder="Youth Revival Night"></div>
      <div class="form-group"><label>Display dates text</label><input type="text" class="ev-dates" value="${escAttr(ev.dates)}" placeholder="Fri 12 December 2026, 6:00 PM"></div>
    </div>
    <div class="form-grid-2">
      <div class="form-group"><label>Venue</label><input type="text" class="ev-venue" maxlength="160" value="${escAttr(ev.venue)}" placeholder="Church auditorium, Wa"></div>
      <div class="form-group"><label class="check-line"><input type="checkbox" class="ev-published"${ev.published === false ? '' : ' checked'}> Published (untick to hide without deleting)</label></div>
    </div>
    <div class="form-group"><label>Description</label><textarea class="ev-desc" rows="2">${escAttr(ev.description)}</textarea></div>
    <div class="form-grid-2">
      <div class="form-group"><label>Starts (countdown)</label><input type="datetime-local" class="ev-start" value="${escAttr(isoToLocalValue(ev.start))}"></div>
      <div class="form-group"><label>Ends (hides after this)</label><input type="datetime-local" class="ev-end" value="${escAttr(isoToLocalValue(ev.end))}"></div>
    </div>
    <div class="form-grid-2">
      <div class="form-group"><label>Registration / flyer link (optional)</label><input type="url" class="ev-link" value="${escAttr(ev.link)}" placeholder="https://..."></div>
      <div class="form-group"><label>Poster image (pick from library or paste a URL)</label><input type="text" class="ev-image" list="event-image-options" value="${escAttr(ev.image)}" placeholder="assets/images/..."></div>
    </div>
  </div>`;

const weeklyRowHtml = (a = {}) => `
  <div class="repeat-row" data-kind="weekly">
    <div class="repeat-row-head"><span>Weekly activity</span><button type="button" class="btn-mini danger btn-remove-row">Remove</button></div>
    <div class="form-grid-2">
      <div class="form-group"><label>Day</label><select class="wk-day">${WEEK_DAYS.map(d => `<option${d === (a.day || 'Sunday') ? ' selected' : ''}>${d}</option>`).join('')}</select></div>
      <div class="form-group"><label>Time</label><input type="text" class="wk-time" value="${escAttr(a.time)}" placeholder="8:00 AM – 11:00 AM"></div>
    </div>
    <div class="form-grid-2">
      <div class="form-group"><label>Activity</label><input type="text" class="wk-title" value="${escAttr(a.title)}" placeholder="Sunday Worship Service"></div>
      <div class="form-group"><label>Location (optional)</label><input type="text" class="wk-location" value="${escAttr(a.location)}" placeholder="Main sanctuary, Wa"></div>
    </div>
    <div class="form-group"><label>Short description (optional)</label><textarea class="wk-desc" rows="2">${escAttr(a.description)}</textarea></div>
  </div>`;

const renderEventEditors = (s) => {
  const evBox = $('#events-editor'), wkBox = $('#weekly-editor');
  if (evBox) evBox.innerHTML = (Array.isArray(s.events) ? s.events : []).map(eventRowHtml).join('');
  if (wkBox) wkBox.innerHTML = (Array.isArray(s.weekly) ? s.weekly : []).map(weeklyRowHtml).join('');
  refreshEventImageOptions();
};

const refreshEventImageOptions = () => {
  const dl = $('#event-image-options');
  if (!dl) return;
  dl.innerHTML = (typeof allMedia !== 'undefined' ? allMedia : [])
    .filter(m => m.type === 'image' && !m.hidden)
    .map(m => `<option value="${escAttr(m.url)}">${escAttr(m.filename)}</option>`).join('');
};

const collectEventRows = () => $$('#events-editor .repeat-row').map(row => ({
  title: $('.ev-title', row).value.trim(),
  dates: $('.ev-dates', row).value.trim(),
  description: $('.ev-desc', row).value.trim(),
  start: localValueToIso($('.ev-start', row).value),
  end: localValueToIso($('.ev-end', row).value),
  link: $('.ev-link', row).value.trim(),
  image: $('.ev-image', row).value.trim(),
  venue: $('.ev-venue', row).value.trim(),
  published: $('.ev-published', row).checked
})).filter(ev => ev.title);

/* =========================================================================
   ANNOUNCEMENTS EDITOR (settings.announcements)
   ========================================================================= */
const ANNOUNCE_CATS = [['programme', 'Church programme'], ['service', 'Special service'], ['notice', 'Important notice'], ['update', 'Ministry update']];
const announceRowHtml = (a = {}) => `
  <div class="repeat-row announce-row" data-kind="announcement">
    <div class="repeat-row-head"><span>Announcement</span><button type="button" class="btn-mini danger btn-remove-row">Remove</button></div>
    <div class="form-grid-2">
      <div class="form-group"><label>Title</label><input type="text" class="an-title" maxlength="120" value="${escAttr(a.title)}" placeholder="Special thanksgiving service"></div>
      <div class="form-group"><label>Type</label><select class="an-cat">${ANNOUNCE_CATS.map(([v, l]) => `<option value="${v}"${v === (a.category || 'update') ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
    </div>
    <div class="form-group"><label>Message</label><textarea class="an-body" rows="3" maxlength="600">${escAttr(a.body)}</textarea></div>
    <div class="form-grid-2">
      <div class="form-group"><label>Show from (optional)</label><input type="date" class="an-date" value="${escAttr(a.date)}"><small>Leave empty to show immediately. A future date schedules it.</small></div>
      <div class="form-group"><label>Hide after (optional)</label><input type="date" class="an-expires" value="${escAttr(a.expires)}"><small>It disappears automatically after this day.</small></div>
    </div>
    <div class="form-grid-2">
      <div class="form-group"><label>Link (optional)</label><input type="text" class="an-link" value="${escAttr(a.link)}" placeholder="https://… or #events"></div>
      <div class="form-group"><label>Link text</label><input type="text" class="an-linktext" maxlength="40" value="${escAttr(a.linkText)}" placeholder="Learn more"></div>
    </div>
    <label class="check-line"><input type="checkbox" class="an-published"${a.published ? ' checked' : ''}> Published</label>
    <label class="check-line"><input type="checkbox" class="an-pinned"${a.pinned ? ' checked' : ''}> Pin to the top</label>
  </div>`;
const renderAnnouncementEditor = (s) => {
  const box = $('#announcements-editor');
  if (box) box.innerHTML = (Array.isArray(s.announcements) ? s.announcements : []).map(announceRowHtml).join('')
    || '<p class="muted-note" id="announce-empty">No announcements yet. Click “Add announcement”.</p>';
};
const collectAnnouncementRows = () => $$('#announcements-editor .announce-row').map(row => ({
  title: $('.an-title', row).value.trim(),
  category: $('.an-cat', row).value,
  body: $('.an-body', row).value.trim(),
  date: $('.an-date', row).value,
  expires: $('.an-expires', row).value,
  link: $('.an-link', row).value.trim(),
  linkText: $('.an-linktext', row).value.trim(),
  published: $('.an-published', row).checked,
  pinned: $('.an-pinned', row).checked
})).filter(a => a.title);
$('#btn-add-announcement')?.addEventListener('click', () => {
  $('#announce-empty')?.remove();
  $('#announcements-editor')?.insertAdjacentHTML('beforeend', announceRowHtml({ published: true }));
  $('#announcements-editor .announce-row:last-child .an-title')?.focus();
});
$('#announcements-editor')?.addEventListener('click', (e) => {
  const btn = e.target.closest('.btn-remove-row');
  if (btn && confirm('Remove this announcement? (It leaves the site only after you click Save Changes.)')) btn.closest('.announce-row')?.remove();
});

const collectWeeklyRows = () => $$('#weekly-editor .repeat-row').map(row => ({
  day: $('.wk-day', row).value,
  time: $('.wk-time', row).value.trim(),
  title: $('.wk-title', row).value.trim(),
  location: $('.wk-location', row).value.trim(),
  description: $('.wk-desc', row).value.trim()
})).filter(a => a.title);

$('#btn-add-event')?.addEventListener('click', () => {
  $('#events-editor')?.insertAdjacentHTML('beforeend', eventRowHtml({}));
  $('#events-editor .repeat-row:last-child .ev-title')?.focus();
});
$('#btn-add-weekly')?.addEventListener('click', () => {
  $('#weekly-editor')?.insertAdjacentHTML('beforeend', weeklyRowHtml({}));
  $('#weekly-editor .repeat-row:last-child .wk-title')?.focus();
});
['#events-editor', '#weekly-editor'].forEach(sel => {
  $(sel)?.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-remove-row');
    if (btn && confirm('Remove this entry? (It is only removed from the site after you click Save Changes.)')) {
      btn.closest('.repeat-row')?.remove();
    }
  });
});

const DEFAULT_VERSES = [
  { text: 'The LORD is my shepherd; I shall not want.', ref: 'Psalm 23:1' },
  { text: 'I can do all things through Christ which strengtheneth me.', ref: 'Philippians 4:13' },
  { text: 'Trust in the LORD with all thine heart; and lean not unto thine own understanding.', ref: 'Proverbs 3:5' },
  { text: 'Be strong and of a good courage; be not afraid, neither be thou dismayed: for the LORD thy God is with thee whithersoever thou goest.', ref: 'Joshua 1:9' },
  { text: 'Pray without ceasing.', ref: '1 Thessalonians 5:17' },
  { text: 'Call unto me, and I will answer thee, and shew thee great and mighty things, which thou knowest not.', ref: 'Jeremiah 33:3' },
  { text: 'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.', ref: 'John 3:16' }
];

const verseRowHtml = (v = {}) => `
  <div class="repeat-row">
    <div class="repeat-row-head"><span>Verse</span><button type="button" class="btn-mini danger btn-remove-row">Remove</button></div>
    <div class="form-group"><label>Verse text</label><textarea class="vs-text" rows="2">${escAttr(v.text)}</textarea></div>
    <div class="form-group"><label>Reference</label><input type="text" class="vs-ref" value="${escAttr(v.ref)}" placeholder="Psalm 23:1"></div>
  </div>`;
const branchRowHtml = (b = {}) => `
  <div class="repeat-row">
    <div class="repeat-row-head"><span>Branch</span><button type="button" class="btn-mini danger btn-remove-row">Remove</button></div>
    <div class="form-grid-2">
      <div class="form-group"><label>Branch name</label><input type="text" class="br-name" value="${escAttr(b.name)}" placeholder="Headquarters, Wa"></div>
      <div class="form-group"><label>Phone</label><input type="text" class="br-phone" value="${escAttr(b.phone)}" placeholder="024 000 0000"></div>
    </div>
    <div class="form-group"><label>Address</label><input type="text" class="br-address" value="${escAttr(b.address)}" placeholder="Street, town, region"></div>
    <div class="form-group"><label>Service times</label><textarea class="br-times" rows="2" placeholder="Sunday 8:00 AM&#10;Wednesday 6:00 PM">${escAttr(b.times)}</textarea></div>
    <div class="form-group"><label>Google Maps link (optional, otherwise built from the address)</label><input type="url" class="br-map" value="${escAttr(b.map)}" placeholder="https://maps.google.com/..."></div>
  </div>`;

const renderExtrasEditors = (s) => {
  const vb = $('#verses-editor'), bb = $('#branches-editor');
  const verses = Array.isArray(s.verses) ? s.verses : DEFAULT_VERSES;
  if (vb) vb.innerHTML = verses.map(verseRowHtml).join('');
  if (bb) bb.innerHTML = (Array.isArray(s.branches) ? s.branches : []).map(branchRowHtml).join('');
  const feed = $('#podcast-feed-url');
  if (feed) feed.value = `${location.origin}/podcast.xml`;
};
const collectVerseRows = () => $$('#verses-editor .repeat-row').map(r => ({ text: $('.vs-text', r).value.trim(), ref: $('.vs-ref', r).value.trim() })).filter(v => v.text);
const collectBranchRows = () => $$('#branches-editor .repeat-row').map(r => ({
  name: $('.br-name', r).value.trim(), phone: $('.br-phone', r).value.trim(), address: $('.br-address', r).value.trim(),
  times: $('.br-times', r).value.trim(), map: $('.br-map', r).value.trim()
})).filter(b => b.name);

$('#btn-add-verse')?.addEventListener('click', () => { $('#verses-editor')?.insertAdjacentHTML('beforeend', verseRowHtml({})); $('#verses-editor .repeat-row:last-child .vs-text')?.focus(); });
$('#btn-add-branch')?.addEventListener('click', () => { $('#branches-editor')?.insertAdjacentHTML('beforeend', branchRowHtml({})); $('#branches-editor .repeat-row:last-child .br-name')?.focus(); });
['#verses-editor', '#branches-editor'].forEach(sel => $(sel)?.addEventListener('click', (e) => {
  const btn = e.target.closest('.btn-remove-row');
  if (btn && confirm('Remove this entry? (It is only removed from the site after you click Save Changes.)')) btn.closest('.repeat-row')?.remove();
}));
$('#btn-copy-feed')?.addEventListener('click', async () => {
  const v = $('#podcast-feed-url')?.value || '';
  try { await navigator.clipboard.writeText(v); showToast('Podcast feed link copied', 'success'); } catch { $('#podcast-feed-url')?.select(); }
});

/* =========================================================================
   PAGE BUILDER: section order / visibility / publishing / custom sections,
   friendly page-text editor, and preview (nothing is published until Save).
   ========================================================================= */
const SECTION_CATALOG = [
  { id: 'hero-section', label: 'Hero banner', pinned: true },
  { id: 'quick-links', label: 'Quick links strip' },
  { id: 'announcements', label: 'Announcements' },
  { id: 'verse', label: 'Verse of the day' },
  { id: 'about', label: 'About / welcome' },
  { id: 'foundation', label: 'Mission, vision & statement of faith' },
  { id: 'sermons', label: 'Sermons' },
  { id: 'live', label: 'Livestream' },
  { id: 'events', label: 'Events & weekly activities' },
  { id: 'gallery', label: 'Gallery' },
  { id: 'prayer', label: 'Prayer request form' },
  { id: 'prayer-wall', label: 'Prayer wall' },
  { id: 'testimonies', label: 'Testimonies' },
  { id: 'connect', label: 'Connect / new visitors' },
  { id: 'give', label: 'Giving' },
  { id: 'locations', label: 'Locations' },
  { id: 'contact', label: 'Contact' }
];
let layoutState = { items: [], custom: [] };
let openSectionId = null;

const loadLayoutState = (s) => {
  const lay = (s && s.layout) || {};
  const custom = (Array.isArray(lay.custom) ? lay.custom : []).filter((c) => c && c.id).map((c) => ({ ...c }));
  const known = new Set([...SECTION_CATALOG.map((b) => b.id), ...custom.map((c) => c.id)]);
  const items = [], seen = new Set();
  (Array.isArray(lay.items) ? lay.items : []).forEach((it) => {
    if (it && known.has(it.id) && !seen.has(it.id)) { seen.add(it.id); items.push({ id: it.id, visible: it.visible !== false, published: it.published !== false }); }
  });
  SECTION_CATALOG.forEach((b, i) => {
    if (seen.has(b.id)) return;
    seen.add(b.id);
    let at = items.length;
    for (let k = i - 1; k >= 0; k--) { const p = items.findIndex((x) => x.id === SECTION_CATALOG[k].id); if (p >= 0) { at = p + 1; break; } }
    items.splice(at, 0, { id: b.id, visible: true, published: true });   // new built-ins slot in where they normally sit
  });
  custom.forEach((c) => { if (!seen.has(c.id)) { seen.add(c.id); items.push({ id: c.id, visible: true, published: true }); } });
  const h = items.findIndex((x) => x.id === 'hero-section');
  if (h > 0) items.unshift(items.splice(h, 1)[0]);
  layoutState = { items, custom };
};

const collectLayout = () => ({
  items: layoutState.items.map((x) => ({ id: x.id, visible: x.visible !== false, published: x.published !== false })),
  custom: layoutState.custom.map((c) => ({ ...c }))
});

const sectionTitle = (id) => {
  const b = SECTION_CATALOG.find((x) => x.id === id);
  if (b) return b.label;
  const c = layoutState.custom.find((x) => x.id === id);
  return String((c && c.title) || 'Untitled section').replace(/\|/g, ' ');
};

const customEditorHtml = (c) => `
  <div class="lay-edit">
    <div class="form-grid-2">
      <div class="form-group"><label>Heading <small>(use | for a highlighted ending)</small></label><input type="text" data-f="title" value="${escAttr(c.title)}" maxlength="200" placeholder="Join our|prayer meeting"></div>
      <div class="form-group"><label>Small label above heading</label><input type="text" data-f="eyebrow" value="${escAttr(c.eyebrow)}" maxlength="120" placeholder="EVERY FRIDAY"></div>
    </div>
    <div class="form-group"><label>Text <small>(blank line = new paragraph)</small></label><textarea data-f="body" rows="5" maxlength="8000">${escAttr(c.body)}</textarea></div>
    <div class="form-grid-2">
      <div class="form-group"><label>Layout</label>
        <select data-f="style">${[['text', 'Text only'], ['image-right', 'Text + picture on the right'], ['image-left', 'Text + picture on the left'], ['banner', 'Banner (centred, background picture)']].map(([v, l]) => `<option value="${v}" ${(c.style || 'text') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="form-group"><label>Picture (pick from library or paste a link)</label><input type="text" data-f="imageUrl" list="event-image-options" value="${escAttr(c.imageUrl)}" placeholder="assets/images/..."></div>
    </div>
    <div class="form-group"><label>Background picture (optional)</label><input type="text" data-f="bgImage" list="event-image-options" value="${escAttr(c.bgImage)}" placeholder="assets/images/..."></div>
    <div class="form-grid-2">
      <div class="form-group"><label>Button 1 label</label><input type="text" data-f="buttonLabel" value="${escAttr(c.buttonLabel)}" maxlength="60"></div>
      <div class="form-group"><label>Button 1 link</label><input type="text" data-f="buttonUrl" value="${escAttr(c.buttonUrl)}" placeholder="https://... or #contact"></div>
      <div class="form-group"><label>Button 2 label</label><input type="text" data-f="button2Label" value="${escAttr(c.button2Label)}" maxlength="60"></div>
      <div class="form-group"><label>Button 2 link</label><input type="text" data-f="button2Url" value="${escAttr(c.button2Url)}" placeholder="https://... or #contact"></div>
    </div>
    <div class="form-grid-2">
      <div class="form-group"><label style="display:flex;gap:8px;align-items:center"><input type="checkbox" data-f="showInMenu" ${c.showInMenu ? 'checked' : ''}> Show in the top menu</label></div>
      <div class="form-group"><label>Menu label</label><input type="text" data-f="navLabel" value="${escAttr(c.navLabel)}" maxlength="30" placeholder="Fellowship"></div>
    </div>
  </div>`;

const renderLayoutEditor = () => {
  const box = $('#layout-list');
  if (!box) return;
  box.innerHTML = layoutState.items.map((it, i) => {
    const builtin = SECTION_CATALOG.find((b) => b.id === it.id);
    const pinned = !!(builtin && builtin.pinned);
    const c = builtin ? null : layoutState.custom.find((x) => x.id === it.id);
    const off = !pinned && it.visible === false;
    const upOff = pinned || i <= 1;
    const downOff = pinned || i === layoutState.items.length - 1;
    return `<div class="lay-row ${off ? 'is-off' : ''}" data-id="${escAttr(it.id)}">
      <div class="lay-main">
        <div class="lay-move"><button type="button" data-act="up" ${upOff ? 'disabled' : ''} aria-label="Move up">▲</button><button type="button" data-act="down" ${downOff ? 'disabled' : ''} aria-label="Move down">▼</button></div>
        <div class="lay-name"><span data-role="name">${escAttr(sectionTitle(it.id))}</span>${pinned ? '<span class="lay-badge">ALWAYS FIRST</span>' : ''}${c ? '<span class="lay-badge">CUSTOM</span>' : ''}${!pinned && it.published === false ? '<span class="lay-badge draft">DRAFT</span>' : ''}<small>#${escAttr(it.id)}</small></div>
        <div class="lay-flags">
          <label><input type="checkbox" data-flag="visible" ${it.visible !== false ? 'checked' : ''} ${pinned ? 'disabled' : ''}> Visible</label>
          <label><input type="checkbox" data-flag="published" ${it.published !== false ? 'checked' : ''} ${pinned ? 'disabled' : ''}> Published</label>
          ${c ? `<button type="button" class="btn-mini" data-act="edit">${openSectionId === it.id ? 'Close' : 'Edit'}</button><button type="button" class="btn-mini danger" data-act="delete">Delete</button>` : ''}
        </div>
      </div>
      ${c && openSectionId === it.id ? customEditorHtml(c) : ''}
    </div>`;
  }).join('');
};

const layoutBoxEvents = () => {
  const box = $('#layout-list');
  if (!box || box.dataset.wired) return;
  box.dataset.wired = '1';
  const rowOf = (el) => el.closest('.lay-row');
  box.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const row = rowOf(btn); const id = row.dataset.id;
    const i = layoutState.items.findIndex((x) => x.id === id);
    const act = btn.dataset.act;
    if (act === 'up' && i > 1) [layoutState.items[i - 1], layoutState.items[i]] = [layoutState.items[i], layoutState.items[i - 1]];
    else if (act === 'down' && i < layoutState.items.length - 1) [layoutState.items[i + 1], layoutState.items[i]] = [layoutState.items[i], layoutState.items[i + 1]];
    else if (act === 'edit') openSectionId = openSectionId === id ? null : id;
    else if (act === 'delete') {
      if (!confirm('Delete this section? This cannot be undone after you save.')) return;
      layoutState.items.splice(i, 1);
      layoutState.custom = layoutState.custom.filter((x) => x.id !== id);
      if (openSectionId === id) openSectionId = null;
    } else return;
    renderLayoutEditor(); sendPreviewSoon();
  });
  box.addEventListener('change', (e) => {
    const row = rowOf(e.target); if (!row) return;
    const id = row.dataset.id;
    if (e.target.dataset.flag) {
      const it = layoutState.items.find((x) => x.id === id);
      if (it) it[e.target.dataset.flag] = e.target.checked;
      renderLayoutEditor();
    } else if (e.target.dataset.f) {
      const c = layoutState.custom.find((x) => x.id === id);
      if (c) c[e.target.dataset.f] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    }
  });
  box.addEventListener('input', (e) => {
    const f = e.target.dataset && e.target.dataset.f;
    if (!f) return;
    const row = rowOf(e.target); const c = layoutState.custom.find((x) => x.id === row.dataset.id);
    if (!c) return;
    c[f] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    if (f === 'title') { const n = $('[data-role="name"]', row); if (n) n.textContent = sectionTitle(c.id); }
  });
};

const addCustomSection = () => {
  if (layoutState.custom.length >= 40) { showToast('You can add up to 40 custom sections.', 'error'); return; }
  const id = 'c-' + Math.random().toString(36).slice(2, 8);
  layoutState.custom.push({ id, title: 'New section', eyebrow: '', body: '', imageUrl: '', bgImage: '', buttonLabel: '', buttonUrl: '', button2Label: '', button2Url: '', style: 'text', navLabel: '', showInMenu: false });
  layoutState.items.push({ id, visible: true, published: false });   // new sections start as drafts
  openSectionId = id;
  renderLayoutEditor(); sendPreviewSoon();
  showToast('Section added as a draft. Fill it in, tick Published, then Save Changes.', 'success');
};

/* ---- friendly page-text editor (reads and writes the same JSON as the Advanced box) ---- */
const humanizeKey = (k) => String(k).replace(/([A-Z])/g, ' $1').replace(/(\d+)/g, ' $1').replace(/^./, (ch) => ch.toUpperCase()).trim();
const PT_GROUPS = [
  ['Menu & buttons', null],
  ['Quick links', /^quick/], ['Foundation, mission & faith', /^(foundation|mission|vision|values|faith(?!Statements)|story|founder|aboutExplore)/],
  ['Sermons', /^sermons/], ['Events & weekly', /^(events|weekly)/], ['Gallery', /^gallery/],
  ['Prayer wall & testimonies', /^(wall|testimonies)/], ['Connect', /^connect/], ['Giving & locations', /^(giving|locations)/],
  ['Contact & social', /^(contact|social)/], ['Footer', /^footer/]
];
const getContentObj = () => {
  try { const o = JSON.parse($('#field-page-content')?.value || '{}'); return o && typeof o === 'object' && !Array.isArray(o) ? o : null; } catch { return null; }
};
const writeContentObj = (o) => { const ta = $('#field-page-content'); if (ta) ta.value = JSON.stringify(o, null, 2); sendPreviewSoon(); };
const ptField = (attr, key, val) => {
  const long = String(val).length > 80 || String(val).includes('\n');
  return `<div class="${long ? 'wide' : ''}"><label>${escAttr(humanizeKey(key))}</label>${long
    ? `<textarea ${attr}="${escAttr(key)}" rows="${Math.min(6, Math.ceil(String(val).length / 90) + 1)}">${escAttr(val)}</textarea>`
    : `<input type="text" ${attr}="${escAttr(key)}" value="${escAttr(val)}">`}</div>`;
};
const renderPageText = () => {
  const box = $('#page-text-editor');
  if (!box) return;
  const obj = getContentObj();
  if (obj === null) { box.innerHTML = '<p class="form-help">The Advanced JSON box in About &amp; Foundation has a mistake. Fix it there and this editor will come back.</p>'; return; }
  const uiText = obj.uiText && typeof obj.uiText === 'object' ? obj.uiText : {};
  const keys = Object.keys(obj).filter((k) => typeof obj[k] === 'string');
  const claimed = new Set();
  let html = '';
  PT_GROUPS.slice(1).forEach(([title, re]) => {
    const ks = keys.filter((k) => !claimed.has(k) && re.test(k));
    ks.forEach((k) => claimed.add(k));
    if (ks.length) html += `<div class="pt-group"><h4>${title}</h4><div class="pt-grid">${ks.map((k) => ptField('data-k', k, obj[k])).join('')}</div></div>`;
  });
  const rest = keys.filter((k) => !claimed.has(k));
  if (rest.length) html += `<div class="pt-group"><h4>Other text</h4><div class="pt-grid">${rest.map((k) => ptField('data-k', k, obj[k])).join('')}</div></div>`;
  const uk = Object.keys(uiText).filter((k) => typeof uiText[k] === 'string');
  if (uk.length) html += `<div class="pt-group"><h4>Menu, buttons &amp; form labels</h4><div class="pt-grid">${uk.map((k) => ptField('data-ui', k, uiText[k])).join('')}</div></div>`;
  const faith = Array.isArray(obj.faithStatements) ? obj.faithStatements : [];
  html += `<div class="pt-group"><h4>Statement of faith</h4><div id="pt-faith">${faith.map((t, i) => `<div class="pt-faith-row"><textarea data-faith="${i}" rows="2">${escAttr(t)}</textarea><button type="button" class="btn-mini danger" data-faith-del="${i}">Remove</button></div>`).join('')}</div><button type="button" class="btn-mini" id="pt-faith-add">+ Add a statement</button></div>`;
  box.innerHTML = html;
};
const wirePageText = () => {
  const box = $('#page-text-editor');
  if (!box || box.dataset.wired) return;
  box.dataset.wired = '1';
  box.addEventListener('input', (e) => {
    const t = e.target; const obj = getContentObj(); if (!obj) return;
    if (t.dataset.k) obj[t.dataset.k] = t.value;
    else if (t.dataset.ui) { obj.uiText = obj.uiText && typeof obj.uiText === 'object' ? obj.uiText : {}; obj.uiText[t.dataset.ui] = t.value; }
    else if (t.dataset.faith !== undefined) { if (!Array.isArray(obj.faithStatements)) obj.faithStatements = []; obj.faithStatements[Number(t.dataset.faith)] = t.value; }
    else return;
    writeContentObj(obj);
  });
  box.addEventListener('click', (e) => {
    const obj = getContentObj(); if (!obj) return;
    const del = e.target.closest('[data-faith-del]');
    if (del) { obj.faithStatements = (obj.faithStatements || []).filter((_, i) => i !== Number(del.dataset.faithDel)); writeContentObj(obj); renderPageText(); }
    else if (e.target.closest('#pt-faith-add')) { obj.faithStatements = [...(obj.faithStatements || []), '']; writeContentObj(obj); renderPageText(); }
  });
  $('#field-page-content')?.addEventListener('change', renderPageText);
};

/* ---- preview ---- */
let previewWin = null, previewTimer = null;
const sendPreview = () => {
  if (!previewWin || previewWin.closed || getContentObj() === null) return;
  try { previewWin.postMessage({ type: 'pai-preview', settings: collectFormData() }, location.origin); } catch { /* window gone */ }
};
function sendPreviewSoon() { clearTimeout(previewTimer); previewTimer = setTimeout(sendPreview, 500); }
const openPreview = () => {
  previewWin = window.open('/?preview=1', 'pai-preview');
  if (!previewWin) showToast('Your browser blocked the preview window. Please allow pop-ups for this site.', 'error');
};
window.addEventListener('message', (e) => {
  if (e.origin !== location.origin || !previewWin || e.source !== previewWin) return;
  if (e.data && e.data.type === 'pai-preview-ready') sendPreview();
});
$('#btn-preview')?.addEventListener('click', openPreview);
$('#btn-layout-preview')?.addEventListener('click', openPreview);
$('#btn-add-section')?.addEventListener('click', addCustomSection);
document.addEventListener('input', sendPreviewSoon);
document.addEventListener('change', sendPreviewSoon);

const populateForm = (s) => {
  // Live Broadcast
  const isLive = Boolean(s.live?.isLiveNow);
  $('#field-is-live').checked = isLive;
  $('#field-live-url').value = s.live?.url || '';
  $('#field-live-title').value = s.live?.title || '';
  $('#field-live-desc').value = s.live?.description || '';
  $('#field-live-status-note').value = s.live?.statusNote || '';
  updateLivePill(isLive);
  updateLiveStreamPreview(s.live?.url);

  $('#field-live-next-title').value = s.live?.nextTitle || '';
  $('#field-live-next-start').value = s.live?.nextStart ? isoToLocalValue(s.live.nextStart) : '';
  $('#field-hero-btn-visit-text').value = s.hero?.btnVisitText || '';
  $('#field-hero-btn-visit-link').value = s.hero?.btnVisitLink || '';
  $('#field-event-venue').value = s.event?.venue || '';
  $('#field-seo-title').value = s.seo?.title || '';
  $('#field-seo-desc').value = s.seo?.description || '';
  $('#field-seo-image').value = s.seo?.ogImage || '';
  renderAnnouncementEditor(s);

  // Hero Section
  $('#field-hero-eyebrow').value = s.hero?.eyebrow || '';
  $('#field-hero-title-main').value = s.hero?.titleMain || '';
  $('#field-hero-title-accent').value = s.hero?.titleAccent || '';
  $('#field-hero-copy').value = s.hero?.copy || '';
  $('#field-hero-tagline').value = s.hero?.tagline || '';
  $('#field-hero-btn-primary-text').value = s.hero?.btnPrimaryText || '';
  $('#field-hero-btn-primary-link').value = s.hero?.btnPrimaryLink || '';
  $('#field-hero-btn-secondary-text').value = s.hero?.btnSecondaryText || '';
  $('#field-hero-btn-secondary-link').value = s.hero?.btnSecondaryLink || '';
  $('#field-hero-bg').value = s.hero?.bgImage || '';
  updateHeroMediaPreview(s.hero?.bgImage);

  // General & Church
  $('#field-church-name').value = s.general?.churchName || '';
  $('#field-church-slogan').value = s.general?.slogan || '';
  $('#field-church-region').value = s.general?.region || '';
  $('#field-founder-name').value = s.general?.founder || '';
  $('#field-logo-url').value = s.general?.logoUrl || '';
  $('#logo-preview').src = s.general?.logoUrl || 'assets/images/prayer-army-logo.png';

  // Contacts
  $('#field-contact-phone').value = s.contact?.phone || '';
  $('#field-contact-whatsapp').value = s.contact?.whatsapp || '';
  $('#field-contact-email').value = s.contact?.email || '';
  $('#field-contact-address').value = s.contact?.address || '';

  // Sermons
  $('#field-sermons-heading').value = s.sermons?.heading || '';
  $('#field-sermons-library-url').value = s.sermons?.libraryUrl || '';
  $('#field-sermon-feat-kicker').value = s.sermons?.featuredKicker || '';
  $('#field-sermon-feat-title').value = s.sermons?.featuredTitle || '';
  $('#field-sermon-feat-desc').value = s.sermons?.featuredDesc || '';
  $('#field-sermon-feat-url').value = s.sermons?.featuredUrl || '';
  $('#field-sermon-mini1-title').value = s.sermons?.mini1Title || '';
  $('#field-sermon-mini1-url').value = s.sermons?.mini1Url || '';
  $('#field-sermon-mini2-title').value = s.sermons?.mini2Title || '';
  $('#field-sermon-mini2-url').value = s.sermons?.mini2Url || '';

  // Events
  $('#field-event-title').value = s.event?.title || '';
  $('#field-event-dates').value = s.event?.dates || '';
  $('#field-event-desc').value = s.event?.description || '';
  if (s.event?.start) {
    try { $('#field-event-start').value = new Date(s.event.start).toISOString().slice(0, 16); } catch {}
  }
  if (s.event?.end) {
    try { $('#field-event-end').value = new Date(s.event.end).toISOString().slice(0, 16); } catch {}
  }
  $('#field-event-link').value = s.event?.link || '';
  $('#field-event-caption').value = s.event?.stackCaption || '';
  renderEventEditors(s);
  renderExtrasEditors(s);

  // About & Foundation
  $('#field-about-eyebrow').value = s.about?.eyebrow || '';
  $('#field-about-heading').value = s.about?.heading || '';
  $('#field-about-p1').value = s.about?.p1 || '';
  $('#field-about-p2').value = s.about?.p2 || '';
  $('#field-mission-title').value = s.foundation?.missionTitle || '';
  $('#field-mission-text').value = s.foundation?.missionText || '';
  $('#field-vision-title').value = s.foundation?.visionTitle || '';
  $('#field-vision-text').value = s.foundation?.visionText || '';
  $('#field-values-title').value = s.foundation?.valuesTitle || '';
  $('#field-values-text').value = s.foundation?.valuesText || '';
  $('#field-founder-bio').value = s.foundation?.founderBio || '';
  $('#field-faith-image').value = s.foundation?.faithImage || '';
  if ($('#field-page-content')) $('#field-page-content').value = JSON.stringify(s.content || {}, null, 2);

  // Giving
  $('#field-give-heading').value = s.giving?.heading || '';
  $('#field-give-info').value = s.giving?.info || '';
  $('#field-give-momo').value = s.giving?.momo || '';
  $('#field-give-link').value = s.giving?.link || '';
  $('#field-give-note').value = s.giving?.note || '';
  payMethods = JSON.parse(JSON.stringify(s.giving?.methods || [])).map((m) => ({ type: m.type || 'other', title: m.title || '', rows: (m.rows || []).map((r) => ({ label: r.label || '', value: r.value || '' })) }));
  renderPayEditor();

  // Prayer
  $('#field-prayer-eyebrow').value = s.prayer?.eyebrow || '';
  $('#field-prayer-heading').value = s.prayer?.heading || '';
  $('#field-prayer-copy').value = s.prayer?.copy || '';
  $('#field-prayer-email').value = s.prayer?.recipientEmail || '';
  $('#field-prayer-endpoint').value = s.prayer?.endpoint || '';

  // Announcement Banner
  $('#field-meta-pixel-id').value = s.tracking?.metaPixelId || '';
  $('#field-banner-enabled').checked = Boolean(s.announcement?.enabled);
  $('#field-banner-text').value = s.announcement?.text || '';

  // Social
  $('#field-social-youtube').value = s.social?.youtube || '';
  $('#field-social-facebook').value = s.social?.facebook || '';
  $('#field-social-instagram').value = s.social?.instagram || '';
  $('#field-social-tiktok').value = s.social?.tiktok || '';
  $('#field-social-x').value = s.social?.x || s.social?.twitter || '';
  if ($('#field-social-whatsapp')) $('#field-social-whatsapp').value = s.social?.whatsapp || '';
  if ($('#field-social-telegram')) $('#field-social-telegram').value = s.social?.telegram || '';
  if ($('#field-social-threads')) $('#field-social-threads').value = s.social?.threads || '';
  if ($('#field-social-linkedin')) $('#field-social-linkedin').value = s.social?.linkedin || '';
  if ($('#field-social-spotify')) $('#field-social-spotify').value = s.social?.spotify || '';
  updateAdminSocialPreview();

  // Passkey (never populated from settings -- it's not stored there anymore.
  // This field is write-only: fill it in to set a NEW passkey.)
  $('#field-manager-passkey').value = '';
  $('#field-manager-passkey').placeholder = 'Leave blank to keep current passkey';

  window.dispatchEvent(new CustomEvent('pai:hero-settings-loaded',{detail:{hero:s.hero||{}}}));
  // Page Builder
  loadLayoutState(s); layoutBoxEvents(); renderLayoutEditor(); wirePageText(); renderPageText();
};

// Collect Form Fields into JSON (site content only -- the passkey lives in
// admin_config, not in site_settings, and is changed separately)
const collectFormData = () => {
  return {
    general: {
      churchName: $('#field-church-name').value.trim(),
      slogan: $('#field-church-slogan').value.trim(),
      region: $('#field-church-region').value.trim(),
      founder: $('#field-founder-name').value.trim(),
      logoUrl: $('#field-logo-url').value.trim()
    },
    hero: {
      eyebrow: $('#field-hero-eyebrow').value.trim(),
      titleMain: $('#field-hero-title-main').value.trim(),
      titleAccent: $('#field-hero-title-accent').value.trim(),
      copy: $('#field-hero-copy').value.trim(),
      tagline: $('#field-hero-tagline').value.trim(),
      btnPrimaryText: $('#field-hero-btn-primary-text').value.trim(),
      btnPrimaryLink: $('#field-hero-btn-primary-link').value.trim(),
      btnSecondaryText: $('#field-hero-btn-secondary-text').value.trim(),
      btnSecondaryLink: $('#field-hero-btn-secondary-link').value.trim(),
      btnVisitText: $('#field-hero-btn-visit-text').value.trim(),
      btnVisitLink: $('#field-hero-btn-visit-link').value.trim(),
      bgImage: $('#field-hero-bg').value.trim(),
      slides: window.paiHeroSlidesDraft?.slides || currentSettings?.hero?.slides || [],
      sliderEnabled: window.paiHeroSlidesDraft?.enabled ?? currentSettings?.hero?.sliderEnabled ?? true,
      slideDuration: window.paiHeroSlidesDraft?.duration || currentSettings?.hero?.slideDuration || 7
    },
    about: {
      eyebrow: $('#field-about-eyebrow').value.trim(),
      heading: $('#field-about-heading').value.trim(),
      p1: $('#field-about-p1').value.trim(),
      p2: $('#field-about-p2').value.trim(),
      founderName: $('#field-founder-name').value.trim(),
      founderRole: currentSettings.about?.founderRole || 'Founder',
      stat1Title: currentSettings.about?.stat1Title || 'PAI',
      stat1Desc: currentSettings.about?.stat1Desc || 'Prayer Army International',
      stat2Title: currentSettings.about?.stat2Title || 'Ghana',
      stat2Desc: currentSettings.about?.stat2Desc || 'Headquartered in the Upper West Region',
      stat3Title: currentSettings.about?.stat3Title || 'Prophetic',
      stat3Desc: currentSettings.about?.stat3Desc || 'Ministry expression'
    },
    foundation: {
      missionTitle: $('#field-mission-title').value.trim(),
      missionText: $('#field-mission-text').value.trim(),
      visionTitle: $('#field-vision-title').value.trim(),
      visionText: $('#field-vision-text').value.trim(),
      valuesTitle: $('#field-values-title').value.trim(),
      valuesText: $('#field-values-text').value.trim(),
      storyTitle: currentSettings.foundation?.storyTitle || 'A prophetic ministry with a heart for people.',
      storyText: currentSettings.foundation?.storyText || '',
      founderBio: $('#field-founder-bio').value.trim(),
      faithImage: $('#field-faith-image').value.trim()
    },
    layout: collectLayout(),
    content: (() => {
      try {
        const parsed = JSON.parse($('#field-page-content')?.value || '{}');
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Content must be a JSON object');
        return parsed;
      } catch (error) {
        showToast('Page Content JSON is invalid. Please correct it before saving.', 'error');
        return currentSettings.content || {};
      }
    })(),
    live: {
      isLiveNow: $('#field-is-live').checked,
      title: $('#field-live-title').value.trim(),
      description: $('#field-live-desc').value.trim(),
      url: $('#field-live-url').value.trim(),
      statusNote: $('#field-live-status-note').value.trim(),
      nextTitle: $('#field-live-next-title').value.trim(),
      nextStart: $('#field-live-next-start').value ? new Date($('#field-live-next-start').value + ':00Z').toISOString() : ''

    },
    sermons: {
      heading: $('#field-sermons-heading').value.trim(),
      libraryUrl: $('#field-sermons-library-url').value.trim(),
      featuredKicker: $('#field-sermon-feat-kicker').value.trim(),
      featuredTitle: $('#field-sermon-feat-title').value.trim(),
      featuredDesc: $('#field-sermon-feat-desc').value.trim(),
      featuredUrl: $('#field-sermon-feat-url').value.trim(),
      mini1Kicker: currentSettings.sermons?.mini1Kicker || 'PRAYER',
      mini1Title: $('#field-sermon-mini1-title').value.trim(),
      mini1Url: $('#field-sermon-mini1-url').value.trim(),
      mini2Kicker: currentSettings.sermons?.mini2Kicker || 'MINISTRY',
      mini2Title: $('#field-sermon-mini2-title').value.trim(),
      mini2Url: $('#field-sermon-mini2-url').value.trim()
    },
    event: {
      title: $('#field-event-title').value.trim(),
      dates: $('#field-event-dates').value.trim(),
      description: $('#field-event-desc').value.trim(),
      // The start/end fields are populated (in populateForm) straight from
      // the stored UTC ISO string, so the value typed/shown here is always
      // meant as UTC -- appending "Z" reads it back as UTC too. Without
      // this, the browser's Date constructor treats a bare "YYYY-MM-DDTHH:mm"
      // as *local* time, which silently shifts the event by the admin's
      // timezone offset every time settings are saved from outside GMT.
      start: $('#field-event-start').value ? new Date($('#field-event-start').value + ':00Z').toISOString() : currentSettings.event?.start,
      end: $('#field-event-end').value ? new Date($('#field-event-end').value + ':00Z').toISOString() : currentSettings.event?.end,
      link: $('#field-event-link').value.trim(),
      stackCaption: $('#field-event-caption').value.trim(),
      venue: $('#field-event-venue').value.trim(),
      image: currentSettings.event?.image || ''

    },
    events: collectEventRows(),
    announcements: collectAnnouncementRows(),
    seo: {
      title: $('#field-seo-title').value.trim(),
      description: $('#field-seo-desc').value.trim(),
      ogImage: $('#field-seo-image').value.trim()
    },
    weekly: collectWeeklyRows(),
    verses: collectVerseRows(),
    branches: collectBranchRows(),
    prayer: {
      eyebrow: $('#field-prayer-eyebrow').value.trim(),
      heading: $('#field-prayer-heading').value.trim(),
      copy: $('#field-prayer-copy').value.trim(),
      recipientEmail: $('#field-prayer-email').value.trim(),
      endpoint: $('#field-prayer-endpoint').value.trim()
    },
    giving: {
      heading: $('#field-give-heading').value.trim(),
      info: $('#field-give-info').value.trim(),
      momo: $('#field-give-momo').value.trim(),
      link: $('#field-give-link').value.trim(),
      note: $('#field-give-note').value.trim(),
      methods: collectPayMethods()
    },
    contact: {
      address: $('#field-contact-address').value.trim(),
      phone: $('#field-contact-phone').value.trim(),
      whatsapp: $('#field-contact-whatsapp').value.trim(),
      email: $('#field-contact-email').value.trim()
    },
    social: {
      youtube: $('#field-social-youtube')?.value.trim() || '',
      facebook: $('#field-social-facebook')?.value.trim() || '',
      instagram: $('#field-social-instagram')?.value.trim() || '',
      tiktok: $('#field-social-tiktok')?.value.trim() || '',
      x: $('#field-social-x')?.value.trim() || '',
      whatsapp: $('#field-social-whatsapp')?.value.trim() || '',
      telegram: $('#field-social-telegram')?.value.trim() || '',
      threads: $('#field-social-threads')?.value.trim() || '',
      linkedin: $('#field-social-linkedin')?.value.trim() || '',
      spotify: $('#field-social-spotify')?.value.trim() || ''
    },
    tracking: { metaPixelId: $('#field-meta-pixel-id').value.replace(/\D/g, '').slice(0, 20) },
    announcement: {
      enabled: $('#field-banner-enabled').checked,
      text: $('#field-banner-text').value.trim()
    }
  };
};

/* =========================================================================
   4. LIVE BROADCAST QUICK SWITCH & PREVIEW
   ========================================================================= */
const livePill = $('#live-broadcast-pill');
const livePillLabel = $('#live-pill-label');
const fieldIsLive = $('#field-is-live');
const sidebarLiveBadge = $('#sidebar-live-badge');

const updateLivePill = (isLive) => {
  livePill.classList.toggle('active', isLive);
  livePillLabel.textContent = isLive ? 'BROADCASTING LIVE' : 'OFFLINE';
  if (sidebarLiveBadge) sidebarLiveBadge.style.display = isLive ? 'inline' : 'none';
};

// Toggle live state directly from pill
livePill?.addEventListener('click', () => {
  const newState = !fieldIsLive.checked;
  fieldIsLive.checked = newState;
  updateLivePill(newState);
  saveSettings(false); // Quick save
  showToast(newState ? '🔴 LIVE broadcast is now ACTIVE on website!' : '⚪ Live broadcast turned OFF.', newState ? 'error' : 'success');
});

fieldIsLive?.addEventListener('change', () => {
  updateLivePill(fieldIsLive.checked);
});

// Stream URL Preview
const fieldLiveUrl = $('#field-live-url');
const streamContainer = $('#stream-preview-container');

const getEmbedUrl = (url) => {
  if (!url) return null;
  // YouTube watch link
  const ytMatch = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
  if (ytMatch) {
    return `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=0`;
  }
  // YouTube live channel stream embed
  if (url.includes('youtube.com/@') || url.includes('/live')) {
    return url;
  }
  return url;
};

const updateLiveStreamPreview = (url) => {
  if (!streamContainer) return;
  if (!url) {
    streamContainer.innerHTML = '<div class="stream-placeholder"><span>Enter a stream URL above to preview here.</span></div>';
    return;
  }
  const embed = getEmbedUrl(url);
  if (url.endsWith('.mp4') || url.endsWith('.webm')) {
    streamContainer.innerHTML = `<video src="${url}" controls playsinline style="position:absolute;inset:0;width:100%;height:100%"></video>`;
  } else if (embed.includes('youtube.com/embed/')) {
    streamContainer.innerHTML = `<iframe src="${embed}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
  } else {
    streamContainer.innerHTML = `<div class="stream-placeholder"><span>Direct Stream URL: <br><a href="${url}" target="_blank" style="color:var(--gold);margin-top:6px;display:inline-block">${url}</a></span></div>`;
  }
};

fieldLiveUrl?.addEventListener('input', () => {
  updateLiveStreamPreview(fieldLiveUrl.value.trim());
});

// Hero Media Preview
const fieldHeroBg = $('#field-hero-bg');
const heroMediaPreviewBox = $('#hero-media-preview-box');

// Logo live preview
$('#field-logo-url')?.addEventListener('input', (e) => {
  $('#logo-preview').src = e.target.value.trim() || 'assets/images/prayer-army-logo.png';
});

// Social Icons Preview in Admin Console
const SOCIAL_ICONS_MAP = {
  facebook: { name: 'Facebook', bg: '#1877f2', svg: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>' },
  youtube: { name: 'YouTube', bg: '#ff0000', svg: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>' },
  instagram: { name: 'Instagram', bg: '#d6249f', svg: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>' },
  tiktok: { name: 'TikTok', bg: '#000000', svg: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.24 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>' },
  x: { name: 'X', bg: '#111111', svg: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>' },
  whatsapp: { name: 'WhatsApp', bg: '#25d366', svg: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.301-.15-1.78-.878-2.056-.978-.276-.1-.477-.15-.678.15-.2.301-.778.978-.954 1.179-.176.2-.351.226-.652.075s-1.272-.469-2.424-1.496c-.896-.799-1.501-1.786-1.677-2.087-.176-.301-.019-.464.132-.614.136-.135.301-.351.452-.527.15-.176.2-.301.301-.502.101-.2.05-.376-.025-.526-.075-.15-.678-1.633-.929-2.235-.244-.587-.492-.507-.678-.517-.176-.009-.376-.009-.577-.009-.201 0-.527.075-.803.376s-1.054 1.029-1.054 2.509c0 1.48 1.079 2.909 1.229 3.11s2.124 3.243 5.146 4.548c.719.311 1.28.497 1.718.636.722.23 1.378.197 1.898.12.579-.087 1.78-.727 2.031-1.429.251-.702.251-1.304.176-1.43-.076-.125-.276-.201-.577-.351zm-5.467 7.618a9.92 9.92 0 0 1-5.06-1.387l-.363-.215-3.761.986 1.003-3.666-.236-.375a9.92 9.92 0 0 1-1.523-5.328c0-5.479 4.458-9.937 9.941-9.937a9.9 9.9 0 0 1 7.026 2.912 9.9 9.9 0 0 1 2.911 7.025c0 5.48-4.458 9.941-9.94 9.941zm8.47-18.411A11.88 11.88 0 0 0 12.005 0C5.38 0 0 5.38 0 12.005a11.95 11.95 0 0 0 1.637 6.012l-1.74 6.357 6.505-1.706a11.95 11.95 0 0 0 5.603 1.397h.005c6.624 0 12.004-5.38 12.004-12.005a11.87 11.87 0 0 0-3.539-8.489z"/></svg>' },
  telegram: { name: 'Telegram', bg: '#0088cc', svg: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.121l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.196 1.006.128.832.942z"/></svg>' },
  threads: { name: 'Threads', bg: '#111111', svg: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.186 24C5.466 24 0 18.534 0 11.814 0 5.094 5.466 0 12.186 0c6.602 0 11.895 5.176 12.004 11.758h-2.584C21.498 6.55 17.37 2.457 12.186 2.457 7.025 2.457 2.584 6.898 2.584 12.06c0 5.161 4.441 9.602 9.602 9.602 3.869 0 7.218-2.316 8.718-5.753l2.368.995C21.368 21.055 17.069 24 12.186 24zm4.185-13.82c-.22-.387-.492-.733-.815-1.03-.794-.73-1.874-1.144-3.125-1.144-2.825 0-4.832 2.05-4.832 4.93 0 2.898 2.037 4.965 4.887 4.965 1.547 0 2.923-.62 3.875-1.745.244-.288.455-.61.63-.961l2.25.961c-.347.669-.798 1.285-1.341 1.82-1.464 1.442-3.447 2.275-5.589 2.275-4.148 0-7.337-3.155-7.337-7.315 0-4.14 3.167-7.28 7.282-7.28 1.933 0 3.633.68 4.916 1.968.618.62 1.096 1.373 1.417 2.227l-2.168.329zm-3.865 5.344c-1.442 0-2.434-1.006-2.434-2.476 0-1.488 1.01-2.493 2.455-2.493 1.464 0 2.434 1.005 2.434 2.493 0 1.47-1.014 2.476-2.455 2.476z"/></svg>' },
  linkedin: { name: 'LinkedIn', bg: '#0077b5', svg: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/></svg>' },
  spotify: { name: 'Spotify / Podcasts', bg: '#1db954', svg: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>' }
};

const updateAdminSocialPreview = () => {
  const container = $('#admin-social-preview');
  if (!container) return;
  const list = [
    { key: 'youtube', url: $('#field-social-youtube')?.value.trim() },
    { key: 'facebook', url: $('#field-social-facebook')?.value.trim() },
    { key: 'instagram', url: $('#field-social-instagram')?.value.trim() },
    { key: 'tiktok', url: $('#field-social-tiktok')?.value.trim() },
    { key: 'x', url: $('#field-social-x')?.value.trim() },
    { key: 'whatsapp', url: $('#field-social-whatsapp')?.value.trim() },
    { key: 'telegram', url: $('#field-social-telegram')?.value.trim() },
    { key: 'threads', url: $('#field-social-threads')?.value.trim() },
    { key: 'linkedin', url: $('#field-social-linkedin')?.value.trim() },
    { key: 'spotify', url: $('#field-social-spotify')?.value.trim() }
  ].filter(item => item.url);

  if (list.length === 0) {
    container.innerHTML = '<span style="color:var(--text-muted);font-size:12px">No social media links provided yet. Fill in any URL above to see icons preview here.</span>';
    return;
  }

  container.innerHTML = list.map(item => {
    const info = SOCIAL_ICONS_MAP[item.key] || { name: item.key, bg: '#333', svg: '🔗' };
    let previewHref = item.url;
    if (item.key === 'whatsapp' && !previewHref.startsWith('http')) {
      previewHref = `https://wa.me/${previewHref.replace(/\D/g, '')}`;
    } else if (!previewHref.startsWith('http')) {
      previewHref = `https://${previewHref}`;
    }
    return `<a class="social-icon-btn-admin" href="${previewHref}" target="_blank" rel="noopener noreferrer" title="${info.name}: ${previewHref}" style="background:${info.bg};border-color:transparent;color:#fff">${info.svg}</a>`;
  }).join('');
};

// Wire live updates and test links
['#field-social-youtube', '#field-social-facebook', '#field-social-instagram', '#field-social-tiktok', '#field-social-x', '#field-social-whatsapp', '#field-social-telegram', '#field-social-threads', '#field-social-linkedin', '#field-social-spotify'].forEach(sel => {
  $(sel)?.addEventListener('input', updateAdminSocialPreview);
});

$$('.btn-test-link').forEach(btn => {
  btn.addEventListener('click', () => {
    const targetId = btn.dataset.for;
    const input = $(`#${targetId}`);
    let url = input?.value.trim();
    if (!url) {
      showToast('Please enter a URL first to test', 'error');
      input?.focus();
      return;
    }
    if (targetId.includes('whatsapp') && !url.startsWith('http')) {
      url = `https://wa.me/${url.replace(/\D/g, '')}`;
    } else if (!url.startsWith('http')) {
      url = `https://${url}`;
    }
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    a.remove();
  });
});

$$('.jump-to-social-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const socialNav = $('button[data-view="view-social"]');
    if (socialNav) socialNav.click();
  });
});

const updateHeroMediaPreview = (bg) => {
  if (!heroMediaPreviewBox) return;
  if (!bg) {
    heroMediaPreviewBox.innerHTML = '<span style="color:var(--text-muted);font-size:12px">No media selected</span>';
    return;
  }
  const isVideo = ['.mp4', '.webm', '.mov', '.ogg'].some(ext => bg.toLowerCase().endsWith(ext));
  if (isVideo) {
    heroMediaPreviewBox.innerHTML = `<video src="${bg}" controls autoplay muted loop style="max-height:100%;max-width:100%;border-radius:4px"></video>`;
  } else {
    heroMediaPreviewBox.innerHTML = `<img src="${bg}" alt="Hero preview" style="max-height:100%;max-width:100%;object-fit:cover;border-radius:4px">`;
  }
};

fieldHeroBg?.addEventListener('input', () => {
  updateHeroMediaPreview(fieldHeroBg.value.trim());
});

/* =========================================================================
   5. MEDIA MANAGER & UPLOADER
   ========================================================================= */
const dropzone = $('#dropzone');
const mediaFileInput = $('#media-file-input');
const uploadProgressBox = $('#upload-progress-box');
const uploadStatusText = $('#upload-status-text');
const uploadPercentText = $('#upload-percent-text');
const uploadProgressFill = $('#upload-progress-fill');
const mediaGridContainer = $('#media-grid-container');
const mediaCount = $('#media-count');
const mediaFilterButtons = $$('.media-tab-btn');

// Drag & Drop
['dragenter', 'dragover'].forEach(name => {
  dropzone?.addEventListener(name, (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });
});

['dragleave', 'drop'].forEach(name => {
  dropzone?.addEventListener(name, (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
  });
});

dropzone?.addEventListener('drop', (e) => {
  if (e.dataTransfer?.files?.length) {
    handleFileUpload(e.dataTransfer.files);
  }
});

mediaFileInput?.addEventListener('change', () => {
  if (mediaFileInput.files?.length) {
    handleFileUpload(mediaFileInput.files);
    mediaFileInput.value = '';
  }
});

// File Upload Handler (supports multiple pictures, videos & audio)
const handleFileUpload = async (files) => {
  const formData = new FormData();
  let count = 0;
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    if (f.type.startsWith('image/') || f.type.startsWith('video/') || f.type.startsWith('audio/')) {
      formData.append(isNodeAdminSession() ? 'files' : 'files[]', f);
      count++;
    }
  }

  if (count === 0) {
    showToast('Please select valid image, video, or audio files', 'error');
    return;
  }

  if(!isNodeAdminSession()){
    await ensureFreshToken();
    formData.append('passkey', getPasskey());
  }

  uploadProgressBox.style.display = 'block';
  uploadStatusText.textContent = `Uploading ${count} file(s)...`;
  uploadPercentText.textContent = '10%';
  uploadProgressFill.style.width = '10%';

  try {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', isNodeAdminSession() ? `${SUPABASE_URL}/upload` : `${EDGE_BASE}/upload-media`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        uploadProgressFill.style.width = `${percent}%`;
        uploadPercentText.textContent = `${percent}%`;
      }
    };

    xhr.onload = () => {
      if (xhr.status === 200) {
        uploadProgressFill.style.width = '100%';
        uploadPercentText.textContent = '100%';
        setTimeout(() => {
          uploadProgressBox.style.display = 'none';
          uploadProgressFill.style.width = '0%';
        }, 800);
        showToast(`Successfully uploaded ${count} media file(s)!`, 'success');
        loadMedia();
        document.dispatchEvent(new CustomEvent('pai:media-uploaded'));
      } else {
        let why = 'Upload failed. Check file size or format.';
        try { why = JSON.parse(xhr.responseText).error || why; } catch {}
        showToast(why, 'error');
        uploadProgressBox.style.display = 'none';
      }
    };

    xhr.onerror = () => {
      showToast('Network error while uploading', 'error');
      uploadProgressBox.style.display = 'none';
    };

    xhr.send(formData);
  } catch (err) {
    showToast('Error uploading files', 'error');
    uploadProgressBox.style.display = 'none';
  }
};

// Load Media Files (bundled church photos + uploaded files)
const loadMedia = async () => {
  try {
    const media = [];

    // 1. Original bundled church images (static manifest, part of the deploy)
    try {
      const manifestRes = await fetch('assets/images/manifest.json');
      if (manifestRes.ok) {
        const manifest = await manifestRes.json();
        media.push(...manifest);
      }
    } catch {}

    // 2. Admin-uploaded media in the uploads folder
    if(isNodeAdminSession()){
      const response=await _origFetch(`${SUPABASE_URL}/media`,{credentials:'same-origin',cache:'no-store'});
      if(!response.ok)throw Error('Unable to load uploaded media');
      const data=await response.json();
      media.push(...(data.media||[]).filter(item=>item.isUpload).map(item=>({
        ...item,url:'/'+String(item.url).replace(/^\//,''),isUpload:true
      })));
    }else{
    await ensureFreshToken();
    const listRes = await fetch(`${SUPABASE_URL}/storage/v1/object/list/media`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${getPasskey()}`
      },
      body: JSON.stringify({ prefix: '', limit: 500, sortBy: { column: 'created_at', order: 'desc' } })
    });
    if (listRes.ok) {
      const objects = await listRes.json();
      for (const obj of objects) {
        if (!obj.name) continue;
        const ext = obj.name.split('.').pop().toLowerCase();
        const isVideo = ['mp4', 'webm', 'mov', 'ogv', 'm4v'].includes(ext);
        const isAudio = ['mp3', 'wav', 'm4a', 'aac', 'oga', 'ogg', 'flac'].includes(ext);
        media.push({
          filename: obj.name,
          url: `/uploads/${encodeURIComponent(obj.name)}`,
          type: isVideo ? 'video' : isAudio ? 'audio' : 'image',
          size: obj.metadata?.size || 0,
          isUpload: true
        });
      }
    }

    }

    // Node media visibility is persistent in MySQL.
    try {
      const hiddenRes = isNodeAdminSession()
        ? await _origFetch(`${SUPABASE_URL}/admin/hidden-assets`,{credentials:'same-origin',cache:'no-store'})
        : await fetch(`${EDGE_BASE}/manage-content`,{
            method:'POST',headers:{'Content-Type':'application/json',apikey:SUPABASE_ANON_KEY},
            body:JSON.stringify({action:'list_hidden_assets'})
          });
      if(!hiddenRes.ok)throw Error('Unable to load hidden assets');
      const {filenames}=await hiddenRes.json();
      const hiddenSet=new Set(filenames||[]);
      media.forEach(m=>{if(!m.isUpload&&hiddenSet.has(m.filename))m.hidden=true;});
    }catch(err){console.warn('Media visibility:',err.message);showToast('Hidden assets unavailable. Check migration 005.','error');}

    allMedia = media;
    renderMediaGrid();
    populateMessageMediaSelect();
  } catch (err) {
    console.error('Failed to load media files', err);
  }
};

// Filter Buttons
mediaFilterButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    mediaFilterButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentMediaFilter = btn.dataset.filter;
    renderMediaGrid();
  });
});

// Render Media Grid
const renderMediaGrid = () => {
  if (!mediaGridContainer) return;
  
  // Hidden Church Assets stay out of every normal view -- they only show up
  // under the dedicated "Hidden" tab, where they can be restored.
  const visible = allMedia.filter(m => !m.hidden);

  let filtered = visible;
  if (currentMediaFilter === 'upload') {
    filtered = visible.filter(m => m.isUpload);
  } else if (currentMediaFilter === 'image') {
    filtered = visible.filter(m => m.type === 'image');
  } else if (currentMediaFilter === 'video') {
    filtered = visible.filter(m => m.type === 'video');
  } else if (currentMediaFilter === 'audio') {
    filtered = visible.filter(m => m.type === 'audio');
  } else if (currentMediaFilter === 'hidden') {
    filtered = allMedia.filter(m => m.hidden);
  }

  mediaCount.textContent = filtered.length;

  if (filtered.length === 0) {
    mediaGridContainer.innerHTML = currentMediaFilter === 'hidden'
      ? '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-muted)">Nothing hidden right now.</div>'
      : '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-muted)">No media files found in this category. Use the uploader above to add files.</div>';
    return;
  }

  mediaGridContainer.innerHTML = filtered.map(item => {
    const isVideo = item.type === 'video';
    const isAudio = item.type === 'audio';
    const isHidden = !!item.hidden;
    const badgeLabel = isVideo ? 'VIDEO' : isAudio ? 'AUDIO' : 'PHOTO';
    return `
      <div class="media-card${isHidden ? ' media-card-hidden' : ''}">
        <div class="media-thumb-wrap">
          ${isVideo
            ? `<video src="${item.url}" preload="metadata" muted playsinline></video>`
            : isAudio
            ? `<div class="media-audio-thumb" style="display:flex;align-items:center;justify-content:center;height:100%;font-size:32px;background:#10131a;">🎙</div>`
            : `<img src="${escAttr(item.url)}" alt="${escAttr(item.filename)}" loading="lazy">`
          }
          <span class="media-type-badge ${isVideo ? 'video' : ''}">${badgeLabel}</span>
          ${isHidden ? '<span class="media-type-badge" style="left:auto;right:8px;background:#5c1b26">HIDDEN</span>' : ''}
        </div>
        <div class="media-info">
          <div class="media-filename" title="${escAttr(item.filename)}">${escAttr(item.filename)}</div>
          <div class="media-size">${formatBytes(item.size)} • ${item.isUpload ? 'Uploaded' : 'Church Asset'}</div>
          
          <div class="media-actions">
            <button type="button" class="btn-media-action btn-copy-url" data-url="${escAttr(item.url)}">
              📋 Copy Link
            </button>
            <div class="media-btn-row">
              ${isHidden ? `
                <button type="button" class="btn-media-action btn-unhide-asset" data-filename="${escAttr(item.filename)}">
                  ↺ Restore
                </button>
              ` : `
              ${!isAudio ? `
                <button type="button" class="btn-media-action btn-set-hero" data-url="${escAttr(item.url)}">
                  ⚡ Hero
                </button>
              ` : ''}
              ${!isVideo && !isAudio ? `
                <button type="button" class="btn-media-action btn-set-logo" data-url="${escAttr(item.url)}">
                  🖼 Logo
                </button>
                <button type="button" class="btn-media-action btn-set-faith" data-url="${escAttr(item.url)}">
                  ✝ Faith
                </button>
              ` : ''}
              ${isVideo ? `
                <button type="button" class="btn-media-action btn-set-stream" data-url="${escAttr(item.url)}">
                  📡 Stream
                </button>
              ` : ''}
              ${!isVideo && !isAudio ? `
                <button type="button" class="btn-media-action btn-set-sermon" data-url="${escAttr(item.url)}">
                  📖 Sermon
                </button>
              ` : ''}
              ${item.isUpload ? `
                <button type="button" class="btn-media-action delete btn-del-media" data-filename="${escAttr(item.filename)}">
                  🗑 Delete Upload
                </button>
              ` : `
                <button type="button" class="btn-media-action btn-hide-asset" data-filename="${escAttr(item.filename)}" ${item.filename.toLowerCase() === "prayer-army-logo.png" ? "disabled title=\"Official church logo is protected\"" : ""}>
                  ${item.filename.toLowerCase() === "prayer-army-logo.png" ? "🔒 Protected Logo" : "🚫 Hide from Library"}
                </button>
              `}
              `}
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Attach Action Listeners
  $$('.btn-copy-url', mediaGridContainer).forEach(btn => {
    btn.addEventListener('click', () => {
      const url = btn.dataset.url;
      navigator.clipboard.writeText(url).then(() => {
        showToast(`Copied to clipboard: ${url}`, 'success');
      });
    });
  });

  $$('.btn-set-hero', mediaGridContainer).forEach(btn => {
    btn.addEventListener('click', () => {
      const url = btn.dataset.url;
      $('#field-hero-bg').value = url;
      updateHeroMediaPreview(url);
      showToast('Set as Hero Media! Remember to click "Save Changes".', 'success');
    });
  });

  $$('.btn-set-logo', mediaGridContainer).forEach(btn => {
    btn.addEventListener('click', () => {
      const url = btn.dataset.url;
      $('#field-logo-url').value = url;
      $('#logo-preview').src = url;
      showToast('Set as Church Logo! Remember to click "Save Changes".', 'success');
    });
  });

  $$('.btn-set-faith', mediaGridContainer).forEach(btn => {
    btn.addEventListener('click', () => {
      const url = btn.dataset.url;
      $('#field-faith-image').value = url;
      showToast('Set as Statement of Faith picture! Remember to click "Save Changes".', 'success');
    });
  });

  $$('.btn-set-stream', mediaGridContainer).forEach(btn => {
    btn.addEventListener('click', () => {
      const url = btn.dataset.url;
      $('#field-live-url').value = url;
      updateLiveStreamPreview(url);
      showToast('Set as Live Stream URL! Remember to click "Save Changes".', 'success');
    });
  });

  $$('.btn-set-sermon', mediaGridContainer).forEach(btn => {
    btn.addEventListener('click', () => {
      const url = btn.dataset.url;
      $('#field-sermon-feat-url').value = url;
      showToast('Set as Featured Sermon Link! Remember to click "Save Changes".', 'success');
    });
  });

  $$('.btn-del-media', mediaGridContainer).forEach(btn => {
    btn.addEventListener('click', async () => {
      const filename = btn.dataset.filename;
      if (!confirm(`Delete "${filename}" permanently? This cannot be undone.`)) return;

      const label = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '…';
      const restore = () => { btn.disabled = false; btn.innerHTML = label; };

      try {
        const res = isNodeAdminSession()
          ? await _origFetch(`${SUPABASE_URL}/media/${encodeURIComponent(filename)}`,{method:'DELETE',credentials:'same-origin'})
          : await fetch(`${EDGE_BASE}/delete-media`, {
              method:'POST',headers:{'Content-Type':'application/json',apikey:SUPABASE_ANON_KEY},
              body:JSON.stringify({passkey:getPasskey(),filename,name:filename,path:filename})
            });
        let data = null;
        try { data = await res.json(); } catch {}

        if (!res.ok || data?.error || data?.success === false) {
          const reason = data?.error || data?.message || `server returned ${res.status}`;
          console.error('delete-media failed', res.status, data);
          showToast(`Could not delete: ${reason}`, 'error');
          restore();
          return;
        }

        // Confirm it is really gone from storage, not just "OK" from the function
        await loadMedia();
        if (allMedia.some(m => m.isUpload && m.filename === filename)) {
          showToast('The server accepted the request but the file is still in storage. Check the delete-media function.', 'error');
        } else {
          showToast('Media file deleted', 'success');
        }
      } catch (err) {
        console.error('delete-media network error', err);
        showToast('Could not reach the delete-media function (network, CORS, or it is not deployed).', 'error');
        restore();
      }
    });
  });

  $$('.btn-hide-asset', mediaGridContainer).forEach(btn => {
    btn.addEventListener('click', async () => {
      const filename = btn.dataset.filename;
      if (!confirm(`Hide "${filename}" from the Media Library? The original file will not be deleted, and you can restore it from the Hidden tab.`)) return;

      btn.disabled = true;
      try {
        const res = isNodeAdminSession()
          ? await _origFetch(`${SUPABASE_URL}/admin/hidden-assets/${encodeURIComponent(filename)}`,{
              method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json'},
              body:JSON.stringify({hidden:true})
            })
          : await fetch(`${EDGE_BASE}/manage-content`,{
              method:'POST',headers:{'Content-Type':'application/json',apikey:SUPABASE_ANON_KEY},
              body:JSON.stringify({passkey:getPasskey(),action:'hide_asset',payload:{filename}})
            });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.error) {
          showToast(data?.error || 'Could not hide this file', 'error');
          btn.disabled = false;
          return;
        }
        showToast('Removed from the Media Library', 'success');
        await loadMedia();
      } catch {
        showToast('Network error while hiding this file', 'error');
        btn.disabled = false;
      }
    });
  });

  $$('.btn-unhide-asset', mediaGridContainer).forEach(btn => {
    btn.addEventListener('click', async () => {
      const filename = btn.dataset.filename;
      btn.disabled = true;
      try {
        const res = isNodeAdminSession()
          ? await _origFetch(`${SUPABASE_URL}/admin/hidden-assets/${encodeURIComponent(filename)}`,{
              method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json'},
              body:JSON.stringify({hidden:false})
            })
          : await fetch(`${EDGE_BASE}/manage-content`,{
              method:'POST',headers:{'Content-Type':'application/json',apikey:SUPABASE_ANON_KEY},
              body:JSON.stringify({passkey:getPasskey(),action:'unhide_asset',payload:{filename}})
            });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.error) {
          showToast(data?.error || 'Could not restore this file', 'error');
          btn.disabled = false;
          return;
        }
        showToast('Restored to the Media Library', 'success');
        await loadMedia();
      } catch {
        showToast('Network error while restoring this file', 'error');
        btn.disabled = false;
      }
    });
  });
};

/* =========================================================================
   6. SAVING SETTINGS TO SERVER
   ========================================================================= */
const btnSaveAll = $('#btn-save-all');

const saveSettings = async (showNotification = true) => {
  try {
    const rawPageContent = $('#field-page-content')?.value || '{}';
    const parsedPageContent = JSON.parse(rawPageContent);
    if (!parsedPageContent || typeof parsedPageContent !== 'object' || Array.isArray(parsedPageContent)) throw new Error('Page content must be a JSON object');
  } catch {
    showToast('Page Content JSON is invalid. Correct it before saving.', 'error');
    $('#field-page-content')?.focus();
    return;
  }
  // Preserve settings that do not have a visible field in this editor.
  // Without this, saving one section silently deletes unrelated public content.
  const mergeEditedSettings = (original, edited) => {
    if (!edited || typeof edited !== 'object' || Array.isArray(edited)) return edited;
    const base = original && typeof original === 'object' && !Array.isArray(original) ? original : {};
    const result = {...base};
    for (const [key,value] of Object.entries(edited)) {
      if (['__proto__','prototype','constructor'].includes(key)) continue;
      result[key] = value && typeof value === 'object' && !Array.isArray(value)
        ? mergeEditedSettings(base[key], value) : value;
    }
    return result;
  };
  const data = mergeEditedSettings(currentSettings, collectFormData());
  const newPasskey = $('#field-manager-passkey')?.value.trim();
  if(isNodeAdminSession() && newPasskey){
    showToast('Changing the shared passkey is not available through this Node admin session. Clear that field before saving.', 'error');
    return;
  }
  document.dispatchEvent(new CustomEvent('pai:settings-save',{detail:{state:'saving'}}));
  btnSaveAll.disabled = true;
  btnSaveAll.innerHTML = '<span>⏳</span> Saving...';

  try {
    const res = isNodeAdminSession()
      ? await _origFetch(`${SUPABASE_URL}/settings`,{
          method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','If-Match-Settings-Revision':String(nodeSettingsRevision||'')},
          body:JSON.stringify(data)
        })
      : await fetch(`${EDGE_BASE}/save-settings`, {
          method:'POST',headers:{'Content-Type':'application/json',apikey:SUPABASE_ANON_KEY},
          body:JSON.stringify({passkey:getPasskey(),settings:data})
        });

    if (res.ok) {
      if(isNodeAdminSession()){
        const saved=await res.json();
        if(!saved.success||!Number.isSafeInteger(saved.revision))throw Error('Save was not confirmed by the database');
        // Verify a fresh database read before announcing publication.
        const check=await _origFetch(`${SUPABASE_URL}/settings`,{credentials:'same-origin',cache:'no-store'});
        if(!check.ok)throw Error('Saved, but could not verify the public website settings. Refresh and check before editing again.');
        const readBack=await check.json();
        const readRevision=Number(check.headers.get('X-Settings-Revision'));
        if(readRevision!==saved.revision)throw Error('The settings revision changed during verification. Reload before editing further.');
        // The public endpoint intentionally omits internal settings.
        for(const key of ['general','hero','about','live','event','events','sermons','content','contact','gallery']){
          if(Object.hasOwn(saved.settings||{},key)&&JSON.stringify(readBack[key])!==JSON.stringify(saved.settings[key]))
            throw Error('The website settings did not match the saved version for '+key+'. Please reload.');
        }
        nodeSettingsRevision=readRevision;
      }
      document.dispatchEvent(new CustomEvent('pai:settings-save',{detail:{state:'saved'}}));
      currentSettings = data;
      // Keep preview-only data out of the public website's fallback path.
      localStorage.removeItem('pai_site_settings');

      // If a new passkey was typed, change it as a separate, explicit step
      if (newPasskey) {
        const pkRes = await fetch(`${EDGE_BASE}/change-passkey`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
          body: JSON.stringify({ currentPasskey: getPasskey(), newPasskey })
        });
        if (pkRes.ok) {
          if (!isNodeAdminSession() && !isAccountSession()) setStoredPasskey(newPasskey);
          $('#field-manager-passkey').value = '';
          showToast('✓ Changes saved and passkey updated!', 'success');
        } else {
          showToast('Content saved, but passkey change failed', 'error');
        }
      } else if (showNotification) {
        showToast('✓ All changes saved and published to website!', 'success');
      }
    } else {
      const body = await res.json().catch(() => ({}));
      document.dispatchEvent(new CustomEvent('pai:settings-save',{detail:{state:'error'}}));
      showToast(body.error || 'Failed to save settings to server', 'error');
    }
  } catch (err) {
    document.dispatchEvent(new CustomEvent('pai:settings-save',{detail:{state:'error'}}));
    showToast(err?.message || 'Network error while saving settings', 'error');
  } finally {
    btnSaveAll.disabled = false;
    btnSaveAll.innerHTML = '<span>💾</span> Save Changes';
  }
};

btnSaveAll?.addEventListener('click', () => saveSettings(true));

// Keyboard shortcut: Ctrl+S or Cmd+S to save
window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    saveSettings(true);
  }
});

/* =========================================================================
   7. BACKUP & RESTORE
   ========================================================================= */
const btnExportBackup = $('#btn-export-backup');
const backupFileInput = $('#backup-file-input');
const btnResetDefaults = $('#btn-reset-defaults');

btnExportBackup?.addEventListener('click', () => {
  const data = collectFormData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `prayerarmy-settings-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Downloaded settings backup file', 'success');
});

backupFileInput?.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const parsed = JSON.parse(event.target.result);
      populateForm(parsed);
      showToast('Backup restored into form. Click "Save Changes" to apply.', 'success');
    } catch {
      showToast('Invalid JSON backup file', 'error');
    }
  };
  reader.readAsText(file);
});

btnResetDefaults?.addEventListener('click', async () => {
  if (confirm('Are you sure you want to reset all website content back to default values? This cannot be undone.')) {
    try {
      const res = await fetch('/site-settings.json');
      if (res.ok) {
        const defaults = await res.json();
        populateForm(defaults);
        await saveSettings(true);
        showToast('Reset to defaults complete', 'success');
      }
    } catch {
      showToast('Could not load defaults', 'error');
    }
  }
});

/* =========================================================================
   MESSAGES ARCHIVE (admin) — create/delete messages, moderate comments
   ========================================================================= */
const messagesAdminList = $('#messages-admin-list');
const messagesAdminCount = $('#messages-admin-count');
const msgMediaSelect = $('#msg-media-select');


// Can this link be played on the public site? (mirrors getPlayable in script.js)
const isPlayableLink = (url) => {
  const u = String(url || '').trim();
  if (!u) return false;
  return /(?:youtube\.com\/(?:watch\?v=|live\/|embed\/|shorts\/)|youtu\.be\/)[a-zA-Z0-9_-]{11}/.test(u)
    || /youtube\.com\/(?:playlist|watch)\?[^#]*list=[a-zA-Z0-9_-]+/.test(u)
    || /vimeo\.com\/(?:video\/)?\d+/.test(u)
    || /(?:facebook\.com|fb\.watch)\//.test(u)
    || /\.(mp4|webm|ogv|mov|m4v|mp3|m4a|wav|ogg|oga|flac|aac)(\?|#|$)/i.test(u);
};
const askRecordingLink = (current = '') => {
  const v = prompt(
    'The live link can only show the CURRENT broadcast. To play the recording on the website, paste the link of the finished recording (YouTube video, Facebook video, Vimeo or an uploaded MP4/MP3 link):',
    current
  );
  return v === null ? null : v.trim();
};

const callManageContent = async (action, payload = {}) => {
  const res = await fetch(`${EDGE_BASE}/manage-content`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ passkey: getPasskey(), action, payload })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
};

// Keep the "attach uploaded media" dropdown in sync with the Media Uploader tab
const AUDIO_EXT = ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'oga', 'flac'];
const populateMessageMediaSelect = () => {
  refreshEventImageOptions();
  if (!msgMediaSelect) return;
  const current = msgMediaSelect.value;
  const candidates = (allMedia || []).filter((m) => {
    const ext = (m.filename || m.url || '').split('.').pop().toLowerCase();
    return m.type === 'video' || AUDIO_EXT.includes(ext);
  });
  msgMediaSelect.innerHTML = '<option value="">— None —</option>' + candidates.map((m) => {
    const ext = (m.filename || m.url || '').split('.').pop().toLowerCase();
    const kind = AUDIO_EXT.includes(ext) ? 'audio' : 'video';
    return `<option value="${m.url}" data-kind="${kind}">${m.filename || m.url}</option>`;
  }).join('');
  if (candidates.some((m) => m.url === current)) msgMediaSelect.value = current;
};

let messagesCache = [];
let messageCommentsCache = {};
const renderMessagesAdmin = () => {
  const q = ($('#msg-filter-q')?.value || '').trim().toLowerCase();
  const cat = $('#msg-filter-cat')?.value || '';
  const featOnly = $('#msg-filter-feat')?.value === '1';
  const messages = messagesCache.filter((m) => (!cat || m.category === cat) && (!featOnly || m.is_featured)
    && (!q || `${m.title} ${m.description || ''} ${m.speaker || ''} ${m.category || ''}`.toLowerCase().includes(q)));
  messagesAdminCount.textContent = messagesCache.length;
  if (!messages.length) {
    messagesAdminList.innerHTML = `<p style="font-size:13px;color:#6b7280">${messagesCache.length ? 'No messages match your search.' : 'No messages yet.'}</p>`;
    return;
  }
  messagesAdminList.innerHTML = messages.map((m) => {
    const msgComments = messageCommentsCache[m.id] || [];
    const dateStr = new Date(m.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    return `
      <div class="admin-item" data-id="${m.id}">
        <div class="admin-item-head">
          <h4>${m.source === 'live' ? '🔴 ' : ''}${escapeAdminHtml(m.title)}${m.is_featured ? ' <span class="req-badge">Featured</span>' : ''}${m.category ? ` <span class="req-badge">${escapeAdminHtml(m.category)}</span>` : ''}</h4>
          <time>${dateStr}</time>
        </div>
        ${m.speaker ? `<p style="font-size:12px;color:#d9ae56">${escapeAdminHtml(m.speaker)}</p>` : ''}
        ${m.description ? `<p>${escapeAdminHtml(m.description)}</p>` : ''}
        ${m.link ? `<p style="font-size:11.5px"><a href="${escapeAdminHtml(m.link)}" target="_blank" rel="noopener" style="color:var(--gold)">${escapeAdminHtml(m.link)}</a></p>` : ''}
        ${m.media_url ? `<p style="font-size:11.5px;color:#8890a0">📎 ${m.media_type || 'media'} attached</p>` : ''}
        <div class="admin-item-actions">
          <button type="button" class="btn-mini btn-edit-message" data-id="${m.id}">✎ Edit details</button>
          <button type="button" class="btn-mini btn-feature-message" data-id="${m.id}">${m.is_featured ? '★ Unfeature' : '☆ Feature'}</button>
          <button type="button" class="btn-mini btn-edit-notes" data-id="${m.id}">${m.notes_url ? '📎 Change notes link' : '📎 Add notes link'}</button>
          ${m.media_url || isPlayableLink(m.link) ? '' : `<button type="button" class="btn-mini btn-fix-link" data-id="${m.id}">⚠ Add recording link</button>`}
          <button type="button" class="btn-mini danger btn-delete-message" data-id="${m.id}">Delete message</button>
        </div>
        ${msgComments.length ? `
          <div class="comment-mini">
            ${msgComments.map((c) => `
              <div class="comment-mini-row" data-comment-id="${c.id}">
                <span><strong>${escapeAdminHtml(c.name)}:</strong> ${escapeAdminHtml(c.comment)}</span>
                <button type="button" class="btn-mini danger btn-delete-comment" data-id="${c.id}" style="padding:2px 8px" aria-label="Delete this comment">✕</button>
              </div>`).join('')}
          </div>` : ''}
      </div>`;
  }).join('');
};

const loadMessagesAdmin = async () => {
  if (!messagesAdminList) return;
  try {
    const [msgRes, commentRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/messages?select=*&order=created_at.desc&limit=500`),
      fetch(`${SUPABASE_URL}/rest/v1/message_comments?select=*&order=created_at.desc`)
    ]);
    messagesCache = msgRes.ok ? await msgRes.json() : [];
    const comments = commentRes.ok ? await commentRes.json() : [];
    messageCommentsCache = {};
    comments.forEach((c) => { (messageCommentsCache[c.message_id] ||= []).push(c); });
    // category suggestions + filter
    const cats = [...new Set(messagesCache.map((m) => m.category).filter(Boolean))].sort();
    const dl = $('#msg-category-options'); if (dl) dl.innerHTML = cats.map((c) => `<option value="${escAttr(c)}">`).join('');
    const fc = $('#msg-filter-cat'); if (fc) { const cur = fc.value; fc.innerHTML = '<option value="">All categories</option>' + cats.map((c) => `<option value="${escAttr(c)}">${escAttr(c)}</option>`).join(''); fc.value = cats.includes(cur) ? cur : ''; }
    renderMessagesAdmin();
  } catch (err) {
    messagesAdminList.innerHTML = '<p style="font-size:13px;color:#f87171">Could not load messages.</p>';
  }
};
['#msg-filter-q', '#msg-filter-cat', '#msg-filter-feat'].forEach((sel) => $(sel)?.addEventListener('input', () => renderMessagesAdmin()));

messagesAdminList?.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-id]');
  if (!btn) return;
  const id = btn.dataset.id;
  const m = messagesCache.find((x) => String(x.id) === id);
  const cls = btn.classList;
  try {
    if (cls.contains('btn-edit-message') && m) {
      await openEditDialog({
        title: 'Edit message',
        fields: [
          { name: 'title', label: 'Title', required: true, value: m.title, maxlength: 200 },
          { name: 'description', label: 'Description', type: 'textarea', value: m.description, maxlength: 4000 },
          { name: 'speaker', label: 'Speaker', value: m.speaker, maxlength: 120 },
          { name: 'category', label: 'Category', value: m.category, maxlength: 60, list: 'msg-category-options' },
          { name: 'thumbnail_url', label: 'Thumbnail picture link (optional)', value: m.thumbnail_url, maxlength: 2000, list: 'event-image-options' },
          { name: 'link', label: 'Video link (YouTube / Facebook / Vimeo)', value: m.link, maxlength: 2000 },
          { name: 'is_featured', label: 'Featured sermon', type: 'checkbox', value: m.is_featured }
        ],
        onSave: async (v) => {
          if (v.link && !/^https?:\/\//i.test(v.link)) throw new Error('The video link must start with https://');
          if (v.thumbnail_url && !/^(https?:\/\/|\/|assets\/|uploads\/)/i.test(v.thumbnail_url)) throw new Error('The thumbnail must be a link or a library picture.');
          await callManageContent('update_message', { id, ...v });
          showToast('Message updated', 'success');
          await loadMessagesAdmin();
        }
      });
    } else if (cls.contains('btn-feature-message') && m) {
      await callManageContent('update_message', { id, is_featured: !m.is_featured });
      showToast(m.is_featured ? 'No longer featured' : 'Marked as featured', 'success');
      loadMessagesAdmin();
    } else if (cls.contains('btn-edit-notes') && m) {
      const val = window.prompt('Paste the sermon notes link (leave empty to remove it):', m.notes_url || '');
      if (val === null) return;
      const url = val.trim();
      if (url && !/^https?:\/\//i.test(url)) { showToast('Please paste a full link starting with https://', 'error'); return; }
      await callManageContent('update_message', { id, notes_url: url }); showToast('Notes link saved', 'success'); loadMessagesAdmin();
    } else if (cls.contains('btn-fix-link') && m) {
      const link = askRecordingLink(m.link || '');
      if (!link) return;
      if (!isPlayableLink(link)) { showToast('That link cannot play on the site. Use a YouTube, Facebook or Vimeo video link, or an MP4/MP3 file.', 'error'); return; }
      btn.disabled = true;
      await callManageContent('update_message', { id, link });
      showToast('Recording link saved — it now plays on the website', 'success');
      loadMessagesAdmin();
    } else if (cls.contains('btn-delete-message')) {
      if (!confirm('Delete this message? This also removes its comments. This cannot be undone.')) return;
      await callManageContent('delete_message', { id });
      showToast('Message deleted', 'success'); loadMessagesAdmin();
    } else if (cls.contains('btn-delete-comment')) {
      if (!confirm('Delete this comment?')) return;
      await callManageContent('delete_comment', { id });
      showToast('Comment deleted', 'success'); loadMessagesAdmin();
    }
  } catch (err) {
    showToast(err.message || 'That did not work. Please try again.', 'error');
    btn.disabled = false;
  }
});

function escapeAdminHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

$('#btn-create-message')?.addEventListener('click', async () => {
  const title = $('#msg-title').value.trim();
  const description = $('#msg-desc').value.trim();
  const link = $('#msg-link').value.trim();
  const notes_url = $('#msg-notes')?.value.trim() || '';
  const selectedOpt = msgMediaSelect?.selectedOptions?.[0];
  const media_url = msgMediaSelect?.value || '';
  const media_type = media_url ? (selectedOpt?.dataset.kind || 'video') : '';
  const speaker = $('#msg-speaker')?.value.trim() || '';
  const category = $('#msg-category')?.value.trim() || '';
  const thumbnail_url = $('#msg-thumb')?.value.trim() || '';
  const is_featured = Boolean($('#msg-featured')?.checked);
  const note = $('#msg-create-note');
  const btn = $('#btn-create-message');

  if (!title) { note.textContent = 'Title is required.'; note.className = 'form-note err'; return; }

  btn.disabled = true;
  try {
    await callManageContent('create_message', { title, description, link, media_url, media_type, notes_url, source: 'manual', speaker, category, thumbnail_url, is_featured });
    note.textContent = 'Message added.';
    note.className = 'form-note ok';
    $('#msg-title').value = '';
    $('#msg-desc').value = '';
    $('#msg-link').value = '';
    if ($('#msg-notes')) $('#msg-notes').value = '';
    ['#msg-speaker', '#msg-category', '#msg-thumb'].forEach((sel) => { if ($(sel)) $(sel).value = ''; });
    if ($('#msg-featured')) $('#msg-featured').checked = false;
    if (msgMediaSelect) msgMediaSelect.value = '';
    loadMessagesAdmin();
  } catch (err) {
    note.textContent = err.message || 'Could not add message.';
    note.className = 'form-note err';
  }
  btn.disabled = false;
});

/* =========================================================================
   ARCHIVE A LIVE BROADCAST — turns live mode off and saves it as a message
   ========================================================================= */
$('#btn-archive-live')?.addEventListener('click', async () => {
  const note = $('#archive-live-note');
  const btn = $('#btn-archive-live');
  const title = $('#field-live-title')?.value.trim() || 'Live Service Recording';
  const description = $('#field-live-desc')?.value.trim() || '';
  let link = $('#field-live-url')?.value.trim() || '';

  if (!confirm('Save this broadcast to the public Sermon Archive and go offline now?')) return;

  // A channel "/live" page cannot be replayed on the site, so ask for the recording link
  if (!isPlayableLink(link)) {
    const recording = askRecordingLink('');
    if (recording === null) return;           // cancelled — nothing saved
    if (recording) link = recording;
  }

  btn.disabled = true;
  try {
    await callManageContent('create_message', { title, description, link, source: 'live' });
    const isLiveField = $('#field-is-live');
    if (isLiveField) isLiveField.checked = false;
    await saveSettings(false);
    note.textContent = isPlayableLink(link) ? 'Archived — the broadcast now appears in the Sermon Archive, and live status is off.' : 'Archived without a playable recording link. Use "Fix link" on it in the messages list once the recording is ready.';
    note.className = 'form-note ok';
    showToast('Broadcast archived to Messages', 'success');
    loadMessagesAdmin();
  } catch (err) {
    note.textContent = err.message || 'Could not archive this broadcast.';
    note.className = 'form-note err';
  }
  btn.disabled = false;
});

/* =========================================================================
   SUBMITTED PRAYER REQUESTS (admin) — private, read via manage-content only
   ========================================================================= */
const requestsAdminList = $('#requests-admin-list');
const requestsBadge = $('#sidebar-requests-badge');

let requestsCache = [];
const FOLLOW_LABEL = { new: 'New', in_progress: 'Following up', done: 'Follow-up done' };
const renderRequests = () => {
  if (!requestsAdminList) return;
  const q = ($('#req-filter-q')?.value || '').trim().toLowerCase();
  const st = $('#req-filter-status')?.value || '';
  const list = requestsCache.filter((r) => {
    if (q && !`${r.name} ${r.request} ${r.contact || ''}`.toLowerCase().includes(q)) return false;
    if (st === 'unread') return !r.is_read;
    if (st === 'private') return r.is_private;
    if (st === 'in_progress' || st === 'done') return r.follow_up === st;
    return true;
  });
  if (!requestsCache.length) { requestsAdminList.innerHTML = '<p style="font-size:13px;color:#6b7280">No prayer requests submitted yet.</p>'; return; }
  if (!list.length) { requestsAdminList.innerHTML = '<p style="font-size:13px;color:#6b7280">No requests match your search.</p>'; return; }
  requestsAdminList.innerHTML = list.map((r) => {
    const dateStr = new Date(r.created_at).toLocaleString();
    const fu = r.follow_up || 'new';
    return `
      <div class="admin-item${r.is_read ? '' : ' unread'}" data-id="${r.id}">
        <div class="admin-item-head">
          <h4>${escapeAdminHtml(r.name)}${r.is_private ? ' <span class="req-badge">🔒 Confidential</span>' : ''}${fu !== 'new' ? ` <span class="req-badge">${FOLLOW_LABEL[fu]}</span>` : ''}</h4>
          <time>${dateStr}</time>
        </div>
        <p>${escapeAdminHtml(r.request)}</p>
        ${r.contact ? `<p style="font-size:11.5px;color:#8890a0">Contact: ${escapeAdminHtml(r.contact)}</p>` : ''}
        <div class="req-follow">
          <select class="status-select req-status" data-id="${r.id}" aria-label="Follow-up status for ${escapeAdminHtml(r.name)}">
            ${Object.entries(FOLLOW_LABEL).map(([v, l]) => `<option value="${v}"${v === fu ? ' selected' : ''}>${l}</option>`).join('')}
          </select>
          <input type="text" class="note-input req-note" data-id="${r.id}" maxlength="1000" value="${escapeAdminHtml(r.admin_note || '')}" placeholder="Private follow-up note (never public)" aria-label="Follow-up note">
        </div>
        <div class="admin-item-actions">
          <button type="button" class="btn-mini btn-save-follow" data-id="${r.id}">Save follow-up</button>
          <button type="button" class="btn-mini btn-toggle-read" data-id="${r.id}" data-read="${r.is_read}">${r.is_read ? 'Mark unread' : 'Mark read'}</button>
          <button type="button" class="btn-mini danger btn-delete-request" data-id="${r.id}">Delete</button>
        </div>
      </div>`;
  }).join('');
};
const loadPrayerRequests = async () => {
  if (!requestsAdminList) return;
  try {
    const { requests } = await callManageContent('list_prayer_requests');
    requestsCache = requests;
    const unread = requests.filter((r) => !r.is_read).length;
    if (requestsBadge) {
      requestsBadge.style.display = unread ? 'inline-block' : 'none';
      requestsBadge.textContent = unread;
    }
    renderRequests();
  } catch (err) {
    requestsAdminList.innerHTML = `<p style="font-size:13px;color:#f87171">${escapeAdminHtml(err.message || 'Could not load prayer requests.')} Please refresh and try again.</p>`;
  }
};
['#req-filter-q', '#req-filter-status'].forEach((sel) => $(sel)?.addEventListener('input', renderRequests));
requestsAdminList?.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-id]');
  if (!btn) return;
  const id = btn.dataset.id;
  try {
    if (btn.classList.contains('btn-toggle-read')) {
      await callManageContent('mark_prayer_request_read', { id, is_read: btn.dataset.read !== 'true' });
      loadPrayerRequests();
    } else if (btn.classList.contains('btn-save-follow')) {
      const row = btn.closest('.admin-item');
      await callManageContent('set_prayer_followup', { id, follow_up: $('.req-status', row).value, admin_note: $('.req-note', row).value });
      showToast('Follow-up saved', 'success');
      loadPrayerRequests();
    } else if (btn.classList.contains('btn-delete-request')) {
      if (!confirm('Delete this prayer request permanently? This cannot be undone.')) return;
      await callManageContent('delete_prayer_request', { id });
      showToast('Request deleted', 'success');
      loadPrayerRequests();
    }
  } catch (err) { showToast(err.message || 'Could not update request', 'error'); }
});


/* =========================================================================
   NEW VISITORS / VOLUNTEERS + TESTIMONIES (admin)
   ========================================================================= */
const KIND_LABEL = { visitor: 'First-time visitor', callback: 'Call-back request', question: 'Question', volunteer: 'Volunteer', counseling: 'Counseling', other: 'Other' };
const setBadge = (el, n) => { if (el) { el.style.display = n ? 'inline-block' : 'none'; el.textContent = n; } };

const loadConnectAdmin = async () => {
  const box = $('#connect-admin-list');
  if (!box) return;
  try {
    const { requests } = await callManageContent('list_connect_requests');
    setBadge($('#sidebar-connect-badge'), requests.filter((r) => !r.is_contacted).length);
    if (!requests.length) { box.innerHTML = '<p style="font-size:13px;color:#6b7280">Nobody has used the form yet.</p>'; return; }
    box.innerHTML = requests.map((r) => {
      const tel = (r.phone || '').replace(/[^\d+]/g, '');
      const wa = tel ? `https://wa.me/${tel.replace(/^\+/, '').replace(/^0/, '233')}` : '';
      return `
      <div class="admin-item${r.is_contacted ? '' : ' unread'}" data-id="${r.id}">
        <div class="admin-item-head">
          <h4>${escapeAdminHtml(r.name)} <span class="req-badge">${KIND_LABEL[r.kind] || 'Other'}</span></h4>
          <time>${new Date(r.created_at).toLocaleString()}</time>
        </div>
        ${r.note ? `<p>${escapeAdminHtml(r.note)}</p>` : ''}
        <p style="font-size:12.5px;color:#8890a0">${r.phone ? `📞 ${escapeAdminHtml(r.phone)}` : ''} ${r.email ? `✉ ${escapeAdminHtml(r.email)}` : ''}</p>
        <div class="admin-item-actions">
          ${wa ? `<a class="btn-mini" href="${wa}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
          ${r.phone ? `<a class="btn-mini" href="tel:${escapeAdminHtml(tel)}">Call</a>` : ''}
          <button type="button" class="btn-mini btn-contacted" data-id="${r.id}" data-done="${r.is_contacted}">${r.is_contacted ? 'Mark not contacted' : 'Mark contacted'}</button>
          <button type="button" class="btn-mini danger btn-del-connect" data-id="${r.id}">Delete</button>
        </div>
      </div>`;
    }).join('');
    $$('.btn-contacted', box).forEach((b) => b.addEventListener('click', async () => {
      try { await callManageContent('mark_connect_contacted', { id: b.dataset.id, is_contacted: b.dataset.done !== 'true' }); loadConnectAdmin(); }
      catch (err) { showToast(err.message || 'Could not update', 'error'); }
    }));
    $$('.btn-del-connect', box).forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('Delete this entry permanently?')) return;
      try { await callManageContent('delete_connect_request', { id: b.dataset.id }); loadConnectAdmin(); }
      catch (err) { showToast(err.message || 'Could not delete', 'error'); }
    }));
  } catch {
    box.innerHTML = '<p style="font-size:13px;color:#f87171">Could not load this list. Please refresh and try again.</p>';
  }
};

let testimoniesCache = [];
const renderTestimonies = () => {
  const box = $('#testimonies-admin-list');
  if (!box) return;
  const q = ($('#tes-filter-q')?.value || '').trim().toLowerCase();
  const st = $('#tes-filter-status')?.value || '';
  const list = testimoniesCache.filter((t) => (!q || `${t.name} ${t.location || ''} ${t.testimony}`.toLowerCase().includes(q))
    && (!st || (st === 'pending' ? !t.is_approved : t.is_approved)));
  if (!testimoniesCache.length) { box.innerHTML = '<p style="font-size:13px;color:#6b7280">No testimonies submitted yet.</p>'; return; }
  if (!list.length) { box.innerHTML = '<p style="font-size:13px;color:#6b7280">No testimonies match your search.</p>'; return; }
  box.innerHTML = list.map((t) => `
    <div class="admin-item${t.is_approved ? '' : ' unread'}" data-id="${t.id}">
      <div class="admin-item-head">
        <h4>${escapeAdminHtml(t.name)}${t.location ? ` <span style="font-weight:500;color:#8890a0;font-size:12px">· ${escapeAdminHtml(t.location)}</span>` : ''}
          <span class="req-badge" style="${t.is_approved ? 'background:#1f4d2e;color:#a7f3c0' : ''}">${t.is_approved ? 'Published' : 'Awaiting approval'}</span>
          <span class="req-badge">${t.show_name === false ? 'Shown as Anonymous' : 'Name may be shown'}</span></h4>
        <time>${new Date(t.created_at).toLocaleString()}</time>
      </div>
      <p>${escapeAdminHtml(t.testimony)}</p>
      <div class="admin-item-actions">
        <button type="button" class="btn-mini btn-approve" data-id="${t.id}" data-ok="${t.is_approved}">${t.is_approved ? 'Unpublish' : 'Approve & publish'}</button>
        <button type="button" class="btn-mini btn-edit-testimony" data-id="${t.id}">✎ Edit</button>
        <button type="button" class="btn-mini danger btn-del-testimony" data-id="${t.id}">Delete</button>
      </div>
    </div>`).join('');
};
const loadTestimoniesAdmin = async () => {
  const box = $('#testimonies-admin-list');
  if (!box) return;
  try {
    const { testimonies } = await callManageContent('list_testimonies');
    testimoniesCache = testimonies;
    setBadge($('#sidebar-testimonies-badge'), testimonies.filter((t) => !t.is_approved).length);
    renderTestimonies();
  } catch (err) {
    box.innerHTML = `<p style="font-size:13px;color:#f87171">${escapeAdminHtml(err.message || 'Could not load testimonies.')} Please refresh and try again.</p>`;
  }
};
['#tes-filter-q', '#tes-filter-status'].forEach((sel) => $(sel)?.addEventListener('input', renderTestimonies));
$('#testimonies-admin-list')?.addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-id]');
  if (!b) return;
  const id = b.dataset.id, t = testimoniesCache.find((x) => x.id === id);
  try {
    if (b.classList.contains('btn-approve')) {
      await callManageContent('set_testimony_approved', { id, is_approved: b.dataset.ok !== 'true' });
      showToast(b.dataset.ok === 'true' ? 'Testimony unpublished' : 'Testimony published', 'success'); loadTestimoniesAdmin();
    } else if (b.classList.contains('btn-edit-testimony') && t) {
      await openEditDialog({
        title: 'Edit testimony',
        fields: [
          { name: 'name', label: 'Name', required: true, value: t.name, maxlength: 80 },
          { name: 'location', label: 'Town / Country', value: t.location, maxlength: 80 },
          { name: 'testimony', label: 'Testimony', type: 'textarea', required: true, value: t.testimony, maxlength: 1500 },
          { name: 'show_name', label: 'The person agreed to show their name publicly', type: 'checkbox', value: t.show_name !== false }
        ],
        onSave: async (v) => { await callManageContent('update_testimony', { id, ...v }); showToast('Testimony updated', 'success'); await loadTestimoniesAdmin(); }
      });
    } else if (b.classList.contains('btn-del-testimony')) {
      if (!confirm('Delete this testimony permanently?')) return;
      await callManageContent('delete_testimony', { id }); showToast('Testimony deleted', 'success'); loadTestimoniesAdmin();
    }
  } catch (err) { showToast(err.message || 'Could not update', 'error'); }
});


/* =========================================================================
   PRAYER WALL MODERATION + ANALYTICS (admin)
   ========================================================================= */
let wallCache = [];
const renderWall = () => {
  const box = $('#wall-admin-list');
  if (!box) return;
  const q = ($('#wall-filter-q')?.value || '').trim().toLowerCase();
  const st = $('#wall-filter-status')?.value || '';
  const list = wallCache.filter((p) => (!q || `${p.name || ''} ${p.request}`.toLowerCase().includes(q)) && (!st || (st === 'pending' ? !p.is_approved : p.is_approved)));
  if (!wallCache.length) { box.innerHTML = '<p style="font-size:13px;color:#6b7280">Nothing has been added to the wall yet.</p>'; return; }
  if (!list.length) { box.innerHTML = '<p style="font-size:13px;color:#6b7280">Nothing matches your search.</p>'; return; }
  const total = wallCache.filter((p) => p.is_approved).reduce((t, p) => t + (p.prayed_count || 0), 0);
  box.innerHTML = `<p class="muted-note" style="margin:0 0 12px">Published prayers have been prayed over <strong>${total}</strong> times in total (one count per person per request).</p>` + list.map((p) => `
    <div class="admin-item${p.is_approved ? '' : ' unread'}" data-id="${p.id}">
      <div class="admin-item-head">
        <h4>${escapeAdminHtml(p.name || 'Anonymous')}
          <span class="req-badge" style="${p.is_approved ? 'background:#1f4d2e;color:#a7f3c0' : ''}">${p.is_approved ? `Published · 🙏 ${p.prayed_count}` : 'Awaiting approval'}</span></h4>
        <time>${new Date(p.created_at).toLocaleString()}</time>
      </div>
      <p>${escapeAdminHtml(p.request)}</p>
      <div class="admin-item-actions">
        <button type="button" class="btn-mini btn-wall-approve" data-id="${p.id}" data-ok="${p.is_approved}">${p.is_approved ? 'Unpublish' : 'Approve & publish'}</button>
        <button type="button" class="btn-mini btn-wall-edit" data-id="${p.id}">✎ Edit / clean up</button>
        <button type="button" class="btn-mini danger btn-wall-del" data-id="${p.id}">Delete</button>
      </div>
    </div>`).join('');
};
const loadWallAdmin = async () => {
  const box = $('#wall-admin-list');
  if (!box) return;
  try {
    const { prayers } = await callManageContent('list_wall_prayers');
    wallCache = prayers;
    setBadge($('#sidebar-wall-badge'), prayers.filter((p) => !p.is_approved).length);
    renderWall();
  } catch (err) {
    box.innerHTML = `<p style="font-size:13px;color:#f87171">${escapeAdminHtml(err.message || 'Could not load the prayer wall.')} Please refresh and try again.</p>`;
  }
};
['#wall-filter-q', '#wall-filter-status'].forEach((sel) => $(sel)?.addEventListener('input', renderWall));
$('#wall-admin-list')?.addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-id]');
  if (!b) return;
  const id = b.dataset.id, p = wallCache.find((x) => x.id === id);
  try {
    if (b.classList.contains('btn-wall-approve')) {
      await callManageContent('set_wall_approved', { id, is_approved: b.dataset.ok !== 'true' });
      showToast(b.dataset.ok === 'true' ? 'Removed from the public wall' : 'Published on the wall', 'success'); loadWallAdmin();
    } else if (b.classList.contains('btn-wall-edit') && p) {
      await openEditDialog({
        title: 'Edit wall request',
        fields: [
          { name: 'name', label: 'First name (blank = Anonymous)', value: p.name, maxlength: 60 },
          { name: 'request', label: 'Request (remove any phone numbers or private details)', type: 'textarea', required: true, value: p.request, maxlength: 400 }
        ],
        onSave: async (v) => { await callManageContent('update_wall_prayer', { id, ...v }); showToast('Request updated', 'success'); await loadWallAdmin(); }
      });
    } else if (b.classList.contains('btn-wall-del')) {
      if (!confirm('Delete this request permanently?')) return;
      await callManageContent('delete_wall_prayer', { id }); showToast('Request deleted', 'success'); loadWallAdmin();
    }
  } catch (err) { showToast(err.message || 'Could not update', 'error'); }
});

const loadAnalytics = async () => {
  const box = $('#analytics-body');
  if (!box) return;
  box.innerHTML = '<p style="font-size:13px;color:#6b7280">Loading…</p>';
  try {
    const span = Number($('#analytics-range')?.value) || 30;
    const { analytics: a } = await callManageContent('get_analytics', { days: span });
    const days = a.days || [];
    const sum = (k, from = 0) => days.slice(from).reduce((t, d) => t + (d[k] || 0), 0);
    const maxViews = Math.max(1, ...days.map((d) => d.views));
    const rank = (rows, empty) => rows.length
      ? `<ul class="rank-list">${rows.map(([n, c]) => `<li><span>${escapeAdminHtml(n)}</span><b>${c}</b></li>`).join('')}</ul>`
      : `<p style="font-size:13px;color:#6b7280">${empty}</p>`;
    const dev = a.devices || {};
    const devTotal = Object.values(dev).reduce((t, v) => t + v, 0) || 1;
    const devRows = Object.entries(dev).sort((x, y) => y[1] - x[1]).map(([k, v]) => [`${k.charAt(0).toUpperCase() + k.slice(1)} (${Math.round(v / devTotal * 100)}%)`, v]);
    box.innerHTML = `
      <div class="stat-grid">
        <div class="stat-box"><b>${days.length ? days[days.length - 1].views : 0}</b><span>Visits today</span></div>
        <div class="stat-box"><b>${sum('views')}</b><span>Visits, last ${span} days</span></div>
        <div class="stat-box"><b>${sum('plays')}</b><span>Sermon plays</span></div>
        <div class="stat-box"><b>${a.shares || 0}</b><span>Shares</span></div>
      </div>
      <div class="card">
        <h3 class="card-title">Visits per day</h3>
        <div class="bars">${days.map((d) => `<div class="bar" style="height:${Math.round((d.views / maxViews) * 100)}%" title="${d.day}: ${d.views} visits, ${d.plays} plays"></div>`).join('')}</div>
        <div class="bar-axis"><span>${days[0]?.day || ''}</span><span>${days[days.length - 1]?.day || ''}</span></div>
      </div>
      <div class="form-grid-2" style="align-items:start">
        <div class="card"><h3 class="card-title">Popular pages</h3>${rank(a.topPages || [], 'No visits yet.')}</div>
        <div class="card"><h3 class="card-title">Most played sermons</h3>${rank(a.topSermons || [], 'No sermon plays yet.')}</div>
      </div>
      <div class="form-grid-2" style="align-items:start">
        <div class="card"><h3 class="card-title">Where visitors come from</h3>${rank(a.referrers || [], 'No visits yet.')}</div>
        <div class="card"><h3 class="card-title">Devices</h3>${rank(devRows, 'No visits yet.')}</div>
      </div>`;
  } catch (err) {
    box.innerHTML = `<p style="font-size:13px;color:#f87171">${escapeAdminHtml(err.message || 'Could not load statistics.')} Please refresh and try again.</p>`;
  }
};
$('#btn-refresh-analytics')?.addEventListener('click', loadAnalytics);
$('#analytics-range')?.addEventListener('change', loadAnalytics);


/* =========================================================================
   TEAM & ACCOUNTS (system admin) + MY ACCOUNT
   ========================================================================= */
const callAdminUsers = async (action, payload = {}) => {
  const res = await fetch(`${EDGE_BASE}/admin-users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ passkey: getPasskey(), action, payload })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
};

const ROLE_HELP = {
  owner: 'Everything, including this team page and security.',
  editor: 'Website content, events, giving, live status, pictures, sermons and visitor stats. Cannot see private prayer requests or the team list.',
  media: 'Pictures, videos, audio and the sermon archive only.',
  care: 'Private prayer requests, new visitors and volunteers, testimonies and the prayer wall only.',
  registrar: 'Member directory, households, ministries, small groups, volunteer scheduling, attendance sessions and reports.',
  usher: 'Attendance registers and check-in only. No member contact details or directory exports.'
};
const showRoleHelp = () => { const el = $('#team-role-help'); if (el) el.textContent = ROLE_HELP[$('#team-role').value] || ''; };
$('#team-role')?.addEventListener('change', showRoleHelp);
showRoleHelp();

const randomPassword = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint32Array(14));
  return Array.from(bytes, (n) => chars[n % chars.length]).join('');
};
$('#btn-gen-password')?.addEventListener('click', () => { $('#team-password').value = randomPassword(); });

const loadTeam = async () => {
  const box = $('#team-list');
  if (!box) return;
  try {
    const { users } = await callAdminUsers('list_users');
    if (!users.length) {
      box.innerHTML = '<p style="font-size:13px;color:#6b7280">No accounts yet. You are signed in with the shared passkey. Add your own system admin account below, sign in with it, then turn the shared passkey off under My Account &amp; Backup.</p>';
      return;
    }
    box.innerHTML = users.map((u) => {
      const mine = me && me.via === 'account' && (u.email || '').toLowerCase() === (me.email || '').toLowerCase();
      return `
      <div class="team-row${u.active ? '' : ' is-off'}" data-id="${u.user_id}">
        <div>
          <strong>${escapeAdminHtml(u.display_name || u.email)}</strong>${u.active ? '' : ' <span class="role-badge" style="background:#3a1a1f;color:#f3a3ac">Off</span>'}
          <small>${escapeAdminHtml(u.email)} · last sign-in ${u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleDateString() : 'never'}</small>
        </div>
        <div>
          <select class="team-role-select" data-id="${u.user_id}" aria-label="Role for ${escapeAdminHtml(u.email)}">
            ${Object.keys(ROLE_LABEL).filter(r=>isNodeAdminSession()||!['registrar','usher'].includes(r)).map((r) => `<option value="${r}"${u.role === r ? ' selected' : ''}>${ROLE_LABEL[r]}</option>`).join('')}
          </select>
        </div>
        <div class="team-actions">
          <button type="button" class="btn-mini btn-team-reset" data-id="${u.user_id}">Reset password</button>
          ${mine ? '' : `<button type="button" class="btn-mini btn-team-toggle" data-id="${u.user_id}" data-active="${u.active}">${u.active ? 'Turn off' : 'Turn on'}</button>
          <button type="button" class="btn-mini danger btn-team-delete" data-id="${u.user_id}">Delete</button>`}
        </div>
      </div>`;
    }).join('');

    const guard = async (fn, okMsg) => {
      try { await fn(); if (okMsg) showToast(okMsg, 'success'); } catch (err) { showToast(err.message || 'Something went wrong', 'error'); }
      loadTeam();
    };
    $$('.team-role-select', box).forEach((sel) => sel.addEventListener('change', () =>
      guard(() => callAdminUsers('set_role', { user_id: sel.dataset.id, role: sel.value }), 'Role updated')));
    $$('.btn-team-toggle', box).forEach((b) => b.addEventListener('click', () =>
      guard(() => callAdminUsers('set_active', { user_id: b.dataset.id, active: b.dataset.active !== 'true' }), 'Account updated')));
    $$('.btn-team-reset', box).forEach((b) => b.addEventListener('click', () => {
      const pw = window.prompt('Type a new temporary password (at least 10 characters). Share it privately.', randomPassword());
      if (!pw) return;
      guard(() => callAdminUsers('reset_password', { user_id: b.dataset.id, password: pw.trim() }), 'Password changed');
    }));
    $$('.btn-team-delete', box).forEach((b) => b.addEventListener('click', () => {
      if (!confirm('Delete this account permanently? They will no longer be able to sign in.')) return;
      guard(() => callAdminUsers('delete_user', { user_id: b.dataset.id }), 'Account deleted');
    }));
  } catch (err) {
    box.innerHTML = `<p style="font-size:13px;color:#f87171">${escapeAdminHtml(err.message || 'Could not load the team list.')}</p>`;
  }
};

$('#btn-create-team-user')?.addEventListener('click', async () => {
  const btn = $('#btn-create-team-user');
  const email = $('#team-email').value.trim();
  const password = $('#team-password').value;
  const out = $('#team-created');
  out.hidden = true;
  btn.disabled = true;
  try {
    await callAdminUsers('create_user', { name: $('#team-name').value.trim(), email, role: $('#team-role').value, password });
    out.innerHTML = `Account created. Share these details privately:<br>Sign-in page: ${location.origin}/admin<br>Email: ${escapeAdminHtml(email)}<br>Temporary password: ${escapeAdminHtml(password)}<br><br>Ask them to change the password under My Account &amp; Backup.`;
    out.hidden = false;
    ['#team-name', '#team-email', '#team-password'].forEach((id) => { $(id).value = ''; });
    showToast('Account created', 'success');
    loadTeam();
  } catch (err) {
    showToast(err.message || 'Could not create the account', 'error');
  }
  btn.disabled = false;
});

// ---- My account card + shared passkey switch ----
function renderAccountCard() {
  const sum = $('#account-summary');
  if (!sum || !me) return;
  const viaPasskey = me.via === 'passkey';
  sum.innerHTML = viaPasskey
    ? 'You are signed in with the <strong>shared passkey</strong>. Anyone who knows it has system admin access. Create your own system admin account under Team &amp; Accounts, sign in with it, then turn the shared passkey off below.'
    : `Signed in as <strong>${escapeAdminHtml(me.name || me.email)}</strong> (${escapeAdminHtml(me.email)}), role: <strong>${ROLE_LABEL[me.role] || me.role}</strong>.`;
  const pw = $('#account-password-box');
  if (pw) pw.hidden = viaPasskey;
  const st = $('#legacy-status'), tg = $('#btn-toggle-legacy');
  if (st && tg) {
    st.textContent = legacyEnabled
      ? 'The shared passkey is ON. Anyone who knows it can sign in as a system admin.'
      : 'The shared passkey is OFF. Only personal accounts can sign in.';
    tg.textContent = legacyEnabled ? 'Turn the shared passkey off' : 'Turn the shared passkey on';
  }
}

$('#btn-toggle-legacy')?.addEventListener('click', async () => {
  const turningOff = legacyEnabled;
  const msg = turningOff
    ? 'Turn the shared passkey off? Everyone must then sign in with their own account. (If you are using the passkey right now, you will be signed out.)'
    : 'Turn the shared passkey back on?';
  if (!confirm(msg)) return;
  try {
    await callAdminUsers('set_legacy', { enabled: !turningOff });
    legacyEnabled = !turningOff;
    if (turningOff && me?.via === 'passkey') { signOutToLogin('The shared passkey is now off. Sign in with your own account.'); return; }
    renderAccountCard();
    showToast(turningOff ? 'Shared passkey turned off' : 'Shared passkey turned on', 'success');
  } catch (err) {
    showToast(err.message || 'Could not change this setting', 'error');
  }
});

$('#btn-change-my-password')?.addEventListener('click', async () => {
  const input = $('#my-new-password');
  const pw = input.value;
  if (pw.length < 10) { showToast('Use at least 10 characters', 'error'); return; }
  try {
    await ensureFreshToken();
    const res = await _origFetch(`${SUPABASE_URL}/auth/v1/user`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${getPasskey()}` },
      body: JSON.stringify({ password: pw })
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      showToast(/reauth|nonce|recent/i.test(body.msg || body.message || '') ? 'For safety, sign out and sign in again, then change your password.' : (body.msg || body.message || 'Could not change the password'), 'error');
      return;
    }
    input.value = '';
    showToast('Password updated', 'success');
  } catch { showToast('Network error while changing the password', 'error'); }
});


/* =========================================================================
   PRAYER ARMY INTERNATIONAL - ADMIN EXTRAS
   (Merged into admin.js; runs before sign-in is checked.) Dashboard overview, notification preferences, mobile menu drawer.
   Every number on the dashboard is counted by the server from real records, and the server
   only returns the sections the signed-in role is allowed to see.
   ========================================================================= */
(() => {
  'use strict';

  const goTo = (view) => document.querySelector(`.sidebar-btn[data-view="${view}"]`)?.click();
  const esc = (v) => escapeAdminHtml(v);

  /* ---------------- Dashboard ---------------- */
  const card = (n, label, view, { hint = '', attention = false, cls = '' } = {}) =>
    `<button type="button" class="dash-card${attention ? ' attention' : ''} ${cls}" data-go="${view}"><b>${esc(n)}</b><span>${esc(label)}</span>${hint ? `<small>${esc(hint)}</small>` : ''}</button>`;

  const TYPE_LABEL = { prayer: 'Prayer request', testimony: 'Testimony', enquiry: 'Enquiry', wall: 'Prayer wall' };
  const ago = (iso) => {
    const m = Math.round((Date.now() - new Date(iso)) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m} min ago`;
    if (m < 1440) return `${Math.round(m / 60)} h ago`;
    return new Date(iso).toLocaleDateString();
  };

  const loadDashboard = async () => {
    const box = document.getElementById('dash-body');
    if (!box) return;
    try {
      const { dashboard: d } = await callManageContent('get_dashboard');
      const cards = [];
      if (d.live) cards.push(card(d.live.isLive ? 'LIVE' : 'Offline', 'Livestream status', 'view-live', { hint: d.live.isLive ? d.live.title : 'Not broadcasting', cls: d.live.isLive ? 'live-on' : '' }));
      if (d.sermons) cards.push(card(d.sermons.total, 'Sermons & messages', 'view-messages', { hint: `${d.sermons.featured} featured` }));
      if (d.media) cards.push(card(d.media.uploads, 'Uploaded media files', 'view-media'));
      if (d.prayer) {
        cards.push(card(d.prayer.total, 'Prayer requests', 'view-requests', { hint: `${d.prayer.private} confidential · ${d.prayer.followup} being followed up` }));
        cards.push(card(d.prayer.unread, 'Unread requests', 'view-requests', { attention: d.prayer.unread > 0 }));
        cards.push(card(d.testimonies.total, 'Testimonies', 'view-testimonies'));
        cards.push(card(d.testimonies.pending, 'Testimonies awaiting approval', 'view-testimonies', { attention: d.testimonies.pending > 0 }));
        cards.push(card(d.wall.pending, 'Prayer wall posts awaiting approval', 'view-wall', { attention: d.wall.pending > 0, hint: `${d.wall.prayed} prayers offered` }));
        cards.push(card(d.enquiries.total, 'Visitor enquiries', 'view-connect', { hint: `${d.enquiries.waiting} not yet contacted`, attention: d.enquiries.waiting > 0 }));
      }
      if (d.events) cards.push(card(d.events.upcoming, 'Upcoming events', 'view-events'));
      if (d.announcements) cards.push(card(d.announcements.active, 'Published announcements', 'view-announcements'));
      if (d.traffic) cards.push(card(d.traffic.views7, 'Visits, last 7 days', 'view-analytics', { hint: `${d.traffic.views30} in 30 days · ${d.traffic.plays30} sermon plays` }));

      let html = `<div class="dash-grid">${cards.join('')}</div>`;
      const act = d.activity || [];
      html += `<div class="dash-two">`;
      if (d.traffic) html += `<div class="card"><h3 class="card-title">Visits, last 14 days</h3><div class="mini-bars" id="dash-bars" aria-label="Visits per day"></div><p class="muted-note" id="dash-bars-note"></p></div>`;
      if (d.activity) html += `<div class="card"><h3 class="card-title">Recent activity</h3>${act.length
        ? `<ul class="activity-list">${act.map((a) => `<li><span><em>${esc(TYPE_LABEL[a.type] || a.type)}</em>${esc(a.who)}</span><time datetime="${esc(a.at)}">${esc(ago(a.at))}</time></li>`).join('')}</ul>`
        : '<p class="muted-note">Nothing yet. New requests, testimonies and enquiries will appear here.</p>'}</div>`;
      html += `</div>`;
      if (!cards.length) html = '<p class="muted-note">There is nothing to summarise for your role yet.</p>';
      box.innerHTML = html;

      if (d.traffic) {
        try {
          const { analytics: a } = await callManageContent('get_analytics', { days: 30 });
          const days = (a.days || []).slice(-14);
          const max = Math.max(1, ...days.map((x) => x.views));
          document.getElementById('dash-bars').innerHTML = days.map((x) => `<i style="height:${Math.round(x.views / max * 100)}%" title="${esc(x.day)}: ${x.views} visits"></i>`).join('');
          document.getElementById('dash-bars-note').textContent = days.every((x) => !x.views) ? 'No visits recorded yet.' : `Peak day: ${max} visits.`;
        } catch { /* chart is optional */ }
      }
      const w = document.getElementById('dash-welcome');
      if (w && typeof me !== 'undefined' && me) w.textContent = `Welcome, ${me.name || me.email}. Everything below is counted from your real website records.`;
    } catch (err) {
      box.innerHTML = `<p style="font-size:13px;color:#f87171">${esc(err.message || 'Could not load the dashboard.')}</p>`;
    }
  };

  document.getElementById('dash-body')?.addEventListener('click', (e) => {
    const c = e.target.closest('[data-go]');
    if (c) goTo(c.dataset.go);
  });
  document.getElementById('btn-refresh-dashboard')?.addEventListener('click', loadDashboard);

  /* ---------------- Notification preferences ---------------- */
  const ids = { onPrayer: 'notify-prayer', onConnect: 'notify-connect', onTestimony: 'notify-testimony', onWall: 'notify-wall' };
  const loadNotify = async () => {
    if (!can('settings')) return;
    try {
      const { prefs } = await callManageContent('get_notify_prefs');
      document.getElementById('notify-email').value = prefs.email || '';
      Object.entries(ids).forEach(([k, id]) => { document.getElementById(id).checked = !!prefs[k]; });
    } catch (err) { showToast(err.message || 'Could not load notification settings', 'error'); }
  };
  document.getElementById('btn-save-notify')?.addEventListener('click', async () => {
    const note = document.getElementById('notify-note'), btn = document.getElementById('btn-save-notify');
    const payload = { email: document.getElementById('notify-email').value.trim() };
    Object.entries(ids).forEach(([k, id]) => { payload[k] = document.getElementById(id).checked; });
    if (!payload.email && Object.keys(ids).some((k) => payload[k])) { note.textContent = 'Enter an e-mail address to receive alerts.'; note.className = 'form-note err'; return; }
    btn.disabled = true;
    try {
      await callManageContent('save_notify_prefs', payload);
      note.textContent = 'Saved. Alerts will be sent when new items arrive.'; note.className = 'form-note ok';
    } catch (err) { note.textContent = err.message || 'Could not save.'; note.className = 'form-note err'; }
    btn.disabled = false;
  });

  /* ---------------- Mobile menu drawer ---------------- */
  const topLeft = document.querySelector('.top-left');
  if (topLeft && !document.getElementById('menu-fab')) {
    const b = document.createElement('button');
    b.type = 'button'; b.id = 'menu-fab'; b.className = 'menu-fab';
    b.setAttribute('aria-label', 'Open menu'); b.setAttribute('aria-expanded', 'false');
    b.innerHTML = '<span aria-hidden="true">☰</span> Menu';
    topLeft.prepend(b);
    const setDrawer = (open) => { document.body.classList.toggle('drawer-open', open); b.setAttribute('aria-expanded', String(open)); };
    b.addEventListener('click', () => setDrawer(!document.body.classList.contains('drawer-open')));
    document.getElementById('drawer-backdrop')?.addEventListener('click', () => setDrawer(false));
    document.querySelectorAll('.sidebar-btn').forEach((s) => s.addEventListener('click', () => setDrawer(false)));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setDrawer(false); });
  }
  document.querySelectorAll('.sidebar-btn').forEach((s) => s.addEventListener('click', () => {
    if (s.dataset.view === 'view-dashboard') loadDashboard();
    if (s.dataset.view === 'view-notifications') loadNotify();
  }));

  // Runs on every sign-in (not just the first), so a different person never sees the previous dashboard.
  document.addEventListener('pai:admin-ready', loadDashboard);
  if (window.__paiAdminReady) loadDashboard();
})();

// Run initialization
checkAuthSession();
