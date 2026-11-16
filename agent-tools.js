/* WebMCP: exposes this site's public information to in-browser AI agents (navigator.modelContext).
   Read-only tools plus two safe navigation helpers. Everything is fetched from the site's own API, so the
   answers always match what the admin has published. Forms are also annotated (toolname / tooldescription). */
(() => {
  'use strict';
  const mc = navigator.modelContext;
  if (!mc) return;
  const api = '/api';
  const j = async (url, init) => { const r = await fetch(url, init); if (!r.ok) throw new Error('Request failed: ' + r.status); return r.json(); };
  const settings = async () => (await j(`${api}/rest/v1/site_settings?select=data&id=eq.1`))?.[0]?.data || {};
  const reply = (obj) => ({ content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }] });
  const clip = (v) => String(v ?? '').replace(/\*\*|\[\[|\]\]|\{\{\w+\}\}/g, '').trim();
  const SECTIONS = ['about', 'foundation', 'sermons', 'live', 'events', 'gallery', 'prayer', 'prayer-wall', 'testimonies', 'connect', 'give', 'contact'];

  const tools = [
    {
      name: 'get_organization_info',
      description: 'Name, slogan, region, founder, address, phone, email and social profiles of the church.',
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: true },
      execute: async () => {
        const s = await settings();
        return reply({ name: clip(s.general?.churchName), slogan: clip(s.general?.slogan), region: clip(s.general?.region), founder: clip(s.general?.founder),
          address: clip(s.contact?.address), phone: s.contact?.phone || '', email: s.contact?.email || '',
          profiles: Object.fromEntries(Object.entries(s.social || {}).filter(([k, v]) => v && /^https?:/.test(v) && k !== 'whatsapp')), website: location.origin + '/' });
      }
    },
    {
      name: 'search_site',
      description: 'Search sermons, events, announcements and ministry information on this website.',
      inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'Words to search for (2+ characters)' } }, required: ['query'] },
      annotations: { readOnlyHint: true },
      execute: async ({ query }) => reply(await j(`${api}/search?q=${encodeURIComponent(String(query || '').slice(0, 80))}`))
    },
    {
      name: 'list_sermons',
      description: 'Latest sermons and messages, newest first.',
      inputSchema: { type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 50, description: 'How many to return (default 10)' } } },
      annotations: { readOnlyHint: true },
      execute: async ({ limit } = {}) => {
        const rows = await j(`${api}/rest/v1/messages?select=*&order=created_at.desc&limit=${Math.max(1, Math.min(50, Number(limit) || 10))}`);
        return reply(rows.map((m) => ({ title: m.title, description: m.description, date: String(m.created_at).slice(0, 10), url: `${location.origin}/?m=${m.id}`, watchUrl: m.link || null, mediaUrl: m.media_url || null })));
      }
    },
    {
      name: 'get_events_and_services',
      description: 'Upcoming events and the weekly schedule of services and activities.',
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: true },
      execute: async () => {
        const s = await settings();
        const events = [s.event, ...(Array.isArray(s.events) ? s.events : [])].filter((e) => e && e.title && e.published !== false);
        return reply({ events: events.map((e) => ({ title: clip(e.title), dates: clip(e.dates), start: e.start || null, end: e.end || null, description: clip(e.description), link: e.link || `${location.origin}/#events` })),
          weekly: (Array.isArray(s.weekly) ? s.weekly : []).filter((w) => w && w.title).map((w) => ({ title: clip(w.title), day: w.day || '', time: w.time || '', location: w.location || '' })) });
      }
    },
    {
      name: 'go_to_section',
      description: 'Scroll the page to a section (or open it from another page): ' + SECTIONS.join(', ') + '.',
      inputSchema: { type: 'object', properties: { section: { type: 'string', enum: SECTIONS } }, required: ['section'] },
      execute: async ({ section }) => {
        if (!SECTIONS.includes(section)) throw new Error('Unknown section');
        const el = document.getElementById(section);
        if (el) { el.scrollIntoView({ behavior: 'smooth' }); history.replaceState(null, '', '#' + section); } else location.href = `/#${section}`;
        return reply({ ok: true, section });
      }
    },
    {
      name: 'open_prayer_request_form',
      description: 'Bring the prayer request form into view so the visitor can write and send their own request. Does not submit anything.',
      inputSchema: { type: 'object', properties: {} },
      execute: async () => {
        const f = document.getElementById('prayer-form');
        if (!f) { location.href = '/#prayer'; return reply({ ok: true, navigated: true }); }
        f.scrollIntoView({ behavior: 'smooth', block: 'center' }); f.querySelector('input,textarea')?.focus({ preventScroll: true });
        return reply({ ok: true });
      }
    }
  ];

  const register = () => {
    try {
      if (typeof mc.registerTool === 'function') tools.forEach((t) => { try { mc.registerTool(t); } catch (e) { console.debug('WebMCP tool skipped', t.name, e); } });
      else if (typeof mc.provideContext === 'function') mc.provideContext({ tools });
    } catch (e) { console.debug('WebMCP unavailable', e); }
  };
  register();
})();
