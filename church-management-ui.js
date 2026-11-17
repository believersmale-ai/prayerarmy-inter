/* Private staff workspace. All records are fetched from role-checked API endpoints. */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s),
    $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (v) =>
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
  const titles = {
    overview: [
      "A place for every person.",
      "Keep your member records, households and attendance in one place.",
    ],
    members: [
      "Your church community.",
      "Find people, keep contact details current and connect households.",
    ],
    households: [
      "Connected as a family.",
      "Organize households and their primary contacts.",
    ],
    attendance: [
      "Gather. Connect. Keep track.",
      "Create service sessions and maintain an accurate attendance register.",
    ],
    register: [
      "Attendance register",
      "Review attendance marks, then save your changes.",
    ],
    reports: [
      "See the bigger picture.",
      "Review recorded attendance across your services.",
    ],
    groups: [
      "Serving and growing together.",
      "Organize ministries, small groups and their leaders.",
    ],
    group: ["Group roster", "Connect people with a ministry or small group."],
    activity: [
      "A clear record of changes.",
      "See who updated church records and when.",
    ],
  };
  const labels = {
    visitor: "Visitor",
    member: "Member",
    inactive: "Inactive",
    scheduled: "Scheduled",
    open: "Open",
    closed: "Closed",
    cancelled: "Cancelled",
    present: "Present",
    late: "Late",
    excused: "Excused",
    absent: "Absent",
    unmarked: "Unmarked",
  };
  const state = {
    me: null,
    view: "overview",
    page: 1,
    members: { search: "", status: "", archived: false, page: 1 },
    households: { search: "", archived: false, page: 1 },
    sessions: { state: "", page: 1 },
    register: { search: "", mark: "", page: 1 },
    groups: { search: "", kind: "", archived: false, page: 1 },
    group: null,
    groupPage: 1,
    session: null,
    pending: new Map(),
    rows: [],
    member: null,
    household: null,
  };
  let request = 0,
    modalRequest = 0,
    modalDirty = false,
    toastTimer;
  const can = (p) => state.me?.permissions?.includes(p);
  const dateTime = (v) =>
    v
      ? new Intl.DateTimeFormat(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(v))
      : "—";
  const dateLabel = (v) =>
    v
      ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
          new Date(String(v).slice(0, 10) + "T12:00:00"),
        )
      : "—";
  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const localInput = (v) => {
    const d = new Date(v);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };
  const initials = (r) =>
    [r.first_name?.[0], r.last_name?.[0]]
      .filter(Boolean)
      .join("")
      .toUpperCase() || "•";
  const badge = (v) =>
    `<span class="badge ${esc(v || "unmarked")}">${esc(labels[v] || v || "Unmarked")}</span>`;
  const button = (label, action, extra = "", kind = "") =>
    `<button type="button" class="button ${kind}" data-action="${action}" ${extra}>${esc(label)}</button>`;
  const person = (r, click = true) =>
    `<div class="person"><span class="avatar">${esc(initials(r))}</span><div>${click ? `<button type="button" class="text-button" data-action="member" data-id="${esc(r.id)}">${esc(r.name)}</button>` : `<strong>${esc(r.name)}</strong>`}${r.preferred_name ? `<small>${esc([r.first_name, r.last_name].filter(Boolean).join(" "))}</small>` : ""}</div></div>`;
  const empty = (title, body, action = "") =>
    `<div class="empty"><span class="empty-symbol" aria-hidden="true">⌂</span><h3>${esc(title)}</h3><p>${esc(body)}</p>${action}</div>`;
  const metric = (title, value, note = "", icon = "◈") =>
    `<article class="metric"><span class="metric-label">${esc(title)}</span><span class="metric-icon" aria-hidden="true">${icon}</span><strong>${esc(Number(value || 0).toLocaleString())}</strong>${note ? `<small>${esc(note)}</small>` : ""}</article>`;
  const toast = (message) => {
    const el = $("#toast");
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.hidden = true;
    }, 5000);
  };
  function signedOut(message = "") {
    $("#church-app").hidden = true;
    $("#church-login").hidden = false;
    $("#page-content").replaceChildren();
    $("#dialog-body").replaceChildren();
    $("#staff-name").textContent = "";
    $("#page-title").textContent = "Church management";
    $("#page-description").textContent = "";
    $("#church-status").textContent = "";
    $("#church-status").hidden = true;
    $("#toast").textContent = "";
    $("#toast").hidden = true;
    state.page = 1;
    state.me = null;
    state.group = null;
    state.groups = { search: "", kind: "", archived: false, page: 1 };
    state.groupPage = 1;
    state.pending.clear();
    state.member = null;
    state.household = null;
    state.session = null;
    state.rows = [];
    state.members = { search: "", status: "", archived: false, page: 1 };
    state.households = { search: "", archived: false, page: 1 };
    state.sessions = { state: "", page: 1 };
    modalDirty = false;
    request++;
    modalRequest++;
    $("#login-error").textContent = message;
    if ($("#edit-dialog").open) $("#edit-dialog").close();
  }
  async function responseError(r) {
    const body = await r.json().catch(() => ({}));
    const error = new Error(
      body.message || body.error || `Request failed (${r.status})`,
    );
    error.status = r.status;
    if (r.status === 401) signedOut("Your session has ended. Sign in again.");
    throw error;
  }
  async function api(path, options = {}) {
    const { body, ...rest } = options;
    const url = path.startsWith("/api/") ? path : "/api/church" + path;
    const r = await fetch(url, {
      credentials: "same-origin",
      ...rest,
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...rest.headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!r.ok) return responseError(r);
    return r.json();
  }
  async function download(path, name) {
    const r = await fetch("/api/church" + path, { credentials: "same-origin" });
    if (!r.ok) return responseError(r);
    const url = URL.createObjectURL(await r.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function status(message) {
    const e = $("#church-status");
    e.textContent = message;
    e.hidden = !message;
  }
  function pagination(data) {
    const pages = Math.max(1, Math.ceil(data.total / data.limit)),
      start = data.total ? (data.page - 1) * data.limit + 1 : 0,
      end = Math.min(data.total, data.page * data.limit);
    return `<div class="pagination"><span>${start}–${end} of ${Number(data.total).toLocaleString()}</span><div class="actions">${button("← Previous", "page", `data-step="-1" ${data.page <= 1 ? "disabled" : ""}`, "small")}<span>${data.page} / ${pages}</span>${button("Next →", "page", `data-step="1" ${data.page >= pages ? "disabled" : ""}`, "small")}</div></div>`;
  }
  function permissionUI() {
    const me = state.me;
    $("#staff-name").textContent =
      (me.name || me.email) +
      " · " +
      ({
        owner: "System admin",
        care: "Pastoral care",
        registrar: "Registrar",
        usher: "Usher",
      }[me.role] || me.role);
    $$("[data-permission]").forEach((e) => {
      e.hidden = !can(e.dataset.permission);
    });
  }
  function modal(title, html) {
    modalRequest++;
    modalDirty = false;
    $("#dialog-title").textContent = title;
    $("#dialog-body").innerHTML = html;
    if (!$("#edit-dialog").open) $("#edit-dialog").showModal();
  }
  function closeModal() {
    if (modalDirty && !confirm("Discard the unsaved changes in this form?"))
      return;
    modalDirty = false;
    modalRequest++;
    $("#edit-dialog").close();
  }
  $("#dialog-close").addEventListener("click", closeModal);
  $("#edit-dialog").addEventListener("cancel", (e) => {
    if (modalDirty && !confirm("Discard the unsaved changes in this form?"))
      e.preventDefault();
    else {
      modalDirty = false;
      modalRequest++;
    }
  });
  $("#dialog-body").addEventListener("input", (e) => {
    if (e.target.closest("form")) modalDirty = true;
  });
  function actionsFor(view) {
    if (view === "groups")
      return button("+ Add group", "new-group", "", "primary");
    if (view === "group") return button("← All groups", "groups");
    if (view === "members")
      return `${button("↓ Export", "export-members")}${button("Import CSV", "import-members")}${button("+ Add member", "new-member", "", "primary")}`;
    if (view === "households")
      return button("+ Add household", "new-household", "", "primary");
    if (view === "attendance" && can("attendance_manage"))
      return button("+ New session", "new-session", "", "primary");
    if (view === "register") return button("← All sessions", "attendance");
    return view === "overview" && can("members")
      ? button("+ Add member", "new-member", "", "primary")
      : "";
  }
  async function navigate(view) {
    if (state.pending.size && !confirm("Discard unsaved attendance marks?"))
      return;
    state.pending.clear();
    state.view = view;
    request++;
    status("");
    const [title, description] = titles[view];
    $("#breadcrumb").textContent =
      view === "register"
        ? "Attendance"
        : view[0].toUpperCase() + view.slice(1);
    $("#page-title").textContent = title;
    $("#page-description").textContent = description;
    $("#page-actions").innerHTML = actionsFor(view);
    $$("#church-nav [data-view]").forEach((b) => {
      const selected =
        b.dataset.view ===
        (view === "register"
          ? "attendance"
          : view === "group"
            ? "groups"
            : view);
      b.classList.toggle("active", selected);
      if (selected) b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
    });
    $("#page-content").innerHTML =
      '<div class="loading">Loading records…</div>';
    $("#page-content").setAttribute("aria-busy", "true");
    try {
      if (view === "overview") await overview();
      else if (view === "members") await members();
      else if (view === "households") await households();
      else if (view === "attendance") await sessions();
      else if (view === "reports") await reports();
      else if (view === "activity") await activity();
      else if (view === "groups") await groups();
      else if (view === "group") await groupDetail();
    } catch (e) {
      if (state.me) {
        status(e.message);
        $("#page-content").innerHTML = empty(
          "Could not load records",
          "Please try again when your connection is available.",
          button("Try again", "retry"),
        );
      }
    } finally {
      $("#page-content").setAttribute("aria-busy", "false");
    }
  }
  async function refresh() {
    if (state.view === "groups") return groupRows();
    if (state.view === "group") return groupDetail();
    if (!state.me) return;
    if (state.view === "members") return memberRows();
    if (state.view === "households") return householdRows();
    if (state.view === "register") return registerRows();
    return navigate(state.view);
  }
  async function overview() {
    const token = request,
      data = await api("/overview");
    if (token !== request) return;
    const m = data.members || {},
      s = data.sessions || [];
    let html = "";
    if (can("members"))
      html += `<div class="metrics">${metric("People in the directory", m.total, "Current records", "♙")}${metric("Church members", m.members, "Membership recorded by staff", "◈")}${metric("Visitors", m.visitors, "People getting connected", "↗")}${metric("Households", data.households, "Families and shared homes", "⌂")}</div>`;
    html += `<div class="welcome-note"><div><h2>Care begins with knowing people.</h2><p class="muted">${can("members") ? "Keep your directory current, connect people to households, and record attendance when your church gathers." : "Open a service register to check people in and save attendance marks."}</p></div>${can("attendance") ? button("View attendance →", "attendance", "", "gold") : ""}</div><div class="two-column">`;
    if (can("members"))
      html += `<article class="card"><div class="card-heading"><div><h3>Recently added people</h3><p class="muted">The latest records in your directory</p></div>${button("View all", "members", "", "small")}</div>${data.recentMembers?.length ? `<div class="record-list">${data.recentMembers.map((r) => `<div class="record-row">${person(r)}${badge(r.membership_status)}</div>`).join("")}</div>` : empty("Start your directory", "Add your first member, or import an existing member list.", button("Add a member", "new-member", "", "primary"))}</article>`;
    if (can("attendance"))
      html += `<article class="card"><div class="card-heading"><div><h3>Service attendance</h3><p class="muted">Your most recent sessions</p></div>${button("View all", "attendance", "", "small")}</div>${s.length ? `<div class="record-list">${s.map(sessionRow).join("")}</div>` : empty("Your first gathering", "Create a service session, open its register, and start recording attendance.", can("attendance_manage") ? button("Create a session", "new-session", "", "primary") : "")}</article>`;
    html += "</div>";
    $("#page-content").innerHTML = html;
  }
  function sessionRow(s) {
    const d = new Date(s.starts_at);
    return `<div class="record-row"><span class="service-date">${d.getDate()}<small>${esc(new Intl.DateTimeFormat(undefined, { month: "short" }).format(d))}</small></span><div class="service-title"><button class="text-button" type="button" data-action="register" data-id="${s.id}">${esc(s.title)}</button><p class="muted">${esc(dateTime(s.starts_at))}</p></div>${badge(s.state)}</div>`;
  }
  async function members() {
    $("#page-content").innerHTML =
      `<article class="card"><div class="toolbar"><label class="search"><span hidden>Search members</span><input id="member-search" type="search" value="${esc(state.members.search)}" placeholder="Search name, phone, email or household"></label><select id="member-status" aria-label="Membership status"><option value="">All statuses</option>${["member", "visitor", "inactive"].map((v) => `<option value="${v}" ${state.members.status === v ? "selected" : ""}>${labels[v]}</option>`).join("")}</select><select id="member-archived" aria-label="Archived members"><option value="false">Current records</option><option value="true" ${state.members.archived ? "selected" : ""}>Archived records</option></select></div><div id="members-table"></div></article>`;
    $("#member-search").addEventListener(
      "input",
      debounce(() => {
        state.members.search = $("#member-search").value;
        state.members.page = 1;
        memberRows().catch((e) => status(e.message));
      }),
    );
    $("#member-status").onchange = () => {
      state.members.status = $("#member-status").value;
      state.members.page = 1;
      memberRows().catch((e) => status(e.message));
    };
    $("#member-archived").onchange = () => {
      state.members.archived = $("#member-archived").value === "true";
      state.members.page = 1;
      memberRows().catch((e) => status(e.message));
    };
    await memberRows();
  }
  function memberQuery() {
    return new URLSearchParams({
      search: state.members.search,
      status: state.members.status,
      archived: String(state.members.archived),
      page: state.members.page,
      limit: 25,
    }).toString();
  }
  async function memberRows() {
    const token = ++request,
      data = await api("/members?" + memberQuery());
    if (token !== request || state.view !== "members") return;
    $("#members-table").innerHTML = data.members.length
      ? `<div class="table-scroll"><table><thead><tr><th>Person</th><th>Contact</th><th>Household</th><th>Status</th><th>Added</th><th></th></tr></thead><tbody>${data.members.map((r) => `<tr><td>${person(r)}</td><td>${esc(r.phone || r.email || "—")}${r.phone && r.email ? `<small>${esc(r.email)}</small>` : ""}</td><td>${r.household_id ? `<button type="button" class="text-button" data-action="household" data-id="${r.household_id}">${esc(r.household_name)}</button>` : '<span class="muted">Not assigned</span>'}</td><td>${badge(r.membership_status)}</td><td class="nowrap">${esc(dateLabel(r.joined_date))}</td><td>${button("View →", "member", `data-id="${r.id}"`, "small")}</td></tr>`).join("")}</tbody></table></div>${pagination(data)}`
      : empty(
          "No people found",
          state.members.search || state.members.status
            ? "Try another name or filter."
            : "Add a member or import your existing directory.",
          can("members")
            ? button("Add a member", "new-member", "", "primary")
            : "",
        );
  }
  async function showMember(id) {
    modal("Member profile", '<p class="muted">Loading member…</p>');
    const token = modalRequest;
    const { member: m } = await api("/members/" + id);
    if (token !== modalRequest) return;
    state.member = m;
    $("#dialog-title").textContent = m.name;
    $("#dialog-body").innerHTML =
      `<div class="profile-heading"><span class="avatar">${esc(initials(m))}</span><div><h3>${esc([m.first_name, m.last_name].filter(Boolean).join(" "))}</h3><p class="section-caption">${badge(m.membership_status)} ${m.archived_at ? '<span class="badge">Archived</span>' : ""}</p></div></div><dl class="profile-details"><div><dt>Email</dt><dd>${esc(m.email || "Not recorded")}</dd></div><div><dt>Phone</dt><dd>${esc(m.phone || "Not recorded")}</dd></div><div><dt>Birth date</dt><dd>${esc(dateLabel(m.birth_date))}</dd></div><div><dt>Join date</dt><dd>${esc(dateLabel(m.joined_date))}</dd></div><div><dt>Household</dt><dd>${esc(m.household_name || "Not assigned")}${m.relationship ? ` · ${esc(m.relationship)}` : ""}</dd></div><div><dt>Registered account</dt><dd>${m.account_id ? "Linked to a registered account" : "Not linked"}</dd></div></dl><div class="detail-actions">${button("Edit record", "edit-member", `data-id="${m.id}"`, "primary")}${button("Attendance history", "member-history", `data-id="${m.id}"`)}${!m.archived_at ? button(m.account_id ? "Unlink account" : "Link account", "link-account", `data-id="${m.id}"`) : ""}${button(m.archived_at ? "Restore record" : "Archive record", "archive-member", `data-id="${m.id}"`, m.archived_at ? "" : "danger")}</div><div id="member-history"></div>`;
  }
  function field(label, name, value = "", type = "text", extra = "") {
    return `<label>${esc(label)}<input type="${type}" name="${name}" value="${esc(value)}" ${extra}></label>`;
  }
  async function memberForm(record = null) {
    modal(
      record ? "Edit member" : "Add a member",
      '<p class="muted">Loading form…</p>',
    );
    const token = modalRequest;
    const homes = await api("/households?limit=100");
    if (token !== modalRequest) return;
    const r = record || {};
    $("#dialog-body").innerHTML =
      `<form id="member-form"><div class="form-grid">${field("First name *", "first_name", r.first_name, "text", 'required maxlength="120" autocomplete="given-name"')}${field("Last name", "last_name", r.last_name, "text", 'maxlength="120" autocomplete="family-name"')}${field("Preferred first name", "preferred_name", r.preferred_name, "text", 'maxlength="120"')}${field("Email", "email", r.email, "email", 'maxlength="190" autocomplete="email"')}${field("Phone", "phone", r.phone, "tel", 'maxlength="40" autocomplete="tel"')}${field("Birth date", "birth_date", r.birth_date, "date", `max="${today()}"`)}${field("Join date *", "joined_date", r.joined_date || today(), "date", "required")}<label>Membership status<select name="membership_status">${["visitor", "member", "inactive"].map((v) => `<option value="${v}" ${(r.membership_status || "visitor") === v ? "selected" : ""}>${labels[v]}</option>`).join("")}</select></label><label>Find household<input id="household-search" type="search" placeholder="Search household names"><select name="household_id" id="household-picker"><option value="">No household</option>${homeOptions(homes.households, r)}</select></label>${field("Relationship in household", "relationship", r.relationship, "text", 'maxlength="50" placeholder="e.g. Primary contact, spouse, child"')}</div><p id="form-error" class="error-text" role="alert"></p><div class="form-actions">${button("Cancel", "close-dialog")}<button class="button primary" type="submit">${record ? "Save member" : "Add member"}</button></div></form>`;
    let currentHomes = homes.households;
    $("#household-search").addEventListener(
      "input",
      debounce(async () => {
        try {
          const picker = $("#household-picker"),
            search = $("#household-search");
          if (!picker || !search) return;
          const selected = picker.value;
          const d = await api(
            "/households?limit=100&search=" + encodeURIComponent(search.value),
          );
          if (!$("#household-picker")) return;
          currentHomes = d.households;
          $("#household-picker").innerHTML =
            '<option value="">No household</option>' +
            homeOptions(d.households, {
              household_id: selected,
              household_name: r.household_name,
            });
        } catch (e) {
          const errorEl = $("#form-error");
          if (errorEl) errorEl.textContent = e.message;
        }
      }),
    );
    $("#member-form").onsubmit = async (e) => {
      e.preventDefault();
      const form = e.currentTarget,
        submit = $("button[type=submit]", form);
      submit.disabled = true;
      try {
        const body = Object.fromEntries(new FormData(form));
        if (record) body.version = record.version;
        const data = await api("/members" + (record ? "/" + record.id : ""), {
          method: record ? "PUT" : "POST",
          body,
        });
        modalDirty = false;
        toast(record ? "Member updated" : "Member added");
        await refresh();
        await showMember(data.member.id);
      } catch (error) {
        if ($("#form-error")) $("#form-error").textContent = error.message;
      } finally {
        submit.disabled = false;
      }
    };
  }
  function homeOptions(homes, member) {
    const all = [...homes];
    if (member.household_id && !all.some((h) => h.id === member.household_id))
      all.unshift({
        id: member.household_id,
        name: member.household_name || "Selected household",
      });
    return all
      .map(
        (h) =>
          `<option value="${h.id}" ${member.household_id === h.id ? "selected" : ""}>${esc(h.name)}</option>`,
      )
      .join("");
  }
  async function households() {
    $("#page-content").innerHTML =
      `<article class="card"><div class="toolbar"><label class="search"><span hidden>Search households</span><input id="household-filter" type="search" value="${esc(state.households.search)}" placeholder="Search households"></label><select id="household-archived" aria-label="Archived households"><option value="false">Current households</option><option value="true" ${state.households.archived ? "selected" : ""}>Archived households</option></select></div><div id="households-table"></div></article>`;
    $("#household-filter").addEventListener(
      "input",
      debounce(() => {
        state.households.search = $("#household-filter").value;
        state.households.page = 1;
        householdRows().catch((e) => status(e.message));
      }),
    );
    $("#household-archived").onchange = () => {
      state.households.archived = $("#household-archived").value === "true";
      state.households.page = 1;
      householdRows().catch((e) => status(e.message));
    };
    await householdRows();
  }
  async function householdRows() {
    const token = ++request,
      data = await api(
        "/households?" +
          new URLSearchParams({
            search: state.households.search,
            archived: state.households.archived,
            page: state.households.page,
            limit: 25,
          }),
      );
    if (token !== request || state.view !== "households") return;
    $("#households-table").innerHTML = data.households.length
      ? `<div class="table-scroll"><table><thead><tr><th>Household</th><th>People</th><th>Primary contact</th><th>Phone / email</th><th></th></tr></thead><tbody>${data.households.map((h) => `<tr><td><button type="button" class="text-button" data-action="household" data-id="${h.id}">${esc(h.name)}</button></td><td>${Number(h.member_count)}</td><td>${esc([h.contact_first_name, h.contact_last_name].filter(Boolean).join(" ") || "Not selected")}</td><td>${esc(h.phone || h.email || "—")}</td><td>${button("View →", "household", `data-id="${h.id}"`, "small")}</td></tr>`).join("")}</tbody></table></div>${pagination(data)}`
      : empty(
          "No households yet",
          "Create a household, then assign people from their member records.",
          button("Add a household", "new-household", "", "primary"),
        );
  }
  async function showHousehold(id) {
    modal("Household", '<p class="muted">Loading household…</p>');
    const token = modalRequest,
      d = await api("/households/" + id);
    if (token !== modalRequest) return;
    state.household = d;
    const h = d.household;
    $("#dialog-title").textContent = h.name;
    $("#dialog-body").innerHTML =
      `${h.archived_at ? '<p class="badge">Archived household</p>' : ""}<dl class="profile-details"><div><dt>Phone</dt><dd>${esc(h.phone || "Not recorded")}</dd></div><div><dt>Email</dt><dd>${esc(h.email || "Not recorded")}</dd></div><div class="span-2"><dt>Address</dt><dd>${esc(h.address || "Not recorded")}</dd></div></dl><div class="detail-actions">${button("Edit household", "edit-household", `data-id="${h.id}"`, "primary")}${button(h.archived_at ? "Restore household" : "Archive household", "archive-household", `data-id="${h.id}"`, h.archived_at ? "" : "danger")}</div><h3>People in this household</h3>${d.members.length ? `<div class="record-list">${d.members.map((m) => `<div class="record-row">${person(m)}<div>${m.id === h.primary_contact_id ? '<span class="badge member">Primary contact</span>' : esc(m.relationship || "")}${m.archived_at ? "<small>Archived</small>" : ""}</div></div>`).join("")}</div>` : empty("No people assigned", "Choose this household when adding or editing a member.")}`;
  }
  function householdForm(data = null) {
    const h = data?.household || {},
      members = (data?.members || []).filter((m) => !m.archived_at);
    modal(
      data ? "Edit household" : "Add a household",
      `<form id="household-form"><div class="form-grid">${field("Household name *", "name", h.name, "text", 'required maxlength="150" placeholder="e.g. Mensah household"')}${field("Phone", "phone", h.phone, "tel", 'maxlength="40"')}${field("Email", "email", h.email, "email", 'maxlength="190"')}<label>Primary contact<select name="primary_contact_id" ${!members.length ? "disabled" : ""}><option value="">Not selected</option>${members.map((m) => `<option value="${m.id}" ${h.primary_contact_id === m.id ? "selected" : ""}>${esc(m.name)}</option>`).join("")}</select>${!members.length ? '<span class="form-help">Assign members to this household before choosing its primary contact.</span>' : ""}</label><label class="span-2">Address<textarea name="address" maxlength="1000">${esc(h.address)}</textarea></label></div><p id="form-error" class="error-text" role="alert"></p><div class="form-actions">${button("Cancel", "close-dialog")}<button class="button primary" type="submit">Save household</button></div></form>`,
    );
    $("#household-form").onsubmit = async (e) => {
      e.preventDefault();
      const form = e.currentTarget,
        submit = $("button[type=submit]", form);
      submit.disabled = true;
      try {
        const body = Object.fromEntries(new FormData(form));
        if (data) body.version = h.version;
        const saved = await api("/households" + (data ? "/" + h.id : ""), {
          method: data ? "PUT" : "POST",
          body,
        });
        modalDirty = false;
        toast("Household saved");
        await refresh();
        await showHousehold(saved.household.id);
      } catch (error) {
        if ($("#form-error")) $("#form-error").textContent = error.message;
      } finally {
        submit.disabled = false;
      }
    };
  }
  async function sessions() {
    $("#page-content").innerHTML =
      `<article class="card"><div class="toolbar"><h3>Service sessions</h3><select id="session-state-filter" aria-label="Session state"><option value="">All sessions</option>${["open", "scheduled", "closed", "cancelled"].map((v) => `<option value="${v}" ${state.sessions.state === v ? "selected" : ""}>${labels[v]}</option>`).join("")}</select><p class="muted">Open a session to prepare its attendance roster.</p></div><div id="sessions-table"></div></article>`;
    $("#session-state-filter").onchange = () => {
      state.sessions.state = $("#session-state-filter").value;
      state.sessions.page = 1;
      sessionRows().catch((e) => status(e.message));
    };
    await sessionRows();
  }
  async function sessionRows() {
    const token = ++request,
      data = await api(
        "/sessions?" +
          new URLSearchParams({
            state: state.sessions.state,
            page: state.sessions.page,
            limit: 25,
          }),
      );
    if (token !== request || state.view !== "attendance") return;
    $("#sessions-table").innerHTML = data.sessions.length
      ? `<div class="table-scroll"><table><thead><tr><th>Service / gathering</th><th>Date & time</th><th>Status</th><th>Present + late</th><th>Guests</th><th></th></tr></thead><tbody>${data.sessions.map((s) => `<tr><td><button type="button" class="text-button" data-action="register" data-id="${s.id}">${esc(s.title)}</button><small>${esc(s.location || "")}</small></td><td class="nowrap">${esc(dateTime(s.starts_at))}</td><td>${badge(s.state)}</td><td>${Number(s.present) + Number(s.late)}</td><td>${Number(s.guest_count)}</td><td>${button("Register →", "register", `data-id="${s.id}"`, "small")}</td></tr>`).join("")}</tbody></table></div>${pagination(data)}`
      : empty(
          "Plan your first gathering",
          "Create a service session, then open it when you are ready to record attendance.",
          can("attendance_manage")
            ? button("New session", "new-session", "", "primary")
            : "",
        );
  }
  function sessionForm(record = null) {
    const r = record || {},
      start = new Date();
    if (!record) {
      start.setMinutes(0, 0, 0);
      start.setHours(start.getHours() + 1);
    }
    const end = new Date(start.getTime() + 2 * 3600e3);
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    modal(
      record ? "Edit service session" : "New service session",
      `<form id="session-form"><div class="form-grid">${field("Service / gathering title *", "title", r.title, "text", 'required maxlength="200" placeholder="e.g. Sunday worship service"')}${field("Location", "location", r.location, "text", 'maxlength="200"')}${field("Starts *", "starts_at", record ? localInput(r.starts_at) : localInput(start), "datetime-local", "required")}${field("Ends *", "ends_at", record ? localInput(r.ends_at) : localInput(end), "datetime-local", "required")}${record ? field("Unnamed guests", "guest_count", r.guest_count || 0, "number", 'required min="0" max="100000" step="1"') : ""}<p class="form-help span-2">Times are shown in your local timezone: ${esc(zone)}.${record ? " Guest totals are for attendees who are not already marked in the named register." : ""}</p></div><p id="form-error" class="error-text" role="alert"></p><div class="form-actions">${button("Cancel", "close-dialog")}<button class="button primary" type="submit">${record ? "Save session" : "Create session"}</button></div></form>`,
    );
    $("#session-form").onsubmit = async (e) => {
      e.preventDefault();
      const form = e.currentTarget,
        submit = $("button[type=submit]", form);
      submit.disabled = true;
      try {
        const body = Object.fromEntries(new FormData(form));
        body.starts_at = new Date(body.starts_at).toISOString();
        body.ends_at = new Date(body.ends_at).toISOString();
        if (record) {
          body.version = r.version;
          body.guest_count = Number(body.guest_count);
        }
        const d = await api("/sessions" + (record ? "/" + r.id : ""), {
          method: record ? "PUT" : "POST",
          body,
        });
        modalDirty = false;
        $("#edit-dialog").close();
        toast("Service session saved");
        await openRegister(d.session.id);
      } catch (error) {
        if ($("#form-error")) $("#form-error").textContent = error.message;
      } finally {
        submit.disabled = false;
      }
    };
  }
  async function openRegister(id) {
    if (state.pending.size && !confirm("Discard unsaved attendance marks?"))
      return;
    state.pending.clear();
    state.view = "register";
    state.register = { search: "", mark: "", page: 1 };
    state.session = { id };
    request++;
    status("");
    $("#breadcrumb").textContent = "Attendance";
    $("#page-title").textContent = "Attendance register";
    $("#page-description").textContent =
      "Review attendance marks, then save your changes.";
    $("#page-actions").innerHTML = button("← All sessions", "attendance");
    $$("#church-nav [data-view]").forEach((b) =>
      b.classList.toggle("active", b.dataset.view === "attendance"),
    );
    $("#page-content").innerHTML =
      '<div class="loading">Loading service register…</div>';
    const d = await api("/sessions/" + id);
    if (state.session?.id !== id) return;
    state.session = d.session;
    renderRegister(d.stats);
    await registerRows();
  }
  function statsLine(s) {
    return `<span><strong>${Number(s.present)}</strong> Present</span><span><strong>${Number(s.late)}</strong> Late</span><span>${Number(s.excused)} Excused</span><span>${Number(s.absent)} Absent</span><span>${Number(s.unmarked)} Unmarked</span><span>${Number(s.roster_count)} on roster</span>`;
  }
  function renderRegister(stats) {
    const s = state.session;
    $("#page-title").textContent = s.title;
    $("#page-description").textContent =
      dateTime(s.starts_at) + (s.location ? " · " + s.location : "");
    const manage = can("attendance_manage");
    $("#page-content").innerHTML =
      `<article class="card"><div class="card-heading"><div>${badge(s.state)}<p class="muted">${Number(s.guest_count)} unnamed guests · ${esc(Intl.DateTimeFormat().resolvedOptions().timeZone)}</p></div><div class="actions">${manage ? `${["scheduled", "open"].includes(s.state) ? button("Edit details / guests", "edit-session") : ""}${s.state === "open" ? button("Close register", "set-session-state", 'data-state="closed"', "gold") : button(s.opened_at ? "Reopen register" : "Open register", "set-session-state", 'data-state="open"', "primary")}${s.state !== "cancelled" ? button("Cancel session", "set-session-state", 'data-state="cancelled"', "small danger") : ""}` : ""}</div></div><div class="register-stats" id="register-stats">${statsLine(stats)}</div><div class="toolbar"><label class="search"><span hidden>Find people in register</span><input id="roster-search" type="search" placeholder="Search people or households"></label><select id="roster-status" aria-label="Attendance filter"><option value="">All marks</option>${["unmarked", "present", "late", "excused", "absent"].map((v) => `<option value="${v}">${labels[v]}</option>`).join("")}</select>${manage && s.state === "open" ? button("Add new members to roster", "refresh-roster", "", "small") : ""}</div><div id="roster-table"></div></article>${s.state === "open" ? `<div class="register-actions"><span id="pending-note">No unsaved marks</span><div class="actions">${button("Mark this page present", "mark-page", "", "subtle")}${button("Save attendance", "save-attendance", "disabled", "primary")}</div></div>` : '<p class="section-caption">' + (s.state === "scheduled" ? "Open this session to prepare its roster." : "This register is locked. A registrar can reopen it for corrections.") + "</p>"}`;
    $("#roster-search").addEventListener(
      "input",
      debounce(() => {
        if (!discardMarks()) return;
        state.register.search = $("#roster-search").value;
        state.register.page = 1;
        registerRows().catch((e) => status(e.message));
      }),
    );
    $("#roster-status").onchange = () => {
      if (!discardMarks()) return;
      state.register.mark = $("#roster-status").value;
      state.register.page = 1;
      registerRows().catch((e) => status(e.message));
    };
  }
  function discardMarks() {
    if (
      state.pending.size &&
      !confirm(
        "Discard unsaved attendance marks before changing the register view?",
      )
    )
      return false;
    state.pending.clear();
    return true;
  }
  async function registerRows() {
    const token = ++request,
      id = state.session.id,
      data = await api(
        "/sessions/" +
          id +
          "/roster?" +
          new URLSearchParams({ ...state.register, limit: 25 }),
      );
    if (
      token !== request ||
      state.view !== "register" ||
      state.session.id !== id
    )
      return;
    state.rows = data.roster;
    $("#register-stats").innerHTML = statsLine(data.stats);
    $("#roster-table").innerHTML = data.roster.length
      ? `<div class="table-scroll"><table><thead><tr><th>Person</th><th>Household</th><th>Attendance</th><th>Checked in</th></tr></thead><tbody>${data.roster.map((r) => `<tr><td>${person(r, can("members"))}${r.archived_at ? "<small>Archived record</small>" : ""}</td><td>${esc(r.household_name || "—")}</td><td><select class="attendance-select" data-attendance="${r.id}" aria-label="Attendance for ${esc(r.name)}" ${state.session.state !== "open" || r.archived_at || r.membership_status === "inactive" ? "disabled" : ""}>${["unmarked", "present", "late", "excused", "absent"].map((v) => `<option value="${v}" ${(r.status || "unmarked") === v ? "selected" : ""}>${labels[v]}</option>`).join("")}</select></td><td class="nowrap">${esc(r.checked_in_at ? dateTime(r.checked_in_at) : "—")}</td></tr>`).join("")}</tbody></table></div>${pagination(data)}`
      : empty(
          "No people on this roster",
          state.session.state === "scheduled"
            ? "Open the register to add active directory records."
            : state.register.search
              ? "Try a different name or filter."
              : "Add people to the directory, then refresh this roster.",
        );
    updatePending();
  }
  function updatePending() {
    const note = $("#pending-note");
    if (note)
      note.textContent = state.pending.size
        ? `${state.pending.size} unsaved attendance mark${state.pending.size === 1 ? "" : "s"}`
        : "No unsaved marks";
    const b = $('[data-action="save-attendance"]');
    if (b) b.disabled = !state.pending.size;
  }
  function mark(id, value) {
    const row = state.rows.find((r) => r.id === id);
    if (!row) return;
    if ((row.status || "unmarked") === value) state.pending.delete(id);
    else
      state.pending.set(id, {
        member_id: id,
        status: value,
        record_version: row.record_version,
      });
    updatePending();
  }
  async function reports() {
    const now = today(),
      first = now.slice(0, 8) + "01";
    $("#page-content").innerHTML =
      `<article class="card"><form id="report-form" class="toolbar"><label>From<input name="from" type="date" value="${first}" required></label><label>Through<input name="through" type="date" value="${now}" required></label><button class="button primary" type="submit">Run report</button>${button("↓ Export CSV", "export-report")}${button("Print", "print-report", "", "subtle")}</form><div id="report-results"></div></article>`;
    $("#report-form").onsubmit = (e) => {
      e.preventDefault();
      reportRows().catch((error) => status(error.message));
    };
    await reportRows();
  }
  function reportQuery() {
    const form = $("#report-form");
    const from = new Date(form.elements.from.value + "T00:00:00"),
      last = new Date(form.elements.through.value + "T00:00:00");
    last.setDate(last.getDate() + 1);
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(last.getTime()))
      throw Error("Choose a valid report date range");
    return new URLSearchParams({
      from: from.toISOString(),
      to: last.toISOString(),
    }).toString();
  }
  async function reportRows() {
    const token = ++request,
      data = await api("/reports/attendance?" + reportQuery());
    if (token !== request || state.view !== "reports") return;
    const s = data.summary;
    $("#report-results").innerHTML =
      `<div class="card-content"><p class="muted">Open and closed sessions in your selected date range. Unmarked records are shown separately from absent records.</p><div class="report-metrics">${metric("Recorded attendances", s.totalAttendance, "Present + late + unnamed guests", "✓")}${metric("Service sessions", s.sessions, "Cancelled sessions excluded", "▥")}${metric("Late arrivals", s.late, "Included in attendance totals", "◷")}${metric("Unnamed guests", s.guests, "Recorded by session staff", "↗")}</div></div>${data.sessions.length ? `<div class="table-scroll"><table><thead><tr><th>Service</th><th>Date</th><th>Present</th><th>Late</th><th>Guests</th><th>Excused</th><th>Absent</th><th>Unmarked</th></tr></thead><tbody>${data.sessions.map((r) => `<tr><td>${esc(r.title)}<small>${esc(labels[r.state])}</small></td><td class="nowrap">${esc(dateTime(r.starts_at))}</td>${["present", "late", "guest_count", "excused", "absent", "unmarked"].map((k) => `<td>${Number(r[k])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>` : empty("No sessions in this date range", "Choose another date range, or open a service register to begin recording attendance.")}`;
  }
  const actionLabels = {
    "group.created": "Group created",
    "group.updated": "Group details updated",
    "group.archived": "Group archived",
    "group.restored": "Group restored",
    "group.roster.updated": "Group roster updated",
    "member.create": "Member added",
    "member.update": "Member updated",
    "member.archive": "Member archived",
    "member.restore": "Member restored",
    "member.link_account": "Sign-in account linked",
    "member.unlink_account": "Sign-in account unlinked",
    "household.create": "Household added",
    "household.update": "Household updated",
    "household.archive": "Household archived",
    "household.restore": "Household restored",
    "session.create": "Service session created",
    "session.update": "Service details updated",
    "session.open": "Register opened",
    "session.closed": "Register closed",
    "session.cancelled": "Service cancelled",
    "session.refresh_roster": "Roster refreshed",
    "attendance.mark": "Attendance recorded",
    "members.import": "Member list imported",
    "members.export": "Member directory exported",
    "attendance.export": "Attendance report exported",
  };
  const groupKind = (kind) =>
    kind === "ministry" ? "Ministry" : "Small group";
  async function groups() {
    $("#page-content").innerHTML =
      `<article class="card"><div class="toolbar"><label class="search"><span hidden>Search groups</span><input id="group-search" type="search" placeholder="Search groups" value="${esc(state.groups.search)}"></label><select id="group-kind" aria-label="Group type"><option value="">All types</option><option value="ministry">Ministries</option><option value="small_group">Small groups</option></select><select id="group-archived" aria-label="Archived groups"><option value="false">Current groups</option><option value="true">Archived groups</option></select></div><div id="groups-table"></div></article>`;
    $("#group-kind").value = state.groups.kind;
    $("#group-archived").value = String(state.groups.archived);
    const filter = () => {
      if (state.view !== "groups" || !$("#group-search")) return;
      state.groups.search = $("#group-search").value;
      state.groups.kind = $("#group-kind").value;
      state.groups.archived = $("#group-archived").value === "true";
      state.groups.page = 1;
      return groupRows();
    };
    $("#group-search").oninput = debounce(filter);
    $("#group-kind").onchange = () => filter().catch((e) => status(e.message));
    $("#group-archived").onchange = () =>
      filter().catch((e) => status(e.message));
    await groupRows();
  }
  async function groupRows() {
    const token = ++request,
      q = new URLSearchParams({ ...state.groups, limit: 25 }),
      data = await api("/groups?" + q);
    if (token !== request || !$("#groups-table")) return;
    $("#groups-table").innerHTML = data.groups.length
      ? `<div class="table-scroll"><table><thead><tr><th>Group</th><th>Type</th><th>Current people</th><th>Meeting</th><th></th></tr></thead><tbody>${data.groups.map((g) => `<tr><td><button type="button" class="text-button" data-action="group" data-id="${g.id}">${esc(g.name)}</button><small>${esc(g.location || "")}</small></td><td>${groupKind(g.kind)}</td><td>${g.member_count}</td><td>${esc(g.meeting_details || "Not recorded")}</td><td>${button("Open roster →", "group", `data-id="${g.id}"`, "small")}</td></tr>`).join("")}</tbody></table></div>${pagination(data)}`
      : empty(
          "No groups found",
          "Add a ministry or small group, or adjust your filters.",
        );
  }
  async function groupDetail() {
    const token = ++request,
      data = await api(
        `/groups/${state.group.id}?page=${state.groupPage}&limit=25`,
      );
    if (token !== request || state.view !== "group") return;
    const g = (state.group = data.group);
    $("#page-content").innerHTML =
      `<article class="card"><div class="card-heading"><div><h3>${esc(g.name)}</h3><p class="muted">${groupKind(g.kind)}${g.archived_at ? " · Archived" : ""}</p></div><div class="actions">${!g.archived_at ? button("Edit group", "edit-group") + button("+ Add person", "group-add", "", "primary") : ""}${button(g.archived_at ? "Restore group" : "Archive group", "archive-group")}</div></div><p>${esc(g.description || "No description recorded.")}</p><dl class="profile-details"><div><dt>Location</dt><dd>${esc(g.location || "Not recorded")}</dd></div><div><dt>Meeting details</dt><dd>${esc(g.meeting_details || "Not recorded")}</dd></div></dl><p class="muted">${data.total} people on this roster. Archived member records remain visible; current group counts exclude them. Leader assignments do not grant staff access.</p>${data.members.length ? `<div class="table-scroll"><table><thead><tr><th>Person</th><th>Group role</th><th>Joined group</th><th></th></tr></thead><tbody>${data.members.map((m) => `<tr><td>${person(m)}${m.archived_at ? '<span class="badge">Archived member</span>' : ""}</td><td>${m.role === "leader" ? "Leader" : "Member"}</td><td>${esc(dateTime(m.joined_at))}</td><td><div class="actions">${!g.archived_at ? (!m.archived_at ? button(m.role === "leader" ? "Make member" : "Make leader", "group-role", `data-id="${m.id}" data-role="${m.role === "leader" ? "member" : "leader"}"`, "small") : "") + button("Remove", "group-remove", `data-id="${m.id}"`, "small danger") : ""}</div></td></tr>`).join("")}</tbody></table></div>${pagination(data)}` : empty("Build this group’s roster", "Add people from your existing member directory.")}</article>`;
  }
  function groupForm(record = null) {
    const g = record || {};
    modal(
      record ? "Edit group" : "Add a group",
      `<form id="group-form"><div class="form-grid">${field("Group name *", "name", g.name, "text", 'required maxlength="150"')}<label>Group type<select name="kind"><option value="ministry" ${g.kind === "ministry" ? "selected" : ""}>Ministry</option><option value="small_group" ${g.kind === "small_group" ? "selected" : ""}>Small group</option></select></label>${field("Location", "location", g.location, "text", 'maxlength="200"')}${field("Meeting details", "meeting_details", g.meeting_details, "text", 'maxlength="300" placeholder="e.g. Wednesdays at 18:00"')}<label>Description<textarea name="description" maxlength="2000" rows="4">${esc(g.description || "")}</textarea></label></div><p id="form-error" class="error-text" role="alert"></p><div class="form-actions">${button("Cancel", "close-dialog")}<button type="submit" class="button primary">${record ? "Save group" : "Add group"}</button></div></form>`,
    );
    $("#group-form").onsubmit = async (e) => {
      e.preventDefault();
      const form = e.currentTarget,
        b = $("button[type=submit]", form);
      b.disabled = true;
      try {
        const body = Object.fromEntries(new FormData(form));
        if (record) body.version = g.version;
        const d = await api("/groups" + (record ? "/" + g.id : ""), {
          method: record ? "PUT" : "POST",
          body,
        });
        modalDirty = false;
        closeModal();
        state.group = d.group;
        state.groupPage = 1;
        await navigate("group");
        toast(record ? "Group updated" : "Group added");
      } catch (e) {
        if ($("#form-error")) $("#form-error").textContent = e.message;
      } finally {
        b.disabled = false;
      }
    };
  }
  async function groupAdd() {
    const g = state.group;
    modal(
      "Add a person",
      `<form id="group-find"><label>Search member directory<input id="group-person-search" type="search" maxlength="100" placeholder="Enter a name"></label><button class="button" type="submit">Find people</button></form><form id="group-person-form"><label>Person<select name="member_id" required id="group-person-picker"><option value="">Loading people…</option></select></label><p id="group-picker-note" class="muted"></p><label>Group role<select name="role"><option value="member">Member</option><option value="leader">Leader</option></select></label><p id="form-error" class="error-text" role="alert"></p><div class="form-actions">${button("Cancel", "close-dialog")}<button type="submit" class="button primary">Add to group</button></div></form>`,
    );
    const token = modalRequest;
    let searchRequest = 0;
    const find = async () => {
      const seq = ++searchRequest,
        search = $("#group-person-search").value,
        d = await api(
          "/members?limit=100&search=" + encodeURIComponent(search),
        );
      if (token !== modalRequest || seq !== searchRequest) return;
      $("#group-person-picker").innerHTML =
        '<option value="">Choose a person</option>' +
        d.members
          .map(
            (m) =>
              `<option value="${m.id}">${esc(m.name)}${m.household_name ? " · " + esc(m.household_name) : ""}${m.email || m.phone ? " · " + esc(m.email || m.phone) : ""}</option>`,
          )
          .join("");
      $("#group-picker-note").textContent =
        d.total > 100
          ? "Showing the first 100 matches. Refine the search to find someone else."
          : `${d.total} people found. Existing roster entries will be updated without duplicates.`;
    };
    $("#group-find").onsubmit = async (e) => {
      e.preventDefault();
      try {
        await find();
      } catch (e) {
        if ($("#form-error")) $("#form-error").textContent = e.message;
      }
    };
    $("#group-person-form").onsubmit = async (e) => {
      e.preventDefault();
      const f = e.currentTarget,
        b = $("button[type=submit]", f);
      b.disabled = true;
      try {
        const body = Object.fromEntries(new FormData(f));
        body.version = g.version;
        await api(`/groups/${g.id}/members/${body.member_id}`, {
          method: "PUT",
          body,
        });
        modalDirty = false;
        closeModal();
        await groupDetail();
        toast("Group roster updated");
      } catch (e) {
        if ($("#form-error")) $("#form-error").textContent = e.message;
      } finally {
        b.disabled = false;
      }
    };
    await find();
  }
  async function activity() {
    const token = request,
      data = await api("/activity?page=" + state.page + "&limit=25");
    if (token !== request) return;
    $("#page-content").innerHTML =
      `<article class="card"><div class="card-heading"><div><h3>Record activity</h3><p class="muted">Changes, imports and exports made by staff</p></div></div>${data.activity.length ? data.activity.map((a) => `<div class="activity-item"><span class="activity-dot" aria-hidden="true"></span><div><strong>${esc(actionLabels[a.action] || a.action)}</strong>${a.record_name ? `<p class="muted">${esc(a.record_name)}</p>` : ""}<small>By ${esc(a.actor_name)}</small></div><time datetime="${esc(a.created_at)}">${esc(dateTime(a.created_at))}</time></div>`).join("") + pagination(data) : empty("Activity will appear here", "Changes to members, households and attendance will be recorded as your staff work.")}</article>`;
  }
  function parseCSV(text) {
    text = text.replace(/^\uFEFF/, "");
    const rows = [];
    let row = [],
      field = "",
      quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '"') {
        if (quoted && text[i + 1] === '"') {
          field += '"';
          i++;
        } else if (quoted) quoted = false;
        else if (field === "") quoted = true;
        else throw Error("A quote is in an invalid position in the CSV file");
      } else if (c === "," && !quoted) {
        row.push(field);
        field = "";
      } else if ((c === "\n" || c === "\r") && !quoted) {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field);
        if (row.some((v) => v.trim())) rows.push(row);
        row = [];
        field = "";
      } else field += c;
    }
    if (quoted) throw Error("The CSV contains an unfinished quoted field");
    row.push(field);
    if (row.some((v) => v.trim())) rows.push(row);
    if (rows.length < 2)
      throw Error("Add at least one member row below the column headings");
    if (rows.length > 501) throw Error("Import up to 500 members at a time");
    const headers = rows.shift().map((v) => v.trim().toLowerCase()),
      allowed = [
        "first_name",
        "last_name",
        "preferred_name",
        "email",
        "phone",
        "birth_date",
        "joined_date",
        "membership_status",
      ];
    if (
      !headers.includes("first_name") ||
      new Set(headers).size !== headers.length ||
      headers.some((h) => !allowed.includes(h))
    )
      throw Error(
        "Use the template column headings. First name is required, and column names must be unique.",
      );
    return rows.map((values, i) => {
      if (values.length !== headers.length)
        throw Error(`Row ${i + 2} has the wrong number of columns`);
      return Object.fromEntries(
        headers.map((key, j) => [key, values[j].trim()]),
      );
    });
  }
  function importForm() {
    modal(
      "Import members",
      `<p class="muted">Upload a CSV file with up to 500 people. Preview and validate it before importing. Duplicate names with the same email are flagged for review.</p><p>${button("Download CSV template", "import-template", "", "small")}</p><div class="file-picker"><label>Choose CSV file<input id="import-file" type="file" accept=".csv,text/csv"></label><p class="form-help">Assign household links after importing. The template uses first_name, last_name, email, phone and membership_status.</p></div><p id="import-error" class="error-text" role="alert"></p><div id="import-preview"></div><div class="form-actions">${button("Cancel", "close-dialog")}${button("Import members", "commit-import", "disabled", "primary")}</div>`,
    );
    let prepared = null;
    $("#import-file").onchange = async (e) => {
      prepared = null;
      $("#import-error").textContent = "";
      $('[data-action="commit-import"]').disabled = true;
      try {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 1e6) throw Error("Use a CSV file smaller than 1 MB");
        const parsed = parseCSV(await file.text()),
          d = await api("/members/import/preview", {
            method: "POST",
            body: { rows: parsed },
          });
        prepared = {
          rows: d.rows.map((r) => r.data),
          requestId: crypto.randomUUID(),
        };
        $("#import-preview").innerHTML =
          `<p class="section-caption">${d.validCount} of ${d.rows.length} rows are ready to import.</p><div class="import-preview"><table><thead><tr><th>Row</th><th>Name</th><th>Validation</th></tr></thead><tbody>${d.rows.map((r) => `<tr><td>${r.index + 1}</td><td>${esc(r.data ? [r.data.first_name, r.data.last_name].filter(Boolean).join(" ") : "—")}</td><td>${r.errors.length ? `<span class="danger-note">${esc(r.errors.join("; "))}</span>` : '<span class="badge member">Ready</span>'}</td></tr>`).join("")}</tbody></table></div>`;
        $('[data-action="commit-import"]').disabled = !d.ready;
        modalDirty = d.ready;
      } catch (error) {
        $("#import-error").textContent = error.message;
      }
    };
    $('[data-action="commit-import"]').onclick = async (e) => {
      e.stopPropagation();
      if (!prepared) return;
      const b = e.currentTarget;
      b.disabled = true;
      try {
        const d = await api("/members/import", {
          method: "POST",
          body: prepared,
        });
        modalDirty = false;
        $("#edit-dialog").close();
        toast(`${d.imported} members imported`);
        state.members.page = 1;
        await refresh();
      } catch (error) {
        $("#import-error").textContent = error.message;
        b.disabled = false;
      }
    };
  }
  function debounce(fn, ms = 300) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        Promise.resolve(fn(...args)).catch((error) => status(error.message));
      }, ms);
    };
  }
  async function handle(action, el) {
    if (action === "groups") return navigate("groups");
    if (action === "group") {
      state.group = { id: el.dataset.id };
      state.groupPage = 1;
      return navigate("group");
    }
    if (action === "new-group") return groupForm();
    if (action === "edit-group") return groupForm(state.group);
    if (action === "group-add") return groupAdd();
    if (action === "archive-group") {
      const g = state.group;
      if (
        !confirm(
          g.archived_at
            ? "Restore this group?"
            : "Archive this group? Its roster and history will remain available.",
        )
      )
        return;
      await api(`/groups/${g.id}/archive`, {
        method: "POST",
        body: { version: g.version, archived: !g.archived_at },
      });
      return groupDetail();
    }
    if (action === "group-role" || action === "group-remove") {
      if (
        action === "group-remove" &&
        !confirm("Remove this person from the group roster?")
      )
        return;
      await api(`/groups/${state.group.id}/members/${el.dataset.id}`, {
        method: "PUT",
        body: {
          version: state.group.version,
          role: action === "group-remove" ? "removed" : el.dataset.role,
        },
      });
      return groupDetail();
    }

    if (
      [
        "overview",
        "members",
        "households",
        "attendance",
        "reports",
        "activity",
      ].includes(action)
    )
      return navigate(action);
    if (action === "retry") return navigate(state.view);
    if (action === "close-dialog") return closeModal();
    if (action === "new-member") return memberForm();
    if (action === "member") return showMember(el.dataset.id);
    if (action === "edit-member") return memberForm(state.member);
    if (action === "new-household") return householdForm();
    if (action === "household") return showHousehold(el.dataset.id);
    if (action === "edit-household") return householdForm(state.household);
    if (action === "new-session") return sessionForm();
    if (action === "register") return openRegister(el.dataset.id);
    if (action === "edit-session") return sessionForm(state.session);
    if (action === "export-members")
      return download("/members/export?" + memberQuery(), "church-members.csv");
    if (action === "import-members") return importForm();
    if (action === "export-report")
      return download(
        "/reports/attendance/export?" + reportQuery(),
        "church-attendance.csv",
      );
    if (action === "print-report") return window.print();
    if (action === "import-template") {
      const blob = new Blob(
        ["first_name,last_name,email,phone,membership_status\r\n"],
        { type: "text/csv" },
      );
      const url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = "member-import-template.csv";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return;
    }
    if (action === "page") {
      if (state.view === "register" && !discardMarks()) return;
      const step = Number(el.dataset.step);
      if (state.view === "groups") {
        state.groups.page += step;
        return groupRows();
      }
      if (state.view === "group") {
        state.groupPage += step;
        return groupDetail();
      }
      if (state.view === "members") {
        state.members.page += step;
        return memberRows();
      }
      if (state.view === "households") {
        state.households.page += step;
        return householdRows();
      }
      if (state.view === "attendance") {
        state.sessions.page += step;
        return sessionRows();
      }
      if (state.view === "register") {
        state.register.page += step;
        return registerRows();
      }
      state.page += step;
      return activity();
    }
    if (action === "archive-member") {
      const m = state.member;
      if (
        !confirm(
          m.archived_at
            ? "Restore this member record?"
            : "Archive this member? Their household and attendance history will remain available.",
        )
      )
        return;
      await api("/members/" + m.id + "/archive", {
        method: "POST",
        body: { version: m.version, archived: !m.archived_at },
      });
      toast(m.archived_at ? "Member restored" : "Member archived");
      await refresh();
      return showMember(m.id);
    }
    if (action === "archive-household") {
      const h = state.household.household;
      if (
        !confirm(
          h.archived_at
            ? "Restore this household?"
            : "Archive this household? Move or archive its active member records first.",
        )
      )
        return;
      await api("/households/" + h.id + "/archive", {
        method: "POST",
        body: { version: h.version, archived: !h.archived_at },
      });
      await refresh();
      return showHousehold(h.id);
    }
    if (action === "member-history") {
      const token = modalRequest,
        d = await api("/members/" + el.dataset.id + "/history");
      if (token !== modalRequest) return;
      $("#member-history").innerHTML =
        `<h3>Attendance history</h3>${d.history.length ? `<div class="record-list">${d.history.map((r) => `<div class="record-row"><div><strong>${esc(r.title)}</strong><p class="muted">${esc(dateTime(r.starts_at))}${r.state === "cancelled" ? " · Cancelled" : ""}</p></div>${badge(r.status)}</div>`).join("")}</div>` : '<p class="section-caption">No attendance history has been recorded.</p>'}`;
      return;
    }
    if (action === "link-account") {
      const m = state.member;
      let account = null;
      if (m.account_id) {
        if (!confirm("Unlink this registered account from the member record?"))
          return;
      } else {
        if (!m.email)
          throw Error("Add the member email before linking a sign-in account");
        const data = await api(
          "/accounts?email=" + encodeURIComponent(m.email),
        );
        if (!data.accounts.length)
          throw Error(
            "No active registered member account matches this email. A system admin can review pending membership applications in the website manager.",
          );
        const a = data.accounts[0];
        if (!confirm(`Link ${a.display_name} (${a.email}) to ${m.name}?`))
          return;
        account = a.id;
      }
      await api("/members/" + m.id + "/account", {
        method: "PUT",
        body: { version: m.version, account_id: account },
      });
      return showMember(m.id);
    }
    if (action === "set-session-state") {
      if (state.pending.size)
        throw Error("Save or discard the unsaved attendance marks first");
      const s = state.session,
        to = el.dataset.state;
      if (
        !confirm(
          `${to === "open" ? (s.opened_at ? "Reopen" : "Open") : to === "closed" ? "Close" : "Cancel"} this service register?`,
        )
      )
        return;
      const d = await api("/sessions/" + s.id + "/state", {
        method: "POST",
        body: { version: s.version, state: to },
      });
      state.session = d.session;
      renderRegister(d.stats);
      return registerRows();
    }
    if (action === "refresh-roster") {
      if (state.pending.size)
        throw Error("Save attendance before updating the roster");
      const d = await api("/sessions/" + state.session.id + "/roster/refresh", {
        method: "POST",
        body: {},
      });
      toast(`${d.added} new people added to the roster`);
      return registerRows();
    }
    if (action === "mark-page") {
      $$("[data-attendance]:not(:disabled)").forEach((select) => {
        select.value = "present";
        mark(select.dataset.attendance, "present");
      });
      return;
    }
    if (action === "save-attendance") {
      if (!state.pending.size) return;
      const entries = [...state.pending.values()];
      el.disabled = true;
      try {
        const d = await api("/sessions/" + state.session.id + "/attendance", {
          method: "POST",
          body: { entries },
        });
        state.pending.clear();
        toast(
          `${d.changed} attendance mark${d.changed === 1 ? "" : "s"} saved`,
        );
        await registerRows();
      } finally {
        updatePending();
      }
      return;
    }
  }
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (el && !el.disabled) {
      e.preventDefault();
      if (el.dataset.action === "commit-import") return;
      Promise.resolve(handle(el.dataset.action, el)).catch((error) => {
        toast(error.message);
        status(error.message);
        if ($("#edit-dialog").open) {
          let message = $("#dialog-error");
          if (!message) {
            message = document.createElement("p");
            message.id = "dialog-error";
            message.className = "error-text";
            message.setAttribute("role", "alert");
            $("#dialog-body").prepend(message);
          }
          message.textContent = error.message;
        }
      });
    }
  });
  $("#church-nav").addEventListener("click", (e) => {
    const b = e.target.closest("[data-view]");
    if (b && !b.hidden)
      navigate(b.dataset.view).catch((error) => status(error.message));
  });
  $("#page-content").addEventListener("change", (e) => {
    if (e.target.matches("[data-attendance]"))
      mark(e.target.dataset.attendance, e.target.value);
  });
  $("#sign-out").onclick = async () => {
    if (
      (state.pending.size || modalDirty) &&
      !confirm("Discard unsaved changes and sign out?")
    )
      return;
    try {
      await api("/api/admin/logout", { method: "POST", body: {} });
      signedOut();
    } catch (error) {
      toast(error.message);
    }
  };
  $("#login-form").onsubmit = async (e) => {
    e.preventDefault();
    const form = e.currentTarget,
      b = $("button[type=submit]", form);
    b.disabled = true;
    $("#login-error").textContent = "";
    try {
      await api("/api/admin/login", {
        method: "POST",
        body: Object.fromEntries(new FormData(form)),
      });
      form.reset();
      await start();
    } catch (error) {
      $("#login-error").textContent = error.message;
    } finally {
      b.disabled = false;
    }
  };
  window.addEventListener("beforeunload", (e) => {
    if (state.pending.size || modalDirty) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
  async function start() {
    try {
      const r = await fetch("/api/admin/session", {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (r.status === 401) return signedOut();
      if (!r.ok)
        throw Error(
          "The staff session could not be checked. Please try again.",
        );
      const { user } = await r.json();
      if (
        !user.permissions?.some((p) =>
          ["members", "attendance", "reports"].includes(p),
        )
      )
        return signedOut(
          "Your account does not have church management access. A system admin can assign a registrar or usher role.",
        );
      state.me = user;
      $("#church-login").hidden = true;
      $("#church-app").hidden = false;
      permissionUI();
      await navigate("overview");
    } catch (error) {
      signedOut(error.message);
    }
  }
  start();
})();
