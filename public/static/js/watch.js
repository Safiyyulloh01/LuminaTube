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
  function formatMediaTime(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    var h = Math.floor(sec / 3600);
    var m = Math.floor((sec % 3600) / 60);
    var s = sec % 60;
    if (h > 0) {
      return h + ':' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    }
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function getUrlTimestamp() {
    try {
      var params = new URLSearchParams(window.location.search);
      var t = params.get('t') || params.get('time');
      if (!t && window.location.hash) {
        var match = window.location.hash.match(/[#&?]t=([0-9hms]+)/i);
        if (match) t = match[1];
      }
      if (!t) return 0;
      if (/^\d+$/.test(t)) return parseInt(t, 10);
      var sec = 0;
      var h = t.match(/(\d+)h/i);
      var m = t.match(/(\d+)m/i);
      var s = t.match(/(\d+)s/i);
      if (h) sec += parseInt(h[1], 10) * 3600;
      if (m) sec += parseInt(m[1], 10) * 60;
      if (s) sec += parseInt(s[1], 10);
      return sec;
    } catch (e) {
      return 0;
    }
  }

  function initPlayer() {
    var box = document.getElementById('player-box');
    if (!box || !UZ.playUrl) return;

    loadHls(function () {
      if (window.Artplayer) {
        if (window.art) {
          try { window.art.destroy(false); } catch (e) {}
        }

        var isM3U8 = /\.m3u8($|\?)/i.test(UZ.playUrl);
        var art = new window.Artplayer({
          container: box,
          url: UZ.playUrl,
          poster: UZ.poster || '',
          title: document.title,
          volume: 0.85,
          isLive: false,
          autoplay: true,
          muted: false,
          pip: true,
          autoSize: false,
          autoMini: false,
          screenshot: true,
          setting: true,
          loop: false,
          flip: true,
          playbackRate: true,
          aspectRatio: true,
          fullscreen: true,
          fullscreenWeb: true,
          theme: '#ff0000',
          hotkey: true,
          fastForward: true,
          miniProgressBar: false,
          lock: true,
          gesture: true,
          playsInline: true,
          controls: UZ.isLive ? [
            {
              name: 'live-badge',
              position: 'left',
              index: 15,
              html: '<div style="display:inline-flex;align-items:center;gap:6px;background:#c00;color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;letter-spacing:0.5px;cursor:pointer;margin-right:8px;transition:all .2s" title="Snap to live edge"><span style="width:6px;height:6px;border-radius:50%;background:#fff"></span>LIVE</div>',
              click: function () {
                if (art.hls && art.hls.liveSyncPosition) {
                  art.currentTime = art.hls.liveSyncPosition;
                } else {
                  art.currentTime = art.duration || 999999;
                }
                art.play().catch(function () {});
                art.notice.show = 'Synced to Live';
              }
            }
          ] : [],
          customType: {
            m3u8: function (video, url, instance) {
              if (window.Hls && window.Hls.isSupported()) {
                if (instance.hls) instance.hls.destroy();
                var hls = new window.Hls({
                  liveSyncDurationCount: 3,
                  maxBufferLength: 60,
                  maxMaxBufferLength: 600,
                  backBufferLength: 600,
                  liveBackBufferLength: 600,
                  manifestLoadingMaxRetry: 8,
                  manifestLoadingRetryDelay: 1000
                });
                hls.loadSource(url);
                hls.attachMedia(video);
                instance.hls = hls;
                instance.on('destroy', function () { hls.destroy(); });

                hls.on(window.Hls.Events.MANIFEST_PARSED, function () {
                  var levels = hls.levels || [];
                  if (levels.length > 1) {
                    var selector = [{ default: true, html: 'Auto', level: -1 }];
                    levels.forEach(function (lvl, i) {
                      selector.push({
                        html: lvl.height ? lvl.height + 'p' : Math.round(lvl.bitrate / 1000) + 'k',
                        level: i
                      });
                    });
                    instance.controls.update({
                      name: 'quality',
                      index: 20,
                      position: 'right',
                      html: 'Auto',
                      selector: selector,
                      onSelect: function (item) {
                        hls.currentLevel = item.level !== undefined ? item.level : -1;
                        return item.html;
                      }
                    });
                  }
                  if (instance.autoplay) {
                    video.play().catch(function () {});
                  }
                });

                hls.on(window.Hls.Events.ERROR, function (evt, data) {
                  if (data.fatal) {
                    if (data.type === window.Hls.ErrorTypes.NETWORK_ERROR) {
                      hls.startLoad();
                    } else if (data.type === window.Hls.ErrorTypes.MEDIA_ERROR) {
                      hls.recoverMediaError();
                    }
                  }
                });
              } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                video.src = url;
              } else {
                instance.notice.show = 'HLS format not supported by browser';
              }
            }
          }
        });

        window.art = art;

        // In live streams, handle DVR window seeking, relative starting point, and live edge state
        if (UZ.isLive) {
          var video = art.video;
          var isDragging = false;

          function getDvrRange() {
            if (!video || !video.seekable || video.seekable.length === 0) {
              var ct = (video && video.currentTime) || 0;
              return { start: 0, end: ct, duration: 0 };
            }
            var start = video.seekable.start(0);
            var end = video.seekable.end(video.seekable.length - 1);
            return {
              start: start,
              end: end,
              duration: Math.max(0, end - start)
            };
          }

          function formatDvrTime(sec) {
            sec = Math.max(0, Math.floor(sec || 0));
            var h = Math.floor(sec / 3600);
            var m = Math.floor((sec % 3600) / 60);
            var s = sec % 60;
            if (h > 0) {
              return h + ':' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
            }
            return m + ':' + (s < 10 ? '0' : '') + s;
          }

          function seekToFraction(fraction) {
            var range = getDvrRange();
            if (fraction >= 0.97) {
              // Snap to absolute end -> Live edge
              if (art.hls && art.hls.liveSyncPosition) {
                video.currentTime = art.hls.liveSyncPosition;
              } else {
                video.currentTime = range.end;
              }
              art.play().catch(function () {});
              art.notice.show = 'Synced to Live';
            } else {
              // Map fraction [0 .. 1] to [range.start .. range.end]
              // Fraction 0.0 seeks directly to the oldest saved part on our server (0:00)
              var target = range.start + (fraction * range.duration);
              target = Math.max(range.start, Math.min(range.end - 0.5, target));
              video.currentTime = target;
              art.play().catch(function () {});
            }
            updateDvrUI();
          }

          function updateDvrUI() {
            var range = getDvrRange();
            var relCurrent = Math.max(0, video.currentTime - range.start);
            var behindLive = Math.max(0, range.end - video.currentTime);
            var isAtLive = behindLive < 3.5;

            // 1. Update Live badge
            var badge = art.query('.art-control-live-badge') || box.querySelector('.art-control-live-badge');
            if (badge) {
              var div = badge.querySelector('div') || badge;
              div.style.background = isAtLive ? '#c00' : '#444';
              div.style.opacity = isAtLive ? '1' : '0.7';
              div.setAttribute('title', isAtLive ? 'Live edge' : 'Click to snap to live');
            }

            // 2. Update Progress bar width & indicator
            if (!isDragging) {
              var pct = isAtLive ? 100 : (range.duration > 0 ? (relCurrent / range.duration) * 100 : 0);
              pct = Math.min(100, Math.max(0, pct));
              var playedBar = box.querySelector('.art-progress-played');
              var indicator = box.querySelector('.art-progress-indicator');
              if (playedBar) playedBar.style.width = pct + '%';
              if (indicator) indicator.style.left = pct + '%';
            }

            // 3. Update Time display
            var timeCtrl = box.querySelector('.art-control-time');
            if (timeCtrl) {
              if (isAtLive) {
                timeCtrl.innerHTML = '<span style="color:#ff3333;font-weight:700;display:inline-flex;align-items:center;gap:4px">' +
                  '<span style="width:6px;height:6px;border-radius:50%;background:#ff3333"></span>LIVE</span>' +
                  '<span style="color:#ddd;margin-left:8px;font-family:monospace;font-size:12px">' + formatDvrTime(relCurrent) + '</span>';
              } else {
                timeCtrl.innerHTML = '<span style="color:#fff;font-family:monospace;font-size:12px">' + formatDvrTime(relCurrent) + '</span>' +
                  '<span style="color:#777;margin:0 3px">/</span>' +
                  '<span style="color:#aaa;font-family:monospace;font-size:12px">' + formatDvrTime(range.duration) + '</span>' +
                  '<span style="color:#ff7777;font-size:11px;margin-left:5px">(-' + formatDvrTime(behindLive) + ')</span>';
              }
            }
          }

          // Intercept timeline clicks and drags to support absolute-start seeking
          var progressBar = box.querySelector('.art-control-progress');
          if (progressBar) {
            function getFractionFromEvent(e) {
              var rect = progressBar.getBoundingClientRect();
              var clientX = e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
              var x = Math.max(0, Math.min(rect.width, clientX - rect.left));
              return rect.width > 0 ? x / rect.width : 0;
            }

            progressBar.addEventListener('mousedown', function (e) {
              if (e.button !== 0) return;
              isDragging = true;
              var frac = getFractionFromEvent(e);
              seekToFraction(frac);
            }, true);

            window.addEventListener('mousemove', function (e) {
              if (!isDragging) return;
              var frac = getFractionFromEvent(e);
              var playedBar = box.querySelector('.art-progress-played');
              var indicator = box.querySelector('.art-progress-indicator');
              if (playedBar) playedBar.style.width = (frac * 100) + '%';
              if (indicator) indicator.style.left = (frac * 100) + '%';
            }, true);

            window.addEventListener('mouseup', function (e) {
              if (!isDragging) return;
              isDragging = false;
              var frac = getFractionFromEvent(e);
              seekToFraction(frac);
            }, true);

            progressBar.addEventListener('touchstart', function (e) {
              isDragging = true;
              var frac = getFractionFromEvent(e);
              seekToFraction(frac);
            }, { capture: true, passive: true });

            window.addEventListener('touchend', function (e) {
              if (!isDragging) return;
              isDragging = false;
            }, { capture: true, passive: true });
          }

          art.on('video:timeupdate', updateDvrUI);
          art.on('video:seeking', updateDvrUI);
          art.on('video:seeked', updateDvrUI);
          art.on('video:progress', updateDvrUI);
          setInterval(updateDvrUI, 1000);
        }

        // Telemetry Beacons & Resume Playback (YouTube-style)
        if (!UZ.isLive && UZ.streamId) {
          var urlTime = getUrlTimestamp();
          var initialSeek = 0;

          if (urlTime > 0) {
            initialSeek = urlTime;
          } else if (UZ.resumePosition > 5) {
            initialSeek = UZ.resumePosition;
          } else {
            // LocalStorage fallback for guests / offline cross-session
            try {
              var cached = JSON.parse(localStorage.getItem('lt_resume_' + UZ.streamId) || 'null');
              if (cached && cached.cmt > 5 && (!cached.len || cached.cmt / cached.len < 0.90)) {
                initialSeek = Math.floor(cached.cmt);
              }
            } catch (e) {}
          }

          var hasResumed = false;
          function applyResume() {
            if (hasResumed || initialSeek <= 0) return;
            var vid = art.video;
            if (!vid) return;
            if (vid.duration && vid.duration > 0 && initialSeek >= vid.duration * 0.90) {
              return; // video was already completed
            }
            hasResumed = true;
            try {
              art.currentTime = initialSeek;
              var tStr = formatMediaTime(initialSeek);
              var msg = (UZ.T && UZ.T.resumed_from)
                ? UZ.T.resumed_from.replace('{t}', tStr)
                : ('Resumed from ' + tStr);
              art.notice.show = msg;
            } catch (e) {}
          }

          art.on('ready', function () {
            if (art.video && art.video.readyState >= 1) {
              applyResume();
            }
          });
          art.on('video:loadedmetadata', applyResume);
          art.on('video:canplay', applyResume);

          // Telemetry Beacons (Client to Server)
          var lastSentCmt = -1;
          var lastSentTs = 0;
          var heartbeatInterval = null;

          function emitTelemetry(reason, isBeacon) {
            var vid = art.video;
            if (!vid) return;
            var cmt = vid.currentTime || 0;
            var len = vid.duration || art.duration || 0;
            if (isNaN(cmt) || cmt < 0) return;

            // Sync with local storage for instant offline cache
            try {
              if (len > 0 && cmt / len >= 0.90) {
                localStorage.removeItem('lt_resume_' + UZ.streamId);
              } else if (cmt > 3) {
                localStorage.setItem('lt_resume_' + UZ.streamId, JSON.stringify({ cmt: cmt, len: len, ts: Date.now() }));
              }
            } catch (e) {}

            var now = Date.now();
            if (!isBeacon && Math.abs(cmt - lastSentCmt) < 0.5 && (now - lastSentTs) < 2000) {
              return;
            }
            lastSentCmt = cmt;
            lastSentTs = now;

            var roundedCmt = Math.round(cmt * 10) / 10;
            var roundedLen = Math.round(len);
            var query = 'docid=' + encodeURIComponent(UZ.streamId) +
              '&cmt=' + encodeURIComponent(roundedCmt) +
              '&len=' + encodeURIComponent(roundedLen) +
              '&reason=' + encodeURIComponent(reason || 'heartbeat');

            var beaconUrl = '/api/stats/watchtime?' + query;

            // 1. Unload / visibility change: prioritize navigator.sendBeacon
            if (isBeacon && navigator.sendBeacon) {
              try {
                if (navigator.sendBeacon(beaconUrl)) return;
              } catch (e) {}
            }

            // 2. Fetch with keepalive: true (background HTTP request)
            if (window.fetch) {
              window.fetch(beaconUrl, {
                method: 'POST',
                keepalive: true,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  docid: UZ.streamId,
                  cmt: roundedCmt,
                  len: roundedLen,
                  reason: reason || 'heartbeat'
                })
              }).catch(function () {});
            } else {
              // 3. Fallback tracking ping
              var img = new Image();
              img.src = beaconUrl + '&_t=' + now;
            }
          }

          // Periodic telemetry ping every 5 seconds during active playback
          art.on('video:play', function () {
            if (heartbeatInterval) clearInterval(heartbeatInterval);
            heartbeatInterval = setInterval(function () {
              if (art.video && !art.video.paused && !art.video.ended) {
                emitTelemetry('heartbeat', false);
              }
            }, 5000);
          });

          // Immediate telemetry ping on pause
          art.on('video:pause', function () {
            if (heartbeatInterval) {
              clearInterval(heartbeatInterval);
              heartbeatInterval = null;
            }
            emitTelemetry('pause', false);
          });

          // Immediate telemetry ping on seeking
          art.on('video:seeked', function () {
            emitTelemetry('seek', false);
          });

          // Telemetry ping on video end
          art.on('video:ended', function () {
            if (heartbeatInterval) {
              clearInterval(heartbeatInterval);
              heartbeatInterval = null;
            }
            emitTelemetry('ended', false);
          });

          // Telemetry beacons on tab close, navigate away, or backgrounding
          window.addEventListener('beforeunload', function () {
            emitTelemetry('unload', true);
          });
          window.addEventListener('pagehide', function () {
            emitTelemetry('pagehide', true);
          });
          document.addEventListener('visibilitychange', function () {
            if (document.visibilityState === 'hidden') {
              emitTelemetry('visibility_hidden', true);
            }
          });
          art.on('destroy', function () {
            if (heartbeatInterval) clearInterval(heartbeatInterval);
            emitTelemetry('destroy', true);
          });
        }

        // Sync theater mode with page layout
        art.on('fullscreenWeb', function (state) {
          document.body.classList.toggle('theater-mode', state);
        });

        // Add custom YouTube keyboard shortcuts
        window.addEventListener('keydown', function (e) {
          if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
          var video = art.video;
          var start = (video && video.seekable && video.seekable.length) ? video.seekable.start(0) : 0;
          var end = (video && video.seekable && video.seekable.length) ? video.seekable.end(video.seekable.length - 1) : (art.duration || 999999);

          if (e.key === 'j' || e.key === 'J') {
            e.preventDefault();
            art.currentTime = Math.max(start, art.currentTime - 10);
            art.notice.show = '-10s';
          } else if (e.key === 'l' || e.key === 'L') {
            e.preventDefault();
            art.currentTime = Math.min(end, art.currentTime + 10);
            art.notice.show = '+10s';
          } else if (e.key === 'k' || e.key === 'K') {
            e.preventDefault();
            art.toggle();
          } else if (e.key === 't' || e.key === 'T') {
            e.preventDefault();
            art.fullscreenWeb = !art.fullscreenWeb;
          }
        });
      }
    });
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
    var wrap = document.getElementById('chatbox') || document.getElementById('chat-card');
    if (!wrap) return;
    var msgsEl = document.getElementById('chat-msgs');
    var input = document.getElementById('chat-in') || document.getElementById('chat-input');
    var sendBtn = document.getElementById('send-btn') || document.getElementById('chat-send');
    var form = document.getElementById('chat-form');
    var hint = document.getElementById('chat-hint');
    var pinBox = document.getElementById('pin-box') || document.getElementById('pinned');
    var pinTxt = document.getElementById('pin-txt') || document.getElementById('pinned-txt');
    var ctx = document.getElementById('user-ctx');
    var ctxName = document.getElementById('ctx-name');
    var ctxOwner = document.getElementById('ctx-owner-only');
    var newPill = document.getElementById('new-pill') || document.getElementById('newmsg');
    var emojiBar = document.getElementById('emoji-bar');

    // Intercept form submit to guarantee page never reloads
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
      });
    }

    // For ended / VOD streams, disable chat input cleanly
    if (!UZ.isLive) {
      if (input) {
        input.disabled = true;
        input.placeholder = (UZ.T && UZ.T.ended) ? UZ.T.ended : 'Efir yakunlandi';
      }
      if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.style.opacity = '0.5';
        sendBtn.style.cursor = 'not-allowed';
      }
      if (emojiBar) emojiBar.style.display = 'none';
      if (hint) hint.textContent = (UZ.T && UZ.T.ended) ? UZ.T.ended : 'Efir yakunlandi';
      return;
    }

    if (!window.io || !input || !sendBtn) return;
    var sendHtml = sendBtn.innerHTML;
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
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        send();
      });
    }
  }

  function initTimestampSeek() {
    document.addEventListener('click', function (e) {
      var ts = e.target.closest('.ts-lnk');
      if (ts && ts.dataset.time && window.art) {
        e.preventDefault();
        var sec = parseFloat(ts.dataset.time);
        if (!isNaN(sec)) {
          window.art.currentTime = sec;
          window.art.play().catch(function () {});
          if (window.art.notice) window.art.notice.show = 'Jumped to ' + ts.textContent;
        }
      }
    });

    // Mobile tap: remove sticky focus/hover effect on touch release
    document.addEventListener('pointerup', function (e) {
      var btn = e.target.closest('button, .chip, .btn');
      if (btn) {
        setTimeout(function () {
          try { btn.blur(); } catch (err) {}
        }, 150);
      }
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
    initTimestampSeek();
    pollViewers();
  });
})();
