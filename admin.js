/* =========================================================================
   PRAYER ARMY INTERNATIONAL - DEDICATED SITE MANAGER CONTROLLER
   ========================================================================= */

// Supabase project backing this admin panel. The anon key is safe to expose --
// every privileged action (save settings, upload/delete media, change passkey)
// goes through an Edge Function that re-checks the passkey server-side against
// the service-role-only admin_config table before touching anything.
const SUPABASE_URL = "https://rftshprvuniszeorgrvd.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmdHNocHJ2dW5pc3plb3JncnZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAyODY0MDAsImV4cCI6MjEwNTg2MjQwMH0.l2avLrx2ftsC7sbS-1F_Z05OShGLoCak-iWcU0YTJos";
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
  }, 3500);
};

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
const authError = $('#auth-error');
const togglePwBtn = $('#toggle-pw-btn');
const btnLogout = $('#btn-logout');

const checkAuthSession = () => {
  const isAuth = (sessionStorage.getItem('pai_manager_authenticated') === 'true' ||
                 localStorage.getItem('pai_manager_authenticated') === 'true') &&
                 getPasskey() !== '';
  if (isAuth) {
    showDashboard();
  } else {
    authScreen.style.display = 'flex';
    adminApp.style.display = 'none';
  }
};

const showDashboard = () => {
  authScreen.style.display = 'none';
  adminApp.style.display = 'flex';
  loadSettings();
  loadMedia();
};

togglePwBtn?.addEventListener('click', () => {
  const isPw = passkeyInput.type === 'password';
  passkeyInput.type = isPw ? 'text' : 'password';
  togglePwBtn.textContent = isPw ? '🔒' : '👁';
});

authForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const passkey = passkeyInput.value.trim();
  authError.textContent = '';
  const submitBtn = $('#btn-auth-submit');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Verifying...';

  try {
    const res = await fetch(`${EDGE_BASE}/verify-passkey`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify({ passkey })
    });

    if (res.ok) {
      sessionStorage.setItem('pai_manager_authenticated', 'true');
      localStorage.setItem('pai_manager_authenticated', 'true');
      setStoredPasskey(passkey);
      showDashboard();
      showToast('Unlocked Site Manager Console', 'success');
    } else {
      const body = await res.json().catch(() => ({}));
      authError.textContent = res.status === 429
        ? (body.error || 'Too many attempts. Please wait before trying again.')
        : 'Incorrect passkey. Please check and try again.';
      passkeyInput.select();
    }
  } catch (err) {
    authError.textContent = 'Could not verify passkey with server.';
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Unlock Console';
  }
});

btnLogout?.addEventListener('click', () => {
  sessionStorage.removeItem('pai_manager_authenticated');
  localStorage.removeItem('pai_manager_authenticated');
  clearStoredPasskey();
  adminApp.style.display = 'none';
  authScreen.style.display = 'flex';
  passkeyInput.value = '';
  showToast('Logged out of Site Manager', 'success');
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

  // Prayer
  $('#field-prayer-eyebrow').value = s.prayer?.eyebrow || '';
  $('#field-prayer-heading').value = s.prayer?.heading || '';
  $('#field-prayer-copy').value = s.prayer?.copy || '';
  $('#field-prayer-email').value = s.prayer?.recipientEmail || '';
  $('#field-prayer-endpoint').value = s.prayer?.endpoint || '';

  // Announcement Banner
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
      link: $('#field-give-link').value.trim()
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

// File Upload Handler (supports multiple pictures & videos)
const handleFileUpload = async (files) => {
  const formData = new FormData();
  let count = 0;
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    if (f.type.startsWith('image/') || f.type.startsWith('video/')) {
      formData.append('files', f);
      count++;
    }
  }

  if (count === 0) {
    showToast('Please select valid image or video files', 'error');
    return;
  }

  formData.append('passkey', getPasskey());

  uploadProgressBox.style.display = 'block';
  uploadStatusText.textContent = `Uploading ${count} file(s)...`;
  uploadPercentText.textContent = '10%';
  uploadProgressFill.style.width = '10%';

  try {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${EDGE_BASE}/upload-media`);
    xhr.setRequestHeader('apikey', SUPABASE_ANON_KEY);

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
        showToast('Upload failed. Check file size or format.', 'error');
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

// Load Media Files (bundled church photos + Supabase Storage uploads)
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

    // 2. Admin-uploaded media in the Supabase Storage bucket
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
        media.push({
          filename: obj.name,
          url: `${SUPABASE_URL}/storage/v1/object/public/media/${obj.name}`,
          type: isVideo ? 'video' : 'image',
          size: obj.metadata?.size || 0,
          isUpload: true
        });
      }
    }

    allMedia = media;
    renderMediaGrid();
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
  
  let filtered = allMedia;
  if (currentMediaFilter === 'upload') {
    filtered = allMedia.filter(m => m.isUpload);
  } else if (currentMediaFilter === 'image') {
    filtered = allMedia.filter(m => m.type === 'image');
  } else if (currentMediaFilter === 'video') {
    filtered = allMedia.filter(m => m.type === 'video');
  }

  mediaCount.textContent = filtered.length;

  if (filtered.length === 0) {
    mediaGridContainer.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-muted)">No media files found in this category. Use the uploader above to add files.</div>';
    return;
  }

  mediaGridContainer.innerHTML = filtered.map(item => {
    const isVideo = item.type === 'video';
    return `
      <div class="media-card">
        <div class="media-thumb-wrap">
          ${isVideo 
            ? `<video src="${item.url}" preload="metadata" muted playsinline></video>`
            : `<img src="${item.url}" alt="${item.filename}" loading="lazy">`
          }
          <span class="media-type-badge ${isVideo ? 'video' : ''}">${isVideo ? 'VIDEO' : 'PHOTO'}</span>
        </div>
        <div class="media-info">
          <div class="media-filename" title="${item.filename}">${item.filename}</div>
          <div class="media-size">${formatBytes(item.size)} • ${item.isUpload ? 'Uploaded' : 'Church Asset'}</div>
          
          <div class="media-actions">
            <button type="button" class="btn-media-action btn-copy-url" data-url="${item.url}">
              📋 Copy Link
            </button>
            <div class="media-btn-row">
              <button type="button" class="btn-media-action btn-set-hero" data-url="${item.url}">
                ⚡ Hero
              </button>
              ${!isVideo ? `
                <button type="button" class="btn-media-action btn-set-logo" data-url="${item.url}">
                  🖼 Logo
                </button>
                <button type="button" class="btn-media-action btn-set-faith" data-url="${item.url}">
                  ✝ Faith
                </button>
              ` : ''}
              ${isVideo ? `
                <button type="button" class="btn-media-action btn-set-stream" data-url="${item.url}">
                  📡 Stream
                </button>
              ` : `
                <button type="button" class="btn-media-action btn-set-sermon" data-url="${item.url}">
                  📖 Sermon
                </button>
              `}
              ${item.isUpload ? `
                <button type="button" class="btn-media-action delete btn-del-media" data-filename="${item.filename}">
                  🗑
                </button>
              ` : ''}
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
      if (confirm(`Are you sure you want to delete ${filename}?`)) {
        try {
          const res = await fetch(`${EDGE_BASE}/delete-media`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
            body: JSON.stringify({ passkey: getPasskey(), filename })
          });
          if (res.ok) {
            showToast('Media file deleted', 'success');
            loadMedia();
          } else {
            showToast('Failed to delete file', 'error');
          }
        } catch {
          showToast('Error deleting file', 'error');
        }
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
          setStoredPasskey(newPasskey);
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

// Run initialization
checkAuthSession();
