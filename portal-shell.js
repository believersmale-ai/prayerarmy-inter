/* Shared staff portal navigation; underlying actions keep their existing permission checks. */
(() => {
  "use strict";
  const church = !!document.querySelector("#church-app"),
    root = document.querySelector(church ? "#church-app" : "#admin-app"),
    main = document.querySelector(church ? ".main" : ".main-area");
  if (!root || !main) return;
  const active = () => root.getClientRects().length > 0;
  const skip = document.createElement("a");
  skip.className = "portal-skip";
  skip.href = church ? "#page-content" : "#settings-form";
  skip.textContent = "Skip to workspace";
  document.body.prepend(skip);
  const target = document.querySelector(skip.hash);
  if (target) target.setAttribute("tabindex", "-1");
  const bar = document.createElement("section");
  bar.className = "portal-tools";
  bar.setAttribute("aria-label", "Workspace tools");
  const label = document.createElement("span");
  label.className = "portal-tools-label";
  label.textContent = church ? "CHURCH WORKSPACE" : "WEBSITE WORKSPACE";
  const actions = document.createElement("div");
  actions.className = "portal-tool-actions";
  const find = document.createElement("button");
  find.type = "button";
  find.className = "portal-button";
  find.id = "portal-find";
  find.textContent = "Find a tool";
  find.setAttribute("aria-keyshortcuts", "Control+k Meta+k");
  const other = document.createElement("a");
  other.className = "portal-button";
  other.href = church ? "/admin" : "/church";
  other.textContent = church ? "Website manager ↗" : "Church workspace ↗";
  const member = document.createElement("a");
  member.className = "portal-button";
  member.href = "/member";
  member.textContent = "Member portal ↗";
  member.target = "_blank";
  member.rel = "noopener";
  const refresh = document.createElement("button");
  refresh.type = "button";
  refresh.className = "portal-button";
  refresh.id = "portal-refresh";
  refresh.textContent = "Refresh workspace";
  refresh.onclick = () => {
    if (church) document.dispatchEvent(new CustomEvent("pai:church-refresh"));
    else location.reload();
  };
  actions.append(find, refresh, other, member);
  bar.append(label, actions);
  main.prepend(bar);
  const banner = document.createElement("p");
  banner.className = "portal-offline";
  banner.setAttribute("role", "status");
  banner.hidden = navigator.onLine;
  banner.textContent =
    "You are offline. Reconnect before saving changes. Your open forms will stay on this page.";
  main.prepend(banner);
  window.addEventListener("offline", () => {
    banner.hidden = false;
  });
  window.addEventListener("online", () => {
    banner.hidden = true;
  });
  const dialog = document.createElement("dialog");
  dialog.className = "portal-command";
  dialog.setAttribute("aria-labelledby", "portal-command-title");
  const heading = document.createElement("div");
  heading.className = "portal-command-heading";
  const title = document.createElement("h2");
  title.id = "portal-command-title";
  title.textContent = "Find a workspace tool";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "portal-button";
  close.textContent = "Close";
  close.setAttribute("aria-label", "Close tool finder");
  heading.append(title, close);
  const search = document.createElement("input");
  search.type = "search";
  search.placeholder = "Search people, attendance, pages…";
  search.setAttribute("aria-label", "Search workspace tools");
  search.autocomplete = "off";
  const hint = document.createElement("p");
  hint.textContent =
    "Ctrl / ⌘ K to open · ↑ ↓ to move · Enter to select · Esc to close";
  const results = document.createElement("div");
  results.className = "portal-command-results";
  dialog.append(heading, search, hint, results);
  document.body.append(dialog);
  const buttons = () =>
    [
      ...root.querySelectorAll(
        church ? "#church-nav [data-view]" : ".sidebar-btn[data-view]",
      ),
    ].filter((b) => (church ? !b.hidden : b.style.display !== "none"));
  function render() {
    results.replaceChildren();
    const term = search.value.trim().toLowerCase();
    for (const original of buttons()) {
      const name = original.textContent.replace(/\s+/g, " ").trim();
      if (term && !name.toLowerCase().includes(term)) continue;
      const b = document.createElement("button");
      b.type = "button";
      b.className = "portal-command-item";
      b.textContent = name;
      b.onclick = () => {
        dialog.close();
        original.click();
      };
      results.append(b);
    }
    if (!results.children.length) {
      const empty = document.createElement("p");
      empty.textContent = "No tools match your search. Try another name.";
      results.append(empty);
    }
  }
  function open() {
    if (!active()) return;
    search.value = "";
    render();
    if (!dialog.open) dialog.showModal();
    search.focus();
  }
  close.onclick = () => dialog.close();
  find.onclick = open;
  search.oninput = render;
  dialog.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      dialog.close();
      return;
    }
    const items = [...results.querySelectorAll("button")],
      index = items.indexOf(document.activeElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (items.length)
        items[
          (index + (e.key === "ArrowDown" ? 1 : -1) + items.length) %
            items.length
        ].focus();
    }
    if (e.key === "Enter" && document.activeElement === search) {
      e.preventDefault();
      items[0]?.click();
    }
  });
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      if (dialog.open) dialog.close();
      else if (!document.querySelector("dialog[open]")) open();
    }
  });
  const navButtons = [
    ...root.querySelectorAll(
      church ? "#church-nav [data-view]" : ".sidebar-btn[data-view]",
    ),
  ];
  const current = () =>
    navButtons.forEach((b) => {
      if (b.classList.contains("active"))
        b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
    });
  const navigationObserver = new MutationObserver(current);
  navButtons.forEach((b) =>
    navigationObserver.observe(b, {
      attributes: true,
      attributeFilter: ["class"],
    }),
  );
  current();
  const update = () => {
    other.hidden =
      !church &&
      Boolean(document.querySelector("#church-management-link")?.hidden);
    if (!active() && dialog.open) {
      dialog.close();
      results.replaceChildren();
      search.value = "";
    }
  };
  document.addEventListener("pai:admin-ready", update);
  new MutationObserver(update).observe(root, {
    attributes: true,
    attributeFilter: ["hidden", "style"],
  });
  update();
})();
