(function () {
  const form = document.getElementById("onboard-form");
  const submitBtn = document.getElementById("submit");
  const formError = document.getElementById("form-error");
  const submitStatus = document.getElementById("submit-status");
  const scriptUrl = (window.ONBOARD_CONFIG || {}).scriptUrl || "";

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const FIELDS = ["code", "firstName", "lastName", "email", "mobile", "role", "roleOther", "workLocation",
    "startDate", "hiringManager", "payType", "payAmount", "consent"];

  // ---- Phone mask: (516) 555-1234 ----
  const mobile = document.getElementById("mobile");
  mobile.addEventListener("input", () => {
    let d = mobile.value.replace(/\D/g, "");
    if (d.length === 11 && d[0] === "1") d = d.slice(1);
    d = d.slice(0, 10);
    let out = d;
    if (d.length > 6) out = `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
    else if (d.length > 3) out = `(${d.slice(0, 3)}) ${d.slice(3)}`;
    else if (d.length > 0) out = `(${d}`;
    mobile.value = out;
  });

  // ---- Role: "Other" asks for the title ----
  const roleOtherField = document.getElementById("role-other-field");
  function syncRole() {
    const other = form.role.value === "Other";
    roleOtherField.hidden = !other;
    if (!other) { form.roleOther.value = ""; setError("roleOther", ""); }
  }
  form.role.addEventListener("change", () => { syncRole(); if (form.role.value === "Other") form.roleOther.focus(); });

  // ---- Pay: hourly rate or annual salary ----
  const payLabel = document.getElementById("payAmount-label");
  const payUnit = document.getElementById("pay-unit");
  const payType = () => (form.querySelector('input[name="payType"]:checked') || {}).value || "";
  function syncPay() {
    const salary = payType() === "Salary";
    payLabel.textContent = salary ? "Annual salary" : "Hourly rate";
    payUnit.textContent = salary ? "/ yr" : "/ hr";
    form.payAmount.placeholder = salary ? "52,000" : "18.00";
  }
  form.querySelectorAll('input[name="payType"]').forEach((r) => r.addEventListener("change", () => { syncPay(); setError("payAmount", ""); }));
  form.payAmount.addEventListener("input", () => { form.payAmount.value = form.payAmount.value.replace(/[^\d.,]/g, ""); });
  const payNumber = () => Number(form.payAmount.value.replace(/,/g, ""));

  // ---- Work location: searchable store list (store-picker.js) ----
  const storeSearch = document.getElementById("storeSearch");
  const stores = window.StorePicker({
    input: storeSearch,
    hidden: form.workLocation,
    combo: document.getElementById("store-combo"),
    list: document.getElementById("store-list"),
    hint: document.getElementById("store-hint"),
    scriptUrl,
    onChange: () => setError("workLocation", ""),
  });

  // ---- Field error helpers ----
  function setError(name, msg) {
    const el = form.querySelector(`.error[data-for="${name}"]`);
    if (el) el.textContent = msg || "";
    const input = form.elements[name];
    const node = input && (input.closest ? input : input[0]);
    const field = node && node.closest(".field");
    if (field) field.classList.toggle("invalid", !!msg);
    if (input && input.setAttribute) input.setAttribute("aria-invalid", msg ? "true" : "false");
  }

  // Clear a field's error as soon as the user edits it
  form.addEventListener("input", (e) => {
    if (e.target.name) setError(e.target.name, "");
    formError.textContent = "";
  });
  form.addEventListener("change", (e) => { if (e.target.name) setError(e.target.name, ""); });

  function readValues() {
    return {
      code: form.code.value.trim().toUpperCase(),
      firstName: form.firstName.value.trim(),
      lastName: form.lastName.value.trim(),
      email: form.email.value.trim().toLowerCase(),
      mobile: form.mobile.value.trim(),
      role: form.role.value,
      roleOther: form.roleOther.value.trim(),
      workLocation: form.workLocation.value.trim(),
      startDate: form.startDate.value,
      hiringManager: form.hiringManager.value.trim(),
      payType: payType(),
      payAmount: payNumber(),
      consent: form.consent.checked,
      company: form.company.value, // honeypot
    };
  }

  function validate(v) {
    const errors = {};
    if (!v.code) errors.code = "Enter the onboarding code.";
    if (!v.firstName) errors.firstName = "Enter the new hire’s first name.";
    if (!v.lastName) errors.lastName = "Enter the new hire’s last name.";
    if (!EMAIL_RE.test(v.email)) errors.email = "Enter a valid email address.";
    if (v.mobile.replace(/\D/g, "").length !== 10) errors.mobile = "Enter a 10-digit mobile number.";
    if (!v.role) errors.role = "Choose a role.";
    if (v.role === "Other" && !v.roleOther) errors.roleOther = "Enter the role title.";
    if (stores.hasUnpickedText()) errors.workLocation = "Pick the store from the list.";
    else if (!v.workLocation) errors.workLocation = "Choose the store they’ll work at.";
    if (!v.startDate) errors.startDate = "Enter the start date.";
    if (!v.hiringManager) errors.hiringManager = "Enter the hiring manager’s name.";
    if (!v.payType) errors.payType = "Choose hourly or salary.";
    if (!(v.payAmount > 0)) errors.payAmount = v.payType === "Salary" ? "Enter the annual salary." : "Enter the hourly rate.";
    else if (v.payType === "Hourly" && v.payAmount > 500) errors.payAmount = "That looks like a salary — switch Pay type to Salary.";
    else if (v.payType === "Salary" && v.payAmount < 1000) errors.payAmount = "That looks like an hourly rate — switch Pay type to Hourly.";
    if (!v.consent) errors.consent = "Please confirm before continuing.";
    return errors;
  }

  function focusField(name) {
    const el = name === "workLocation" ? storeSearch
      : name === "payType" ? form.querySelector('input[name="payType"]')
      : form.elements[name];
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.focus({ preventScroll: true });
  }

  function setLoading(on) {
    submitBtn.disabled = on;
    submitBtn.classList.toggle("loading", on);
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    formError.textContent = "";

    const v = readValues();
    const errors = validate(v);
    FIELDS.forEach((k) => setError(k, errors[k]));
    const firstBad = FIELDS.find((k) => errors[k]);
    if (firstBad) return focusField(firstBad);

    if (!scriptUrl || scriptUrl.startsWith("PASTE_")) {
      formError.textContent = "This form isn’t connected yet. Please contact Jon.";
      return;
    }

    setLoading(true);
    // Google Apps Script usually answers in 2–5s but can occasionally take 20s+,
    // so keep the person informed instead of showing a silent spinner.
    submitStatus.textContent = "Adding the new hire…";
    const slowTimer = setTimeout(() => {
      submitStatus.textContent = "Still working — this can take up to 30 seconds. Please don’t close this page.";
    }, 6000);
    const controller = new AbortController();
    const abortTimer = setTimeout(() => controller.abort(), 60000);
    try {
      // Sent as text/plain so the browser skips the CORS preflight that Apps Script can't answer.
      const res = await fetch(scriptUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(v),
        signal: controller.signal,
      });
      const data = await res.json();

      if (data.ok) {
        showSuccess(v, data.duplicate);
        return;
      }
      if (data.error === "invalid_code") {
        setError("code", "That onboarding code isn’t valid. Double-check it with Jon.");
        focusField("code");
      } else if (data.field) {
        setError(data.field, data.message || "Please check this field.");
        focusField(data.field);
      } else {
        formError.textContent = data.message || "Something went wrong. Please try again.";
      }
    } catch (err) {
      formError.textContent = err.name === "AbortError"
        ? "This is taking longer than usual. Please try again — if your first try went through, the hire won’t be added twice."
        : "We couldn’t reach the server. Check your connection and try again.";
    } finally {
      clearTimeout(slowTimer);
      clearTimeout(abortTimer);
      submitStatus.textContent = "";
      setLoading(false);
    }
  });

  function showSuccess(v, duplicate) {
    document.getElementById("form-view").hidden = true;
    document.getElementById("success-view").hidden = false;
    const text = document.getElementById("success-text");
    const strong = (s) => { const b = document.createElement("strong"); b.textContent = s; return b; };
    text.replaceChildren(...(duplicate
      ? [strong(v.email), " was already submitted, so nothing new was added. Contact Jon if their details need to change."]
      : ["Once onboarding is approved, ", strong(`${v.firstName} ${v.lastName}`), " gets a welcome email at ",
         strong(v.email), " with everything they need before their first day."]));
    const title = document.getElementById("success-title");
    title.textContent = duplicate ? "This hire is already on file." : "New hire added.";
    title.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Start a fresh entry, keeping the code, store, start date and hiring manager (often the same for a batch)
  document.getElementById("add-another").addEventListener("click", () => {
    ["firstName", "lastName", "email", "mobile", "payAmount"].forEach((k) => { form.elements[k].value = ""; });
    form.consent.checked = false;
    document.getElementById("success-view").hidden = true;
    document.getElementById("form-view").hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
    form.firstName.focus({ preventScroll: true });
  });

  syncRole();
  syncPay();
})();
