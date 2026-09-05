require('dotenv').config();
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const express = require('express');
const session = require('express-session');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const rateLimit = require('express-rate-limit');

const db = require('./db.js');
const { generateCaptcha } = require('./captcha.js');
const { setupSocket } = require('./socket.js');

const app = express();
app.set('trust proxy', 1);

const server = http.createServer(app);
const io = new Server(server, { path: '/socket.io' });

const PORT = process.env.PORT || 3000;
const SITE_NAME = process.env.SITE_NAME || 'LuminaTube';
const SESSION_SECRET = process.env.SESSION_SECRET || 'lumina_prod_secure_secret_fallback_key_2026';

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Juda ko‘p urinishlar bo‘ldi. Iltimos, 15 daqiqadan so‘ng qayta urinib ko‘ring.'
});

const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let dest = 'public/uploads';
    if (file.fieldname === 'avatar') dest = 'public/uploads/avatars';
    else if (file.fieldname === 'thumbnail') dest = 'public/uploads/thumbs';
    else if (file.fieldname === 'video') dest = 'public/vod';
    fs.mkdirSync(dest, { recursive: true });
    cb(null, dest);
  },
  filename: (req, file, cb) => {
    const rawExt = path.extname(file.originalname).toLowerCase();
    let ext = rawExt;
    if (file.fieldname === 'video' && !['.mp4', '.webm', '.mkv'].includes(rawExt)) ext = '.mp4';
    if ((file.fieldname === 'avatar' || file.fieldname === 'thumbnail') && !['.jpg', '.jpeg', '.png', '.webp'].includes(rawExt)) ext = '.jpg';
    const rand = crypto.randomBytes(8).toString('hex');
    cb(null, Date.now() + '_' + rand + ext);
  }
});

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (file.fieldname === 'video') {
    if (['.mp4', '.webm', '.mkv'].includes(ext)) return cb(null, true);
    return cb(new Error('Faqat MP4, WebM va MKV formatdagi videolar qabul qilinadi.'));
  }
  if (file.fieldname === 'avatar' || file.fieldname === 'thumbnail') {
    if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) return cb(null, true);
    return cb(new Error('Faqat JPG, PNG va WebP formatdagi rasmlar qabul qilinadi.'));
  }
  cb(null, false);
};

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter
});

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const sessionMiddleware = session({
  name: 'lt.sid',
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 30 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: 'lax'
  }
});

app.use(sessionMiddleware);
io.engine.use(sessionMiddleware);
setupSocket(io);

app.use('/static', express.static(path.join(__dirname, 'public/static')));
app.use('/thumbs', express.static(path.join(__dirname, 'public/uploads/thumbs')));
app.get('/thumbs/:file', (req, res) => {
  const filename = path.basename(req.params.file);
  const localPath = path.join(__dirname, 'public/uploads/thumbs', filename);
  if (fs.existsSync(localPath)) {
    return res.sendFile(localPath);
  }
  res.redirect('/img/no-thumb.svg');
});

app.get('/uploads/thumbs/:file', (req, res) => {
  res.redirect('/thumbs/' + path.basename(req.params.file));
});

app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// Native VOD Streaming with HTTP 206 Partial Content (Range Requests)
app.get('/vod/:file', (req, res) => {
  const filePath = path.join(__dirname, 'public/vod', path.basename(req.params.file));
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Video not found');
  }
  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = (end - start) + 1;
    const file = fs.createReadStream(filePath, { start, end });
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': 'video/mp4',
    };
    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': 'video/mp4',
      'Accept-Ranges': 'bytes',
    };
    res.writeHead(200, head);
    fs.createReadStream(filePath).pipe(res);
  }
});
app.use('/vod', express.static(path.join(__dirname, 'public/vod')));

// Native HLS Streaming (OBS / Ingest)
app.use('/hls', express.static(path.join(__dirname, 'public/hls'), {
  setHeaders: (res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
}));

function linkify(text) {
  if (!text) return '';

  // 1. Normalize pre-existing HTML link tags or <br> into clean text
  let cleaned = String(text)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<a\s+(?:[^>]*?\s+)?href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi, (m, href, label) => {
      const cleanLabel = label.trim();
      if (!cleanLabel || cleanLabel === href) return href;
      return '[' + cleanLabel + '](' + href + ')';
    });

  // 2. HTML escape to eliminate XSS
  const escaped = cleaned
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  // 3. Markdown links [title](https://url)
  let formatted = escaped.replace(/\[([^\]]+)\]\((https?:\/\/[^\s\)\"\'<>]+)\)/gi, (m, title, url) => {
    return `<a href="${url}" class="lnk" target="_blank" rel="noopener noreferrer nofollow">${title}</a>`;
  });

  // 4. Raw URLs (http:// or https://)
  formatted = formatted.replace(/(^|[\s(>])(https?:\/\/[^\s<)]+)/gi, (m, prefix, url) => {
    return `${prefix}<a href="${url}" class="lnk" target="_blank" rel="noopener noreferrer nofollow">${url}</a>`;
  });

  // 5. Timestamps like 01:23 or 1:23:45
  formatted = formatted.replace(/(^|[\s(])(\b(?:\d{1,2}:)?\d{1,2}:\d{2}\b)/gi, (m, prefix, timeStr) => {
    const parts = timeStr.split(':').map(Number);
    let seconds = 0;
    if (parts.length === 3) seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
    else if (parts.length === 2) seconds = parts[0] * 60 + parts[1];
    return `${prefix}<a href="#t=${seconds}" class="lnk ts-lnk" data-time="${seconds}" title="Jump to ${timeStr}">${timeStr}</a>`;
  });

  return formatted;
}

app.use((req, res, next) => {
  if (req.session.user) {
    const fresh = db.prepare('SELECT id, login, role, title, avatar, stream_key, donate_url FROM users WHERE id = ?').get(req.session.user.id);
    if (fresh) req.session.user = fresh;
  }
  res.locals.currentUser = req.session.user || null;
  res.locals.lang = req.session.lang || 'uz';
  res.locals.siteName = SITE_NAME;
  res.locals.host = req.headers.host;
  res.locals.currentTab = '';
  res.locals.linkify = linkify;
  next();
});

function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
  }
  next();
}

app.get('/lang/:lang', (req, res) => {
  const lang = req.params.lang;
  if (['uz', 'ru'].includes(lang)) {
    req.session.lang = lang;
  }
  res.redirect(req.get('Referrer') || '/');
});

app.get('/captcha.svg', (req, res) => {
  const { text, svg } = generateCaptcha();
  req.session.captcha = text.toUpperCase();
  res.set('Content-Type', 'image/svg+xml; charset=utf-8');
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.send(svg);
});

app.get('/check-login', (req, res) => {
  const login = (req.query.login || '').trim();
  if (!/^[A-Za-z0-9_-]{3,20}$/.test(login)) {
    return res.json({ status: 'invalid' });
  }
  const user = db.prepare('SELECT id FROM users WHERE login = ?').get(login);
  res.json({ status: user ? 'taken' : 'free' });
});

app.get('/', requireAuth, (req, res) => {
  const q = (req.query.q || '').trim();
  res.locals.currentTab = 'home';
  res.locals.query = q;
  const currentUserId = req.session.user ? req.session.user.id : -1;

  let liveQuery = "SELECT s.*, u.login as user_login, u.title as user_title, u.avatar FROM streams s JOIN users u ON s.user_id = u.id WHERE s.status = 'live' AND s.visibility = 'public'";
  let endedQuery = `
    SELECT s.*, u.login as user_login, u.title as user_title, u.avatar,
           wh.cmt as watch_cmt, wh.len as watch_len, wh.completed as watch_completed
    FROM streams s
    JOIN users u ON s.user_id = u.id
    LEFT JOIN watch_history wh ON wh.stream_id = s.id AND wh.user_id = ${currentUserId}
    WHERE s.status = 'ended' AND s.visibility = 'public'
  `;
  let params = [];

  if (q) {
    liveQuery += " AND (s.title LIKE ? OR u.login LIKE ?)";
    endedQuery += " AND (s.title LIKE ? OR u.login LIKE ?)";
    params = [`%${q}%`, `%${q}%`];
  }

  liveQuery += " ORDER BY s.id DESC";
  endedQuery += " ORDER BY s.id DESC";

  const liveStreams = db.prepare(liveQuery).all(...params);
  const endedStreams = db.prepare(endedQuery).all(...params);

  res.render('index', { liveStreams, endedStreams });
});

app.get('/watch/:id', requireAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const stream = db.prepare(`
    SELECT s.*, u.login as user_login, u.title as user_title, u.avatar, u.donate_url
    FROM streams s JOIN users u ON s.user_id = u.id
    WHERE s.id = ?
  `).get(id);

  if (!stream) return res.status(404).render('404');

  db.prepare('UPDATE streams SET views = views + 1 WHERE id = ?').run(id);
  stream.views++;

  const subCount = db.prepare('SELECT COUNT(*) as c FROM subscriptions WHERE channel_id = ?').get(stream.user_id).c;
  const likeCount = db.prepare('SELECT COUNT(*) as c FROM likes WHERE stream_id = ?').get(id).c;

  const isSubscribed = req.session.user
    ? !!db.prepare('SELECT 1 FROM subscriptions WHERE subscriber_id = ? AND channel_id = ?').get(req.session.user.id, stream.user_id)
    : false;

  const isLiked = req.session.user
    ? !!db.prepare('SELECT 1 FROM likes WHERE stream_id = ? AND user_id = ?').get(id, req.session.user.id)
    : false;

  const isOwner = req.session.user && req.session.user.id === stream.user_id;
  const isMod = req.session.user
    ? !!db.prepare('SELECT 1 FROM moderators WHERE channel_id = ? AND user_id = ?').get(stream.user_id, req.session.user.id)
    : false;
  const canMod = isOwner || (req.session.user && req.session.user.role === 'admin') || isMod;

  const comments = db.prepare(`
    SELECT c.*, u.login, u.avatar
    FROM comments c JOIN users u ON c.user_id = u.id
    WHERE c.stream_id = ?
    ORDER BY c.id DESC
  `).all(id);

  let playUrl = stream.play_url || '';
  const localVodPath = path.join(__dirname, 'public/vod', `vod_${stream.id}.mp4`);
  if (fs.existsSync(localVodPath)) {
    playUrl = `/vod/vod_${stream.id}.mp4`;
  }
  stream.play_url = playUrl;

  let resumePosition = 0;
  if (req.session.user) {
    const history = db.prepare('SELECT cmt, completed FROM watch_history WHERE user_id = ? AND stream_id = ?').get(req.session.user.id, id);
    if (history && !history.completed && history.cmt > 5) {
      resumePosition = Math.floor(history.cmt);
    }
  }

  res.render('watch', {
    stream,
    subCount,
    likeCount,
    isSubscribed,
    isLiked,
    isOwner,
    canMod,
    comments,
    resumePosition
  });
});

app.get('/c/:login', requireAuth, (req, res) => {
  res.locals.currentTab = 'channel';
  const login = req.params.login;
  const channel = db.prepare('SELECT * FROM users WHERE login = ?').get(login);
  if (!channel) return res.status(404).render('404');

  const currentUserId = req.session.user ? req.session.user.id : -1;
  const subCount = db.prepare('SELECT COUNT(*) as c FROM subscriptions WHERE channel_id = ?').get(channel.id).c;
  const streams = db.prepare(`
    SELECT s.*, wh.cmt as watch_cmt, wh.len as watch_len, wh.completed as watch_completed
    FROM streams s
    LEFT JOIN watch_history wh ON wh.stream_id = s.id AND wh.user_id = ?
    WHERE s.user_id = ? AND s.visibility = 'public'
    ORDER BY s.id DESC
  `).all(currentUserId, channel.id);

  const isSubscribed = req.session.user
    ? !!db.prepare('SELECT 1 FROM subscriptions WHERE subscriber_id = ? AND channel_id = ?').get(req.session.user.id, channel.id)
    : false;

  res.render('channel', { channel, subCount, streams, isSubscribed });
});

app.get('/subs', requireAuth, (req, res) => {
  res.locals.currentTab = 'subs';
  const currentUserId = req.session.user ? req.session.user.id : -1;
  const streams = db.prepare(`
    SELECT s.*, u.login as user_login, u.title as user_title, u.avatar,
           wh.cmt as watch_cmt, wh.len as watch_len, wh.completed as watch_completed
    FROM streams s
    JOIN users u ON s.user_id = u.id
    JOIN subscriptions sub ON sub.channel_id = s.user_id AND sub.subscriber_id = ?
    LEFT JOIN watch_history wh ON wh.stream_id = s.id AND wh.user_id = ?
    WHERE s.visibility = 'public'
    ORDER BY s.id DESC
  `).all(currentUserId, currentUserId);

  res.render('subs', { streams });
});

app.get('/studio', requireAuth, (req, res) => {
  res.locals.currentTab = 'studio';
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.user.id);
  const myStreams = db.prepare('SELECT * FROM streams WHERE user_id = ? ORDER BY id DESC').all(user.id);
  const nextStream = db.prepare("SELECT * FROM streams WHERE user_id = ? AND status = 'live' ORDER BY id DESC LIMIT 1").get(user.id);

  const moderators = db.prepare(`
    SELECT u.id, u.login FROM users u
    JOIN moderators m ON m.user_id = u.id
    WHERE m.channel_id = ?
  `).all(user.id);

  const bannedUsers = db.prepare(`
    SELECT u.id, u.login FROM users u
    JOIN chat_bans b ON b.user_id = u.id
    WHERE b.channel_id = ?
  `).all(user.id);

  res.render('studio', { myStreams, nextStream, moderators, bannedUsers });
});

app.get('/settings', requireAuth, (req, res) => {
  res.locals.currentTab = 'settings';
  res.render('settings');
});

app.post('/settings/password', requireAuth, (req, res) => {
  const { old_password, new_password, new_password2 } = req.body;
  if (!new_password || new_password.length < 6 || new_password !== new_password2) {
    return res.render('settings', { error: 'Yangi parollar mos kelmadi yoki 6 belgidan kam' });
  }

  const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.session.user.id);
  if (!bcrypt.compareSync(old_password, user.password_hash)) {
    return res.render('settings', { error: 'Joriy parol noto‘g‘ri' });
  }

  const newHash = bcrypt.hashSync(new_password, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, req.session.user.id);

  res.render('settings', { success: 'Parol muvaffaqiyatli o‘zgartirildi' });
});

app.get('/admin', requireAuth, (req, res) => {
  if (req.session.user.role !== 'admin') {
    return res.status(403).render('403');
  }
  const users = db.prepare('SELECT id, login, role, created_at FROM users ORDER BY id DESC').all();
  const streams = db.prepare('SELECT id, title, status FROM streams').all();
  res.render('admin', { users, streams });
});

app.post('/admin/role', requireAuth, (req, res) => {
  if (req.session.user.role !== 'admin') return res.status(403).send('Forbidden');
  const { user_id, role } = req.body;
  if (['viewer', 'streamer', 'admin'].includes(role)) {
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, user_id);
  }
  res.redirect('/admin');
});

function safeRedirect(target) {
  if (typeof target === 'string' && target.startsWith('/') && !target.startsWith('//') && !target.startsWith('/\\')) {
    return target;
  }
  return '/';
}

app.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('login', { next: req.query.next || '/' });
});

app.post('/login', authLimiter, (req, res) => {
  const { website, login, password, next } = req.body;
  if (website) return res.status(400).send('Bot detected');

  if (!login || !password) {
    return res.render('login', { error: 'Login yoki parol noto‘g‘ri', next: safeRedirect(next) });
  }

  const user = db.prepare('SELECT * FROM users WHERE login = ?').get(login);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.render('login', { error: 'Login yoki parol noto‘g‘ri', next: safeRedirect(next) });
  }

  req.session.user = {
    id: user.id,
    login: user.login,
    role: user.role,
    title: user.title,
    avatar: user.avatar,
    stream_key: user.stream_key,
    donate_url: user.donate_url
  };

  res.redirect(safeRedirect(next));
});

app.get('/register', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('register', { next: req.query.next || '/' });
});

app.post('/register', authLimiter, (req, res) => {
  const { website, login, password, password2, captcha, next } = req.body;

  if (website) return res.status(400).send('Bot detected');

  const expectedCaptcha = req.session.captcha;
  delete req.session.captcha;

  if (!captcha || !expectedCaptcha || captcha.trim().toUpperCase() !== expectedCaptcha) {
    return res.status(400).render('register', { error: 'Rasmdagi kod noto‘g‘ri kiritildi.', next: safeRedirect(next) });
  }

  if (!/^[A-Za-z0-9_-]{3,20}$/.test(login)) {
    return res.status(400).render('register', { error: 'Login formati noto‘g‘ri (3-20 ta belgi).', next: safeRedirect(next) });
  }
  if (!password || password.length < 6 || password !== password2) {
    return res.status(400).render('register', { error: 'Parollar mos kelmadi yoki 6 belgidan kam.', next: safeRedirect(next) });
  }

  const existing = db.prepare('SELECT id FROM users WHERE login = ?').get(login);
  if (existing) {
    return res.status(400).render('register', { error: 'Bu login band.', next: safeRedirect(next) });
  }

  const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  const initialRole = userCount === 0 ? 'admin' : 'viewer';

  const hash = bcrypt.hashSync(password, 10);
  const streamKey = 'live_' + crypto.randomBytes(8).toString('hex');

  const result = db.prepare(`
    INSERT INTO users (login, password_hash, role, title, stream_key)
    VALUES (?, ?, ?, ?, ?)
  `).run(login, hash, initialRole, login, streamKey);

  req.session.user = {
    id: result.lastInsertRowid,
    login,
    role: initialRole,
    title: login,
    avatar: null,
    stream_key: streamKey,
    donate_url: null
  };

  res.redirect(safeRedirect(next));
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

app.post('/api/like/:id', requireAuth, (req, res) => {
  const streamId = parseInt(req.params.id, 10);
  const userId = req.session.user.id;

  const exists = db.prepare('SELECT 1 FROM likes WHERE stream_id = ? AND user_id = ?').get(streamId, userId);
  let liked = false;

  if (exists) {
    db.prepare('DELETE FROM likes WHERE stream_id = ? AND user_id = ?').run(streamId, userId);
  } else {
    db.prepare('INSERT INTO likes (stream_id, user_id) VALUES (?, ?)').run(streamId, userId);
    liked = true;
  }

  const count = db.prepare('SELECT COUNT(*) as c FROM likes WHERE stream_id = ?').get(streamId).c;
  res.json({ liked, count });
});

app.post('/api/sub/:channelId', requireAuth, (req, res) => {
  const channelId = parseInt(req.params.channelId, 10);
  const subscriberId = req.session.user.id;

  if (channelId === subscriberId) return res.status(400).json({ error: 'self_sub' });

  const exists = db.prepare('SELECT 1 FROM subscriptions WHERE subscriber_id = ? AND channel_id = ?').get(subscriberId, channelId);
  let subbed = false;

  if (exists) {
    db.prepare('DELETE FROM subscriptions WHERE subscriber_id = ? AND channel_id = ?').run(subscriberId, channelId);
  } else {
    db.prepare('INSERT INTO subscriptions (subscriber_id, channel_id) VALUES (?, ?)').run(subscriberId, channelId);
    subbed = true;
  }

  const count = db.prepare('SELECT COUNT(*) as c FROM subscriptions WHERE channel_id = ?').get(channelId).c;
  res.json({ subbed, count });
});

app.post('/api/comment/:id', apiLimiter, requireAuth, (req, res) => {
  const streamId = parseInt(req.params.id, 10);
  const body = (req.body.body || '').trim();
  if (!body) return res.status(400).json({ error: 'empty_comment' });

  const result = db.prepare('INSERT INTO comments (stream_id, user_id, body) VALUES (?, ?, ?)').run(streamId, req.session.user.id, body);
  res.json({
    id: result.lastInsertRowid,
    login: req.session.user.login,
    body
  });
});

app.delete('/api/comment/:id', requireAuth, (req, res) => {
  const cid = parseInt(req.params.id, 10);
  const comment = db.prepare('SELECT c.user_id, s.user_id as owner_id FROM comments c JOIN streams s ON c.stream_id = s.id WHERE c.id = ?').get(cid);
  if (!comment) return res.status(404).json({ error: 'not_found' });

  if (req.session.user.id === comment.user_id || req.session.user.id === comment.owner_id || req.session.user.role === 'admin') {
    db.prepare('DELETE FROM comments WHERE id = ?').run(cid);
    return res.json({ ok: true });
  }
  res.status(403).json({ error: 'forbidden' });
});

app.get('/api/viewers/:id', (req, res) => {
  res.json({ n: 0 });
});

// YouTube-style Playback & Watchtime Telemetry Beacons
function handleTelemetry(req, res) {
  const params = { ...req.query, ...req.body };
  const rawDocId = params.docid || params.videoId || params.streamId || params.id;
  const rawCmt = params.cmt !== undefined ? params.cmt : (params.currentTime !== undefined ? params.currentTime : params.time);
  const rawLen = params.len !== undefined ? params.len : params.duration;

  const streamId = parseInt(rawDocId, 10);
  const cmt = parseFloat(rawCmt);
  const len = parseFloat(rawLen) || 0;

  if (!streamId || isNaN(streamId) || isNaN(cmt) || cmt < 0) {
    return res.status(400).json({ error: 'Invalid telemetry parameters' });
  }

  // Gracefully accept beacon for guest / unauthenticated sessions
  if (!req.session || !req.session.user) {
    return res.status(204).end();
  }

  const userId = req.session.user.id;

  // Completion threshold: past ~90–95% of video duration (or <= 15s remaining for long videos)
  const isCompleted = (len > 0) && (cmt / len >= 0.90 || (len - cmt <= 15 && len >= 60));
  const resumeCmt = isCompleted ? 0 : Math.max(0, cmt);
  const completedFlag = isCompleted ? 1 : 0;

  try {
    db.prepare(`
      INSERT INTO watch_history (user_id, stream_id, cmt, len, completed, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id, stream_id) DO UPDATE SET
        cmt = excluded.cmt,
        len = CASE WHEN excluded.len > 0 THEN excluded.len ELSE watch_history.len END,
        completed = excluded.completed,
        updated_at = CURRENT_TIMESTAMP
    `).run(userId, streamId, resumeCmt, len, completedFlag);
  } catch (err) {
    console.error('Telemetry beacon database error:', err.message);
  }

  if (req.method === 'GET' && !req.headers.accept?.includes('application/json')) {
    return res.status(204).end();
  }

  if (req.xhr || req.headers.accept?.includes('application/json')) {
    return res.json({ status: 'ok', docid: streamId, cmt: resumeCmt, len, completed: isCompleted });
  }

  res.status(204).end();
}

app.all('/api/stats/watchtime', handleTelemetry);
app.all('/api/stats/playback', handleTelemetry);

app.get('/api/stats/playback-info/:id', (req, res) => {
  const streamId = parseInt(req.params.id, 10);
  if (!streamId || isNaN(streamId)) {
    return res.status(400).json({ error: 'Invalid stream ID' });
  }
  if (!req.session || !req.session.user) {
    return res.json({ streamId, resumePosition: 0, completed: false });
  }
  const history = db.prepare('SELECT cmt, len, completed, updated_at FROM watch_history WHERE user_id = ? AND stream_id = ?').get(req.session.user.id, streamId);
  if (!history || history.completed || history.cmt <= 5) {
    return res.json({ streamId, resumePosition: 0, completed: !!(history && history.completed) });
  }
  return res.json({
    streamId,
    resumePosition: Math.floor(history.cmt),
    len: history.len,
    completed: false,
    updatedAt: history.updated_at
  });
});

app.post('/api/studio/upload', requireAuth, upload.fields([
  { name: 'video', maxCount: 1 },
  { name: 'thumbnail', maxCount: 1 }
]), (req, res) => {
  if (req.session.user.role !== 'streamer' && req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'forbidden' });
  }

  const { title, description, visibility } = req.body;
  if (!req.files || !req.files['video'] || !req.files['video'][0]) {
    return res.status(400).json({ error: 'no_video' });
  }

  const videoFile = req.files['video'][0];
  const playUrl = '/vod/' + videoFile.filename;

  let thumbPath = '/img/no-thumb.svg';
  if (req.files['thumbnail'] && req.files['thumbnail'][0]) {
    thumbPath = '/uploads/thumbs/' + req.files['thumbnail'][0].filename;
  }

  const cleanTitle = (title || 'Yangi video').trim().slice(0, 100);
  const cleanDesc = (description || '').trim().slice(0, 2000);
  const cleanVis = visibility === 'private' ? 'private' : 'public';

  const resInsert = db.prepare(`
    INSERT INTO streams (user_id, title, description, thumbnail, status, visibility, play_url, duration)
    VALUES (?, ?, ?, ?, 'ended', ?, ?, 'VOD')
  `).run(req.session.user.id, cleanTitle, cleanDesc, thumbPath, cleanVis, playUrl);

  io.emit('home:update');
  res.json({ ok: true, streamId: resInsert.lastInsertRowid });
});

app.post('/api/studio/channel', requireAuth, upload.single('avatar'), (req, res) => {
  const { title, about, donate_url } = req.body;
  const user = req.session.user;

  let avatarPath = user.avatar;
  if (req.file) {
    avatarPath = '/uploads/avatars/' + req.file.filename;
    user.avatar = avatarPath;
  }

  let validDonate = donate_url ? donate_url.trim() : null;
  let donate_bad = false;
  if (validDonate && !/^https:\/\//i.test(validDonate)) {
    donate_bad = true;
    validDonate = null;
  }

  db.prepare(`
    UPDATE users SET title = ?, about = ?, avatar = ?, donate_url = ? WHERE id = ?
  `).run(title || user.login, about || '', avatarPath, validDonate, user.id);

  user.title = title || user.login;
  user.donate_url = validDonate;

  res.json({
    ok: true,
    avatar: avatarPath,
    donate_url: validDonate,
    donate_bad
  });
});

app.post('/api/studio/resetkey', requireAuth, (req, res) => {
  if (req.session.user.role !== 'streamer' && req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'forbidden' });
  }

  const newKey = 'live_' + crypto.randomBytes(8).toString('hex');
  db.prepare('UPDATE users SET stream_key = ? WHERE id = ?').run(newKey, req.session.user.id);
  req.session.user.stream_key = newKey;

  res.json({ key: newKey });
});

app.post('/api/studio/next', requireAuth, upload.single('thumbnail'), (req, res) => {
  if (req.session.user.role !== 'streamer' && req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'forbidden' });
  }

  const { title, description, slow_mode, chat_enabled, remove_thumb } = req.body;
  let thumbPath = null;
  if (req.file) {
    thumbPath = '/uploads/thumbs/' + req.file.filename;
  }

  let stream = db.prepare("SELECT id, thumbnail FROM streams WHERE user_id = ? AND status = 'live' ORDER BY id DESC LIMIT 1").get(req.session.user.id);
  if (!stream) {
    const resInsert = db.prepare(`
      INSERT INTO streams (user_id, title, description, thumbnail, status, chat_enabled, slow_mode)
      VALUES (?, ?, ?, ?, 'live', ?, ?)
    `).run(req.session.user.id, title || 'Yangi efir', description || '', thumbPath || '/img/no-thumb.svg', chat_enabled === '1' ? 1 : 0, parseInt(slow_mode || 0, 10));
    stream = { id: resInsert.lastInsertRowid, thumbnail: thumbPath };
  } else {
    let finalThumb = stream.thumbnail;
    if (remove_thumb === '1') finalThumb = '/img/no-thumb.svg';
    else if (thumbPath) finalThumb = thumbPath;

    db.prepare(`
      UPDATE streams SET title = ?, description = ?, thumbnail = ?, chat_enabled = ?, slow_mode = ? WHERE id = ?
    `).run(title || 'Yangi efir', description || '', finalThumb, chat_enabled === '1' ? 1 : 0, parseInt(slow_mode || 0, 10), stream.id);
    stream.thumbnail = finalThumb;
  }

  io.emit('home:update');
  res.json({ ok: true, thumb: stream.thumbnail });
});

app.delete('/api/studio/stream/:id', requireAuth, (req, res) => {
  const sid = parseInt(req.params.id, 10);
  const stream = db.prepare('SELECT user_id FROM streams WHERE id = ?').get(sid);
  if (!stream) return res.status(404).json({ error: 'not_found' });

  if (stream.user_id === req.session.user.id || req.session.user.role === 'admin') {
    db.prepare('DELETE FROM streams WHERE id = ?').run(sid);
    io.emit('home:update');
    return res.json({ ok: true });
  }
  res.status(403).json({ error: 'forbidden' });
});

app.post('/api/studio/stream/:id/visibility', requireAuth, (req, res) => {
  const sid = parseInt(req.params.id, 10);
  const { visibility } = req.body;
  const stream = db.prepare('SELECT user_id FROM streams WHERE id = ?').get(sid);
  if (!stream) return res.status(404).json({ error: 'not_found' });

  if (stream.user_id === req.session.user.id || req.session.user.role === 'admin') {
    const newVis = visibility === 'public' ? 'public' : 'private';
    db.prepare('UPDATE streams SET visibility = ? WHERE id = ?').run(newVis, sid);
    io.emit('home:update');
    return res.json({ visibility: newVis });
  }
  res.status(403).json({ error: 'forbidden' });
});

app.post('/api/studio/stream/:id', requireAuth, (req, res) => {
  const sid = parseInt(req.params.id, 10);
  const { title, description, visibility } = req.body;
  const stream = db.prepare('SELECT user_id FROM streams WHERE id = ?').get(sid);
  if (!stream) return res.status(404).json({ error: 'not_found' });

  if (stream.user_id === req.session.user.id || req.session.user.role === 'admin') {
    db.prepare('UPDATE streams SET title = ?, description = ?, visibility = ? WHERE id = ?')
      .run(title, description, visibility, sid);
    io.emit('home:update');
    return res.json({ ok: true });
  }
  res.status(403).json({ error: 'forbidden' });
});

app.post('/api/studio/mod', requireAuth, (req, res) => {
  const { login } = req.body;
  const target = db.prepare('SELECT id, login FROM users WHERE login = ?').get(login);
  if (!target) return res.status(400).json({ error: 'no_user' });

  db.prepare('INSERT OR IGNORE INTO moderators (channel_id, user_id) VALUES (?, ?)').run(req.session.user.id, target.id);
  res.json({ ok: true, user: target });
});

app.delete('/api/studio/mod/:uid', requireAuth, (req, res) => {
  const uid = parseInt(req.params.uid, 10);
  db.prepare('DELETE FROM moderators WHERE channel_id = ? AND user_id = ?').run(req.session.user.id, uid);
  res.json({ ok: true });
});

app.delete('/api/studio/ban/:uid', requireAuth, (req, res) => {
  const uid = parseInt(req.params.uid, 10);
  db.prepare('DELETE FROM chat_bans WHERE channel_id = ? AND user_id = ?').run(req.session.user.id, uid);
  res.json({ ok: true });
});

// Native Stream Lifecycle API (For OBS & Native Broadcasts)
app.post('/api/studio/stream/status', requireAuth, (req, res) => {
  const { streamId, status, play_url, alt_url, duration } = req.body;
  const sid = parseInt(streamId, 10);
  const stream = db.prepare('SELECT * FROM streams WHERE id = ?').get(sid);
  if (!stream) return res.status(404).json({ error: 'Stream not found' });
  if (stream.user_id !== req.session.user.id && req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  db.prepare(`
    UPDATE streams
    SET status = COALESCE(?, status),
        play_url = COALESCE(?, play_url),
        alt_url = COALESCE(?, alt_url),
        duration = COALESCE(?, duration),
        ended_at = CASE WHEN ? = 'ended' THEN CURRENT_TIMESTAMP ELSE ended_at END
    WHERE id = ?
  `).run(status, play_url, alt_url, duration, status, sid);

  io.emit('home:update');
  res.json({ ok: true });
});

app.use((req, res) => {
  res.status(404).render('404');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`${SITE_NAME} is running on port ${PORT}`);
});
