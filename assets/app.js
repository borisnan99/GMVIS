/* ==========================================================================
   Greater Manchester Vis — shared behaviour
   Accessibility toolbar · read-aloud · mobile nav · forms
   All preferences persist in localStorage across pages.
   ========================================================================== */
(function () {
  "use strict";
  var KEY = "gmvis.a11y.v1";
  var doc = document.documentElement;

  /* ---------- Preference store ---------- */
  var defaults = { size: "1", contrast: "normal", dys: "off", motion: "auto" };
  var prefs = load();

  function load() {
    try { return Object.assign({}, defaults, JSON.parse(localStorage.getItem(KEY) || "{}")); }
    catch (e) { return Object.assign({}, defaults); }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch (e) {} }

  function apply() {
    doc.style.setProperty("--fs-scale", prefs.size);
    doc.setAttribute("data-contrast", prefs.contrast);
    doc.setAttribute("data-dys", prefs.dys);
    var sysReduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    doc.setAttribute("data-motion", prefs.motion === "reduce" || (prefs.motion === "auto" && sysReduce) ? "reduce" : "auto");
    syncControls();
  }

  /* ---------- Build the toolbar ---------- */
  function svg(paths) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + '</svg>'; }

  var fab = document.createElement("button");
  fab.className = "a11y-fab";
  fab.setAttribute("aria-label", "Open accessibility settings");
  fab.setAttribute("aria-expanded", "false");
  fab.innerHTML = svg('<circle cx="12" cy="12" r="9"/><path d="M12 8v0M12 11v5M9 12h6"/>');

  var panel = document.createElement("div");
  panel.className = "a11y-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Accessibility settings");
  panel.setAttribute("data-open", "false");
  panel.innerHTML =
    '<h2>Accessibility' +
      '<button class="readaloud" style="padding:7px 10px" data-close aria-label="Close settings">' + svg('<path d="M18 6 6 18M6 6l12 12"/>') + '</button>' +
    '</h2>' +
    '<p class="sub">Your choices are saved on this device.</p>' +
    '<div class="a11y-row">' +
      '<span class="label" id="lbl-size">Text size</span>' +
      '<div class="seg" role="group" aria-labelledby="lbl-size">' +
        '<button data-size="1" aria-pressed="false">A</button>' +
        '<button data-size="1.15" aria-pressed="false">A+</button>' +
        '<button data-size="1.3" aria-pressed="false">A++</button>' +
        '<button data-size="1.5" aria-pressed="false">A+++</button>' +
      '</div>' +
    '</div>' +
    '<div class="a11y-row">' +
      '<span class="label" id="lbl-contrast">High-contrast mode</span>' +
      '<button class="toggle-btn" data-toggle="contrast" aria-pressed="false" aria-labelledby="lbl-contrast"><span>Black &amp; gold</span><span class="state">Off</span></button>' +
    '</div>' +
    '<div class="a11y-row">' +
      '<span class="label" id="lbl-dys">Dyslexia-friendly font</span>' +
      '<button class="toggle-btn" data-toggle="dys" aria-pressed="false" aria-labelledby="lbl-dys"><span>Lexend</span><span class="state">Off</span></button>' +
    '</div>' +
    '<div class="a11y-row">' +
      '<span class="label" id="lbl-motion">Reduce motion</span>' +
      '<button class="toggle-btn" data-toggle="motion" aria-pressed="false" aria-labelledby="lbl-motion"><span>Fewer animations</span><span class="state">Off</span></button>' +
    '</div>' +
    '<button class="reset" data-reset>Reset all to default</button>';

  document.addEventListener("DOMContentLoaded", function () {
    document.body.appendChild(fab);
    document.body.appendChild(panel);
    wireToolbar();
    wireNav();
    wireReadAloud();
    wireForms();
    apply();
    /* Hide decorative SVGs from AT (icon cells and checklist marks) */
    document.querySelectorAll(".ic svg, li > svg").forEach(function (s) {
      s.setAttribute("aria-hidden", "true");
    });
  });

  function openPanel(open) {
    panel.setAttribute("data-open", open ? "true" : "false");
    fab.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) { var f = panel.querySelector("[data-size]"); if (f) f.focus(); }
  }

  function wireToolbar() {
    fab.addEventListener("click", function () { openPanel(panel.getAttribute("data-open") !== "true"); });
    panel.querySelector("[data-close]").addEventListener("click", function () { openPanel(false); fab.focus(); });

    panel.querySelectorAll("[data-size]").forEach(function (b) {
      b.addEventListener("click", function () { prefs.size = b.getAttribute("data-size"); save(); apply(); });
    });
    panel.querySelectorAll("[data-toggle]").forEach(function (b) {
      b.addEventListener("click", function () {
        var k = b.getAttribute("data-toggle");
        if (k === "contrast") prefs.contrast = prefs.contrast === "high" ? "normal" : "high";
        if (k === "dys") prefs.dys = prefs.dys === "on" ? "off" : "on";
        if (k === "motion") prefs.motion = prefs.motion === "reduce" ? "auto" : "reduce";
        save(); apply();
      });
    });
    panel.querySelector("[data-reset]").addEventListener("click", function () {
      prefs = Object.assign({}, defaults); save(); apply();
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && panel.getAttribute("data-open") === "true") { openPanel(false); fab.focus(); }
    });
    document.addEventListener("click", function (e) {
      if (panel.getAttribute("data-open") === "true" && !panel.contains(e.target) && e.target !== fab && !fab.contains(e.target)) openPanel(false);
    });
  }

  function syncControls() {
    panel.querySelectorAll("[data-size]").forEach(function (b) {
      b.setAttribute("aria-pressed", b.getAttribute("data-size") === prefs.size ? "true" : "false");
    });
    setToggle("contrast", prefs.contrast === "high");
    setToggle("dys", prefs.dys === "on");
    setToggle("motion", doc.getAttribute("data-motion") === "reduce");
  }
  function setToggle(k, on) {
    var b = panel.querySelector('[data-toggle="' + k + '"]');
    if (!b) return;
    b.setAttribute("aria-pressed", on ? "true" : "false");
    var s = b.querySelector(".state"); if (s) s.textContent = on ? "On" : "Off";
  }

  /* ---------- Mobile nav ---------- */
  function wireNav() {
    var burger = document.querySelector(".hamburger");
    var menu = document.querySelector(".menu");
    if (!burger || !menu) return;

    function isMobile() { return window.getComputedStyle(burger).display !== "none"; }

    function setNav(open) {
      menu.setAttribute("data-open", open ? "true" : "false");
      burger.setAttribute("aria-expanded", open ? "true" : "false");
      burger.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      if (isMobile()) {
        menu.setAttribute("aria-hidden", open ? "false" : "true");
      } else {
        menu.removeAttribute("aria-hidden");
      }
    }

    setNav(false);

    burger.addEventListener("click", function () { setNav(menu.getAttribute("data-open") !== "true"); });
    menu.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () { setNav(false); });
    });
    window.addEventListener("resize", function () {
      if (!isMobile()) { menu.removeAttribute("aria-hidden"); }
      else if (menu.getAttribute("data-open") !== "true") { menu.setAttribute("aria-hidden", "true"); }
    });
  }

  /* ---------- Read aloud (Web Speech API) ---------- */
  function wireReadAloud() {
    var supported = "speechSynthesis" in window;
    var current = null;
    document.querySelectorAll("[data-readaloud]").forEach(function (btn) {
      if (!supported) { btn.style.display = "none"; return; }
      var labelEl = btn.querySelector(".ra-label");
      var iconPlay = '<path d="M6 4l14 8-14 8V4z"/>';
      var iconStop = '<rect x="6" y="6" width="12" height="12" rx="2"/>';
      btn.addEventListener("click", function () {
        if (btn.getAttribute("data-speaking") === "true") { stop(); return; }
        document.querySelectorAll('[data-speaking="true"]').forEach(function(o){ o.setAttribute("data-speaking","false"); }); 
        window.speechSynthesis.cancel();
        var sel = btn.getAttribute("data-readaloud");
        var target = sel ? document.querySelector(sel) : btn.closest("main");
        if (!target) return;
        var text = (target.getAttribute("data-read-text") || target.innerText || "").replace(/\s+/g, " ").trim();
        var u = new SpeechSynthesisUtterance(text);
        u.rate = 0.96; u.pitch = 1;
        u.onend = u.onerror = function () { reset(btn, labelEl, iconPlay); };
        current = u;
        btn.setAttribute("data-speaking", "true");
        if (labelEl) labelEl.textContent = "Stop";
        var ic = btn.querySelector("svg"); if (ic) ic.innerHTML = iconStop;
        window.speechSynthesis.speak(u);
      });
      function reset(b, l, icon) { b.setAttribute("data-speaking", "false"); if (l) l.textContent = b.getAttribute("data-label-default") || "Listen"; var ic = b.querySelector("svg"); if (ic) ic.innerHTML = icon; }
      function stop() { window.speechSynthesis.cancel(); reset(btn, labelEl, iconPlay); }
    });
    window.addEventListener("beforeunload", function () { if (supported) window.speechSynthesis.cancel(); });
  }

  /* ---------- Forms: validation + Web3Forms submit ---------- */
  function wireForms() {
    document.querySelectorAll("form[data-validate]").forEach(function (form) {
      form.setAttribute("novalidate", "");

      form.addEventListener("submit", function (e) {
        e.preventDefault();

        /* Client-side validation */
        var ok = true, firstBad = null;
        form.querySelectorAll("[required], [data-email]").forEach(function (el) {
          var bad = false;
          if (el.type === "checkbox") { if (el.hasAttribute("required") && !el.checked) bad = true; }
          else if (el.hasAttribute("required") && !el.value.trim()) bad = true;
          if (el.hasAttribute("data-email") && el.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(el.value)) bad = true;
          el.setAttribute("aria-invalid", bad ? "true" : "false");
          if (bad && !firstBad) firstBad = el;
          if (bad) ok = false;
        });
        if (!ok) { if (firstBad) firstBad.focus(); return; }

        /* Loading state */
        var submitBtn = form.querySelector(".btn[type=submit]");
        var origText = submitBtn ? submitBtn.textContent : "";
        if (submitBtn) { submitBtn.disabled = true; submitBtn.setAttribute("aria-busy", "true"); submitBtn.textContent = "Sending…"; }

        /* Submit to Web3Forms */
        fetch("https://api.web3forms.com/submit", {
          method: "POST",
          headers: { "Accept": "application/json" },
          body: new FormData(form)
        })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          if (data.success) {
            var success = form.querySelector(".form-success");
            if (success) {
              form.querySelectorAll(".field, fieldset, .btn[type=submit]").forEach(function (n) { n.style.display = "none"; });
              success.setAttribute("data-show", "true");
              success.setAttribute("tabindex", "-1");
              success.focus();
            }
          } else {
            resetBtn(submitBtn, origText);
            showErr(form);
          }
        })
        .catch(function () { resetBtn(submitBtn, origText); showErr(form); });
      });

      form.querySelectorAll("input, select, textarea").forEach(function (el) {
        function clearInvalid() { if (el.getAttribute("aria-invalid") === "true") el.setAttribute("aria-invalid", "false"); }
        el.addEventListener("input", clearInvalid);
        el.addEventListener("change", clearInvalid);
      });
    });
  }

  function resetBtn(btn, text) {
    if (!btn) return;
    btn.disabled = false; btn.removeAttribute("aria-busy"); btn.textContent = text;
  }
  function showErr(form) {
    var errDiv = form.querySelector(".form-error");
    if (!errDiv) return;
    errDiv.setAttribute("data-show", "true");
    errDiv.setAttribute("tabindex", "-1");
    errDiv.focus();
  }
})();
