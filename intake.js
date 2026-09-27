(function () {
  const form = document.getElementById("intake-form");
  const submitBtn = document.getElementById("submit");
  const formError = document.getElementById("form-error");
  const submitStatus = document.getElementById("submit-status");
  const scriptUrl = (window.ONBOARD_CONFIG || {}).scriptUrl || "";

  // Private key from the welcome email link (?k=...). Kept for the session so a page refresh still works.
  const params = new URLSearchParams(location.search);
  let intakeKey = params.get("k") || "";
  try {
    if (intakeKey) sessionStorage.setItem("nyIntakeKey", intakeKey);
    else intakeKey = sessionStorage.getItem("nyIntakeKey") || "";
  } catch (_) {}
  const linkWarning = document.getElementById("link-warning");
  if (!intakeKey && linkWarning) linkWarning.hidden = false;

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // server limit per file
  const IMAGE_MAX_EDGE = 2000; // shrink phone photos to keep uploads fast

  // ---- Input masks ----
  const mask = (el, fn) => el.addEventListener("input", () => { el.value = fn(el.value); });

  mask(form.phone, (v) => {
    let d = v.replace(/\D/g, "");
    if (d.length === 11 && d[0] === "1") d = d.slice(1);
    d = d.slice(0, 10);
    if (d.length > 6) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
    if (d.length > 3) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
    return d.length ? `(${d}` : "";
  });

  mask(form.ssn, (v) => {
    const d = v.replace(/\D/g, "").slice(0, 9);
    if (d.length > 5) return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
    if (d.length > 3) return `${d.slice(0, 3)}-${d.slice(3)}`;
    return d;
  });

  mask(form.zip, (v) => v.replace(/[^\d-]/g, "").slice(0, 10));

  document.querySelectorAll(".secret-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const input = document.getElementById(btn.dataset.target);
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.textContent = show ? "Hide" : "Show";
      btn.setAttribute("aria-label", (show ? "Hide" : "Show") + " Social Security number");
    });
  });

  ["id1", "id2"].forEach((id) => {
    const input = form[id];
    const label = document.querySelector(`.file-drop-text[data-for="${id}"]`);
    input.addEventListener("change", () => {
      const f = input.files[0];
      label.textContent = f ? `✓ ${f.name}` : "Tap to take a photo or choose a file";
      input.closest(".file-drop").classList.toggle("has-file", !!f);
      setError(id, "");
    });
  });

  // ---- Work location: searchable store list from the toolboxstores sheet ----
  const storeSearch = document.getElementById("storeSearch");
  const storeCombo = document.getElementById("store-combo");
  const storeList = document.getElementById("store-list");
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

  function renderStores() {
    const q = storeSearch.value === form.workLocation.value ? "" : storeSearch.value;
    const words = norm(q).split(" ").filter(Boolean);
    matches = stores.filter((st) => words.every((w) => st._hay.includes(w)));
    if (words.length && active < 0) active = 0;
    if (active >= matches.length) active = matches.length - 1;
    storeList.innerHTML = matches.length
      ? matches.map((st, i) =>
          `<li role="option" id="store-opt-${i}" data-i="${i}" aria-selected="${i === active}">` +
          `<span class="store-name">${highlight(st.name, words)}</span>` +
          `<span class="store-meta">${highlight(st.id, words)}${st.address ? " · " + highlight(st.address, words) : ""}</span></li>`
        ).join("")
      : `<li class="empty" role="option" aria-disabled="true">No stores match “${escapeHtml(q)}”. Try a town or store ID.</li>`;
    storeSearch.setAttribute("aria-activedescendant", active >= 0 && matches.length ? `store-opt-${active}` : "");
    const el = storeList.querySelector('[aria-selected="true"]');
    if (el) el.scrollIntoView({ block: "nearest" });
  }

  function openStores() {
    if (!stores || !stores.length) return;
    renderStores();
    storeList.hidden = false;
    storeSearch.setAttribute("aria-expanded", "true");
  }

  function closeStores() {
    storeList.hidden = true;
    storeSearch.setAttribute("aria-expanded", "false");
    storeSearch.removeAttribute("aria-activedescendant");
    active = -1;
  }

  function pickStore(st) {
    form.workLocation.value = storeLabel(st);
    storeSearch.value = storeLabel(st);
    storeCombo.classList.add("has-value");
    setError("workLocation", "");
    closeStores();
  }

  storeSearch.addEventListener("focus", () => { if (storeSearch.value === form.workLocation.value) storeSearch.select(); openStores(); });
  storeSearch.addEventListener("input", () => {
    setError("workLocation", "");
    if (stores && !stores.length) { form.workLocation.value = storeSearch.value.trim(); return; } // list unavailable: free text
    form.workLocation.value = "";
    storeCombo.classList.remove("has-value");
    active = -1;
    openStores();
  });
  storeSearch.addEventListener("keydown", (e) => {
    if (!stores || !stores.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (storeList.hidden) return openStores();
      if (!matches.length) return;
      active = e.key === "ArrowDown" ? Math.min(active + 1, matches.length - 1) : Math.max(active - 1, 0);
      renderStores();
    } else if (e.key === "Enter" && !storeList.hidden) {
      e.preventDefault(); // don't submit the form
      if (matches[active]) pickStore(matches[active]);
    } else if (e.key === "Escape" && !storeList.hidden) {
      e.preventDefault();
      closeStores();
    }
  });
  storeSearch.addEventListener("blur", () => {
    closeStores();
    if (!stores || !stores.length || form.workLocation.value) return;
    // Accept an exact typed match (store ID or name) without clicking
    const typed = norm(storeSearch.value);
    const exact = typed && stores.find((st) => norm(st.id) === typed || norm(st.name) === typed || norm(storeLabel(st)) === typed);
    if (exact) pickStore(exact);
  });
  // mousedown (not click) so the choice lands before the input loses focus
  storeList.addEventListener("mousedown", (e) => {
    const li = e.target.closest("li[data-i]");
    e.preventDefault();
    if (li) pickStore(matches[Number(li.dataset.i)]);
  });

  function useStores(list) {
    stores = list.map((st) => ({ ...st, _hay: norm(`${st.name} ${st.id} ${st.id.replace(/^wz/i, "")} ${st.address}`) }));
    storeSearch.placeholder = "Search your store…";
    storeSearch.disabled = false;
  }

  (async function loadStores() {
    storeSearch.disabled = true;
    try {
      const cached = sessionStorage.getItem("nyStores");
      if (cached) return useStores(JSON.parse(cached));
    } catch (_) {}
    try {
      if (!scriptUrl || scriptUrl.startsWith("PASTE_")) throw new Error("not connected");
      const res = await fetch(`${scriptUrl}?action=stores`);
      const data = await res.json();
      if (!data.ok || !Array.isArray(data.stores) || !data.stores.length) throw new Error("no stores");
      useStores(data.stores);
      try { sessionStorage.setItem("nyStores", JSON.stringify(data.stores)); } catch (_) {}
    } catch (_) {
      stores = [];
      storeSearch.placeholder = "Type your store name or ID";
      storeSearch.disabled = false;
      document.getElementById("store-hint").textContent = "Couldn’t load the store list. Type your store’s town or ID instead.";
    }
  })();

  // ---- Errors ----
  function setError(name, msg) {
    const el = form.querySelector(`.error[data-for="${name}"]`);
    if (el) el.textContent = msg || "";
    const input = form.elements[name];
    const field = input && input.closest && input.closest(".field");
    if (field) field.classList.toggle("invalid", !!msg);
    if (input && input.setAttribute) input.setAttribute("aria-invalid", msg ? "true" : "false");
  }

  form.addEventListener("input", (e) => {
    if (e.target.name) setError(e.target.name, "");
    formError.textContent = "";
  });

  function values() {
    const g = (n) => (form.elements[n].value || "").trim();
    return {
      action: "intake",
      intakeKey,
      fullName: g("fullName"),
      middleName: g("middleName"),
      badgeName: g("badgeName"),
      dob: g("dob"),
      ssn: g("ssn"),
      email: g("email").toLowerCase(),
      phone: g("phone"),
      carrier: g("carrier"),
      address: g("address"),
      city: g("city"),
      state: g("state"),
      zip: g("zip"),
      workLocation: g("workLocation"),
      hiringManager: g("hiringManager"),
      shirtSize: g("shirtSize"),
      startDate: g("startDate"),
      availableDate: g("availableDate"),
      consent: form.consent.checked,
      company: form.company.value, // honeypot
    };
  }

  function validate(v) {
    const e = {};
    if (v.fullName.split(/\s+/).filter(Boolean).length < 2) e.fullName = "Enter your first and last name.";
    if (!v.badgeName) e.badgeName = "Enter your preferred name for your badge.";
    if (!v.dob) e.dob = "Enter your date of birth.";
    if (v.ssn.replace(/\D/g, "").length !== 9) e.ssn = "Enter your 9-digit Social Security number.";
    if (!EMAIL_RE.test(v.email)) e.email = "Enter a valid email address.";
    if (v.phone.replace(/\D/g, "").length !== 10) e.phone = "Enter a 10-digit phone number.";
    if (!v.carrier) e.carrier = "Choose your phone carrier.";
    if (!v.address) e.address = "Enter your street address.";
    if (!v.city) e.city = "Enter your city.";
    if (!v.state) e.state = "Choose your state.";
    if (!/^\d{5}(-\d{4})?$/.test(v.zip)) e.zip = "Enter a 5-digit zip code.";
    if (storeSearch.value.trim() && !v.workLocation) e.workLocation = "Pick your store from the list.";
    if (!v.startDate) e.startDate = "Enter your start date.";
    if (!v.availableDate) e.availableDate = "Enter your available start date.";
    if (!form.id1.files[0]) e.id1 = "Upload your first ID document.";
    if (!v.consent) e.consent = "Please confirm before submitting.";
    return e;
  }

  // ---- Files: shrink photos, read as base64 ----
  const readAsDataURL = (blob) => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });

  async function shrinkImage(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = rej;
        i.src = url;
      });
      const scale = Math.min(1, IMAGE_MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.85));
      return blob || file;
    } catch (_) {
      return file; // browser can't decode it (e.g. HEIC on desktop); send the original
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function packFile(field) {
    const file = form[field].files[0];
    if (!file) return null;
    let blob = file;
    if (file.type.startsWith("image/") && !/heic|heif/i.test(file.type)) blob = await shrinkImage(file);
    if (blob.size > MAX_UPLOAD_BYTES) throw { field, message: "That file is too large. Please upload a file under 15 MB." };
    const type = blob.type || file.type || "application/octet-stream";
    const dataUrl = await readAsDataURL(blob);
    return { field, type, data: dataUrl.slice(dataUrl.indexOf(",") + 1) };
  }

  function setLoading(on) {
    submitBtn.disabled = on;
    submitBtn.classList.toggle("loading", on);
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    formError.textContent = "";

    const v = values();
    const errors = validate(v);
    Object.keys(v).concat(["id1", "id2"]).forEach((k) => setError(k, errors[k]));
    const firstBad = Object.keys(errors)[0];
    if (firstBad) {
      const el = firstBad === "workLocation" ? storeSearch : form.elements[firstBad];
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.focus({ preventScroll: true });
      return;
    }
    if (!scriptUrl || scriptUrl.startsWith("PASTE_")) {
      formError.textContent = "This form isn’t connected yet. Please contact your manager.";
      return;
    }

    setLoading(true);
    submitStatus.textContent = "Preparing your ID documents…";
    const slowTimer = setTimeout(() => {
      submitStatus.textContent = "Still uploading — this can take up to a minute. Please don’t close this page.";
    }, 10000);
    const controller = new AbortController();
    const abortTimer = setTimeout(() => controller.abort(), 120000);

    try {
      const files = [];
      for (const f of ["id1", "id2"]) {
        const packed = await packFile(f);
        if (packed) files.push(packed);
      }
      submitStatus.textContent = "Submitting your information securely…";

      // text/plain avoids a CORS preflight that Apps Script can't answer.
      const res = await fetch(scriptUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ ...v, files }),
        signal: controller.signal,
      });
      const data = await res.json();

      if (data.ok) {
        document.getElementById("intake-view").hidden = true;
        const done = document.getElementById("intake-success");
        done.hidden = false;
        window.scrollTo({ top: done.getBoundingClientRect().top + window.scrollY - 80, behavior: "smooth" });
        document.getElementById("intake-success-title").focus({ preventScroll: true });
        return;
      }
      if (data.error === "invalid_link") {
        if (linkWarning) { linkWarning.hidden = false; linkWarning.scrollIntoView({ behavior: "smooth", block: "center" }); }
        formError.textContent = "Please open this form from the link in your welcome email.";
      } else if (data.field) {
        setError(data.field, data.message || "Please check this field.");
        form.elements[data.field] && form.elements[data.field].focus();
      } else {
        formError.textContent = data.message || "Something went wrong. Please try again.";
      }
    } catch (err) {
      if (err && err.field) {
        setError(err.field, err.message);
      } else {
        formError.textContent = err && err.name === "AbortError"
          ? "This is taking longer than usual. Please check your connection and try again."
          : "We couldn’t reach the server. Check your connection and try again.";
      }
    } finally {
      clearTimeout(slowTimer);
      clearTimeout(abortTimer);
      submitStatus.textContent = "";
      setLoading(false);
    }
  });
})();
