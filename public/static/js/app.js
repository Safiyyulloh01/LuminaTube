(function () {
  'use strict';
  window.ready = function (fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  };
  window.T = {};
  window.toast = function (msg) {
    var el = document.getElementById('toast');
    if (!el) { return; }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove('show'); }, 2200);
  };
  window.api = function (url, opts) {
    opts = opts || {};
    opts.headers = Object.assign({ 'X-Requested-With': 'fetch' }, opts.headers || {});
    if (opts.json) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(opts.json);
      delete opts.json;
    }
    opts.credentials = 'same-origin';
    return fetch(url, opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) throw new Error(j.error || r.status);
        return j;
      });
    });
  };
  window.copyText = function (text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).catch(function () { return fallback(text); });
    }
    return fallback(text);
    function fallback(txt) {
      var ta = document.createElement('textarea');
      ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.focus(); ta.select();
      try { document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta);
      return Promise.resolve();
    }
  };
  window.esc = function (s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  };
  ready(function () {
    window.T = (window.UZ && window.UZ.T) || {};
    var mb = document.getElementById('umenu-btn');
    var mm = document.getElementById('umenu');
    if (mb && mm) {
      mb.addEventListener('click', function (e) { e.stopPropagation(); mm.classList.toggle('open'); });
      document.addEventListener('click', function () { mm.classList.remove('open'); });
    }
    document.querySelectorAll('.tabs').forEach(function (bar) {
      bar.addEventListener('click', function (e) {
        var b = e.target.closest('button[data-tab]');
        if (!b) return;
        bar.querySelectorAll('button').forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        document.querySelectorAll('.tabpane').forEach(function (p) { p.classList.remove('on'); });
        var pane = document.getElementById('pane-' + b.dataset.tab);
        if (pane) pane.classList.add('on');
      });
    });
    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-copy]');
      if (!b) return;
      e.preventDefault();
      var inp = document.getElementById(b.dataset.copy);
      if (!inp) return;
      var wasPwd = inp.type === 'password';
      if (wasPwd) inp.type = 'text';
      copyText(inp.value).then(function () { toast(T.copied || 'OK'); });
      if (wasPwd) inp.type = 'password';
    });
    var sb = document.getElementById('sub-btn');
    if (sb) {
      sb.addEventListener('click', function () {
        api('/api/sub/' + sb.dataset.ch, { method: 'POST' }).then(function (r) {
          sb.dataset.on = r.subbed ? 1 : 0;
          sb.textContent = r.subbed ? (T.subscribed || 'OK') : (T.subscribe || 'Sub');
          sb.classList.toggle('primary', !r.subbed);
          var c = document.getElementById('sub-count');
          if (c) c.textContent = r.count;
        }).catch(function () { toast(T.error || 'Xatolik'); });
      });
    }
  });
})();
