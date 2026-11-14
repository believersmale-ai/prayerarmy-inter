/* ========= PRAYER ARMY INTERNATIONAL - COMPLETE SITE CONTROLLER ========= */

// Backend: the PHP/MySQL API in /api on this same site (public forms and public content only;
// everything private is checked on the server).
const SUPABASE_URL = `${location.origin}/api`;   // kept name for compatibility: this is now your own Hostinger PHP/MySQL API
const SUPABASE_ANON_KEY = "";                      // not used any more

const DEFAULT_SETTINGS = {
  general: {
    churchName: "Prayer Army International",
    slogan: "Raising Generals, Transforming Generations",
    region: "Upper West Region of Ghana",
    founder: "Prophet Suglo Prosper",
    logoUrl: ""
  },
  hero: {
    eyebrow: "PRAYER ARMY INTERNATIONAL",
    titleMain: "Raising Generals,",
    titleAccent: "Transforming Generations.",
    copy: "A prophetic ministry headquartered in the Upper West Region of Ghana, founded by Prophet Suglo Prosper.",
    tagline: "Faith • Prayer • Prophetic Ministry",
    btnPrimaryText: "Watch Sermons",
    btnPrimaryLink: "#sermons",
    btnSecondaryText: "Watch Live",
    btnSecondaryLink: "#live",
    bgImage: "assets/images/FB_IMG_1790281482379.jpg"
  },
  about: {
    eyebrow: "WELCOME TO PAI",
    heading: "A people of **prayer, faith and purpose.**",
    p1: "Prayer Army International is a prophetic church headquartered in the Upper West Region of Ghana and founded by Prophet Suglo Prosper.",
    p2: "The ministry's public identity is centered on prayer, prophetic ministry, worship, teaching and the transformation of lives through the message of Jesus Christ.",
    founderName: "PROPHET SUGLO PROSPER",
    founderRole: "Founder",
    stat1Title: "PAI",
    stat1Desc: "Prayer Army International",
    stat2Title: "Ghana",
    stat2Desc: "Headquartered in the Upper West Region",
    stat3Title: "Prophetic",
    stat3Desc: "Ministry expression"
  },
  foundation: {
    missionTitle: "To raise people of prayer, faith and spiritual purpose.",
    missionText: "Prayer Army International exists to proclaim Jesus Christ, cultivate a life of prayer, teach God's Word, develop believers for purposeful Christian living, and equip people to serve their generation with faith, courage and love.",
    visionTitle: "To raise generals who transform generations.",
    visionText: "We envision a growing community of Spirit-filled believers who know God, walk in truth, pray with confidence, live with integrity and become a positive spiritual influence in their families, communities and nations.",
    valuesTitle: "Prayer. Word. Faith. Love. Service.",
    valuesText: "We value a life of prayer, biblical truth, faith in God, Christlike love, integrity, excellence, discipleship, evangelism and practical service to people.",
    storyTitle: "A prophetic ministry with a heart for people.",
    storyText: "Prayer Army International is a prophetic church headquartered in the Upper West Region of Ghana and founded by Prophet Suglo Prosper. The ministry's public expression brings together prayer, prophetic ministry, worship, teaching and the call to transformed Christian living.",
    founderBio: "Founder of Prayer Army International and a minister whose public ministry is expressed through preaching, prayer, prophetic ministry and the raising of believers for purposeful Christian service.",
    faithImage: "assets/images/statement-of-faith.jpg"
  },
  live: {
    isLiveNow: false,
    title: "Prophetic & Prayer Service Live",
    description: "Join Prayer Army International online from anywhere in the world. When we go live, tap below to worship and pray with us in real time.",
    url: "https://www.youtube.com/@prophetsugloprosper/live",
    statusNote: "Regular Sunday and Prophetic Services streamed live"
  },
  sermons: {
    heading: "Messages that build faith.",
    libraryUrl: "https://www.youtube.com/@prophetsugloprosper/videos",
    featuredKicker: "PROPHETIC MESSAGE",
    featuredTitle: "Experience the ministry of the Word",
    featuredDesc: "Prophetic preaching, prayer and teaching from Prophet Suglo Prosper — messages to strengthen your faith and stir your spirit.",
    featuredUrl: "https://www.youtube.com/@prophetsugloprosper/videos",
    mini1Kicker: "PRAYER",
    mini1Title: "Moments of prayer and ministry",
    mini1Url: "https://www.youtube.com/@prophetsugloprosper/videos",
    mini2Kicker: "MINISTRY",
    mini2Title: "Prayer and prophetic ministry",
    mini2Url: "https://www.youtube.com/@prophetsugloprosper/videos"
  },
  event: {
    title: "Manifests Conference 2026",
    dates: "23–27 November 2026",
    description: "Five days of prayer, worship and prophetic ministry. Follow our channels for venue, program and updates.",
    start: "2026-11-23T00:00:00Z",
    end: "2026-11-28T00:00:00Z",
    link: "",
    stackCaption: "Every gathering is an opportunity to seek God together."
  },
  prayer: {
    eyebrow: "WE WOULD LOVE TO PRAY WITH YOU",
    heading: "Bring your request. Leave it in prayer.",
    copy: "Whether you are seeking direction, strength, healing, provision or simply want someone to stand with you in prayer, submit your request to the ministry.",
    recipientEmail: "prayerarmyinternational@gmail.com",
    endpoint: ""
  },
  giving: {
    heading: "Support the work.",
    info: "Your giving and partnership help carry the message of Jesus Christ, sustain prayer ministry and reach more people across the Upper West Region and beyond. Every seed is received with gratitude.",
    momo: "",
    link: "",
    note: "",
    methods: []
  },
  contact: {
    address: "Headquarters: Upper West Region, Ghana",
    phone: "",
    whatsapp: "",
    email: "prayerarmyinternational@gmail.com"
  },
  social: {
    youtube: "https://www.youtube.com/@prophetsugloprosper",
    facebook: "https://www.facebook.com/prayerarmyinternational",
    instagram: "https://www.instagram.com/prayerarmyinternational",
    tiktok: "https://www.tiktok.com/@prayerarmyinternational",
    x: "https://x.com/prayerarmyint",
    whatsapp: "https://wa.me/233241234567",
    telegram: ""
  },
  tracking: { metaPixelId: "" },
  verses: [
    { text: "The LORD is my shepherd; I shall not want.", ref: "Psalm 23:1" },
    { text: "I can do all things through Christ which strengtheneth me.", ref: "Philippians 4:13" },
    { text: "Trust in the LORD with all thine heart; and lean not unto thine own understanding.", ref: "Proverbs 3:5" },
    { text: "Be strong and of a good courage; be not afraid, neither be thou dismayed: for the LORD thy God is with thee whithersoever thou goest.", ref: "Joshua 1:9" },
    { text: "Pray without ceasing.", ref: "1 Thessalonians 5:17" },
    { text: "Call unto me, and I will answer thee, and shew thee great and mighty things, which thou knowest not.", ref: "Jeremiah 33:3" },
    { text: "For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.", ref: "John 3:16" }
  ],
  branches: [],
  announcement: {
    enabled: false,
    text: "Join our upcoming prophetic services and prayer gatherings. Raising Generals, Transforming Generations!"
  }
};

let currentSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
let isManagerAuth = false;
let sermonUrls = {};
let triggerLivePlay = () => {}; // wired up inside applySettings once the live video frame exists

// Extract an 11-character YouTube video ID from a watch/live/youtu.be/embed/shorts link
const extractYouTubeId = (url) => {
  if (!url) return null;
  const m = String(url).match(/(?:youtube\.com\/(?:watch\?v=|live\/|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
};

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
// Message to show when a public form is refused (too many submissions vs. a general failure)
const failMessage = async (res, fallback) => {
  const t = await res.text().catch(() => '');
  return /rate_limited/.test(t) ? 'You have sent several messages in a short time. Please wait a little and try again.' : fallback;
};
const escapeHtml = (str) => String(str ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));
document.documentElement.classList.add('js');

// Toast notification
const showToast = (msg, isSuccess = true) => {
  const container = $('#toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast-notice ${isSuccess ? 'success' : ''}`;
  toast.innerHTML = `<span>${isSuccess ? '✓' : 'ℹ'}</span> <div>${msg}</div>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all .3s';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
};

// Header & mobile nav
const header = $('.site-header'), nav = $('.nav'), toggle = $('.menu-toggle'), navBackdrop = $('#nav-backdrop');
const setMenu = o => {
  nav?.classList.toggle('open', o);
  navBackdrop?.classList.toggle('open', o);
  toggle?.setAttribute('aria-expanded', o);
  document.body.classList.toggle('nav-open', o);
  if (toggle) {
    toggle.classList.toggle('is-open', o);
    toggle.setAttribute('aria-label', o ? 'Close menu' : 'Open menu');
  }
};
toggle?.addEventListener('click', () => setMenu(!nav.classList.contains('open')));
navBackdrop?.addEventListener('click', () => setMenu(false));
$$('.nav a').forEach(a => a.addEventListener('click', () => setMenu(false)));
addEventListener('keydown', e => { if (e.key === 'Escape') setMenu(false); });
const onScroll = () => header?.classList.toggle('scrolled', scrollY > 30);
onScroll();
addEventListener('scroll', onScroll, { passive: true });

// Keep the fixed header correctly offset (used by CSS scroll-margin-top too)
const syncHeaderOffset = () => {
  const headerH = header ? header.offsetHeight : 78;
  document.documentElement.style.setProperty('--header-h', headerH + 'px');
};
addEventListener('resize', syncHeaderOffset);
addEventListener('load', syncHeaderOffset);
syncHeaderOffset();

// Announcement popup
const announceModal = $('#announce-modal'), announceBackdrop = $('#announce-backdrop'), announceClose = $('#announce-modal-close');
const closeAnnounce = () => {
  if (!announceModal) return;
  announceModal.classList.remove('show');
  setTimeout(() => { announceModal.hidden = true; }, 320);
};
announceBackdrop?.addEventListener('click', closeAnnounce);
announceClose?.addEventListener('click', closeAnnounce);
addEventListener('keydown', e => { if (e.key === 'Escape' && announceModal && !announceModal.hidden) closeAnnounce(); });

const heroMedia = $('#hero-media');

// Scroll-spy
const navLinks = $$('.nav a[href^="#"]');
const spy = new IntersectionObserver(es => es.forEach(e => {
  if (e.isIntersecting) navLinks.forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + e.target.id));
}), { rootMargin: '-45% 0px -50% 0px' });
navLinks.forEach(a => { const s = $(a.getAttribute('href')); s && spy.observe(s); });

// Reveal on scroll
const rv = new IntersectionObserver(es => es.forEach(e => {
  if (e.isIntersecting) { e.target.classList.add('in'); rv.unobserve(e.target); }
}), { threshold: .12 });
$$('.reveal').forEach(el => rv.observe(el));

// Countdown timers (one per event slide)
let countdownTimer = null;
const tickCountdown = (cd) => {
  if (!cd) return;
  const s = new Date(cd.dataset.start), e = new Date(cd.dataset.end);
  if (isNaN(s)) { cd.hidden = true; return; }
  const n = new Date(), d = s - n;
  if (!isNaN(e) && n >= e) { cd.hidden = true; return; }
  cd.hidden = false;
  if (d <= 0) { cd.innerHTML = '<strong class="live-now">Happening now</strong>'; return; }
  const v = [Math.floor(d / 864e5), Math.floor(d / 36e5) % 24, Math.floor(d / 6e4) % 60];
  cd.innerHTML = ['Days', 'Hrs', 'Min'].map((l, i) => `<div><b>${String(v[i]).padStart(2, '0')}</b><small>${l}</small></div>`).join('');
  cd.setAttribute('aria-label', `${v[0]} days, ${v[1]} hours until this event`);
};
const updateCountdown = () => $$('.countdown[data-start]').forEach(tickCountdown);

// Only ever turn admin-entered links into http(s) / in-page links
// Links typed into the admin panel: allow http(s), mailto, tel, #anchors and relative paths only.
const safeHref = (u) => {
  const v = String(u || '').trim();
  if (!v) return '';
  const scheme = v.match(/^([a-z][a-z0-9+.-]*):/i);
  if (scheme && !['http', 'https', 'mailto', 'tel'].includes(scheme[1].toLowerCase())) return '';
  return v;
};
// A value that is safe to place inside CSS url("...")
const cssUrl = (u) => `url("${String(u || '').replace(/["\\\n\r)(]/g, (c) => encodeURIComponent(c))}")`;
const safeUrl = (u) => {
  const v = String(u || '').trim();
  return /^(https?:\/\/|#|\/)/i.test(v) ? v : '';
};

/* =========================================================================
   SHARE + ADD-TO-CALENDAR HELPERS
   ========================================================================= */
const SITE_ORIGIN = location.origin && location.origin.startsWith('http') ? location.origin : 'https://YOUR-DOMAIN.com';

/* =========================================================================
   META PIXEL (optional, only after the visitor agrees)
   The Pixel ID is set by a system admin in the admin panel. Nothing loads until the
   visitor presses Accept, and visitors who send "Do Not Track" / Global Privacy Control
   are never asked and never tracked. Only event names are sent, never names or messages.
   ========================================================================= */
const CONSENT_KEY = 'pai_consent';
const readConsent = () => { try { return localStorage.getItem(CONSENT_KEY) || ''; } catch { return ''; } };
const writeConsent = (v) => { try { localStorage.setItem(CONSENT_KEY, v); } catch {} };
const privacySignal = () => navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true;
const PIXEL_ID_RE = /^\d{5,20}$/;
let pixelId = '';
let pixelLoaded = false;

const loadMetaPixel = (id) => {
  if (pixelLoaded || !PIXEL_ID_RE.test(id)) return;
  pixelLoaded = true;
  (function (w, d) {
    if (w.fbq) return;
    const q = function () { q.callMethod ? q.callMethod.apply(q, arguments) : q.queue.push(arguments); };
    w.fbq = q; if (!w._fbq) w._fbq = q;
    q.push = q; q.loaded = true; q.version = '2.0'; q.queue = [];
    const t = d.createElement('script');
    t.async = true; t.src = 'https://connect.facebook.net/en_US/fbevents.js';
    d.head.appendChild(t);
  })(window, document);
  window.fbq('init', id);
  window.fbq('track', 'PageView');
};

// name: a Meta standard event (ViewContent, Lead, Contact) or, with custom=true, your own event name
const pixelEvent = (name, params, custom) => {
  if (!pixelLoaded || typeof window.fbq !== 'function') return;
  try { window.fbq(custom ? 'trackCustom' : 'track', name, params || {}); } catch {}
};

const clearPixelCookies = () => {
  ['_fbp', '_fbc'].forEach((n) => {
    document.cookie = `${n}=; Max-Age=0; path=/`;
    document.cookie = `${n}=; Max-Age=0; path=/; domain=${location.hostname}`;
    document.cookie = `${n}=; Max-Age=0; path=/; domain=.${location.hostname}`;
  });
};

const initTracking = (cfg) => {
  const id = String(cfg?.metaPixelId || '').trim();
  const banner = $('#consent-banner'), settingsBtn = $('#cookie-settings');
  if (!PIXEL_ID_RE.test(id) || privacySignal()) {
    if (banner) banner.hidden = true;
    if (settingsBtn) settingsBtn.hidden = true;
    return;
  }
  pixelId = id;
  if (settingsBtn) settingsBtn.hidden = false;
  const choice = readConsent();
  if (choice === 'granted') loadMetaPixel(id);
  else if (choice !== 'denied' && banner) banner.hidden = false;
};

$('#consent-accept')?.addEventListener('click', () => {
  writeConsent('granted');
  $('#consent-banner').hidden = true;
  loadMetaPixel(pixelId);
});
$('#consent-decline')?.addEventListener('click', () => {
  const wasOn = pixelLoaded;
  writeConsent('denied');
  $('#consent-banner').hidden = true;
  if (wasOn) { clearPixelCookies(); location.reload(); }
});
$('#cookie-settings')?.addEventListener('click', () => { $('#consent-banner').hidden = false; });

// Privacy-light analytics: no cookies, no IP, no personal data. Respects Do Not Track.
const track = (kind, label) => {
  if (kind === 'sermon_play') pixelEvent('ViewContent', { content_name: String(label || '').slice(0, 100), content_type: 'sermon' });
  else if (kind === 'share') pixelEvent('ShareClick', { content_name: String(label || '').slice(0, 100) }, true);
  try {
    if (navigator.doNotTrack === '1' || navigator.webdriver) return;
    let ref = '';
    try { const r = new URL(document.referrer); if (r.host && r.host !== location.host) ref = r.host.replace(/^www\./, ''); } catch {}
    const w = innerWidth;
    fetch(`${SUPABASE_URL}/rest/v1/site_events`, {
      method: 'POST', keepalive: true,
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, Prefer: 'return=minimal' },
      body: JSON.stringify({ kind, label: label ? String(label).slice(0, 200) : null, path: location.pathname.slice(0, 200), referrer: ref.slice(0, 200) || null, device: w < 700 ? 'mobile' : w < 1100 ? 'tablet' : 'desktop' })
    }).catch(() => {});
  } catch {}
};
try { if (!sessionStorage.getItem('pai_viewed')) { sessionStorage.setItem('pai_viewed', '1'); track('view'); } } catch {}

const shareContent = async (title, text, url) => {
  track('share', title);
  const full = `${text}\n${url}`;
  if (navigator.share) {
    try { await navigator.share({ title, text, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(full)}`, '_blank', 'noopener');
};

const icsEscape = (v) => String(v || '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
const icsDate = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const downloadIcs = (filename, { title, description, location: where, start, end, rrule }) => {
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Prayer Army International//Website//EN', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${Date.now()}-${Math.random().toString(36).slice(2, 8)}@prayerarmy-inter`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(start)}`,
    `DTEND:${icsDate(end)}`,
    rrule ? `RRULE:${rrule}` : '',
    `SUMMARY:${icsEscape(title)}`,
    description ? `DESCRIPTION:${icsEscape(description)}` : '',
    where ? `LOCATION:${icsEscape(where)}` : '',
    'BEGIN:VALARM', 'TRIGGER:-PT1H', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(title)}`, 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR'
  ].filter(Boolean).join('\r\n');
  const blob = new Blob([lines], { type: 'text/calendar;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename.replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '.ics';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};

// "8:00 AM – 11:00 AM", "6pm", "18:30-20:00" -> {sh,sm,eh,em} (Ghana time = UTC)
const parseTimeRange = (str) => {
  const re = /(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?/gi;
  const hits = [];
  let m;
  while ((m = re.exec(String(str || ''))) && hits.length < 2) {
    hits.push({ h: Number(m[1]), min: Number(m[2] || 0), ap: (m[3] || '').toLowerCase().replace(/\./g, '') });
  }
  if (!hits.length || hits.some(t => t.h > 24 || t.min > 59)) return null;
  if (hits[1] && !hits[0].ap && hits[1].ap) hits[0].ap = hits[1].ap;
  const to24 = ({ h, min, ap }) => {
    let hh = h % 12; if (!ap) hh = h; else if (ap === 'pm') hh += 12;
    return [hh % 24, min];
  };
  const [sh, sm] = to24(hits[0]);
  let [eh, em] = hits[1] ? to24(hits[1]) : [(sh + 1) % 24, sm];
  if (eh * 60 + em <= sh * 60 + sm) { eh = (sh + 2) % 24; em = sm; }
  return { sh, sm, eh, em };
};

/* =========================================================================
   ROLLING EVENTS + WEEKLY ACTIVITIES
   ========================================================================= */
const eventsState = { index: 0, count: 0, timer: null, paused: false, list: [] };
const weeklyState = { items: [] };
const DAY_ORDER = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const buildEventList = (s) => {
  const now = new Date();
  const fallbackPoster = $('#events-track .event-poster img')?.getAttribute('src') || '';
  const list = [];
  if (s.event?.title) list.push({ ...s.event, image: s.event.image || fallbackPoster, featured: true });
  (Array.isArray(s.events) ? s.events : []).forEach(ev => { if (ev && ev.title) list.push(ev); });

  // Drop events that have already finished (keep the featured one if nothing else is left)
  const upcoming = list.filter(ev => {
    const end = new Date(ev.end || ev.start || '');
    return isNaN(end) || end >= now;
  });
  const shown = upcoming.length ? upcoming : list.slice(0, 1);
  return shown.sort((a, b) => {
    const da = new Date(a.start || ''), db = new Date(b.start || '');
    if (isNaN(da) && isNaN(db)) return 0;
    if (isNaN(da)) return 1;
    if (isNaN(db)) return -1;
    return da - db;
  });
};

const goToEvent = (i, { user = false } = {}) => {
  const track = $('#events-track');
  if (!track || !eventsState.count) return;
  eventsState.index = (i + eventsState.count) % eventsState.count;
  track.style.transform = `translateX(-${eventsState.index * 100}%)`;
  $$('.event-slide', track).forEach((el, idx) => {
    const active = idx === eventsState.index;
    el.setAttribute('aria-hidden', active ? 'false' : 'true');
    if (active) el.removeAttribute('inert'); else el.setAttribute('inert', '');
  });
  $$('#events-dots button').forEach((b, idx) => {
    b.classList.toggle('active', idx === eventsState.index);
    b.setAttribute('aria-selected', idx === eventsState.index ? 'true' : 'false');
  });
  if (user) restartEventsAutoplay();
};

const restartEventsAutoplay = () => {
  clearInterval(eventsState.timer);
  eventsState.timer = null;
  if (eventsState.count < 2) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  eventsState.timer = setInterval(() => {
    if (!eventsState.paused && !document.hidden) goToEvent(eventsState.index + 1);
  }, 8000);
};

const renderEvents = (s) => {
  const track = $('#events-track');
  if (!track) return;
  const list = buildEventList(s);
  if (!list.length) return;

  track.innerHTML = list.map((ev, i) => {
    const link = safeUrl(ev.link);
    const btn = link
      ? `<a class="btn btn-dark" href="${escapeHtml(link)}" target="_blank" rel="noopener">View Event <span>→</span></a>`
      : `<a class="btn btn-dark" href="#prayer">View Event <span>→</span></a>`;
    const canCal = !isNaN(new Date(ev.start || ''));
    const actions = `<div class="event-actions">${btn}
        ${canCal ? `<button type="button" class="chip-btn" data-ev-action="calendar" data-i="${i}">＋ Add to calendar</button>` : ''}
        <button type="button" class="chip-btn" data-ev-action="share" data-i="${i}">Share</button></div>`;
    const image = escapeHtml(ev.image || '');
    const poster = image
      ? `<div class="event-poster"><img loading="${i ? 'lazy' : 'eager'}" decoding="async" src="${image}" alt="${escapeHtml(ev.title)} poster"></div>`
      : `<div class="event-poster event-poster-empty" aria-hidden="true"></div>`;
    const hasDates = !isNaN(new Date(ev.start || ''));
    return `
      <article class="event-card featured-event event-slide" aria-roledescription="slide" aria-label="${i + 1} of ${list.length}">
        ${poster}
        <div class="event-body">
          <span class="event-label">${i === 0 ? 'NEXT PROGRAM' : 'UPCOMING PROGRAM'}</span>
          <h3>${escapeHtml(ev.title)}</h3>
          ${ev.dates ? `<p>${escapeHtml(ev.dates)}</p>` : ''}
          ${hasDates ? `<div class="countdown" role="timer" aria-live="off" data-start="${escapeHtml(ev.start)}" data-end="${escapeHtml(ev.end || '')}"></div>` : ''}
          ${ev.description ? `<p class="muted">${escapeHtml(ev.description)}</p>` : ''}
          ${actions}
        </div>
      </article>`;
  }).join('');

  eventsState.list = list;
  eventsState.count = list.length;
  const controls = $('#events-controls'), dots = $('#events-dots');
  if (controls) controls.hidden = list.length < 2;
  if (dots) {
    dots.innerHTML = list.map((ev, i) =>
      `<button type="button" role="tab" aria-label="Show event ${i + 1}: ${escapeHtml(ev.title)}" data-i="${i}"></button>`).join('');
  }
  goToEvent(Math.min(eventsState.index, list.length - 1));
  restartEventsAutoplay();
  updateCountdown();
};

const renderVerse = (s) => {
  const band = $('#verse');
  if (!band) return;
  const list = (Array.isArray(s.verses) ? s.verses : []).filter(v => v && v.text);
  if (!list.length) { band.hidden = true; return; }
  const n = new Date();
  const dayOfYear = Math.floor((Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()) - Date.UTC(n.getUTCFullYear(), 0, 0)) / 864e5);
  const v = list[dayOfYear % list.length];
  $('#verse-text').textContent = `“${v.text}”`;
  $('#verse-ref').textContent = v.ref || '';
  band.hidden = false;
  const btn = $('#verse-share');
  if (btn) btn.onclick = () => shareContent('Verse of the day', `“${v.text}” — ${v.ref || ''}`, SITE_ORIGIN + '/');
};

const renderLocations = (s) => {
  const sec = $('#locations'), grid = $('#locations-grid');
  if (!sec || !grid) return;
  const list = (Array.isArray(s.branches) ? s.branches : []).filter(b => b && b.name);
  if (!list.length) { sec.hidden = true; return; }
  grid.innerHTML = list.map(b => {
    const map = safeUrl(b.map) || (b.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(b.address)}` : '');
    const tel = String(b.phone || '').replace(/[^\d+]/g, '');
    return `
      <article class="location-card">
        <h3>${escapeHtml(b.name)}</h3>
        ${b.address ? `<p>${escapeHtml(b.address)}</p>` : ''}
        ${b.times ? `<p class="location-times">${escapeHtml(b.times)}</p>` : ''}
        <div class="location-actions">
          ${map ? `<a class="chip-btn" href="${escapeHtml(map)}" target="_blank" rel="noopener">Get directions</a>` : ''}
          ${tel ? `<a class="chip-btn" href="tel:${escapeHtml(tel)}">Call</a>` : ''}
        </div>
      </article>`;
  }).join('');
  sec.hidden = false;
};

const wireEventsUI = () => {
  const rolling = $('#events-rolling');
  if (!rolling || rolling.dataset.bound) return;
  rolling.dataset.bound = '1';
  $('#events-track')?.addEventListener('click', e => {
    const b = e.target.closest('[data-ev-action]');
    if (!b) return;
    const ev = eventsState.list[Number(b.dataset.i)];
    if (!ev) return;
    if (b.dataset.evAction === 'share') {
      shareContent(ev.title, `${ev.title}${ev.dates ? ' — ' + ev.dates : ''} | Prayer Army International`, `${SITE_ORIGIN}/#events`);
    } else {
      const start = new Date(ev.start);
      let end = new Date(ev.end || '');
      if (isNaN(end) || end <= start) end = new Date(start.getTime() + 2 * 36e5);
      downloadIcs(ev.title, { title: ev.title, description: ev.description, start, end, location: 'Prayer Army International' });
    }
  });
  $('#weekly-grid')?.addEventListener('click', e => {
    const b = e.target.closest('[data-wk-i]');
    if (!b) return;
    const a = weeklyState.items[Number(b.dataset.wkI)];
    const t = a && parseTimeRange(a.time);
    if (!t) return;
    const now = new Date();
    const everyDay = a.day === 'Every day';
    const dayIdx = everyDay ? now.getUTCDay() : DAY_ORDER.indexOf(a.day);
    const diff = (dayIdx - now.getUTCDay() + 7) % 7;
    const d = (h, m) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + diff, h, m));
    const start = d(t.sh, t.sm);
    let end = d(t.eh, t.em);
    if (end <= start) end = new Date(start.getTime() + 36e5);
    downloadIcs(a.title, {
      title: a.title, description: a.description, location: a.location || 'Prayer Army International', start, end,
      rrule: everyDay ? 'FREQ=DAILY' : `FREQ=WEEKLY;BYDAY=${['SU','MO','TU','WE','TH','FR','SA'][dayIdx]}`
    });
  });
  $('#events-prev')?.addEventListener('click', () => goToEvent(eventsState.index - 1, { user: true }));
  $('#events-next')?.addEventListener('click', () => goToEvent(eventsState.index + 1, { user: true }));
  $('#events-dots')?.addEventListener('click', e => {
    const b = e.target.closest('button[data-i]');
    if (b) goToEvent(Number(b.dataset.i), { user: true });
  });
  // Pause while the visitor is reading / interacting
  rolling.addEventListener('mouseenter', () => { eventsState.paused = true; });
  rolling.addEventListener('mouseleave', () => { eventsState.paused = false; });
  rolling.addEventListener('focusin', () => { eventsState.paused = true; });
  rolling.addEventListener('focusout', () => { eventsState.paused = false; });
  // Swipe on touch screens
  let startX = null;
  rolling.addEventListener('touchstart', e => { startX = e.touches[0].clientX; eventsState.paused = true; }, { passive: true });
  rolling.addEventListener('touchend', e => {
    eventsState.paused = false;
    if (startX === null) return;
    const dx = e.changedTouches[0].clientX - startX;
    startX = null;
    if (Math.abs(dx) > 50) goToEvent(eventsState.index + (dx < 0 ? 1 : -1), { user: true });
  }, { passive: true });
  rolling.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft') goToEvent(eventsState.index - 1, { user: true });
    if (e.key === 'ArrowRight') goToEvent(eventsState.index + 1, { user: true });
  });
};

const renderWeekly = (s) => {
  const wrap = $('#weekly'), grid = $('#weekly-grid');
  if (!wrap || !grid) return;
  const items = (Array.isArray(s.weekly) ? s.weekly : []).filter(a => a && a.title);
  if (!items.length) { wrap.hidden = true; return; }
  const idx = (d) => { const i = DAY_ORDER.indexOf(d); return i === -1 ? 7 : i; };
  items.sort((a, b) => idx(a.day) - idx(b.day) || String(a.time || '').localeCompare(String(b.time || '')));
  const today = DAY_ORDER[new Date().getDay()];
  weeklyState.items = items;
  grid.innerHTML = items.map(a => {
    const isToday = a.day === today || a.day === 'Every day';
    return `
      <article class="weekly-card${isToday ? ' is-today' : ''}">
        <div class="weekly-when">
          <span class="weekly-day">${escapeHtml(a.day || '')}</span>
          ${a.time ? `<span class="weekly-time">${escapeHtml(a.time)}</span>` : ''}
          ${isToday ? '<span class="weekly-today">Today</span>' : ''}
        </div>
        <h4>${escapeHtml(a.title)}</h4>
        ${a.description ? `<p>${escapeHtml(a.description)}</p>` : ''}
        ${a.location ? `<span class="weekly-where">${escapeHtml(a.location)}</span>` : ''}
        ${parseTimeRange(a.time) && (DAY_ORDER.includes(a.day) || a.day === 'Every day') ? `<button type="button" class="chip-btn" data-wk-i="${items.indexOf(a)}">＋ Add to calendar</button>` : ''}
      </article>`;
  }).join('');
  wrap.hidden = false;
};

/* =========================================================================
   APPLY SETTINGS TO THE ENTIRE WEBSITE DOM
   ========================================================================= */
const applySettings = (s) => {
  currentSettings = s;

  // Church Logo (header, footer, favicon)
  if (s.general?.logoUrl) {
    const logoHeader = $('#site-logo-header'), logoFooter = $('#site-logo-footer'), favicon = $('#site-favicon');
    if (logoHeader) logoHeader.src = s.general.logoUrl;
    if (logoFooter) logoFooter.src = s.general.logoUrl;
    if (favicon) favicon.href = s.general.logoUrl;
  }

  // Announcement Popup (shows once per session per message, not a persistent bar)
  const announceModalEl = $('#announce-modal'), announceMsgEl = $('#announce-modal-msg');
  if (announceModalEl && announceMsgEl) {
    if (s.announcement?.enabled && s.announcement?.text) {
      const dismissKey = 'pai_announcement_seen';
      const alreadySeen = sessionStorage.getItem(dismissKey) === s.announcement.text;
      announceMsgEl.textContent = s.announcement.text;
      if (!alreadySeen) {
        announceModalEl.hidden = false;
        setTimeout(() => announceModalEl.classList.add('show'), 500);
        sessionStorage.setItem(dismissKey, s.announcement.text);
      }
    }
  }

  // Hero Section
  const hEyebrow = $('#hero-eyebrow');
  const hTitleMain = $('#hero-title-main');
  const hTitleAccent = $('#hero-title-accent');
  const hCopy = $('#hero-copy');
  const hNote = $('#hero-note');
  const hBtnPrimary = $('#hero-btn-primary');
  const hBtnSecondary = $('#hero-btn-secondary');

  if (hEyebrow && s.hero?.eyebrow) hEyebrow.textContent = s.hero.eyebrow;
  if (hTitleMain && s.hero?.titleMain) hTitleMain.textContent = s.hero.titleMain;
  if (hTitleAccent && s.hero?.titleAccent) hTitleAccent.textContent = s.hero.titleAccent;
  if (hCopy && s.hero?.copy) hCopy.textContent = s.hero.copy;
  if (hNote && s.hero?.tagline) hNote.innerHTML = `<span class="pulse"></span> ${escapeHtml(s.hero.tagline)}`;

  if (hBtnPrimary) {
    if (s.hero?.btnPrimaryText) hBtnPrimary.innerHTML = `${escapeHtml(s.hero.btnPrimaryText)} <span>→</span>`;
    if (s.hero?.btnPrimaryLink && safeHref(s.hero.btnPrimaryLink)) hBtnPrimary.href = safeHref(s.hero.btnPrimaryLink);
  }

  // Hero Background Media (Image or Video)
  if (heroMedia && s.hero?.bgImage) {
    const bg = s.hero.bgImage;
    const isVideo = ['.mp4', '.webm', '.mov', '.ogg'].some(ext => bg.toLowerCase().endsWith(ext));
    if (isVideo) {
      heroMedia.style.backgroundImage = 'none';
      let vid = heroMedia.querySelector('video.hero-bg-video');
      if (!vid) {
        vid = document.createElement('video');
        vid.className = 'hero-bg-video';
        vid.autoplay = true;
        vid.loop = true;
        vid.muted = true;
        vid.playsInline = true;
        vid.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;pointer-events:none;';
        heroMedia.prepend(vid);
      }
      if (vid.src !== bg) vid.src = bg;
    } else {
      const vid = heroMedia.querySelector('video.hero-bg-video');
      if (vid) vid.remove();
      heroMedia.style.backgroundImage = cssUrl(bg);
    }
  }

  // Live Section & Broadcast controls
  const isLive = Boolean(s.live?.isLiveNow);
  const liveUrl = s.live?.url || 'https://www.youtube.com/@prophetsugloprosper/live';
  const liveDot = $('#nav-live-dot');
  const liveIndicator = $('#live-indicator');
  const liveTitle = $('#live-title');
  const liveDesc = $('#live-desc');
  const liveBtn = $('#live-stream-btn');
  const liveStatus = $('#live-status-text');

  if (liveDot) liveDot.hidden = !isLive;

  if (hBtnSecondary) {
    if (isLive) {
      hBtnSecondary.innerHTML = '<span class="pulse" style="background:#e53e3e"></span> Watch Live Now';
    } else {
      hBtnSecondary.innerHTML = s.hero?.btnSecondaryText || 'Watch Live';
    }
    // Always keeps visitors on-site: jumps to the Live section, which plays
    // the broadcast inline rather than sending anyone to an external tab.
    hBtnSecondary.href = isLive ? '#live' : (safeHref(s.hero?.btnSecondaryLink) || '#live');
    hBtnSecondary.removeAttribute('target');
    hBtnSecondary.removeAttribute('rel');
    if (!hBtnSecondary.dataset.liveBound) {
      hBtnSecondary.dataset.liveBound = '1';
      hBtnSecondary.addEventListener('click', () => {
        if (currentSettings.live?.isLiveNow) {
          // Let the anchor jump happen first, then start on-site playback.
          setTimeout(() => triggerLivePlay(), 400);
        }
      });
    }
  }

  if (liveIndicator) {
    if (isLive) {
      liveIndicator.textContent = '● BROADCASTING LIVE NOW';
      liveIndicator.style.background = '#e53e3e';
      liveIndicator.style.animation = 'blink 1.2s infinite';
    } else {
      liveIndicator.textContent = '● LIVE SERVICE';
      liveIndicator.style.background = '#b53a30';
      liveIndicator.style.animation = 'none';
    }
  }

  if (liveTitle && s.live?.title) liveTitle.textContent = s.live.title;
  if (liveDesc && s.live?.description) liveDesc.textContent = s.live.description;

  if (liveBtn) {
    liveBtn.href = '#live-video-frame';
    liveBtn.removeAttribute('target');
    liveBtn.removeAttribute('rel');
    liveBtn.innerHTML = isLive ? 'Play Live Broadcast <span>▶</span>' : 'Preview Live Stream <span>▶</span>';
    if (!liveBtn.dataset.liveBound) {
      liveBtn.dataset.liveBound = '1';
      liveBtn.addEventListener('click', e => { e.preventDefault(); triggerLivePlay(); });
    }
  }

  if (liveStatus) {
    liveStatus.innerHTML = isLive
      ? '<span class="pulse" style="background:#e53e3e"></span> Service is currently live — tune in now!'
      : `<span class="pulse"></span> ${escapeHtml(s.live?.statusNote || 'Regular Sunday and Prophetic Services streamed live')}`;
  }

  // Inline live video player -- previews with a thumbnail + play button and,
  // once clicked, plays right on the page (embedded iframe/video) instead of
  // sending visitors away to YouTube or another site.
  const liveFrame = $('#live-video-frame');
  const liveThumb = $('#live-video-thumb');
  const livePlayBtn = $('#live-play-btn');
  const liveCaption = $('#live-video-caption');

  if (liveFrame && liveThumb && livePlayBtn && liveCaption) {
    const existingPlayer = liveFrame.querySelector('iframe, video');
    if (existingPlayer) existingPlayer.remove();
    liveFrame.classList.remove('is-playing');

    const ytId = extractYouTubeId(liveUrl);
    const isDirectVideo = ['.mp4', '.webm', '.mov', '.ogg'].some(ext => liveUrl.toLowerCase().endsWith(ext));

    const startPlayback = () => {
      if (liveFrame.classList.contains('is-playing')) return;
      let player;
      if (ytId) {
        player = document.createElement('iframe');
        player.src = `https://www.youtube.com/embed/${ytId}?autoplay=1&rel=0&playsinline=1`;
        player.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture');
        player.allowFullscreen = true;
        player.title = s.live?.title || 'Live broadcast';
      } else if (isDirectVideo) {
        player = document.createElement('video');
        player.src = liveUrl;
        player.controls = true;
        player.autoplay = true;
        player.playsInline = true;
      } else {
        // No embeddable video URL is configured yet -- nothing safe to play
        // inline, so this is a no-op rather than forcing an external redirect.
        return;
      }
      liveFrame.appendChild(player);
      liveFrame.classList.add('is-playing');
    };

    if (ytId) {
      liveThumb.style.backgroundImage = `url('https://img.youtube.com/vi/${ytId}/hqdefault.jpg')`;
    } else {
      liveThumb.style.backgroundImage = cssUrl(s.hero?.bgImage || 'assets/images/FB_IMG_1790281547438.jpg');
    }

    const canPlayInline = Boolean(ytId || isDirectVideo);
    livePlayBtn.hidden = !canPlayInline;
    liveThumb.style.cursor = canPlayInline ? 'pointer' : 'default';
    liveCaption.textContent = isLive
      ? (canPlayInline ? '🔴 LIVE — tap to watch' : 'Live now — link not yet configured for on-site playback')
      : (canPlayInline ? 'Tap to preview' : 'Live preview will appear here once a stream link is set');

    livePlayBtn.onclick = startPlayback;
    liveThumb.onclick = () => { if (canPlayInline) startPlayback(); };
    triggerLivePlay = startPlayback;
  }

  // About Section
  const aEyebrow = $('#about-eyebrow');
  const aHeading = $('#about-heading');
  const aP1 = $('#about-p1');
  const aP2 = $('#about-p2');
  const aFName = $('#about-founder-name');
  const aFRole = $('#about-founder-role');

  if (aEyebrow && s.about?.eyebrow) aEyebrow.textContent = s.about.eyebrow;
  const aEyebrowMobile = $('#about-eyebrow-mobile');
  if (aEyebrowMobile) aEyebrowMobile.textContent = s.about?.eyebrow || aEyebrow?.textContent || '';
  if (aHeading && s.about?.heading) {
    // Wrap **text** as a gold accent span. This used to silently discard the
    // accent styling entirely once settings loaded (innerHTML was set to the
    // plain heading text with no way to mark which part gets the color) —
    // now the admin's Heading field can mark the accented part with **stars**
    // and it's escaped first, so no raw HTML can be injected through it.
    aHeading.innerHTML = escapeHtml(s.about.heading).replace(/\*\*(.+?)\*\*/g, '<span>$1</span>');
  }
  if (aP1 && s.about?.p1) aP1.textContent = s.about.p1;
  if (aP2 && s.about?.p2) aP2.textContent = s.about.p2;
  if (aFName && s.about?.founderName) aFName.textContent = s.about.founderName;
  if (aFRole && s.about?.founderRole) aFRole.textContent = s.about.founderRole;

  if (s.about?.stat1Title && $('#about-stat1-title')) $('#about-stat1-title').textContent = s.about.stat1Title;
  if (s.about?.stat1Desc && $('#about-stat1-desc')) $('#about-stat1-desc').textContent = s.about.stat1Desc;
  if (s.about?.stat2Title && $('#about-stat2-title')) $('#about-stat2-title').textContent = s.about.stat2Title;
  if (s.about?.stat2Desc && $('#about-stat2-desc')) $('#about-stat2-desc').textContent = s.about.stat2Desc;
  if (s.about?.stat3Title && $('#about-stat3-title')) $('#about-stat3-title').textContent = s.about.stat3Title;
  if (s.about?.stat3Desc && $('#about-stat3-desc')) $('#about-stat3-desc').textContent = s.about.stat3Desc;

  // Foundation Section
  if (s.foundation?.missionTitle && $('#foundation-mission-title')) $('#foundation-mission-title').textContent = s.foundation.missionTitle;
  if (s.foundation?.missionText && $('#foundation-mission-text')) $('#foundation-mission-text').textContent = s.foundation.missionText;
  if (s.foundation?.visionTitle && $('#foundation-vision-title')) $('#foundation-vision-title').textContent = s.foundation.visionTitle;
  if (s.foundation?.visionText && $('#foundation-vision-text')) $('#foundation-vision-text').textContent = s.foundation.visionText;
  if (s.foundation?.valuesTitle && $('#foundation-values-title')) $('#foundation-values-title').textContent = s.foundation.valuesTitle;
  if (s.foundation?.valuesText && $('#foundation-values-text')) $('#foundation-values-text').textContent = s.foundation.valuesText;
  if (s.foundation?.storyTitle && $('#foundation-story-title')) $('#foundation-story-title').textContent = s.foundation.storyTitle;
  if (s.foundation?.storyText && $('#foundation-story-text')) $('#foundation-story-text').textContent = s.foundation.storyText;
  if (s.foundation?.founderBio && $('#foundation-founder-bio')) $('#foundation-founder-bio').textContent = s.foundation.founderBio;
  const faithImg = $('#foundation-faith-image'), faithMediaBox = $('#faith-media');
  if (faithImg && faithMediaBox) {
    if (s.foundation?.faithImage) faithImg.src = s.foundation.faithImage.replace('statement-of-faith.png', 'statement-of-faith.jpg');
    faithMediaBox.style.display = '';
  }

  // Sermons Section
  if (s.sermons?.heading && $('#sermons-heading')) $('#sermons-heading').textContent = s.sermons.heading;
  if (s.sermons?.featuredKicker && $('#sermons-feat-kicker')) $('#sermons-feat-kicker').textContent = s.sermons.featuredKicker;
  if (s.sermons?.featuredTitle && $('#sermons-feat-title')) $('#sermons-feat-title').textContent = s.sermons.featuredTitle;
  if (s.sermons?.featuredDesc && $('#sermons-feat-desc')) $('#sermons-feat-desc').textContent = s.sermons.featuredDesc;

  sermonUrls = {
    featured: s.sermons?.featuredUrl || '',
    mini1: s.sermons?.mini1Url || '',
    mini2: s.sermons?.mini2Url || '',
    library: s.sermons?.libraryUrl || ''
  };

  if (s.sermons?.mini1Kicker && $('#mini1-kicker')) $('#mini1-kicker').textContent = s.sermons.mini1Kicker;
  if (s.sermons?.mini1Title && $('#mini1-title')) $('#mini1-title').textContent = s.sermons.mini1Title;
  if (s.sermons?.mini2Kicker && $('#mini2-kicker')) $('#mini2-kicker').textContent = s.sermons.mini2Kicker;
  if (s.sermons?.mini2Title && $('#mini2-title')) $('#mini2-title').textContent = s.sermons.mini2Title;

  // Events Section (rolling) + weekly activities
  if (s.event?.stackCaption && $('#event-stack-caption')) $('#event-stack-caption').textContent = s.event.stackCaption;
  wireEventsUI();
  renderEvents(s);
  renderWeekly(s);
  renderVerse(s);
  initTracking(s.tracking);
  renderLocations(s);

  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = setInterval(updateCountdown, 3e4);

  // Prayer Section
  if (s.prayer?.eyebrow && $('#prayer-eyebrow')) $('#prayer-eyebrow').textContent = s.prayer.eyebrow;
  if (s.prayer?.heading && $('#prayer-heading')) $('#prayer-heading').textContent = s.prayer.heading;
  if (s.prayer?.copy && $('#prayer-copy')) $('#prayer-copy').textContent = s.prayer.copy;

  // Giving Section
  if (s.giving?.heading && $('#give-heading')) $('#give-heading').textContent = s.giving.heading;
  if (s.giving?.info && $('#give-info-text')) $('#give-info-text').textContent = s.giving.info;

  const payCount = renderPayMethods(s.giving?.methods, s.giving?.note);

  const momoBox = $('#give-momo-box'), momoText = $('#give-momo-text');
  if (momoBox && momoText) {
    if (s.giving?.momo) {
      momoText.textContent = s.giving.momo;
      const badge = $('#give-momo-badge');
      if (badge) badge.textContent = payCount ? 'ADDITIONAL DETAILS' : 'MOBILE MONEY / PARTNERSHIP';
      momoBox.hidden = false;
    } else {
      momoBox.hidden = true;
    }
  }

  const giveBtn = $('#give-link-btn');
  if (giveBtn) {
    if (safeHref(s.giving?.link)) {
      giveBtn.href = safeHref(s.giving.link);
      giveBtn.target = '_blank';
      giveBtn.rel = 'noopener';
      giveBtn.innerHTML = 'Give online <span>→</span>';
      giveBtn.hidden = false;
    } else {
      giveBtn.href = '#footer';
      giveBtn.removeAttribute('target');
      giveBtn.removeAttribute('rel');
      giveBtn.hidden = payCount > 0 || !!s.giving?.momo; // the cards already carry the info
    }
  }

  // Contacts & Socials
  const hqEl = $('#footer-hq-address');
  if (hqEl && s.contact?.address) {
    hqEl.innerHTML = escapeHtml(s.contact.address).replace(',', '<br>');
  }

  const cl = $('#contact-lines'), lines = [];
  if (s.contact?.address) lines.push(escapeHtml(s.contact.address));
  if (s.contact?.phone) lines.push(`<a href="tel:${escapeHtml(s.contact.phone.replace(/[^\d+]/g, ''))}">${escapeHtml(s.contact.phone)}</a>`);
  if (s.contact?.whatsapp) lines.push(`<a href="https://wa.me/${s.contact.whatsapp.replace(/\D/g, '')}" target="_blank" rel="noopener">WhatsApp: ${escapeHtml(s.contact.whatsapp)}</a>`);
  if (s.contact?.email) lines.push(`<a href="mailto:${escapeHtml(s.contact.email)}">${escapeHtml(s.contact.email)}</a>`);
  if (lines.length && cl) cl.innerHTML = lines.join('<br>');

  // Dedicated Contact Section Bindings
  const contactAddr = $('#contact-address');
  if (contactAddr && s.contact?.address) contactAddr.textContent = s.contact.address;

  const contactPhoneDisplay = $('#contact-phone-display');
  const contactActionBtns = $('#contact-action-btns');
  if (contactPhoneDisplay) {
    if (s.contact?.phone || s.contact?.whatsapp) {
      contactPhoneDisplay.textContent = [s.contact.phone, s.contact.whatsapp ? `WhatsApp: ${s.contact.whatsapp}` : ''].filter(Boolean).join(' • ');
    }
  }

  if (contactActionBtns) {
    contactActionBtns.innerHTML = '';
    if (s.contact?.phone) {
      const callBtn = document.createElement('a');
      callBtn.className = 'contact-action-btn';
      callBtn.href = `tel:${s.contact.phone.replace(/\s/g, '')}`;
      callBtn.innerHTML = '📞 Call Us';
      contactActionBtns.appendChild(callBtn);
    }
    if (s.contact?.whatsapp) {
      const waBtn = document.createElement('a');
      waBtn.className = 'contact-action-btn';
      waBtn.href = `https://wa.me/${s.contact.whatsapp.replace(/\D/g, '')}`;
      waBtn.target = '_blank';
      waBtn.rel = 'noopener';
      waBtn.innerHTML = '💬 WhatsApp';
      contactActionBtns.appendChild(waBtn);
    }
  }

  const contactEmailLink = $('#contact-email-link');
  if (contactEmailLink && s.contact?.email) {
    contactEmailLink.href = `mailto:${s.contact.email}`;
    contactEmailLink.textContent = s.contact.email;
  }

  // Social Media SVG Icon Definitions & Rendering
  const SOCIAL_CONFIG = {
    facebook: {
      name: 'Facebook',
      svg: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>'
    },
    youtube: {
      name: 'YouTube',
      svg: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>'
    },
    instagram: {
      name: 'Instagram',
      svg: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>'
    },
    tiktok: {
      name: 'TikTok',
      svg: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.24 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>'
    },
    x: {
      name: 'X (Twitter)',
      svg: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>'
    },
    twitter: {
      name: 'X (Twitter)',
      svg: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>'
    },
    whatsapp: {
      name: 'WhatsApp Community',
      svg: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.301-.15-1.78-.878-2.056-.978-.276-.1-.477-.15-.678.15-.2.301-.778.978-.954 1.179-.176.2-.351.226-.652.075s-1.272-.469-2.424-1.496c-.896-.799-1.501-1.786-1.677-2.087-.176-.301-.019-.464.132-.614.136-.135.301-.351.452-.527.15-.176.2-.301.301-.502.101-.2.05-.376-.025-.526-.075-.15-.678-1.633-.929-2.235-.244-.587-.492-.507-.678-.517-.176-.009-.376-.009-.577-.009-.201 0-.527.075-.803.376s-1.054 1.029-1.054 2.509c0 1.48 1.079 2.909 1.229 3.11s2.124 3.243 5.146 4.548c.719.311 1.28.497 1.718.636.722.23 1.378.197 1.898.12.579-.087 1.78-.727 2.031-1.429.251-.702.251-1.304.176-1.43-.076-.125-.276-.201-.577-.351zm-5.467 7.618a9.92 9.92 0 0 1-5.06-1.387l-.363-.215-3.761.986 1.003-3.666-.236-.375a9.92 9.92 0 0 1-1.523-5.328c0-5.479 4.458-9.937 9.941-9.937a9.9 9.9 0 0 1 7.026 2.912 9.9 9.9 0 0 1 2.911 7.025c0 5.48-4.458 9.941-9.94 9.941zm8.47-18.411A11.88 11.88 0 0 0 12.005 0C5.38 0 0 5.38 0 12.005a11.95 11.95 0 0 0 1.637 6.012l-1.74 6.357 6.505-1.706a11.95 11.95 0 0 0 5.603 1.397h.005c6.624 0 12.004-5.38 12.004-12.005a11.87 11.87 0 0 0-3.539-8.489z"/></svg>'
    },
    telegram: {
      name: 'Telegram Channel',
      svg: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.121l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.196 1.006.128.832.942z"/></svg>'
    },
    threads: {
      name: 'Threads',
      svg: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.186 24C5.466 24 0 18.534 0 11.814 0 5.094 5.466 0 12.186 0c6.602 0 11.895 5.176 12.004 11.758h-2.584C21.498 6.55 17.37 2.457 12.186 2.457 7.025 2.457 2.584 6.898 2.584 12.06c0 5.161 4.441 9.602 9.602 9.602 3.869 0 7.218-2.316 8.718-5.753l2.368.995C21.368 21.055 17.069 24 12.186 24zm4.185-13.82c-.22-.387-.492-.733-.815-1.03-.794-.73-1.874-1.144-3.125-1.144-2.825 0-4.832 2.05-4.832 4.93 0 2.898 2.037 4.965 4.887 4.965 1.547 0 2.923-.62 3.875-1.745.244-.288.455-.61.63-.961l2.25.961c-.347.669-.798 1.285-1.341 1.82-1.464 1.442-3.447 2.275-5.589 2.275-4.148 0-7.337-3.155-7.337-7.315 0-4.14 3.167-7.28 7.282-7.28 1.933 0 3.633.68 4.916 1.968.618.62 1.096 1.373 1.417 2.227l-2.168.329zm-3.865 5.344c-1.442 0-2.434-1.006-2.434-2.476 0-1.488 1.01-2.493 2.455-2.493 1.464 0 2.434 1.005 2.434 2.493 0 1.47-1.014 2.476-2.455 2.476z"/></svg>'
    },
    linkedin: {
      name: 'LinkedIn',
      svg: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/></svg>'
    },
    spotify: {
      name: 'Spotify / Podcasts',
      svg: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>'
    }
  };

  const renderSocialIconSet = (container) => {
    if (!container || !s.social) return;
    container.innerHTML = '';
    const entries = Object.entries(s.social).filter(([, url]) => Boolean(url && String(url).trim()));
    if (entries.length === 0) {
      container.style.display = 'none';
      return;
    }
    container.style.display = 'flex';
    entries.forEach(([key, rawUrl]) => {
      let url = String(rawUrl).trim();
      if (!url) return;
      
      const lowerKey = key.toLowerCase();
      const cfg = SOCIAL_CONFIG[lowerKey] || { name: key, svg: '🔗' };
      
      // Smart URL normalizer
      let finalUrl = url;
      if (lowerKey === 'whatsapp' && !finalUrl.startsWith('http')) {
        finalUrl = `https://wa.me/${finalUrl.replace(/\D/g, '')}`;
      } else if (!finalUrl.startsWith('http') && !finalUrl.startsWith('/') && !finalUrl.startsWith('#')) {
        finalUrl = `https://${finalUrl}`;
      }

      const a = document.createElement('a');
      a.className = `social-icon-btn social-btn-${lowerKey}`;
      a.href = finalUrl;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.setAttribute('aria-label', `Follow Prayer Army International on ${cfg.name}`);
      a.title = `${cfg.name} - Prayer Army International`;
      a.innerHTML = cfg.svg;
      container.appendChild(a);
    });
  };

  renderSocialIconSet($('#footer-socials'));
  renderSocialIconSet($('#contact-socials'));

  const yearEl = $('#year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();
};

// Redirect to separate admin page if query param present
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.has("manage") || urlParams.has("admin")) {
  window.location.href = "/admin";
}

// Initial Settings loading
const loadInitialSettings = async () => {
  let loaded = null;

  // Try the server first
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/site_settings?select=data&id=eq.1`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
    );
    if (res.ok) {
      const rows = await res.json();
      const data = rows?.[0]?.data;
      if (data && Object.keys(data).length > 0) {
        loaded = data;
      }
    }
  } catch (e) {
    console.info('Using local fallback for settings');
  }

  // Fallback to localStorage
  if (!loaded) {
    try {
      const saved = localStorage.getItem('pai_site_settings');
      if (saved) loaded = JSON.parse(saved);
    } catch {}
  }

  const finalSettings = Object.assign({}, DEFAULT_SETTINGS, loaded || {});
  applySettings(finalSettings);
};

loadInitialSettings();

// Gallery Lightbox (defensive: only wires up if both the dialog and at
// least one gallery photo are present, so this never throws and never
// blocks the rest of the page's scripts from running)
const lb = $('#lightbox'), figs = $$('.gallery-grid figure');
let cur = 0;
if (lb && figs.length) {
  const show = i => {
    cur = (i + figs.length) % figs.length;
    const im = $('img', figs[cur]);
    if (!im) return;
    const lbImg = $('img', lb), lbCaption = $('figcaption', lb), lbCount = $('.lb-count', lb);
    if (lbImg) { lbImg.src = im.src; lbImg.alt = im.alt; }
    if (lbCaption) lbCaption.textContent = im.alt;
    if (lbCount) lbCount.textContent = `${cur + 1} / ${figs.length}`;
  };
  figs.forEach((f, i) => {
    f.tabIndex = 0;
    f.setAttribute('role', 'button');
    const img = $('img', f);
    f.setAttribute('aria-label', 'Enlarge: ' + (img?.alt || 'photo'));
    const open = () => { show(i); lb.showModal(); };
    f.addEventListener('click', open);
    f.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  });
  $('.lb-close', lb)?.addEventListener('click', () => lb.close());
  $('.lb-prev', lb)?.addEventListener('click', () => show(cur - 1));
  $('.lb-next', lb)?.addEventListener('click', () => show(cur + 1));
  lb.addEventListener('click', e => { if (e.target === lb) lb.close(); });
  addEventListener('keydown', e => {
    if (lb.open) {
      if (e.key === 'ArrowLeft') show(cur - 1);
      if (e.key === 'ArrowRight') show(cur + 1);
    }
  });
}

// Prayer Form
const prayerForm = $('#prayer-form'), prayerNote = $('#prayer-note');
prayerForm?.addEventListener('submit', async e => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(prayerForm));
  const btn = $('button[type=submit]', prayerForm);
  const done = m => {
    prayerNote.textContent = m;
    prayerNote.className = 'form-note ok';
    prayerForm.reset();
  };
  try {
    btn.disabled = true;
    btn.classList.add('loading');
    const r = await fetch(`${SUPABASE_URL}/rest/v1/prayer_requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({
        name: data.name,
        contact: data.contact || null,
        request: data.request,
        is_private: Boolean(data.private)
      })
    });
    if (!r.ok) throw new Error(await failMessage(r, 'Sorry, something went wrong. Please try again in a moment.'));
    pixelEvent('Contact', { content_name: 'prayer request' });
    done('Thank you — your request has been received and we are standing with you in prayer.');
  } catch (err) {
    prayerNote.textContent = err instanceof Error ? err.message : 'Sorry, something went wrong. Please try again in a moment.';
    prayerNote.className = 'form-note err';
  }
  btn.disabled = false;
  btn.classList.remove('loading');
});

/* =========================================================================
   MESSAGES ARCHIVE — past broadcasts saved after each live service.
   Text + optional link + optional uploaded audio/video only, never a
   picture. Visitors can comment and the form never leaves the page.
   ========================================================================= */

/* =========================================================================
   ON-SITE SERMON PLAYER — every sermon plays here, never on another site.
   Supports YouTube (video / playlist), Facebook, Vimeo, direct MP4/WebM
   and MP3/M4A files.
   ========================================================================= */
const getPlayable = (url) => {
  if (!url) return null;
  const u = String(url).trim();
  const yt = extractYouTubeId(u);
  if (yt) return { kind: 'youtube', id: yt };
  const ch = u.match(/youtube\.com\/channel\/(UC[a-zA-Z0-9_-]{22})\/live/);
  if (ch) return { kind: 'channel', id: ch[1] };
  const pl = u.match(/youtube\.com\/(?:playlist|watch)\?[^#]*list=([a-zA-Z0-9_-]+)/);
  if (pl) return { kind: 'playlist', id: pl[1] };
  const vm = u.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vm) return { kind: 'vimeo', id: vm[1] };
  if (/(?:facebook\.com|fb\.watch)\//.test(u)) return { kind: 'facebook', url: u };
  if (/\.(mp4|webm|ogv|mov|m4v)(\?|#|$)/i.test(u)) return { kind: 'video', url: u };
  if (/\.(mp3|m4a|wav|ogg|aac)(\?|#|$)/i.test(u)) return { kind: 'audio', url: u };
  return null;
};

const buildPlayerEl = (p, autoplay = true) => {
  const ap = autoplay ? 1 : 0;
  const frame = (src) => {
    const f = document.createElement('iframe');
    f.src = src; f.title = 'Sermon video'; f.loading = 'lazy';
    f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    f.allowFullscreen = true; f.referrerPolicy = 'strict-origin-when-cross-origin';
    return f;
  };
  switch (p.kind) {
    case 'youtube': return frame(`https://www.youtube.com/embed/${p.id}?autoplay=${ap}&rel=0&playsinline=1`);
    case 'channel': return frame(`https://www.youtube.com/embed/live_stream?channel=${p.id}&autoplay=${ap}`);
    case 'playlist': return frame(`https://www.youtube.com/embed/videoseries?list=${p.id}&autoplay=${ap}&rel=0`);
    case 'vimeo': return frame(`https://player.vimeo.com/video/${p.id}?autoplay=${ap}`);
    case 'facebook': return frame(`https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(p.url)}&show_text=false&autoplay=${ap}`);
    case 'video': { const v = document.createElement('video'); v.src = p.url; v.controls = true; v.playsInline = true; v.autoplay = !!ap; return v; }
    case 'audio': { const a = document.createElement('audio'); a.src = p.url; a.controls = true; a.autoplay = !!ap; return a; }
  }
};

const sermonDialog = $('#sermon-player');
const sermonStage = $('#sp-stage');
const sermonTitle = $('#sp-title');
let archiveItems = []; // archive messages that can be played, newest first

const openSermonPlayer = (url, title = '') => {
  const p = getPlayable(url);
  if (!p || !sermonDialog) return false;
  sermonStage.innerHTML = '';
  sermonStage.className = 'sp-stage sp-' + p.kind;
  sermonStage.appendChild(buildPlayerEl(p));
  sermonTitle.textContent = title;
  if (!sermonDialog.open) sermonDialog.showModal();
  track('sermon_play', title);
  return true;
};
const closeSermonPlayer = () => { if (sermonDialog?.open) sermonDialog.close(); };
if (sermonDialog) {
  $('.sp-close', sermonDialog).addEventListener('click', closeSermonPlayer);
  sermonDialog.addEventListener('click', (e) => { if (e.target === sermonDialog) closeSermonPlayer(); });
  sermonDialog.addEventListener('close', () => { sermonStage.innerHTML = ''; }); // stops playback
}

// Which archived sermon backs each card when no link is set in the manager
const archiveFallback = (slot) => {
  const idx = { featured: 0, mini1: 1, mini2: 2 }[slot] ?? 0;
  return archiveItems[idx] || archiveItems[0] || null;
};
const scrollToArchive = () => {
  const el = $('#messages-archive');
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

document.addEventListener('click', (e) => {
  const trigger = e.target.closest('[data-sermon]');
  if (!trigger) return;
  e.preventDefault();
  const slot = trigger.dataset.sermon;
  if (slot === 'library') {
    if (!openSermonPlayer(sermonUrls.library, 'Sermon playlist')) scrollToArchive();
    return;
  }
  const title = ({ featured: $('#sermons-feat-title'), mini1: $('#mini1-title'), mini2: $('#mini2-title') }[slot])?.textContent || '';
  if (openSermonPlayer(sermonUrls[slot], title)) return;
  const fb = archiveFallback(slot);
  if (fb && openSermonPlayer(fb.media_url || fb.link, fb.title)) return;
  scrollToArchive();
  showToast('This sermon will be available in the archive shortly.', true);
});

/* ---------- Giving: payment method cards ---------- */
const PAY_ICONS = {
  momo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18.5h2"/></svg>',
  bank: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9.5 12 4l9 5.5M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20.5h18"/></svg>',
  online: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h3"/></svg>',
  other: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20.5s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.7a4.3 4.3 0 0 1 7.5 2.8c0 5.4-7.5 10-7.5 10z"/></svg>'
};
const PAY_TYPE_LABEL = { momo: 'Mobile Money', bank: 'Bank Transfer', online: 'Online', other: 'Other' };
const COPY_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>';
const CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';

const copyText = async (text) => {
  try { await navigator.clipboard.writeText(text); return true; } catch {}
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  let ok = false; try { ok = document.execCommand('copy'); } catch {}
  ta.remove(); return ok;
};

const renderPayMethods = (methods = [], note = '') => {
  const grid = $('#pay-grid'), noteEl = $('#pay-note');
  if (!grid) return 0;
  const valid = (Array.isArray(methods) ? methods : []).filter((m) => m && Array.isArray(m.rows) && m.rows.some((r) => r?.value));
  grid.innerHTML = '';
  valid.forEach((m) => {
    const type = PAY_ICONS[m.type] ? m.type : 'other';
    const card = document.createElement('article');
    card.className = 'pay-card';
    const head = document.createElement('div');
    head.className = 'pay-head';
    head.innerHTML = `<span class="pay-icon">${PAY_ICONS[type]}</span><div><small></small><h3></h3></div>`;
    head.querySelector('small').textContent = PAY_TYPE_LABEL[type];
    head.querySelector('h3').textContent = m.title || PAY_TYPE_LABEL[type];
    card.appendChild(head);

    const dl = document.createElement('dl');
    dl.className = 'pay-rows';
    m.rows.filter((r) => r?.value).forEach((r) => {
      const row = document.createElement('div');
      row.className = 'pay-row';
      const dt = document.createElement('dt'); dt.textContent = r.label || '';
      const dd = document.createElement('dd');
      const isUrl = /^https?:\/\//i.test(r.value);
      if (isUrl) {
        const a = document.createElement('a');
        a.href = r.value; a.target = '_blank'; a.rel = 'noopener noreferrer';
        a.className = 'pay-link'; a.textContent = 'Open payment page →';
        dd.appendChild(a);
      } else {
        const v = document.createElement('span'); v.className = 'pay-value'; v.textContent = r.value;
        dd.appendChild(v);
        const btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'pay-copy';
        btn.setAttribute('aria-label', `Copy ${r.label || 'value'}`); btn.innerHTML = COPY_SVG;
        btn.addEventListener('click', async () => {
          if (await copyText(r.value)) {
            btn.innerHTML = CHECK_SVG; btn.classList.add('done');
            showToast(`${r.label || 'Details'} copied`);
            setTimeout(() => { btn.innerHTML = COPY_SVG; btn.classList.remove('done'); }, 1800);
          }
        });
        dd.appendChild(btn);
      }
      if (r.label) row.appendChild(dt);
      row.appendChild(dd);
      dl.appendChild(row);
    });
    card.appendChild(dl);
    grid.appendChild(card);
  });
  grid.hidden = !valid.length;
  if (noteEl) { noteEl.textContent = note || ''; noteEl.hidden = !(valid.length && note); }
  return valid.length;
};

const messagesList = $('#messages-list');

const formatMessageDate = (iso) => {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch { return ''; }
};

const renderComments = (listEl, comments) => {
  listEl.innerHTML = comments.length
    ? comments.map((c) => `
        <li>
          <div class="comment-meta"><span class="comment-name">${escapeHtml(c.name)}</span><span>${formatMessageDate(c.created_at)}</span></div>
          <p class="comment-text">${escapeHtml(c.comment)}</p>
        </li>`).join('')
    : '<p class="comment-empty">No comments yet — be the first to respond.</p>';
};

const buildMessageCard = (msg) => {
  const card = document.createElement('article');
  card.className = 'message-card';
  card.dataset.id = msg.id;

  const mediaTag = msg.media_url
    ? `<${msg.media_type === 'video' ? 'video' : 'audio'} controls preload="none" src="${escapeHtml(msg.media_url)}"></${msg.media_type === 'video' ? 'video' : 'audio'}>`
    : '';
  const playable = !msg.media_url ? getPlayable(msg.link) : null;
  const thumb = playable?.kind === 'youtube' ? `https://img.youtube.com/vi/${playable.id}/hqdefault.jpg` : '';
  const linkTag = playable
    ? `<button type="button" class="message-play" aria-label="Play ${escapeHtml(msg.title)}"${thumb ? ` style="background-image:url('${thumb}')"` : ''}><span class="message-play-icon">▶</span></button>`
    : (!msg.media_url ? `<div class="message-pending"><span>◉</span><p>Recording will be available here soon.</p></div>` : '');

  card.innerHTML = `
    <div class="message-card-head">
      <span class="message-badge${msg.source === 'live' ? ' is-live' : ''}">${msg.source === 'live' ? 'LIVE RECORDING' : 'SERMON'}</span>
      <time datetime="${msg.created_at}">${formatMessageDate(msg.created_at)}</time>
    </div>
    <h4>${escapeHtml(msg.title)}</h4>
    ${msg.description ? `<p>${escapeHtml(msg.description)}</p>` : ''}
    ${linkTag}
    ${mediaTag}
    <div class="share-actions"><button type="button" class="chip-btn" data-share-msg>Share</button>${safeUrl(msg.notes_url) ? `<a class="chip-btn" href="${escapeHtml(safeUrl(msg.notes_url))}" target="_blank" rel="noopener">Sermon notes</a>` : ''}</div>
    <div class="message-comments">
      <button type="button" class="message-comments-toggle" aria-expanded="false">
        💬 <span class="comment-count">${(msg.comments || []).length}</span> Comment${(msg.comments || []).length === 1 ? '' : 's'}
      </button>
      <div class="message-comments-body" hidden>
        <ul class="comment-list"></ul>
        <form class="comment-form">
          <input name="name" placeholder="Your name" required maxlength="80" autocomplete="name">
          <textarea name="comment" placeholder="Leave a comment…" required maxlength="1000" rows="2"></textarea>
          <button class="btn btn-dark btn-sm" type="submit">Post comment</button>
          <p class="form-note" role="status"></p>
        </form>
      </div>
    </div>`;

  $('[data-share-msg]', card)?.addEventListener('click', () => {
    shareContent(msg.title, `${msg.title} | Prayer Army International`, `${SITE_ORIGIN}/?m=${msg.id}#sermons`);
  });

  const playBtn = $('.message-play', card);
  if (playBtn) playBtn.addEventListener('click', () => {
    track('sermon_play', msg.title);
    const el = buildPlayerEl(playable);
    const wrap = document.createElement('div');
    wrap.className = 'message-embed sp-' + playable.kind;
    wrap.appendChild(el);
    playBtn.replaceWith(wrap);
  });

  const toggle = $('.message-comments-toggle', card);
  const body = $('.message-comments-body', card);
  const commentList = $('.comment-list', card);
  renderComments(commentList, msg.comments || []);

  toggle.addEventListener('click', () => {
    const open = body.hidden;
    body.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
  });

  const form = $('.comment-form', card);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const name = String(fd.get('name') || '').trim();
    const comment = String(fd.get('comment') || '').trim();
    const note = $('.form-note', form);
    const submitBtn = $('button[type=submit]', form);
    if (!name || !comment) return;
    submitBtn.disabled = true;
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/message_comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          Prefer: 'return=representation'
        },
        body: JSON.stringify({ message_id: msg.id, name, comment })
      });
      if (!res.ok) throw new Error(await failMessage(res, 'Could not post your comment. Please try again.'));
      const [saved] = await res.json();
      msg.comments = [...(msg.comments || []), saved];
      renderComments(commentList, msg.comments);
      $('.comment-count', card).textContent = msg.comments.length;
      form.reset();
      note.textContent = 'Comment posted — thank you!';
      note.className = 'form-note ok';
    } catch (err) {
      note.textContent = err instanceof Error && err.message ? err.message : 'Could not post your comment. Please try again.';
      note.className = 'form-note err';
    }
    submitBtn.disabled = false;
  });

  return card;
};

const loadMessages = async () => {
  if (!messagesList) return;
  try {
    const [msgRes, commentRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/messages?select=*&order=created_at.desc&limit=200`, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }
      }),
      fetch(`${SUPABASE_URL}/rest/v1/message_comments?select=*&order=created_at.asc`, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }
      })
    ]);
    if (!msgRes.ok) throw 0;
    const messages = await msgRes.json();
    const comments = commentRes.ok ? await commentRes.json() : [];

    const byMessage = {};
    comments.forEach((c) => { (byMessage[c.message_id] ||= []).push(c); });
    messages.forEach((m) => { m.comments = byMessage[m.id] || []; });

    messagesList.innerHTML = '';
    if (!messages.length) {
      messagesList.innerHTML = '<p class="messages-empty">No archived sermons yet — they appear here after each live service.</p>';
      return;
    }
    archiveItems = messages.filter((m) => m.media_url || getPlayable(m.link));
    const PAGE = 6;
    let revealUpTo = () => {};
    const renderList = (list) => {
      messagesList.innerHTML = '';
      if (!list.length) {
        messagesList.innerHTML = '<p class="messages-empty">No sermons match your search.</p>';
        revealUpTo = () => {};
        return;
      }
      let shown = 0;
      const more = document.createElement('button');
      more.type = 'button'; more.className = 'btn btn-ghost archive-more';
      const renderMore = () => {
        list.slice(shown, shown + PAGE).forEach((m) => messagesList.insertBefore(buildMessageCard(m), more));
        shown += PAGE;
        if (shown >= list.length) more.remove();
        else more.textContent = `Show more sermons (${list.length - shown})`;
      };
      messagesList.appendChild(more);
      more.addEventListener('click', renderMore);
      renderMore();
      revealUpTo = (idx) => { while (shown <= idx && shown < list.length) renderMore(); };
    };
    renderList(messages);

    const searchInput = $('#messages-search');
    if (searchInput && !searchInput.dataset.bound) {
      searchInput.dataset.bound = '1';
      searchInput.addEventListener('input', () => {
        const q = searchInput.value.trim().toLowerCase();
        renderList(q ? messages.filter((m) => `${m.title} ${m.description || ''}`.toLowerCase().includes(q)) : messages);
      });
    }

    // Shared link: /?m=<id>#sermons opens straight to that sermon
    const wanted = new URLSearchParams(location.search).get('m');
    const wantedIdx = wanted ? messages.findIndex((m) => m.id === wanted) : -1;
    if (wantedIdx > -1) {
      revealUpTo(wantedIdx);
      const target = messagesList.querySelector(`[data-id="${CSS.escape(wanted)}"]`);
      if (target) setTimeout(() => {
        target.classList.add('is-target');
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 400);
    }
  } catch {
    messagesList.innerHTML = '<p class="messages-empty">Could not load sermons right now. Please refresh the page.</p>';
  }
};

loadMessages();

/* =========================================================================
   TESTIMONIES (approved ones are public) + CONNECT FORM + TESTIMONY FORM
   ========================================================================= */
const testimoniesList = $('#testimonies-list');
const loadTestimonies = async () => {
  if (!testimoniesList) return;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/testimonies?select=id,name,location,testimony,created_at&order=created_at.desc&limit=12`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }
    });
    if (!res.ok) throw 0;
    const rows = await res.json();
    if (!rows.length) {
      testimoniesList.innerHTML = '<p class="messages-empty" style="color:var(--soft)">No testimonies yet. Be the first to share what God has done for you.</p>';
      return;
    }
    testimoniesList.innerHTML = rows.map((t) => `
      <figure class="testimony-card">
        <blockquote>${escapeHtml(t.testimony)}</blockquote>
        <figcaption><strong>${escapeHtml(t.name)}</strong>${t.location ? escapeHtml(t.location) : ''}</figcaption>
      </figure>`).join('');
  } catch {
    testimoniesList.innerHTML = '<p class="messages-empty" style="color:var(--soft)">Testimonies could not load right now.</p>';
  }
};
loadTestimonies();

// Shared submit helper for the two public forms (direct, RLS-protected inserts)
const wirePublicForm = (formSel, noteSel, table, toRow, okMessage, after) => {
  const form = $(formSel), note = $(noteSel);
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    if (data.website) { form.reset(); return; } // honeypot: bots fill this, people never see it
    const btn = $('button[type=submit]', form);
    const restore = btn.innerHTML;
    btn.disabled = true; btn.classList.add('loading');
    try {
      const row = toRow(data);
      if (!row) throw new Error('missing');
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, Prefer: 'return=minimal' },
        body: JSON.stringify(row)
      });
      if (!res.ok) throw new Error('S:' + await failMessage(res, 'Sorry, that did not go through. Please try again in a moment.'));
      form.reset();
      note.textContent = okMessage;
      note.className = 'form-note ok';
      if (after) after();
    } catch (err) {
      note.textContent = err.message === 'missing'
        ? 'Please add a phone number or an email so we can reach you.'
        : (String(err.message).startsWith('S:') ? err.message.slice(2) : 'Sorry, that did not go through. Please try again in a moment.');
      note.className = 'form-note err';
    }
    btn.disabled = false; btn.classList.remove('loading'); btn.innerHTML = restore;
  });
};

wirePublicForm('#testimony-form', '#testimony-note', 'testimonies',
  (d) => ({ name: (d.name || '').trim().slice(0, 80), location: (d.location || '').trim().slice(0, 80) || null, testimony: (d.testimony || '').trim().slice(0, 1500) }),
  'Thank you for sharing! Your testimony will appear once it has been reviewed.');

wirePublicForm('#connect-form', '#connect-note', 'connect_requests',
  (d) => {
    const phone = (d.phone || '').trim(), email = (d.email || '').trim();
    if (!phone && !email) return null;
    return { name: (d.name || '').trim().slice(0, 120), phone: phone.slice(0, 40) || null, email: email.slice(0, 160) || null,
      kind: ['visitor', 'volunteer', 'counseling', 'other'].includes(d.kind) ? d.kind : 'visitor', note: (d.note || '').trim().slice(0, 2000) || null };
  },
  'Thank you! Someone from the ministry will be in touch with you soon.',
  () => pixelEvent('Lead', { content_name: 'connect form' }));


// Podcast feed link
$('#copy-podcast-feed')?.addEventListener('click', async () => {
  const feed = `${location.origin}/podcast.xml`;
  try { await navigator.clipboard.writeText(feed); showToast('Podcast feed link copied. Paste it into your podcast app.'); }
  catch { window.prompt('Copy this podcast feed link:', feed); }
});

/* =========================================================================
   PRAYER WALL (approved requests are public; "I prayed" is a +1 counter)
   ========================================================================= */
const wallList = $('#wall-list');
const prayedIds = (() => { try { return new Set(JSON.parse(localStorage.getItem('pai_prayed') || '[]')); } catch { return new Set(); } })();
const loadWall = async () => {
  if (!wallList) return;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/wall_prayers?select=id,name,request,prayed_count&order=created_at.desc&limit=24`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }
    });
    if (!res.ok) throw 0;
    const rows = await res.json();
    if (!rows.length) { wallList.innerHTML = '<p class="messages-empty" style="color:var(--soft)">No requests on the wall yet. Add one below and we will stand with you.</p>'; return; }
    wallList.innerHTML = rows.map((r) => `
      <article class="wall-card" data-id="${escapeHtml(r.id)}">
        <p>${escapeHtml(r.request)}</p>
        <div class="wall-foot">
          <span class="wall-name">${escapeHtml(r.name || 'Anonymous')}</span>
          <button type="button" class="pray-btn" data-id="${escapeHtml(r.id)}" ${prayedIds.has(r.id) ? 'disabled' : ''}>🙏 <span class="pray-label">${prayedIds.has(r.id) ? 'You prayed' : 'I prayed'}</span> · <span class="pray-count">${Number(r.prayed_count) || 0}</span></button>
        </div>
      </article>`).join('');
  } catch {
    wallList.innerHTML = '<p class="messages-empty" style="color:var(--soft)">The prayer wall could not load right now.</p>';
  }
};
wallList?.addEventListener('click', async (e) => {
  const btn = e.target.closest('.pray-btn');
  if (!btn || btn.disabled) return;
  const id = btn.dataset.id;
  btn.disabled = true;
  const countEl = $('.pray-count', btn), labelEl = $('.pray-label', btn);
  const before = Number(countEl.textContent) || 0;
  countEl.textContent = before + 1; labelEl.textContent = 'You prayed';
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/increment_prayed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ p_id: id })
    });
    if (!res.ok) throw 0;
    prayedIds.add(id);
    try { localStorage.setItem('pai_prayed', JSON.stringify([...prayedIds])); } catch {}
  } catch {
    countEl.textContent = before; labelEl.textContent = 'I prayed'; btn.disabled = false;
  }
});
loadWall();

wirePublicForm('#wall-form', '#wall-note', 'wall_prayers',
  (d) => ({ name: (d.name || '').trim().slice(0, 60) || null, request: (d.request || '').trim().slice(0, 400) }),
  'Thank you. Your request will appear on the wall once it has been reviewed. We are praying with you.');

// Giving: count clicks on the payment buttons (event name only, no amounts or details)
document.addEventListener('click', (e) => {
  if (e.target.closest('#give-link-btn, .pay-link')) pixelEvent('GiveClick', {}, true);
});
