(function () {
  'use strict';
  var UZ = window.UZ || {};
  var HLS_SOURCES = [
    'https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.5.17/hls.min.js',
    'https://unpkg.com/hls.js@1.5.17/dist/hls.min.js'
  ];
  function loadHls(cb) {
    if (window.Hls) return cb(true);
    var i = 0, done = false;
    function next() {
      if (done) return;
      if (window.Hls) { done = true; return cb(true); }
      if (i >= HLS_SOURCES.length) { done = true; return cb(false); }
      var s = document.createElement('script');
      s.src = HLS_SOURCES[i++];
      s.async = true;
      s.onload = function () { setTimeout(next, 0); };
      s.onerror = function () { setTimeout(next, 0); };
      document.head.appendChild(s);
    }
    next();
  }
  var pstat, pmsg, pbtn;
  function status(text, isErr, retryFn) {
    if (!pstat) return;
    pstat.hidden = false;
    pstat.classList.toggle('err', !!isErr);
    pmsg.textContent = text;
    if (retryFn) { pbtn.hidden = false; pbtn.onclick = retryFn; }
    else pbtn.hidden = true;
  }
  function hideStatus() { if (pstat) pstat.hidden = true; }
  function buildQuality(hls, box) {
    var sel = document.createElement('select');
    sel.id = 'qsel';
    sel.style.cssText = 'position:absolute;top:8px;right:8px;z-index:6;background:rgba(0,0,0,.65);' +
      'color:#fff;border:1px solid #444;border-radius:6px;padding:3px 6px;font-size:11.5px';
    function fill() {
      sel.innerHTML = '<option value="-1">Auto</option>';
      (hls.levels || []).forEach(function (l, i) {
        var o = document.createElement('option');
        o.value = i;
        o.textContent = (l.height ? l.height + 'p' : Math.round(l.bitrate / 1000) + 'k');
        sel.appendChild(o);
      });
      sel.value = String(hls.currentLevel);
    }
    hls.on(window.Hls.Events.MANIFEST_PARSED, fill);
    hls.on(window.Hls.Events.LEVEL_SWITCHED, function () {
      if (sel.value !== '-1') sel.value = String(hls.currentLevel);
    });
    sel.addEventListener('change', function () { hls.currentLevel = parseInt(sel.value, 10); });
    box.appendChild(sel);
  }
  function initPlayer() {
    var video = document.getElementById('player');
    var box = document.getElementById('player-box');
    pstat = document.getElementById('pstat');
    pmsg = pstat ? pstat.querySelector('.msg') : null;
    pbtn = pstat ? pstat.querySelector('.btn') : null;
    if (!video || !UZ.playUrl) return;
    var url = UZ.playUrl;
    video.addEventListener('playing', hideStatus);
    video.addEventListener('canplay', hideStatus);
    if (!/\.m3u8($|\?)/.test(url)) { video.src = url; hideStatus(); return; }
    var native = !!video.canPlayType('application/vnd.apple.mpegurl');
    status(UZ.T.p_loading || '...');
    loadHls(function (ok) {
      if (ok && window.Hls.isSupported()) {
        startHls(url, 0);
      } else if (native) {
        video.src = url;
        video.play().catch(function () {});
      } else {
        status(UZ.T.p_hlsfail || 'hls.js', true, function () { location.reload(); });
      }
    });
    var netFails = 0;
    function startHls(src, attempt) {
      if (window.__hls) { try { window.__hls.destroy(); } catch (e) {} }
      var hls = new window.Hls({
        liveSyncDurationCount: 3,
        maxBufferLength: 20,
        manifestLoadingMaxRetry: 6,
        manifestLoadingRetryDelay: 1500,
        levelLoadingMaxRetry: 6,
        fragLoadingMaxRetry: 6,
        lowLatencyMode: false
      });
      window.__hls = hls;
      hls.loadSource(src);
      hls.attachMedia(video);
      buildQuality(hls, box);
      hls.on(window.Hls.Events.MANIFEST_PARSED, function () {
        status(UZ.T.p_wait || '...');
        video.play().catch(function () {});
      });
      hls.on(window.Hls.Events.FRAG_BUFFERED, hideStatus);
      hls.on(window.Hls.Events.ERROR, function (evt, data) {
        if (!data.fatal) return;
        if (data.type === window.Hls.ErrorTypes.MEDIA_ERROR) {
          try { hls.recoverMediaError(); } catch (e) {}
          return;
        }
        if (data.type === window.Hls.ErrorTypes.NETWORK_ERROR) {
          netFails++;
          if (attempt === 0 && netFails >= 2 && UZ.altUrl) {
            netFails = 0;
            return startHls(UZ.altUrl, 1);
          }
          if (netFails > 6) {
            return status(UZ.T.p_offline || '...', true, function () { netFails = 0; startHls(src, attempt); });
          }
          status(UZ.T.p_wait || '...');
          setTimeout(function () { try { hls.startLoad(); } catch (e) {} }, 2500);
          return;
        }
        status(UZ.T.p_offline || '...', true, function () { location.reload(); });
      });
    }
  }
  function initActions() {
    var lb = document.getElementById('like-btn');
    if (lb) {
      lb.addEventListener('click', function () {
        api('/api/like/' + lb.dataset.id, { method: 'POST' }).then(function (r) {
          lb.classList.toggle('on', r.liked);
          document.getElementById('like-count').textContent = r.count;
        }).catch(function () { toast(T.error || 'Xatolik'); });
      });
    }
    var shb = document.getElementById('share-btn');
    if (shb) {
      shb.addEventListener('click', function () {
        var url = location.origin + location.pathname;
        if (navigator.share) navigator.share({ title: document.title, url: url }).catch(function () {});
        else copyText(url).then(function () { toast(T.copied || 'OK'); });
      });
    }
  }
  function initComments() {
    var form = document.getElementById('comment-form');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var ta = form.querySelector('textarea');
        var body = ta.value.trim();
        if (!body) return;
        api('/api/comment/' + form.dataset.id, { method: 'POST', json: { body: body } }).then(function (r) {
          ta.value = '';
          var nc = document.getElementById('no-comments');
          if (nc) nc.remove();
          var div = document.createElement('div');
          div.className = 'citem';
          div.dataset.cid = r.id;
          div.innerHTML = '<span class="avatar sm">' + esc(r.login.charAt(0)) + '</span>' +
            '<div class="body"><div class="hd"><b>' + esc(r.login) + '</b><span>—</span></div>' +
            '<div class="txt"></div><button class="del" data-cid="' + r.id + '">' + esc(T['delete'] || 'x') + '</button></div>';
          div.querySelector('.txt').textContent = r.body;
          var list = document.getElementById('comment-list');
          list.insertBefore(div, list.firstChild);
        }).catch(function () { toast(T.error || 'Xatolik'); });
      });
    }
    var list = document.getElementById('comment-list');
    if (list) {
      list.addEventListener('click', function (e) {
        var b = e.target.closest('.del');
        if (!b) return;
        if (!confirm(T.del_confirm || '?')) return;
        api('/api/comment/' + b.dataset.cid, { method: 'DELETE' }).then(function () {
          var it = b.closest('.citem');
          if (it) it.remove();
        }).catch(function () { toast(T.error || 'Xatolik'); });
      });
    }
  }
  function isMobile() { return window.innerWidth <= 1000; }
  function setAppVh() {
    var h = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
    document.documentElement.style.setProperty('--appvh', Math.round(h) + 'px');
  }
  function initMobileLayout() {
    if (!UZ.isLive) return;
    var tabs = document.getElementById('m-tabs');
    function apply() {
      if (isMobile()) {
        document.body.classList.add('mwatch');
        if (!document.body.classList.contains('mtab-info')) document.body.classList.add('mtab-chat');
      } else {
        document.body.classList.remove('mwatch', 'mtab-chat', 'mtab-info');
      }
      setAppVh();
    }
    apply();
    if (tabs) {
      tabs.addEventListener('click', function (e) {
        var b = e.target.closest('button[data-mtab]');
        if (!b) return;
        tabs.querySelectorAll('button').forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        var chat = b.dataset.mtab === 'chat';
        document.body.classList.toggle('mtab-chat', chat);
        document.body.classList.toggle('mtab-info', !chat);
        if (chat) {
          var m = document.getElementById('chat-msgs');
          if (m) setTimeout(function () { m.scrollTop = m.scrollHeight; }, 30);
        }
      });
    }
    window.addEventListener('resize', apply);
    window.addEventListener('orientationchange', function () { setTimeout(apply, 250); });
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', setAppVh);
    }
  }
  function initChat() {
    var wrap = document.getElementById('chatbox');
    if (!wrap || !window.io) return;
    var msgsEl = document.getElementById('chat-msgs');
    var input = document.getElementById('chat-input');
    var sendBtn = document.getElementById('chat-send');
    var sendHtml = sendBtn.innerHTML;
    var hint = document.getElementById('chat-hint');
    var pinBox = document.getElementById('pinned');
    var pinTxt = document.getElementById('pinned-txt');
    var ctx = document.getElementById('user-ctx');
    var ctxName = document.getElementById('ctx-name');
    var ctxOwner = document.getElementById('ctx-owner-only');
    var newPill = document.getElementById('newmsg');
    var emojiBar = document.getElementById('emoji-bar');
    var state = { slowMode: 8, chatEnabled: true };
    var timerId = null;
    var target = { userId: 0, login: '', msgId: 0 };
    var unseen = 0;
    if (!UZ.isOwner && ctxOwner) ctxOwner.style.display = 'none';
    var socket = io({ path: '/socket.io' });
    function atBottom() {
      return msgsEl.scrollHeight - msgsEl.scrollTop - msgsEl.clientHeight < 70;
    }
    function scrollDown() {
      msgsEl.scrollTop = msgsEl.scrollHeight;
      unseen = 0;
      if (newPill) newPill.hidden = true;
    }
    msgsEl.addEventListener('scroll', function () {
      if (atBottom()) { unseen = 0; if (newPill) newPill.hidden = true; }
    });
    if (newPill) newPill.addEventListener('click', scrollDown);
    function badgeIcon(badge) {
      if (badge === 'mod') return '<svg class="keyico" viewBox="0 0 24 24"><path d="M22.7 19l-9.1-9.1a7 7 0 00-9.2-9.1l3.9 3.9-2.8 2.8-3.9-3.9a7 7 0 009.1 9.2l9.1 9.1a1 1 0 001.4 0l1.5-1.5a1 1 0 000-1.4z"/></svg>';
      if (badge === 'owner') return '<svg class="ownico" viewBox="0 0 24 24"><path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.3 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8z"/></svg>';
      if (badge === 'admin') return '<svg class="ownico" style="fill:#ff6b6b" viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5z"/></svg>';
      return '';
    }
    function addMsg(m) {
      var stick = atBottom();
      var d = document.createElement('div');
      d.className = 'cmsg' + (m.badge ? ' ' + m.badge : '');
      d.dataset.mid = m.id;
      d.dataset.uid = m.uid;
      d.dataset.login = m.login;
      var nick = document.createElement('span');
      nick.className = 'nick';
      nick.innerHTML = badgeIcon(m.badge);
      nick.appendChild(document.createTextNode(m.login + ':'));
      var txt = document.createElement('span');
      txt.textContent = ' ' + m.text;
      d.appendChild(nick);
      d.appendChild(txt);
      msgsEl.appendChild(d);
      while (msgsEl.children.length > 300) msgsEl.removeChild(msgsEl.firstChild);
      if (stick) scrollDown();
      else if (newPill) { unseen++; newPill.hidden = false; newPill.textContent = (UZ.T.newmsg || '↓') + ' ' + unseen; }
    }
    function sysMsg(text) {
      var stick = atBottom();
      var d = document.createElement('div');
      d.className = 'chat-sys';
      d.textContent = text;
      msgsEl.appendChild(d);
      if (stick) scrollDown();
    }
    function setPinned(p) {
      if (!p) { pinBox.style.display = 'none'; return; }
      pinBox.style.display = 'flex';
      pinTxt.textContent = p.login + ': ' + p.text;
      if (UZ.isOwner) {
        pinTxt.style.cursor = 'pointer';
        pinTxt.title = UZ.T.unpin || '';
        pinTxt.onclick = function () { socket.emit('mod:pin', { id: 0 }); };
      }
    }
    function refreshHint() {
      if (!state.chatEnabled) { hint.textContent = UZ.T.chat_disabled || ''; return; }
      hint.textContent = state.slowMode > 0
        ? (UZ.T.slow_hint || '').replace('{n}', state.slowMode) : '';
    }
    function lockFor(ms) {
      clearInterval(timerId);
      sendBtn.disabled = true;
      var end = Date.now() + ms;
      function tick() {
        var left = Math.ceil((end - Date.now()) / 1000);
        if (left <= 0) {
          clearInterval(timerId);
          sendBtn.disabled = false;
          sendBtn.innerHTML = sendHtml;
          refreshHint();
          return;
        }
        sendBtn.textContent = String(left);
      }
      tick();
      timerId = setInterval(tick, 250);
    }
    function setViewers(n) {
      var a = document.getElementById('viewers-n');
      var b = document.getElementById('viewers-n2');
      if (a) a.textContent = fmtN(n);
      if (b) b.textContent = fmtN(n);
    }
    function fmtN(n) {
      n = Number(n) || 0;
      if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
      if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
      return String(n);
    }
    socket.on('connect', function () { socket.emit('join', { streamId: UZ.streamId }); });
    socket.on('init', function (d) {
      msgsEl.innerHTML = '';
      state.slowMode = d.slowMode;
      state.chatEnabled = d.chatEnabled;
      (d.messages || []).forEach(addMsg);
      if (!d.messages || !d.messages.length) sysMsg(UZ.T.chat_empty || '');
      setPinned(d.pinned);
      setViewers(d.viewers);
      refreshHint();
      if (!d.chatEnabled) { input.disabled = true; sendBtn.disabled = true; }
      scrollDown();
    });
    socket.on('msg', addMsg);
    socket.on('viewers', setViewers);
    socket.on('pinned', setPinned);
    socket.on('state', function (d) {
      state.slowMode = d.slowMode;
      state.chatEnabled = d.chatEnabled;
      input.disabled = !d.chatEnabled;
      sendBtn.disabled = !d.chatEnabled;
      refreshHint();
    });
    socket.on('deleted', function (id) {
      var el = msgsEl.querySelector('[data-mid="' + id + '"]');
      if (el) el.remove();
    });
    socket.on('badge', function (d) {
      msgsEl.querySelectorAll('[data-uid="' + d.userId + '"]').forEach(function (el) {
        el.className = 'cmsg' + (d.badge ? ' ' + d.badge : '');
        var nick = el.querySelector('.nick');
        if (nick) { nick.innerHTML = badgeIcon(d.badge); nick.appendChild(document.createTextNode(el.dataset.login + ':')); }
      });
      if (d.badge === 'mod' && d.login) sysMsg(d.login + ' → ' + (UZ.T.moderator || 'moderator'));
    });
    function muteMe(until) {
      input.disabled = true; sendBtn.disabled = true;
      hint.textContent = until
        ? (UZ.T.muted || '').replace('{n}', new Date(until).toLocaleTimeString())
        : (UZ.T.banned || '');
    }
    socket.on('mutedUser', function (d) { if (d.userId === UZ.meId) muteMe(d.until); });
    socket.on('muted', function (d) { muteMe(d.until); });
    socket.on('slow', function (d) { lockFor(d.ms); });
    socket.on('streamend', function () {
      sysMsg(UZ.T.ended || '');
      setTimeout(function () { location.reload(); }, 6000);
    });
    socket.on('err', function (e) {
      if (e === 'chat_disabled') { input.disabled = true; sendBtn.disabled = true; hint.textContent = UZ.T.chat_disabled || ''; }
    });
    function send() {
      var v = input.value.trim();
      if (!v) return;
      socket.emit('msg', { text: v });
      input.value = '';
      input.focus();                    
      scrollDown();
      lockFor(UZ.canMod ? 1000 : Math.max(1000, state.slowMode * 1000));
    }
    sendBtn.addEventListener('click', function (e) { e.preventDefault(); send(); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !sendBtn.disabled) { e.preventDefault(); send(); }
    });
    input.addEventListener('focus', function () {
      setTimeout(function () { setAppVh(); scrollDown(); }, 250);
    });
    if (emojiBar) {
      emojiBar.addEventListener('click', function (e) {
        var b = e.target.closest('button[data-e]');
        if (!b) return;
        e.preventDefault();
        input.value = (input.value + b.dataset.e).slice(0, 300);
        input.focus();
      });
    }
    msgsEl.addEventListener('click', function (e) {
      var nick = e.target.closest('.nick');
      if (!nick) return;
      var row = nick.closest('.cmsg');
      var uid = parseInt(row.dataset.uid, 10);
      var login = row.dataset.login;
      if (!UZ.canMod || uid === UZ.meId) {
        if (uid === UZ.meId) return;
        input.value = ('@' + login + ' ' + input.value).slice(0, 300);
        input.focus();
        return;
      }
      target.userId = uid; target.login = login;
      target.msgId = parseInt(row.dataset.mid, 10);
      ctxName.textContent = login;
      if (window.innerWidth > 1000) {
        ctx.style.left = Math.min(window.innerWidth - 215, e.clientX) + 'px';
        ctx.style.top = Math.min(window.innerHeight - 300, e.clientY) + 'px';
      } else {
        ctx.style.left = ''; ctx.style.top = '';
      }
      ctx.classList.add('open');
      e.stopPropagation();
    });
    document.addEventListener('click', function () { ctx.classList.remove('open'); });
    ctx.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-a]');
      if (!b) return;
      var a = b.dataset.a;
      if (a === 'reply') { input.value = ('@' + target.login + ' ' + input.value).slice(0, 300); input.focus(); }
      else if (a === 'timeout') socket.emit('mod:timeout', { userId: target.userId, seconds: parseInt(b.dataset.s, 10) });
      else if (a === 'ban') socket.emit('mod:ban', { userId: target.userId });
      else if (a === 'unban') socket.emit('mod:unban', { userId: target.userId });
      else if (a === 'delmsg') socket.emit('mod:delete', { id: target.msgId });
      else if (a === 'pin') socket.emit('mod:pin', { id: target.msgId });
      else if (a === 'promote') socket.emit('mod:promote', { userId: target.userId });
      else if (a === 'demote') socket.emit('mod:demote', { userId: target.userId });
      ctx.classList.remove('open');
    });
  }
  function pollViewers() {
    if (!UZ.isLive || document.getElementById('chatbox')) return;
    setInterval(function () {
      api('/api/viewers/' + UZ.streamId).then(function (r) {
        var b = document.getElementById('viewers-n2');
        if (b) b.textContent = r.n;
      }).catch(function () {});
    }, 15000);
  }
  ready(function () {
    setAppVh();
    initMobileLayout();
    initPlayer();
    initActions();
    initComments();
    initChat();
    pollViewers();
  });
})();
