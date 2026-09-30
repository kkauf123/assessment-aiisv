/* assessment.aiisv.org — app.js v1.0
   Code generator + sample-library gate. Talks to the Apps Script backend in apps-script/Code.gs. */
(function () {
  'use strict';
  var CFG = window.AIISV_CONFIG || {};
  var SAMPLES_KEY = 'aiisv_samples_unlocked';
  var CODE_KEY = 'aiisv_last_code';

  function store(kind) { try { return window[kind]; } catch (e) { return null; } }
  function get(kind, k) { try { var s = store(kind); return s ? s.getItem(k) : null; } catch (e) { return null; } }
  function set(kind, k, v) { try { var s = store(kind); if (s) s.setItem(k, v); } catch (e) {} }
  function del(kind, k) { try { var s = store(kind); if (s) s.removeItem(k); } catch (e) {} }

  // Remember campaign parameters (utm_*, ref) for the whole visit.
  (function keepUtm() {
    var p = new URLSearchParams(location.search), found = {};
    p.forEach(function (v, k) { if (/^utm_|^ref$/.test(k)) found[k] = v.slice(0, 120); });
    if (Object.keys(found).length) set('sessionStorage', 'aiisv_utm', JSON.stringify(found));
  })();
  function utm() { try { return JSON.parse(get('sessionStorage', 'aiisv_utm') || '{}'); } catch (e) { return {}; } }

  // POST as text/plain so the browser skips the CORS preflight Apps Script can't answer.
  function post(payload, tries) {
    tries = tries || 0;
    if (!CFG.API_URL) return Promise.reject(new Error('not-configured'));
    payload.utm = utm();
    payload.page = location.pathname;
    return fetch(CFG.API_URL, {
      method: 'POST', redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    }).then(function (r) { return r.json(); }).catch(function (err) {
      if (tries < 2) return new Promise(function (res) { setTimeout(res, 900 * (tries + 1)); }).then(function () { return post(payload, tries + 1); });
      throw err;
    });
  }

  // Cloudflare Turnstile (optional)
  var tsIds = {};
  window.aiisvTurnstileReady = function () {
    document.querySelectorAll('.ts').forEach(function (el) {
      tsIds[el.id] = window.turnstile.render(el, { sitekey: CFG.TURNSTILE_SITEKEY, appearance: 'interaction-only' });
    });
  };
  if (CFG.TURNSTILE_SITEKEY && document.querySelector('.ts')) {
    var s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=aiisvTurnstileReady&render=explicit';
    s.async = true; s.defer = true; document.head.appendChild(s);
  }
  function tsToken(form) {
    var el = form.querySelector('.ts');
    if (!el || !window.turnstile || tsIds[el.id] === undefined) return '';
    return window.turnstile.getResponse(tsIds[el.id]) || '';
  }
  function tsReset(form) {
    var el = form.querySelector('.ts');
    if (el && window.turnstile && tsIds[el.id] !== undefined) window.turnstile.reset(tsIds[el.id]);
  }

  function showError(form, msg) {
    var box = form.querySelector('.error');
    if (!box) { box = document.createElement('p'); box.className = 'error'; box.setAttribute('role', 'alert'); form.appendChild(box); }
    box.textContent = msg; box.hidden = false;
  }
  function clearError(form) { var b = form.querySelector('.error'); if (b) b.hidden = true; }
  function busy(btn, on, label) {
    if (!btn) return;
    if (on) { btn.dataset.label = btn.textContent; btn.textContent = label; btn.disabled = true; }
    else { btn.textContent = btn.dataset.label || btn.textContent; btn.disabled = false; }
  }
  var FALLBACK = 'We couldn’t reach our server just now. Please email info@aiisv.org and we’ll send your access code personally.';

  /* ---------- 1. Executive Lite code generator ---------- */
  var codeForm = document.getElementById('code-form');
  if (codeForm) {
    var result = document.getElementById('code-result');
    var showCode = function (data) {
      document.getElementById('code-value').textContent = data.code;
      document.getElementById('code-start').href = data.startUrl;
      document.getElementById('code-note').textContent = data.existing
        ? 'You already have a code for this email, so here it is again. We’ve re-sent it to your inbox too.'
        : 'We’ve also emailed this code to you from info@aiisv.org, with a one-click link to begin.';
      codeForm.hidden = true; result.hidden = false;
      set('sessionStorage', CODE_KEY, JSON.stringify(data));
      var h = result.querySelector('[tabindex="-1"]'); if (h) h.focus();
    };
    var saved = get('sessionStorage', CODE_KEY);
    if (saved) { try { showCode(JSON.parse(saved)); } catch (e) {} }

    codeForm.addEventListener('submit', function (e) {
      e.preventDefault(); clearError(codeForm);
      if (!codeForm.reportValidity()) return;
      var f = codeForm.elements, btn = codeForm.querySelector('button[type=submit]');
      busy(btn, true, 'Generating your code…');
      post({
        action: 'code', name: f.name.value.trim(), email: f.email.value.trim(), company: f.company.value.trim(),
        title: f.title.value.trim(), website: f.website.value, token: tsToken(codeForm)
      }).then(function (res) {
        busy(btn, false);
        if (res && res.ok) { showCode(res); if (window.gtag) gtag('event', 'generate_code'); }
        else { tsReset(codeForm); showError(codeForm, (res && res.message) || FALLBACK); }
      }).catch(function () { busy(btn, false); tsReset(codeForm); showError(codeForm, FALLBACK); });
    });

    document.getElementById('code-copy').addEventListener('click', function () {
      var b = this, v = document.getElementById('code-value').textContent;
      var done = function () { b.textContent = 'Copied'; setTimeout(function () { b.textContent = 'Copy code'; }, 2000); };
      if (navigator.clipboard) navigator.clipboard.writeText(v).then(done, done); else done();
    });
    document.getElementById('code-reset').addEventListener('click', function () {
      del('sessionStorage', CODE_KEY); codeForm.reset(); tsReset(codeForm);
      result.hidden = true; codeForm.hidden = false; codeForm.elements.name.focus();
    });
  }

  /* ---------- 2. Sample-library gate (landing page + /samples/) ---------- */
  var unlocked = get('localStorage', SAMPLES_KEY) === '1' || /[?&]unlocked=1\b/.test(location.search);
  if (unlocked) set('localStorage', SAMPLES_KEY, '1');

  var lib = document.getElementById('library'), lockedView = document.getElementById('library-locked');
  if (lib && lockedView) { lib.hidden = !unlocked; lockedView.hidden = unlocked; }

  document.querySelectorAll('form.gate-form').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault(); clearError(form);
      if (!form.reportValidity()) return;
      var f = form.elements, btn = form.querySelector('button[type=submit]');
      busy(btn, true, 'Opening the library…');
      var go = function () {
        set('localStorage', SAMPLES_KEY, '1');
        var dest = form.dataset.next || '/samples/';
        if (lib && lockedView) { lib.hidden = false; lockedView.hidden = true; busy(btn, false); window.scrollTo({ top: lib.offsetTop - 80, behavior: 'smooth' }); }
        else location.href = dest;
      };
      // Never hold the visitor back: unlock after the save, or after 6s if the server is slow.
      var t = setTimeout(go, 6000), fired = false;
      var once = function () { if (!fired) { fired = true; clearTimeout(t); go(); } };
      post({ action: 'samples', name: f.sname.value.trim(), email: f.semail.value.trim(), website: f.website.value, token: tsToken(form) })
        .then(function (res) {
          if (res && res.ok === false && res.message && res.retry) { fired = true; clearTimeout(t); busy(btn, false); tsReset(form); showError(form, res.message); return; }
          if (window.gtag) gtag('event', 'unlock_samples');
          once();
        }).catch(once);
    });
  });
})();
