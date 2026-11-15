/* =========================================================================
   PRAYER ARMY INTERNATIONAL - ADMIN EXTRAS
   Loaded after admin.js: dashboard overview, notification preferences, mobile menu drawer.
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
