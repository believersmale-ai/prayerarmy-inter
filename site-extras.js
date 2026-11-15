/* =========================================================================
   PRAYER ARMY INTERNATIONAL - SITE EXTRAS
   Loaded after script.js. Uses its helpers ($, $$, escapeHtml, safeUrl, SUPABASE_URL)
   and re-runs whenever the site settings are (re)applied ("pai:settings" event).
   Everything here is driven by admin-editable settings or real database records.
   ========================================================================= */
(() => {
  'use strict';

  const todayStr = () => new Date().toISOString().slice(0, 10);
  const fmtDate = (v, opts = { year: 'numeric', month: 'long', day: 'numeric' }) => {
    const d = new Date(v);
    return isNaN(d) ? '' : d.toLocaleDateString(undefined, opts);
  };

  /* ---------------------------------------------------------------------
     1. ANNOUNCEMENTS  (settings.announcements, managed in the admin)
     --------------------------------------------------------------------- */
  const ANNOUNCE_LABEL = { programme: 'Church programme', service: 'Special service', notice: 'Important notice', update: 'Ministry update' };
  const renderAnnouncements = (s) => {
    const sec = $('#announcements'), grid = $('#announce-grid');
    if (!sec || !grid) return;
    const today = todayStr();
    const list = (Array.isArray(s.announcements) ? s.announcements : [])
      .filter((a) => a && a.title && a.published
        && (!a.date || a.date <= today)            // scheduled posts stay hidden until their date
        && (!a.expires || a.expires >= today))     // expired posts disappear automatically
      .sort((a, b) => (Number(!!b.pinned) - Number(!!a.pinned)) || String(b.date || '').localeCompare(String(a.date || '')))
      .slice(0, 6);
    sec.hidden = list.length === 0;
    grid.innerHTML = list.map((a) => {
      const href = safeUrl(a.link);
      const cat = ANNOUNCE_LABEL[a.category] ? a.category : 'update';
      return `
      <article class="announce-card-item cat-${cat}${a.pinned ? ' is-pinned' : ''}">
        <div class="announce-meta"><span class="announce-cat">${ANNOUNCE_LABEL[cat]}</span>${a.date ? `<time datetime="${escapeHtml(a.date)}">${escapeHtml(fmtDate(a.date + 'T12:00:00'))}</time>` : ''}</div>
        <h3>${escapeHtml(a.title)}</h3>
        ${a.body ? `<p>${escapeHtml(a.body)}</p>` : ''}
        ${href ? `<a class="text-link" href="${escapeHtml(href)}"${/^https?:/i.test(href) ? ' target="_blank" rel="noopener"' : ''}>${escapeHtml(a.linkText || 'Learn more')} <span aria-hidden="true">→</span></a>` : ''}
      </article>`;
    }).join('');
  };

  /* ---------------------------------------------------------------------
     2. PAST EVENT HIGHLIGHTS  (events that have finished)
     --------------------------------------------------------------------- */
  const renderPastEvents = (s) => {
    const box = $('#past-events'), grid = $('#past-grid');
    if (!box || !grid) return;
    const now = new Date();
    const all = [...(s.event?.title ? [s.event] : []), ...(Array.isArray(s.events) ? s.events : [])]
      .filter((e) => e && e.title && e.published !== false);
    const past = all.filter((e) => { const end = new Date(e.end || e.start || ''); return !isNaN(end) && end < now; })
      .sort((a, b) => new Date(b.end || b.start) - new Date(a.end || a.start)).slice(0, 6);
    box.hidden = past.length === 0;
    grid.innerHTML = past.map((e) => `
      <article class="past-card">
        ${e.image ? `<img loading="lazy" decoding="async" width="400" height="300" src="${escapeHtml(e.image)}" alt="${escapeHtml(e.title)}">` : ''}
        <div><h4>${escapeHtml(e.title)}</h4>
        <p class="past-when">${escapeHtml(e.dates || fmtDate(e.start))}${e.venue ? ' · ' + escapeHtml(e.venue) : ''}</p>
        ${e.description ? `<p>${escapeHtml(e.description)}</p>` : ''}</div>
      </article>`).join('');
  };

  /* ---------------------------------------------------------------------
     3. LIVE: scheduled next broadcast + official platforms
        A countdown is only a countdown. The page is marked "live" ONLY when the
        administrator switches the broadcast on, never because a time has passed.
     --------------------------------------------------------------------- */
  let nextTimer = null;
  const PLATFORMS = [['youtube', 'YouTube'], ['facebook', 'Facebook'], ['tiktok', 'TikTok'], ['instagram', 'Instagram'], ['x', 'X'], ['telegram', 'Telegram'], ['whatsapp', 'WhatsApp']];
  const renderLiveExtras = (s) => {
    const box = $('#live-next');
    clearInterval(nextTimer);
    if (box) {
      const start = new Date(s.live?.nextStart || '');
      const show = !s.live?.isLiveNow && !isNaN(start) && start > new Date();
      box.hidden = !show;
      if (show) {
        $('#live-next-title').textContent = s.live.nextTitle || 'Our next service';
        $('#live-next-when').textContent = start.toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' }) + ' (your local time)';
        const count = $('#live-next-count');
        const tick = () => {
          const d = start - new Date();
          if (d <= 0) {
            // Time reached: never claim "live" here. Tell people to look at the status.
            clearInterval(nextTimer);
            count.innerHTML = '<p class="live-next-pending">Scheduled start time reached. The broadcast will show here as soon as it begins.</p>';
            return;
          }
          const v = [Math.floor(d / 864e5), Math.floor(d / 36e5) % 24, Math.floor(d / 6e4) % 60, Math.floor(d / 1e3) % 60];
          count.innerHTML = ['Days', 'Hrs', 'Min', 'Sec'].map((l, i) => `<div><b>${String(v[i]).padStart(2, '0')}</b><small>${l}</small></div>`).join('');
          count.setAttribute('aria-label', `${v[0]} days, ${v[1]} hours and ${v[2]} minutes until the next broadcast`);
        };
        tick();
        nextTimer = setInterval(tick, 1000);
      }
    }
    const pf = $('#live-platforms'), links = $('#live-platforms-links');
    if (pf && links) {
      const items = PLATFORMS.map(([k, label]) => [safeUrl(s.social?.[k]), label]).filter(([u]) => u).slice(0, 5);
      pf.hidden = items.length === 0;
      links.innerHTML = items.map(([u, label]) => `<a href="${escapeHtml(u)}" target="_blank" rel="noopener">${label}</a>`).join('');
    }
  };

  /* ---------------------------------------------------------------------
     4. SEO: make canonical / sharing addresses match the real domain at runtime,
        and apply the optional title / description set in the admin.
     --------------------------------------------------------------------- */
  const applySeo = (s) => {
    const real = /^https?:/.test(location.origin) && !/localhost|127\.0\.0\.1/.test(location.hostname);
    const origin = real ? location.origin : '';
    const setMeta = (sel, attr, val) => { const el = $(sel); if (el && val) el.setAttribute(attr, val); };
    if (origin) {
      const abs = (u) => (/^https?:/i.test(u) ? u : `${origin}/${String(u).replace(/^\//, '')}`);
      setMeta('#canonical-link', 'href', `${origin}/`);
      setMeta('meta[property="og:url"]', 'content', `${origin}/`);
      const img = s.seo?.ogImage || s.hero?.bgImage;
      if (img) { setMeta('meta[property="og:image"]', 'content', abs(img)); setMeta('meta[name="twitter:image"]', 'content', abs(img)); }
    }
    if (s.seo?.title) { document.title = s.seo.title; setMeta('meta[property="og:title"]', 'content', s.seo.title); setMeta('meta[name="twitter:title"]', 'content', s.seo.title); }
    if (s.seo?.description) {
      setMeta('meta[name="description"]', 'content', s.seo.description);
      setMeta('meta[property="og:description"]', 'content', s.seo.description);
      setMeta('meta[name="twitter:description"]', 'content', s.seo.description);
    }
    // Footer legal / contact details always come from the settings
    const legalPhone = s.contact?.phone || s.about?.phone;
    const cl = $('#contact-lines');
    if (cl && legalPhone) cl.textContent = legalPhone;
  };

  document.addEventListener('pai:settings', (e) => {
    const s = e.detail || {};
    renderAnnouncements(s);
    renderPastEvents(s);
    renderLiveExtras(s);
    applySeo(s);
  });
  // If settings were applied before this file ran, apply now.
  if (typeof currentSettings === 'object' && currentSettings?.general) {
    renderAnnouncements(currentSettings); renderPastEvents(currentSettings); renderLiveExtras(currentSettings); applySeo(currentSettings);
  }

  /* ---------------------------------------------------------------------
     5. GLOBAL SEARCH  (sermons, events, announcements, ministry information)
        Results come from /api/search, which only ever returns public data.
     --------------------------------------------------------------------- */
  const dlg = $('#site-search'), input = $('#site-search-input'), out = $('#site-search-results');
  const TYPE_LABEL = { sermon: 'Sermons', event: 'Events', announcement: 'Announcements', ministry: 'About the ministry' };
  let searchTimer = null, searchSeq = 0;

  const showHint = (msg) => { out.innerHTML = `<p class="ss-hint">${escapeHtml(msg)}</p>`; };
  const runSearch = async (q) => {
    const seq = ++searchSeq;
    showHint('Searching…');
    try {
      const r = await fetch(`${SUPABASE_URL}/search?q=${encodeURIComponent(q)}`, { cache: 'no-store' });
      if (r.status === 429) throw new Error('Too many searches in a short time. Please wait a moment.');
      if (!r.ok) throw new Error('Search is not available right now.');
      const { results = [] } = await r.json();
      if (seq !== searchSeq) return;                      // a newer search replaced this one
      if (!results.length) { showHint(`No results for “${q}”. Try a different word.`); return; }
      const groups = {};
      results.forEach((x) => { (groups[x.type] ||= []).push(x); });
      out.innerHTML = Object.keys(TYPE_LABEL).filter((t) => groups[t]).map((t) => `
        <section><h3>${TYPE_LABEL[t]}</h3><ul>${groups[t].map((x) => `
          <li><a href="${escapeHtml(x.url)}" data-ss-link><strong>${escapeHtml(x.title)}</strong>${x.meta ? `<em>${escapeHtml(x.meta)}</em>` : ''}${x.text ? `<span>${escapeHtml(x.text)}</span>` : ''}</a></li>`).join('')}</ul></section>`).join('');
    } catch (err) {
      if (seq === searchSeq) showHint(!navigator.onLine ? 'You appear to be offline.' : (err.message || 'Search is not available right now.'));
    }
  };

  if (dlg && input && out) {
    $('#open-search')?.addEventListener('click', () => {
      if (typeof dlg.showModal === 'function') dlg.showModal();
      input.focus(); input.select();
    });
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });   // click on the dim backdrop
    input.addEventListener('input', () => {
      clearTimeout(searchTimer);
      const q = input.value.trim();
      if (q.length < 2) { searchSeq++; showHint('Type at least two letters to search.'); return; }
      searchTimer = setTimeout(() => runSearch(q), 250);
    });
    out.addEventListener('click', (e) => {
      const a = e.target.closest('[data-ss-link]');
      if (!a) return;
      dlg.close();
      // Same-page anchors scroll; deep links like /?m=<id> load normally
      const u = new URL(a.href, location.href);
      if (u.pathname === location.pathname && !u.search && u.hash) { e.preventDefault(); location.hash = u.hash; }
    });
    dlg.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); dlg.close(); return; }   // search fields swallow Esc by default
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const links = [...out.querySelectorAll('a')];
      if (!links.length) return;
      e.preventDefault();
      const i = links.indexOf(document.activeElement);
      links[(i + (e.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length].focus();
    });
  }
})();
