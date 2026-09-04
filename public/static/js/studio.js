(function () {
  'use strict';
  function post(url, form) {
    return fetch(url, {
      method: 'POST', body: form, credentials: 'same-origin',
      headers: { 'X-Requested-With': 'fetch' }
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) throw new Error(j.error || r.status);
        return j;
      });
    });
  }
  ready(function () {
    var keyInp = document.getElementById('stream-key');
    var tk = document.getElementById('toggle-key');
    if (tk) {
      tk.addEventListener('click', function () {
        var hidden = keyInp.type === 'password';
        keyInp.type = hidden ? 'text' : 'password';
        tk.textContent = hidden ? (T.hide_key || 'Hide') : (T.show_key || 'Show');
      });
    }
    var rk = document.getElementById('reset-key');
    if (rk) {
      rk.addEventListener('click', function () {
        if (!confirm(T.reset_confirm || '?')) return;
        api('/api/studio/resetkey', { method: 'POST' }).then(function (r) {
          keyInp.value = r.key;
          toast(T.saved || 'OK');
        }).catch(function () { toast(T.error || 'Xatolik'); });
      });
    }
    function bindPreview(inputId, imgId) {
      var inp = document.getElementById(inputId);
      var img = document.getElementById(imgId);
      if (!inp || !img) return;
      inp.addEventListener('change', function () {
        var f = inp.files && inp.files[0];
        if (!f) return;
        if (img._url) { try { URL.revokeObjectURL(img._url); } catch (e) {} }
        img._url = URL.createObjectURL(f);
        img.src = img._url;
      });
    }
    bindPreview('thumb-input', 'thumb-prev');
    bindPreview('avatar-input', 'avatar-prev');
    var ti0 = document.getElementById('thumb-input');
    var ai0 = document.getElementById('avatar-input');
    function failMsg(err) {
      var m = err && err.message;
      if (m === 'too_big') return T.too_big || 'Rasm juda katta';
      if (m === 'bad_image') return T.bad_image || 'Rasmni o\'qib bo\'lmadi';
      return T.error || 'Xatolik';
    }
    var nf = document.getElementById('next-form');
    if (nf) {
      nf.addEventListener('submit', function (e) {
        e.preventDefault();
        var cf = document.getElementById('chat-form');
        if (cf) {
          nf.querySelector('[name=slow_mode]').value = cf.querySelector('[name=slow_mode]').value;
          nf.querySelector('[name=chat_enabled]').value = cf.querySelector('[name=chat_enabled]').checked ? '1' : '0';
        }
        post('/api/studio/next', new FormData(nf)).then(function (r) {
          toast(T.saved || 'OK');
          var tp = document.getElementById('thumb-prev');
          if (tp) tp.src = r.thumb ? (r.thumb + '?v=' + Date.now()) : '/img/no-thumb.svg';
          var rm = nf.querySelector('[name=remove_thumb]');
          if (rm) rm.checked = false;
          if (ti0) ti0.value = '';
        }).catch(function (err) { toast(failMsg(err)); });
      });
    }
    var cf = document.getElementById('chat-form');
    if (cf) {
      cf.addEventListener('submit', function (e) {
        e.preventDefault();
        var fd = new FormData();
        fd.append('title', (nf && nf.querySelector('[name=title]').value) || '');
        fd.append('description', (nf && nf.querySelector('[name=description]').value) || '');
        fd.append('slow_mode', cf.querySelector('[name=slow_mode]').value);
        fd.append('chat_enabled', cf.querySelector('[name=chat_enabled]').checked ? '1' : '0');
        post('/api/studio/next', fd).then(function () { toast(T.saved || 'OK'); })
          .catch(function () { toast(T.error || 'Xatolik'); });
      });
    }
    var chf = document.getElementById('chan-form');
    if (chf) {
      chf.addEventListener('submit', function (e) {
        e.preventDefault();
        var btn = chf.querySelector('button[type=submit]');
        if (btn) btn.disabled = true;
        post('/api/studio/channel', new FormData(chf))
          .then(function (r) {
            toast(r.donate_bad ? (T.donate_bad || 'Havola noto\'g\'ri') : (T.saved || 'OK'));
            var du = document.getElementById('donate-url');
            if (du && r.donate_url !== undefined) du.value = r.donate_url;
            if (ai0) ai0.value = '';
            var ap = document.getElementById('avatar-prev');
            if (ap && r.avatar) ap.src = r.avatar + '?v=' + Date.now();
            var hb = document.getElementById('umenu-btn');
            if (hb && r.avatar) {
              hb.textContent = '';
              var im = document.createElement('img');
              im.src = r.avatar + '?v=' + Date.now();
              im.alt = '';
              hb.appendChild(im);
            }
          })
          .catch(function (err) { toast(failMsg(err)); })
          .then(function () { if (btn) btn.disabled = false; });
      });
    }
    var listPane = document.getElementById('pane-list');
    if (listPane) {
      listPane.addEventListener('click', function (e) {
        var b = e.target.closest('button[data-act]');
        if (!b) return;
        var tr = b.closest('tr[data-sid]');
        if (!tr) return;
        var id = tr.dataset.sid;
        if (b.dataset.act === 'del') {
          if (!confirm(T.del_confirm || '?')) return;
          api('/api/studio/stream/' + id, { method: 'DELETE' }).then(function () {
            var er = listPane.querySelector('tr[data-edit="' + id + '"]');
            if (er) er.remove();
            tr.remove();
            toast(T.saved || 'OK');
          }).catch(function () { toast(T.error || 'Xatolik'); });
        } else if (b.dataset.act === 'vis') {
          var v = b.dataset.v;
          api('/api/studio/stream/' + id + '/visibility', { method: 'POST', json: { visibility: v } })
            .then(function (r) {
              b.dataset.v = r.visibility === 'private' ? 'public' : 'private';
              b.textContent = r.visibility === 'private' ? T.make_public : T.make_private;
              var p = tr.querySelector('[data-vis]');
              p.textContent = r.visibility === 'private' ? T.private : T.public;
              p.className = 'pill ' + (r.visibility === 'private' ? 'priv' : 'pub');
            }).catch(function () { toast(T.error || 'Xatolik'); });
        } else if (b.dataset.act === 'edit') {
          var row = listPane.querySelector('tr[data-edit="' + id + '"]');
          if (row) row.style.display = row.style.display === 'none' ? '' : 'none';
        }
      });
      listPane.addEventListener('submit', function (e) {
        var f = e.target.closest('form.stream-edit');
        if (!f) return;
        e.preventDefault();
        post('/api/studio/stream/' + f.dataset.id, new FormData(f)).then(function () {
          toast(T.saved || 'OK');
          setTimeout(function () { location.reload(); }, 700);
        }).catch(function () { toast(T.error || 'Xatolik'); });
      });
    }
    var addBtn = document.getElementById('mod-add');
    if (addBtn) {
      addBtn.addEventListener('click', function () {
        var inp = document.getElementById('mod-login');
        var login = inp.value.trim();
        if (!login) return;
        api('/api/studio/mod', { method: 'POST', json: { login: login } }).then(function (r) {
          var tb = document.querySelector('#mod-table tbody');
          if (tb.querySelector('tr[data-uid="' + r.user.id + '"]')) {
            inp.value = '';
            return toast(T.saved || 'OK');   
          }
          var tr = document.createElement('tr');
          tr.dataset.uid = r.user.id;
          tr.innerHTML = '<td><span class="urow">' +
            '<span class="avatar xs"></span>' +
            '<svg class="keyico" viewBox="0 0 24 24"><path d="M22.7 19l-9.1-9.1a7 7 0 00-9.2-9.1l3.9 3.9-2.8 2.8-3.9-3.9a7 7 0 009.1 9.2l9.1 9.1a1 1 0 001.4 0l1.5-1.5a1 1 0 000-1.4z"/></svg>' +
            '<span class="nm mod"></span></span></td>' +
            '<td style="text-align:right"><button class="btn sm danger" data-act="unmod">' + esc(T.remove || 'x') + '</button></td>';
          tr.querySelector('.nm').textContent = r.user.login;
          tr.querySelector('.avatar').textContent = (r.user.login || '?').charAt(0);
          tb.appendChild(tr);
          var none = document.getElementById('mod-none');
          if (none) none.style.display = 'none';
          inp.value = '';
          toast(T.saved || 'OK');
        }).catch(function (err) {
          toast(err.message === 'no_user' ? 'Foydalanuvchi topilmadi' : (T.error || 'Xatolik'));
        });
      });
    }
    var chatPane = document.getElementById('pane-chat');
    if (chatPane) {
      chatPane.addEventListener('click', function (e) {
        var b = e.target.closest('button[data-act]');
        if (!b) return;
        var tr = b.closest('tr[data-uid]');
        if (!tr) return;
        var uid = tr.dataset.uid;
        var url = b.dataset.act === 'unmod' ? '/api/studio/mod/' + uid : '/api/studio/ban/' + uid;
        api(url, { method: 'DELETE' }).then(function () {
          tr.remove();
          var none = document.getElementById('mod-none');
          if (none && !document.querySelectorAll('#mod-table tbody tr').length) none.style.display = '';
          toast(T.saved || 'OK');
        }).catch(function () { toast(T.error || 'Xatolik'); });
      });
    }
  });
})();
