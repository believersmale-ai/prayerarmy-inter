/* =========================================================================
   PRAYER ARMY INTERNATIONAL - DEDICATED SITE MANAGER CONTROLLER
   ========================================================================= */

// Backend: the PHP/MySQL API in /api on this same Hostinger site. Every privileged action
// (save settings, upload/delete media, team, private requests) is re-checked on the server
// against the signed-in account's role before anything happens.
const SUPABASE_URL = `${location.origin}/api`;   // kept name for compatibility: this is now your own Hostinger PHP/MySQL API
const SUPABASE_ANON_KEY = "";                      // not used any more
const EDGE_BASE = `${SUPABASE_URL}/functions/v1`;

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
      if (!r.ok) return false;
      saveTokens(await r.json());
      return true;
    } catch { return false; } finally { _refreshing = null; }
  })();
  return _refreshing;
};

// Every call to an server call gets a fresh token; one retry if the server says it expired.
const swapToken = (init, from, to) =>
  (from && init && typeof init.body === 'string') ? { ...init, body: init.body.split(from).join(to) } : init;
window.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : (input && input.url) || '';
  if (!url.includes('/functions/v1/') || !isAccountSession()) return _origFetch(input, init);
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
const passkeyInput = $('#passkey-input');
const emailInput = $('#email-input');
const accountPwInput = $('#account-pw-input');
const authError = $('#auth-error');
const togglePwBtn = $('#toggle-pw-btn');
const btnLogout = $('#btn-logout');

let me = null;               // who is signed in: { role, email, name, via, permissions }
let legacyEnabled = true;    // is the shared passkey still switched on?
const can = (perm) => !!me && me.permissions.includes(perm);
const ROLE_LABEL = { owner: 'System admin', editor: 'Editor', media: 'Media', care: 'Pastoral care' };

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
  me = null;
  adminApp.style.display = 'none';
  authScreen.style.display = 'flex';
  passkeyInput.value = ''; accountPwInput.value = '';
  authError.textContent = message || '';
}

const loadMe = async () => {
  try {
    const res = await fetch(`${EDGE_BASE}/admin-users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify({ passkey: getPasskey(), action: 'whoami' })
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { error: body.error || 'Could not check your access.' };
    me = body.me; legacyEnabled = !!body.legacy_enabled;
    return { me };
  } catch { return { error: 'Could not reach the server. Check your connection.' }; }
};

// Show only the tabs this person's role allows
const VIEW_PERM = { 'view-media': 'media', 'view-messages': 'messages', 'view-requests': 'care', 'view-connect': 'care',
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
  $('#live-broadcast-pill') && ($('#live-broadcast-pill').style.display = can('settings') ? '' : 'none');
  $('#legacy-card') && ($('#legacy-card').hidden = !can('security'));
  $('#tracking-card') && ($('#tracking-card').hidden = !can('security'));
  const backup = $('#btn-export-backup')?.closest('.card');
  if (backup) backup.hidden = !can('settings');
  const chip = $('#whoami-chip');
  if (chip) chip.textContent = `${me.name || me.email} · ${ROLE_LABEL[me.role] || me.role}`;
  renderAccountCard();
};

const showDashboard = async () => {
  const r = await loadMe();
  if (r.error) { signOutToLogin(r.error); return; }
  authScreen.style.display = 'none';
  adminApp.style.display = 'flex';
  applyRoleUI();
  loadSettings();
  if (can('media') || can('messages')) loadMedia();
  if (can('messages')) loadMessagesAdmin();
  if (can('care')) { loadPrayerRequests(); loadConnectAdmin(); loadTestimoniesAdmin(); loadWallAdmin(); }
  if (can('team')) loadTeam();
};

const checkAuthSession = () => {
  const isAuth = (sessionStorage.getItem('pai_manager_authenticated') === 'true' ||
                 localStorage.getItem('pai_manager_authenticated') === 'true') &&
                 getPasskey() !== '';
  if (isAuth) {
    showDashboard();
  } else {
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
    if (authMode === 'account') {
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
      const res = await fetch(`${EDGE_BASE}/verify-passkey`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
        body: JSON.stringify({ passkey })
      });
      if (res.ok) {
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
  if (isAccountSession()) {
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
const loadSettings = async () => {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/site_settings?select=data&id=eq.1`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
    );
    if (res.ok) {
      const rows = await res.json();
      currentSettings = rows?.[0]?.data || {};
      populateForm(currentSettings);
    }
  } catch (err) {
    showToast('Failed to load settings from server', 'error');
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
  image: $('.ev-image', row).value.trim()
})).filter(ev => ev.title);

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
      bgImage: $('#field-hero-bg').value.trim()
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
    live: {
      isLiveNow: $('#field-is-live').checked,
      title: $('#field-live-title').value.trim(),
      description: $('#field-live-desc').value.trim(),
      url: $('#field-live-url').value.trim(),
      statusNote: $('#field-live-status-note').value.trim()
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
      stackCaption: $('#field-event-caption').value.trim()
    },
    events: collectEventRows(),
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
      formData.append('files[]', f);
      count++;
    }
  }

  if (count === 0) {
    showToast('Please select valid image, video, or audio files', 'error');
    return;
  }

  await ensureFreshToken();
  formData.append('passkey', getPasskey());

  uploadProgressBox.style.display = 'block';
  uploadStatusText.textContent = `Uploading ${count} file(s)...`;
  uploadPercentText.textContent = '10%';
  uploadProgressFill.style.width = '10%';

  try {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${EDGE_BASE}/upload-media`);

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
    const listRes = await fetch(`${SUPABASE_URL}/storage/v1/object/list/media`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify({ prefix: '', limit: 500, sortBy: { column: 'created_at', order: 'desc' } })
    });
    if (listRes.ok) {
      const objects = await listRes.json();
      for (const obj of objects) {
        if (!obj.name) continue;
        const ext = obj.name.split('.').pop().toLowerCase();
        const isVideo = ['mp4', 'webm', 'mov', 'ogg', 'm4v'].includes(ext);
        const isAudio = ['mp3', 'wav', 'm4a', 'aac', 'oga', 'flac'].includes(ext);
        media.push({
          filename: obj.name,
          url: `/uploads/${encodeURIComponent(obj.name)}`,
          type: isVideo ? 'video' : isAudio ? 'audio' : 'image',
          size: obj.metadata?.size || 0,
          isUpload: true
        });
      }
    }

    // 3. Which bundled Church Assets have been hidden (can't truly delete a
    //    file that's baked into the deploy, so "hiding" is the equivalent)
    try {
      const hiddenRes = await fetch(`${EDGE_BASE}/manage-content`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
        body: JSON.stringify({ action: 'list_hidden_assets' })
      });
      if (hiddenRes.ok) {
        const { filenames } = await hiddenRes.json();
        const hiddenSet = new Set(filenames || []);
        media.forEach(m => { if (!m.isUpload && hiddenSet.has(m.filename)) m.hidden = true; });
      }
    } catch {}

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
                  ↺ Unhide
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
                  🗑
                </button>
              ` : `
                <button type="button" class="btn-media-action delete btn-hide-asset" data-filename="${escAttr(item.filename)}">
                  🚫 Remove
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
        const res = await fetch(`${EDGE_BASE}/delete-media`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
          body: JSON.stringify({ passkey: getPasskey(), filename, name: filename, path: filename })
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
      if (!confirm(`Remove "${filename}" from the Media Library?\n\nThis is a bundled site photo, not an upload, so it can't be permanently deleted -- it will just stop appearing anywhere in the library and won't be selectable for Hero/Logo/Faith/Sermon. You can bring it back later from the "Hidden" tab.`)) return;

      btn.disabled = true;
      try {
        const res = await fetch(`${EDGE_BASE}/manage-content`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
          body: JSON.stringify({ passkey: getPasskey(), action: 'hide_asset', payload: { filename } })
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
        const res = await fetch(`${EDGE_BASE}/manage-content`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
          body: JSON.stringify({ passkey: getPasskey(), action: 'unhide_asset', payload: { filename } })
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
  const data = collectFormData();
  const newPasskey = $('#field-manager-passkey')?.value.trim();
  btnSaveAll.disabled = true;
  btnSaveAll.innerHTML = '<span>⏳</span> Saving...';

  try {
    const res = await fetch(`${EDGE_BASE}/save-settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify({ passkey: getPasskey(), settings: data })
    });

    if (res.ok) {
      currentSettings = data;
      // Also cache locally as an offline fallback for the public site
      localStorage.setItem('pai_site_settings', JSON.stringify(data));

      // If a new passkey was typed, change it as a separate, explicit step
      if (newPasskey) {
        const pkRes = await fetch(`${EDGE_BASE}/change-passkey`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
          body: JSON.stringify({ currentPasskey: getPasskey(), newPasskey })
        });
        if (pkRes.ok) {
          if (!isAccountSession()) setStoredPasskey(newPasskey);
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
      showToast(body.error || 'Failed to save settings to server', 'error');
    }
  } catch (err) {
    showToast('Network error while saving settings', 'error');
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
    || /\.(mp4|webm|ogv|mov|m4v|mp3|m4a|wav|ogg|aac)(\?|#|$)/i.test(u);
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
const AUDIO_EXT = ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'oga'];
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

const loadMessagesAdmin = async () => {
  if (!messagesAdminList) return;
  try {
    const [msgRes, commentRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/messages?select=*&order=created_at.desc&limit=100`, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }
      }),
      fetch(`${SUPABASE_URL}/rest/v1/message_comments?select=*&order=created_at.desc`, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }
      })
    ]);
    const messages = msgRes.ok ? await msgRes.json() : [];
    const comments = commentRes.ok ? await commentRes.json() : [];
    const byMessage = {};
    comments.forEach((c) => { (byMessage[c.message_id] ||= []).push(c); });

    messagesAdminCount.textContent = messages.length;
    if (!messages.length) {
      messagesAdminList.innerHTML = '<p style="font-size:13px;color:#6b7280">No messages yet.</p>';
      return;
    }

    messagesAdminList.innerHTML = messages.map((m) => {
      const msgComments = byMessage[m.id] || [];
      const dateStr = new Date(m.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
      return `
        <div class="admin-item" data-id="${m.id}">
          <div class="admin-item-head">
            <h4>${m.source === 'live' ? '🔴 ' : ''}${escapeAdminHtml(m.title)}</h4>
            <time>${dateStr}</time>
          </div>
          ${m.description ? `<p>${escapeAdminHtml(m.description)}</p>` : ''}
          ${m.link ? `<p style="font-size:11.5px"><a href="${escapeAdminHtml(m.link)}" target="_blank" rel="noopener" style="color:var(--gold)">${escapeAdminHtml(m.link)}</a></p>` : ''}
          ${m.media_url ? `<p style="font-size:11.5px;color:#8890a0">📎 ${m.media_type || 'media'} attached</p>` : ''}
          <div class="admin-item-actions">
            <button type="button" class="btn-mini btn-edit-notes" data-id="${m.id}">${m.notes_url ? '📎 Change notes link' : '📎 Add notes link'}</button>
            ${m.media_url || isPlayableLink(m.link) ? '' : `<button type="button" class="btn-mini btn-fix-link" data-id="${m.id}">⚠ Add recording link</button>`}
            <button type="button" class="btn-mini danger btn-delete-message" data-id="${m.id}">Delete message</button>
          </div>
          ${msgComments.length ? `
            <div class="comment-mini">
              ${msgComments.map((c) => `
                <div class="comment-mini-row" data-comment-id="${c.id}">
                  <span><strong>${escapeAdminHtml(c.name)}:</strong> ${escapeAdminHtml(c.comment)}</span>
                  <button type="button" class="btn-mini danger btn-delete-comment" data-id="${c.id}" style="padding:2px 8px">✕</button>
                </div>`).join('')}
            </div>` : ''}
        </div>`;
    }).join('');

    $$('.btn-edit-notes', messagesAdminList).forEach((btn) => {
      btn.addEventListener('click', async () => {
        const m = messages.find((x) => String(x.id) === btn.dataset.id);
        if (!m) return;
        const val = window.prompt('Paste the sermon notes link (leave empty to remove it):', m.notes_url || '');
        if (val === null) return;
        const url = val.trim();
        if (url && !/^https?:\/\//i.test(url)) { showToast('Please paste a full link starting with https://', 'error'); return; }
        try { await callManageContent('update_message', { id: m.id, notes_url: url }); showToast('Notes link saved', 'success'); loadMessagesAdmin(); }
        catch (err) { showToast(err.message || 'Could not save the link', 'error'); }
      });
    });

    $$('.btn-fix-link', messagesAdminList).forEach((btn) => {
      btn.addEventListener('click', async () => {
        const m = messages.find((x) => String(x.id) === btn.dataset.id);
        if (!m) return;
        const link = askRecordingLink(m.link || '');
        if (!link) return;
        if (!isPlayableLink(link)) { showToast('That link cannot play on the site. Use a YouTube, Facebook or Vimeo video link, or an MP4/MP3 file.', 'error'); return; }
        btn.disabled = true;
        try {
          await callManageContent('update_message', { id: m.id, link });
          showToast('Recording link saved — it now plays on the website', 'success');
          loadMessagesAdmin();
        } catch (err) {
          showToast(err.message || 'Could not update this message', 'error');
          btn.disabled = false;
        }
      });
    });

    $$('.btn-delete-message', messagesAdminList).forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this message? This also removes its comments. This cannot be undone.')) return;
        try {
          await callManageContent('delete_message', { id: btn.dataset.id });
          showToast('Message deleted', 'success');
          loadMessagesAdmin();
        } catch (err) {
          showToast(err.message || 'Failed to delete message', 'error');
        }
      });
    });

    $$('.btn-delete-comment', messagesAdminList).forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this comment?')) return;
        try {
          await callManageContent('delete_comment', { id: btn.dataset.id });
          showToast('Comment deleted', 'success');
          loadMessagesAdmin();
        } catch (err) {
          showToast(err.message || 'Failed to delete comment', 'error');
        }
      });
    });
  } catch (err) {
    messagesAdminList.innerHTML = '<p style="font-size:13px;color:#f87171">Could not load messages.</p>';
  }
};

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
  const note = $('#msg-create-note');
  const btn = $('#btn-create-message');

  if (!title) { note.textContent = 'Title is required.'; note.className = 'form-note err'; return; }

  btn.disabled = true;
  try {
    await callManageContent('create_message', { title, description, link, media_url, media_type, notes_url, source: 'manual' });
    note.textContent = 'Message added.';
    note.className = 'form-note ok';
    $('#msg-title').value = '';
    $('#msg-desc').value = '';
    $('#msg-link').value = '';
    if ($('#msg-notes')) $('#msg-notes').value = '';
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

const loadPrayerRequests = async () => {
  if (!requestsAdminList) return;
  try {
    const { requests } = await callManageContent('list_prayer_requests');
    const unread = requests.filter((r) => !r.is_read).length;
    if (requestsBadge) {
      requestsBadge.style.display = unread ? 'inline-block' : 'none';
      requestsBadge.textContent = unread;
    }
    if (!requests.length) {
      requestsAdminList.innerHTML = '<p style="font-size:13px;color:#6b7280">No prayer requests submitted yet.</p>';
      return;
    }
    requestsAdminList.innerHTML = requests.map((r) => {
      const dateStr = new Date(r.created_at).toLocaleString();
      return `
        <div class="admin-item${r.is_read ? '' : ' unread'}" data-id="${r.id}">
          <div class="admin-item-head">
            <h4>${escapeAdminHtml(r.name)}${r.is_private ? ' <span class="req-badge">Confidential</span>' : ''}</h4>
            <time>${dateStr}</time>
          </div>
          <p>${escapeAdminHtml(r.request)}</p>
          ${r.contact ? `<p style="font-size:11.5px;color:#8890a0">Contact: ${escapeAdminHtml(r.contact)}</p>` : ''}
          <div class="admin-item-actions">
            <button type="button" class="btn-mini btn-toggle-read" data-id="${r.id}" data-read="${r.is_read}">${r.is_read ? 'Mark unread' : 'Mark read'}</button>
            <button type="button" class="btn-mini danger btn-delete-request" data-id="${r.id}">Delete</button>
          </div>
        </div>`;
    }).join('');

    $$('.btn-toggle-read', requestsAdminList).forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await callManageContent('mark_prayer_request_read', { id: btn.dataset.id, is_read: btn.dataset.read !== 'true' });
          loadPrayerRequests();
        } catch (err) {
          showToast(err.message || 'Could not update request', 'error');
        }
      });
    });
    $$('.btn-delete-request', requestsAdminList).forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this prayer request permanently?')) return;
        try {
          await callManageContent('delete_prayer_request', { id: btn.dataset.id });
          showToast('Request deleted', 'success');
          loadPrayerRequests();
        } catch (err) {
          showToast(err.message || 'Could not delete request', 'error');
        }
      });
    });
  } catch (err) {
    requestsAdminList.innerHTML = '<p style="font-size:13px;color:#f87171">Could not load prayer requests. Please refresh and try again.</p>';
  }
};


/* =========================================================================
   NEW VISITORS / VOLUNTEERS + TESTIMONIES (admin)
   ========================================================================= */
const KIND_LABEL = { visitor: 'New visitor', volunteer: 'Volunteer', counseling: 'Counseling', other: 'Other' };
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

const loadTestimoniesAdmin = async () => {
  const box = $('#testimonies-admin-list');
  if (!box) return;
  try {
    const { testimonies } = await callManageContent('list_testimonies');
    setBadge($('#sidebar-testimonies-badge'), testimonies.filter((t) => !t.is_approved).length);
    if (!testimonies.length) { box.innerHTML = '<p style="font-size:13px;color:#6b7280">No testimonies submitted yet.</p>'; return; }
    box.innerHTML = testimonies.map((t) => `
      <div class="admin-item${t.is_approved ? '' : ' unread'}" data-id="${t.id}">
        <div class="admin-item-head">
          <h4>${escapeAdminHtml(t.name)}${t.location ? ` <span style="font-weight:500;color:#8890a0;font-size:12px">· ${escapeAdminHtml(t.location)}</span>` : ''}
            <span class="req-badge" style="${t.is_approved ? 'background:#1f4d2e;color:#a7f3c0' : ''}">${t.is_approved ? 'Published' : 'Awaiting approval'}</span></h4>
          <time>${new Date(t.created_at).toLocaleString()}</time>
        </div>
        <p>${escapeAdminHtml(t.testimony)}</p>
        <div class="admin-item-actions">
          <button type="button" class="btn-mini btn-approve" data-id="${t.id}" data-ok="${t.is_approved}">${t.is_approved ? 'Unpublish' : 'Approve & publish'}</button>
          <button type="button" class="btn-mini danger btn-del-testimony" data-id="${t.id}">Delete</button>
        </div>
      </div>`).join('');
    $$('.btn-approve', box).forEach((b) => b.addEventListener('click', async () => {
      try { await callManageContent('set_testimony_approved', { id: b.dataset.id, is_approved: b.dataset.ok !== 'true' }); loadTestimoniesAdmin(); }
      catch (err) { showToast(err.message || 'Could not update', 'error'); }
    }));
    $$('.btn-del-testimony', box).forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('Delete this testimony permanently?')) return;
      try { await callManageContent('delete_testimony', { id: b.dataset.id }); loadTestimoniesAdmin(); }
      catch (err) { showToast(err.message || 'Could not delete', 'error'); }
    }));
  } catch {
    box.innerHTML = '<p style="font-size:13px;color:#f87171">Could not load testimonies. Please refresh and try again.</p>';
  }
};


/* =========================================================================
   PRAYER WALL MODERATION + ANALYTICS (admin)
   ========================================================================= */
const loadWallAdmin = async () => {
  const box = $('#wall-admin-list');
  if (!box) return;
  try {
    const { prayers } = await callManageContent('list_wall_prayers');
    setBadge($('#sidebar-wall-badge'), prayers.filter((p) => !p.is_approved).length);
    if (!prayers.length) { box.innerHTML = '<p style="font-size:13px;color:#6b7280">Nothing has been added to the wall yet.</p>'; return; }
    box.innerHTML = prayers.map((p) => `
      <div class="admin-item${p.is_approved ? '' : ' unread'}" data-id="${p.id}">
        <div class="admin-item-head">
          <h4>${escapeAdminHtml(p.name || 'Anonymous')}
            <span class="req-badge" style="${p.is_approved ? 'background:#1f4d2e;color:#a7f3c0' : ''}">${p.is_approved ? `Published · 🙏 ${p.prayed_count}` : 'Awaiting approval'}</span></h4>
          <time>${new Date(p.created_at).toLocaleString()}</time>
        </div>
        <p>${escapeAdminHtml(p.request)}</p>
        <div class="admin-item-actions">
          <button type="button" class="btn-mini btn-wall-approve" data-id="${p.id}" data-ok="${p.is_approved}">${p.is_approved ? 'Unpublish' : 'Approve & publish'}</button>
          <button type="button" class="btn-mini danger btn-wall-del" data-id="${p.id}">Delete</button>
        </div>
      </div>`).join('');
    $$('.btn-wall-approve', box).forEach((b) => b.addEventListener('click', async () => {
      try { await callManageContent('set_wall_approved', { id: b.dataset.id, is_approved: b.dataset.ok !== 'true' }); loadWallAdmin(); }
      catch (err) { showToast(err.message || 'Could not update', 'error'); }
    }));
    $$('.btn-wall-del', box).forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('Delete this request permanently?')) return;
      try { await callManageContent('delete_wall_prayer', { id: b.dataset.id }); loadWallAdmin(); }
      catch (err) { showToast(err.message || 'Could not delete', 'error'); }
    }));
  } catch {
    box.innerHTML = '<p style="font-size:13px;color:#f87171">Could not load the prayer wall. Please refresh and try again.</p>';
  }
};

const loadAnalytics = async () => {
  const box = $('#analytics-body');
  if (!box) return;
  box.innerHTML = '<p style="font-size:13px;color:#6b7280">Loading…</p>';
  try {
    const { analytics: a } = await callManageContent('get_analytics');
    const days = a.days || [];
    const sum = (k, from = 0) => days.slice(from).reduce((t, d) => t + (d[k] || 0), 0);
    const maxViews = Math.max(1, ...days.map((d) => d.views));
    const rank = (rows, empty) => rows.length
      ? `<ul class="rank-list">${rows.map(([n, c]) => `<li><span>${escapeAdminHtml(n)}</span><b>${c}</b></li>`).join('')}</ul>`
      : `<p style="font-size:13px;color:#6b7280">${empty}</p>`;
    const dev = a.devices || {};
    const devRows = Object.entries(dev).sort((x, y) => y[1] - x[1]).map(([k, v]) => [k.charAt(0).toUpperCase() + k.slice(1), v]);
    box.innerHTML = `
      <div class="stat-grid">
        <div class="stat-box"><b>${days.length ? days[days.length - 1].views : 0}</b><span>Visits today</span></div>
        <div class="stat-box"><b>${sum('views', Math.max(0, days.length - 7))}</b><span>Last 7 days</span></div>
        <div class="stat-box"><b>${sum('views')}</b><span>Last 30 days</span></div>
        <div class="stat-box"><b>${sum('plays')}</b><span>Sermon plays</span></div>
        <div class="stat-box"><b>${a.shares || 0}</b><span>Shares</span></div>
      </div>
      <div class="card">
        <h3 class="card-title">Visits per day</h3>
        <div class="bars">${days.map((d) => `<div class="bar" style="height:${Math.round((d.views / maxViews) * 100)}%" title="${d.day}: ${d.views} visits, ${d.plays} plays"></div>`).join('')}</div>
        <div class="bar-axis"><span>${days[0]?.day || ''}</span><span>${days[days.length - 1]?.day || ''}</span></div>
      </div>
      <div class="form-grid-2" style="align-items:start">
        <div class="card"><h3 class="card-title">Most played sermons</h3>${rank(a.topSermons || [], 'No sermon plays yet.')}</div>
        <div class="card"><h3 class="card-title">Where visitors come from</h3>${rank(a.referrers || [], 'No visits yet.')}</div>
      </div>
      <div class="card"><h3 class="card-title">Devices</h3>${rank(devRows, 'No visits yet.')}</div>`;
  } catch {
    box.innerHTML = '<p style="font-size:13px;color:#f87171">Could not load statistics. Please refresh and try again.</p>';
  }
};
$('#btn-refresh-analytics')?.addEventListener('click', loadAnalytics);


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
  care: 'Private prayer requests, new visitors and volunteers, testimonies and the prayer wall only.'
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
            ${Object.keys(ROLE_LABEL).map((r) => `<option value="${r}"${u.role === r ? ' selected' : ''}>${ROLE_LABEL[r]}</option>`).join('')}
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

// Run initialization
checkAuthSession();
