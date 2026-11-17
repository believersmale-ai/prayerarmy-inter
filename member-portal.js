(() => {
  "use strict";
  const $ = (s) => document.querySelector(s),
    esc = (v) =>
      String(v ?? "").replace(
        /[&<>"']/g,
        (c) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          })[c],
      );
  const date = (v) =>
    new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(v));
  let account = null,
    request = 0,
    serverOffset = 0,
    timer;
  const selected = new URLSearchParams(location.search).get("session");
  const message = (text) => {
    $("#member-message").textContent = text;
    $("#member-message").hidden = !text;
  };
  const signedOut = (text = "") => {
    request++;
    account = null;
    clearTimeout(timer);
    $("#member-content").replaceChildren();
    $("#member-content").setAttribute("aria-busy", "false");
    $("#member-login").hidden = false;
    $("#member-logout").hidden = true;
    $("#member-refresh").hidden = true;
    message(text);
  };
  async function api(path, method = "GET", body) {
    const r = await fetch("/api/public" + path, {
        method,
        credentials: "same-origin",
        cache: "no-store",
        headers: body ? { "Content-Type": "application/json" } : {},
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
      d = await r.json().catch(() => ({}));
    if (!r.ok) {
      const e = new Error(
        d.error ||
          d.message ||
          "This request could not be completed. Please try again.",
      );
      e.status = r.status;
      if (r.status === 401)
        signedOut("Your member session has ended. Sign in again.");
      throw e;
    }
    return d;
  }
  async function load() {
    clearTimeout(timer);
    const token = ++request;
    $("#member-content").setAttribute("aria-busy", "true");
    try {
      const d = await api("/church/dashboard");
      if (token !== request) return;
      $("#member-login").hidden = true;
      $("#member-logout").hidden = false;
      $("#member-refresh").hidden = false;
      account = true;
      message("");
      serverOffset =
        new Date(d.server_time || Date.now()).getTime() - Date.now();
      if (!d.linked) {
        $("#member-content").innerHTML =
          `<article class="member-card"><h2>Let’s connect your account.</h2><p>${esc(d.message)}</p><p class="muted">An usher can help record your attendance while your account is being linked.</p></article>`;
        return;
      }
      const sessions = [...d.sessions].sort(
        (a, b) => Number(b.id === selected) - Number(a.id === selected),
      );
      $("#member-content").innerHTML =
        `<h2>Hello, ${esc(d.member.name)}.</h2><p class="muted">Upcoming services · ${esc(Intl.DateTimeFormat().resolvedOptions().timeZone)}</p>${d.has_more ? '<p class="muted">Showing the next 100 services offering member check-in.</p>' : ""}${sessions.length ? `<div class="member-services">${sessions.map((s) => `<article class="member-card" data-service="${s.id}"><div><p class="eyebrow">${s.window_open ? "CHECK-IN WINDOW OPEN" : "SCHEDULED SERVICE"}</p><h2>${esc(s.title)}</h2><p class="muted">${esc(s.location || "Ask an usher for location details")}</p></div><dl><div><dt>Service starts</dt><dd>${esc(date(s.starts_at))}</dd></div><div><dt>Member check-in</dt><dd>${esc(date(s.opens_at))} – ${esc(date(s.closes_at))}</dd></div></dl>${s.checked_in ? `<div class="member-receipt" role="status"><strong>✓ You’re checked in.</strong>${s.checked_in_at ? `<br>${esc(date(s.checked_in_at))}` : ""}</div>` : ["absent", "excused"].includes(s.status) ? '<p class="muted">Staff have recorded an attendance mark. Ask an usher if you need it reviewed.</p>' : `<form data-checkin="${s.id}"><label>Code displayed at the service<input name="code" inputmode="text" autocomplete="one-time-code" autocapitalize="characters" spellcheck="false" pattern="[a-fA-F0-9]{8}" minlength="8" maxlength="8" aria-label="Check-in code for ${esc(s.title)}" required ${s.window_open ? "" : "disabled"}></label><p class="error-text" role="alert"></p><button class="button primary" type="submit" ${s.window_open ? "" : "disabled"}>${s.window_open ? "Check me in" : "Check-in opens at " + esc(date(s.opens_at))}</button></form>`}</article>`).join("")}</div>` : '<article class="member-card"><h2>No services offering check-in right now.</h2><p class="muted">Refresh later, or ask an usher to record your attendance.</p></article>'}<section class="member-history"><h2>Your recent attendance</h2>${d.history.length ? `<ul>${d.history.map((h) => `<li><span><strong>${esc(h.title)}</strong><small>${esc(date(h.starts_at))}</small></span><span>${esc({ present: "Present", late: "Late", absent: "Absent", excused: "Excused", unmarked: "Unmarked" }[h.status] || h.status)}</span></li>`).join("")}</ul>` : '<p class="muted">Your attendance history will appear here.</p>'}</section>`;
      for (const form of document.querySelectorAll("[data-checkin]"))
        form.onsubmit = async (e) => {
          e.preventDefault();
          const b = form.querySelector("button"),
            error = form.querySelector(".error-text");
          b.disabled = true;
          error.textContent = "";
          try {
            await api(
              "/church/sessions/" + form.dataset.checkin + "/check-in",
              "POST",
              { code: new FormData(form).get("code") },
            );
            if (token !== request) return;
            await load();
          } catch (e) {
            if (token === request) {
              error.textContent = e.message;
              b.disabled = false;
            }
          }
        };
      clearTimeout(timer);
      const boundaries = d.sessions
        .flatMap((s) => [s.opens_at, s.closes_at])
        .map((v) => new Date(v).getTime() - (Date.now() + serverOffset))
        .filter((n) => n > 0);
      if (boundaries.length)
        timer = setTimeout(
          () => {
            if (account) load();
          },
          Math.min(Math.max(500, Math.min(...boundaries) + 100), 2147483000),
        );
    } catch (e) {
      if (e.status === 401) {
        signedOut();
        return;
      }
      if (token !== request) return;
      if (e.status === 404) {
        signedOut();
        $("#member-login").hidden = true;
        message(
          "Member check-in is not enabled on this installation. An usher can help record your attendance.",
        );
      } else {
        message(e.message);
        $("#member-refresh").hidden = false;
      }
    } finally {
      if (token === request)
        $("#member-content").setAttribute("aria-busy", "false");
    }
  }
  $("#member-login-form").onsubmit = async (e) => {
    e.preventDefault();
    const f = e.currentTarget,
      b = f.querySelector("button");
    b.disabled = true;
    $("#member-login-error").textContent = "";
    try {
      await api("/login", "POST", Object.fromEntries(new FormData(f)));
      f.reset();
      await load();
    } catch (e) {
      $("#member-login-error").textContent =
        e.status === 404
          ? "Member sign-in is not enabled. Please ask a registrar for help."
          : e.message;
    } finally {
      b.disabled = false;
    }
  };
  $("#member-logout").onclick = async () => {
    try {
      await api("/logout", "POST", {});
      signedOut();
    } catch (e) {
      message(e.message);
    }
  };
  $("#member-refresh").onclick = () => load();
  window.addEventListener("online", () => {
    if (account) load();
  });
  window.addEventListener("offline", () =>
    message(
      "You are offline. Reconnect before checking in; an usher can help.",
    ),
  );
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && account) load();
  });
  load();
})();
