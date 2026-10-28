// Searchable store dropdown (combobox) fed by the toolboxstores sheet via Apps Script (?action=stores).
// Used by the hiring-manager form (index.html) and the new-hire intake form (intake.html).
// Markup: a .combo wrapper holding a text input (the search box), a hidden input (the submitted value)
// and a <ul role="listbox">. If the list can't load, the search box falls back to free text.
window.StorePicker = function ({ input, hidden, combo, list, hint, scriptUrl, onChange }) {
  let stores = null; // null until loaded; [] if the list couldn't be fetched (free text is allowed then)
  let matches = [];
  let active = -1;

  const norm = (v) => String(v || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const storeLabel = (st) => `${st.name} (${st.id})`;
  const escapeHtml = (v) => String(v).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const highlight = (text, words) => {
    let html = escapeHtml(text);
    words.forEach((w) => {
      const re = new RegExp(`(${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig");
      html = html.replace(re, "<mark>$1</mark>");
    });
    return html;
  };
  const changed = () => onChange && onChange();

  function render() {
    const q = input.value === hidden.value ? "" : input.value;
    const words = norm(q).split(" ").filter(Boolean);
    matches = stores.filter((st) => words.every((w) => st._hay.includes(w)));
    if (words.length && active < 0) active = 0;
    if (active >= matches.length) active = matches.length - 1;
    const prefix = list.id;
    list.innerHTML = matches.length
      ? matches.map((st, i) =>
          `<li role="option" id="${prefix}-opt-${i}" data-i="${i}" aria-selected="${i === active}">` +
          `<span class="store-name">${highlight(st.name, words)}</span>` +
          `<span class="store-meta">${highlight(st.id, words)}${st.address ? " · " + highlight(st.address, words) : ""}</span></li>`
        ).join("")
      : `<li class="empty" role="option" aria-disabled="true">No stores match “${escapeHtml(q)}”. Try a town or store ID.</li>`;
    input.setAttribute("aria-activedescendant", active >= 0 && matches.length ? `${prefix}-opt-${active}` : "");
    const el = list.querySelector('[aria-selected="true"]');
    if (el) el.scrollIntoView({ block: "nearest" });
  }

  function open() {
    if (!stores || !stores.length) return;
    render();
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
  }

  function close() {
    list.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    active = -1;
  }

  function pick(st) {
    hidden.value = storeLabel(st);
    input.value = storeLabel(st);
    combo.classList.add("has-value");
    changed();
    close();
  }

  input.addEventListener("focus", () => { if (input.value === hidden.value) input.select(); open(); });
  input.addEventListener("input", () => {
    if (stores && !stores.length) { hidden.value = input.value.trim(); changed(); return; } // list unavailable: free text
    hidden.value = "";
    combo.classList.remove("has-value");
    changed();
    active = -1;
    open();
  });
  input.addEventListener("keydown", (e) => {
    if (!stores || !stores.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (list.hidden) return open();
      if (!matches.length) return;
      active = e.key === "ArrowDown" ? Math.min(active + 1, matches.length - 1) : Math.max(active - 1, 0);
      render();
    } else if (e.key === "Enter" && !list.hidden) {
      e.preventDefault(); // don't submit the form
      if (matches[active]) pick(matches[active]);
    } else if (e.key === "Escape" && !list.hidden) {
      e.preventDefault();
      close();
    }
  });
  input.addEventListener("blur", () => {
    close();
    if (!stores || !stores.length || hidden.value) return;
    // Accept an exact typed match (store ID or name) without clicking
    const typed = norm(input.value);
    const exact = typed && stores.find((st) => norm(st.id) === typed || norm(st.name) === typed || norm(storeLabel(st)) === typed);
    if (exact) pick(exact);
  });
  // mousedown (not click) so the choice lands before the input loses focus
  list.addEventListener("mousedown", (e) => {
    const li = e.target.closest("li[data-i]");
    e.preventDefault();
    if (li) pick(matches[Number(li.dataset.i)]);
  });

  function use(listData) {
    stores = listData.map((st) => ({ ...st, _hay: norm(`${st.name} ${st.id} ${st.id.replace(/^wz/i, "")} ${st.address}`) }));
    input.placeholder = "Search your store…";
    input.disabled = false;
  }

  (async function load() {
    input.disabled = true;
    try {
      const cached = sessionStorage.getItem("nyStores");
      if (cached) return use(JSON.parse(cached));
    } catch (_) {}
    try {
      if (!scriptUrl || scriptUrl.startsWith("PASTE_")) throw new Error("not connected");
      const res = await fetch(`${scriptUrl}?action=stores`);
      const data = await res.json();
      if (!data.ok || !Array.isArray(data.stores) || !data.stores.length) throw new Error("no stores");
      use(data.stores);
      try { sessionStorage.setItem("nyStores", JSON.stringify(data.stores)); } catch (_) {}
    } catch (_) {
      stores = [];
      input.placeholder = "Type the store name or ID";
      input.disabled = false;
      if (hint) hint.textContent = "Couldn’t load the store list. Type the store’s town or ID instead.";
    }
  })();

  return {
    // True when something is typed but no store was picked from the list
    hasUnpickedText: () => !!input.value.trim() && !hidden.value,
    reset() { input.value = ""; hidden.value = ""; combo.classList.remove("has-value"); close(); },
  };
};
