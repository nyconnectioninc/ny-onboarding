(function () {
  const form = document.getElementById("onboard-form");
  const submitBtn = document.getElementById("submit");
  const formError = document.getElementById("form-error");
  const scriptUrl = (window.ONBOARD_CONFIG || {}).scriptUrl || "";

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

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

  // ---- Field error helpers ----
  function setError(name, msg) {
    const el = form.querySelector(`.error[data-for="${name}"]`);
    if (el) el.textContent = msg || "";
    const input = form.elements[name];
    const field = input && input.closest(".field");
    if (field) field.classList.toggle("invalid", !!msg);
    if (input) input.setAttribute("aria-invalid", msg ? "true" : "false");
  }

  // Clear a field's error as soon as the user edits it
  form.addEventListener("input", (e) => {
    if (e.target.name) setError(e.target.name, "");
    formError.textContent = "";
  });

  function readValues() {
    return {
      code: form.code.value.trim().toUpperCase(),
      firstName: form.firstName.value.trim(),
      lastName: form.lastName.value.trim(),
      email: form.email.value.trim().toLowerCase(),
      mobile: form.mobile.value.trim(),
      consent: form.consent.checked,
      company: form.company.value, // honeypot
    };
  }

  function validate(v) {
    const errors = {};
    if (!v.code) errors.code = "Enter the onboarding code you were given.";
    if (!v.firstName) errors.firstName = "Enter your first name.";
    if (!v.lastName) errors.lastName = "Enter your last name.";
    if (!EMAIL_RE.test(v.email)) errors.email = "Enter a valid email address.";
    if (v.mobile.replace(/\D/g, "").length !== 10) errors.mobile = "Enter a 10-digit mobile number.";
    if (!v.consent) errors.consent = "Please confirm before continuing.";
    return errors;
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
    ["code", "firstName", "lastName", "email", "mobile", "consent"].forEach((k) => setError(k, errors[k]));
    const firstBad = Object.keys(errors)[0];
    if (firstBad) {
      form.elements[firstBad].focus();
      return;
    }

    if (!scriptUrl || scriptUrl.startsWith("PASTE_")) {
      formError.textContent = "This form isn’t connected yet. Please contact your manager.";
      return;
    }

    setLoading(true);
    try {
      // Sent as text/plain so the browser skips the CORS preflight that Apps Script can't answer.
      const res = await fetch(scriptUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(v),
      });
      const data = await res.json();

      if (data.ok) {
        showSuccess(v.email, data.duplicate);
        return;
      }
      if (data.error === "invalid_code") {
        setError("code", "That onboarding code isn’t valid. Double-check it with your manager.");
        form.code.focus();
      } else if (data.field) {
        setError(data.field, data.message || "Please check this field.");
        form.elements[data.field] && form.elements[data.field].focus();
      } else {
        formError.textContent = data.message || "Something went wrong. Please try again.";
      }
    } catch (err) {
      formError.textContent = "We couldn’t reach the server. Check your connection and try again.";
    } finally {
      setLoading(false);
    }
  });

  function showSuccess(email, duplicate) {
    document.getElementById("form-view").hidden = true;
    document.getElementById("success-view").hidden = false;
    document.getElementById("success-email").textContent = email;
    if (duplicate) {
      document.getElementById("success-title").textContent = "We already have your info.";
    }
    document.getElementById("success-title").focus?.();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
})();
