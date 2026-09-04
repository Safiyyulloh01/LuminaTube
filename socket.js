const db = require('./db.js');

function setupSocket(io) {
  const streamRooms = new Map(); // streamId -> Set of socketIds
  const lastUserMsgTime = new Map(); // socketId or userId -> timestamp

  io.on('connection', (socket) => {
    let currentStreamId = null;
    const session = socket.request.session;
    const currentUser = session ? session.user : null;

    socket.on('join', ({ streamId }) => {
      if (!streamId) return;
      currentStreamId = parseInt(streamId, 10);
      socket.join('stream_' + currentStreamId);

      if (!streamRooms.has(currentStreamId)) {
        streamRooms.set(currentStreamId, new Set());
      }
      streamRooms.get(currentStreamId).add(socket.id);

      const viewers = streamRooms.get(currentStreamId).size;
      io.to('stream_' + currentStreamId).emit('viewers', viewers);

      // Load stream state
      const stream = db.prepare('SELECT * FROM streams WHERE id = ?').get(currentStreamId);
      if (!stream) return;

      // Load recent 50 messages
      const msgs = db.prepare(`
        SELECT m.id, m.user_id as userId, u.login, u.role, m.text, m.created_at
        FROM chat_messages m
        JOIN users u ON m.user_id = u.id
        WHERE m.stream_id = ?
        ORDER BY m.id DESC LIMIT 50
      `).all(currentStreamId).reverse();

      // Check badges
      const formattedMsgs = msgs.map(m => {
        let badge = null;
        if (m.userId === stream.user_id) badge = 'owner';
        else if (m.role === 'admin') badge = 'admin';
        else {
          const isMod = db.prepare('SELECT 1 FROM moderators WHERE channel_id = ? AND user_id = ?').get(stream.user_id, m.userId);
          if (isMod) badge = 'mod';
        }
        return {
          id: m.id,
          userId: m.userId,
          login: m.login,
          badge,
          text: m.text
        };
      });

      // Load pinned msg if any
      let pinned = null;
      if (stream.pinned_msg_id) {
        const pmsg = db.prepare(`
          SELECT m.id, u.login, m.text FROM chat_messages m
          JOIN users u ON m.user_id = u.id WHERE m.id = ?
        `).get(stream.pinned_msg_id);
        if (pmsg) pinned = pmsg;
      }

      socket.emit('init', {
        slowMode: stream.slow_mode || 0,
        chatEnabled: stream.chat_enabled === 1,
        messages: formattedMsgs,
        pinned,
        viewers
      });
    });

    socket.on('msg', ({ text }) => {
      if (!currentUser || !currentStreamId || !text || !text.trim()) return;
      const cleanText = text.trim().slice(0, 300);

      const stream = db.prepare('SELECT * FROM streams WHERE id = ?').get(currentStreamId);
      if (!stream) return;

      if (stream.chat_enabled !== 1) {
        return socket.emit('err', 'chat_disabled');
      }

      // Check bans
      const ban = db.prepare('SELECT until FROM chat_bans WHERE channel_id = ? AND user_id = ?').get(stream.user_id, currentUser.id);
      if (ban) {
        if (!ban.until || new Date(ban.until) > new Date()) {
          return socket.emit('muted', { until: ban.until });
        } else {
          // Timeout expired
          db.prepare('DELETE FROM chat_bans WHERE channel_id = ? AND user_id = ?').run(stream.user_id, currentUser.id);
        }
      }

      // Check slow mode
      if (stream.slow_mode > 0 && currentUser.id !== stream.user_id && currentUser.role !== 'admin') {
        const last = lastUserMsgTime.get(currentUser.id) || 0;
        const now = Date.now();
        const diff = (now - last) / 1000;
        if (diff < stream.slow_mode) {
          return socket.emit('slow', { ms: Math.ceil((stream.slow_mode - diff) * 1000) });
        }
      }

      lastUserMsgTime.set(currentUser.id, Date.now());

      const res = db.prepare('INSERT INTO chat_messages (stream_id, user_id, text) VALUES (?, ?, ?)').run(currentStreamId, currentUser.id, cleanText);
      const msgId = res.lastInsertRowid;

      let badge = null;
      if (currentUser.id === stream.user_id) badge = 'owner';
      else if (currentUser.role === 'admin') badge = 'admin';
      else {
        const isMod = db.prepare('SELECT 1 FROM moderators WHERE channel_id = ? AND user_id = ?').get(stream.user_id, currentUser.id);
        if (isMod) badge = 'mod';
      }

      io.to('stream_' + currentStreamId).emit('msg', {
        id: msgId,
        userId: currentUser.id,
        login: currentUser.login,
        badge,
        text: cleanText
      });
    });

    // Moderation events
    socket.on('mod:delete', ({ id }) => {
      if (!currentUser || !currentStreamId) return;
      const stream = db.prepare('SELECT user_id FROM streams WHERE id = ?').get(currentStreamId);
      if (!stream) return;

      const isOwner = currentUser.id === stream.user_id;
      const isAdmin = currentUser.role === 'admin';
      const isMod = db.prepare('SELECT 1 FROM moderators WHERE channel_id = ? AND user_id = ?').get(stream.user_id, currentUser.id);

      if (isOwner || isAdmin || isMod) {
        db.prepare('DELETE FROM chat_messages WHERE id = ?').run(id);
        io.to('stream_' + currentStreamId).emit('deleted', id);
      }
    });

    socket.on('mod:timeout', ({ userId, seconds }) => {
      if (!currentUser || !currentStreamId) return;
      const stream = db.prepare('SELECT user_id FROM streams WHERE id = ?').get(currentStreamId);
      if (!stream) return;

      const isOwner = currentUser.id === stream.user_id;
      const isAdmin = currentUser.role === 'admin';
      const isMod = db.prepare('SELECT 1 FROM moderators WHERE channel_id = ? AND user_id = ?').get(stream.user_id, currentUser.id);

      if (isOwner || isAdmin || isMod) {
        const until = new Date(Date.now() + seconds * 1000).toISOString();
        db.prepare(`
          INSERT INTO chat_bans (channel_id, user_id, until) VALUES (?, ?, ?)
          ON CONFLICT(channel_id, user_id) DO UPDATE SET until = excluded.until
        `).run(stream.user_id, userId, until);

        io.to('stream_' + currentStreamId).emit('mutedUser', { userId, until });
      }
    });

    socket.on('mod:ban', ({ userId }) => {
      if (!currentUser || !currentStreamId) return;
      const stream = db.prepare('SELECT user_id FROM streams WHERE id = ?').get(currentStreamId);
      if (!stream) return;

      const isOwner = currentUser.id === stream.user_id;
      const isAdmin = currentUser.role === 'admin';
      const isMod = db.prepare('SELECT 1 FROM moderators WHERE channel_id = ? AND user_id = ?').get(stream.user_id, currentUser.id);

      if (isOwner || isAdmin || isMod) {
        db.prepare(`
          INSERT INTO chat_bans (channel_id, user_id, until) VALUES (?, ?, NULL)
          ON CONFLICT(channel_id, user_id) DO UPDATE SET until = NULL
        `).run(stream.user_id, userId);

        io.to('stream_' + currentStreamId).emit('mutedUser', { userId, until: null });
      }
    });

    socket.on('mod:unban', ({ userId }) => {
      if (!currentUser || !currentStreamId) return;
      const stream = db.prepare('SELECT user_id FROM streams WHERE id = ?').get(currentStreamId);
      if (!stream) return;

      const isOwner = currentUser.id === stream.user_id;
      const isAdmin = currentUser.role === 'admin';
      const isMod = db.prepare('SELECT 1 FROM moderators WHERE channel_id = ? AND user_id = ?').get(stream.user_id, currentUser.id);

      if (isOwner || isAdmin || isMod) {
        db.prepare('DELETE FROM chat_bans WHERE channel_id = ? AND user_id = ?').run(stream.user_id, userId);
      }
    });

    socket.on('mod:pin', ({ id }) => {
      if (!currentUser || !currentStreamId) return;
      const stream = db.prepare('SELECT user_id FROM streams WHERE id = ?').get(currentStreamId);
      if (!stream) return;

      const isOwner = currentUser.id === stream.user_id;
      const isAdmin = currentUser.role === 'admin';

      if (isOwner || isAdmin) {
        if (!id || id === 0) {
          db.prepare('UPDATE streams SET pinned_msg_id = NULL WHERE id = ?').run(currentStreamId);
          io.to('stream_' + currentStreamId).emit('pinned', null);
        } else {
          db.prepare('UPDATE streams SET pinned_msg_id = ? WHERE id = ?').run(id, currentStreamId);
          const pmsg = db.prepare('SELECT m.id, u.login, m.text FROM chat_messages m JOIN users u ON m.user_id = u.id WHERE m.id = ?').get(id);
          if (pmsg) io.to('stream_' + currentStreamId).emit('pinned', pmsg);
        }
      }
    });

    socket.on('mod:promote', ({ userId }) => {
      if (!currentUser || !currentStreamId) return;
      const stream = db.prepare('SELECT user_id FROM streams WHERE id = ?').get(currentStreamId);
      if (!stream) return;

      if (currentUser.id === stream.user_id || currentUser.role === 'admin') {
        db.prepare('INSERT OR IGNORE INTO moderators (channel_id, user_id) VALUES (?, ?)').run(stream.user_id, userId);
        const targetUser = db.prepare('SELECT login FROM users WHERE id = ?').get(userId);
        io.to('stream_' + currentStreamId).emit('badge', {
          userId,
          login: targetUser ? targetUser.login : '',
          badge: 'mod'
        });
      }
    });

    socket.on('mod:demote', ({ userId }) => {
      if (!currentUser || !currentStreamId) return;
      const stream = db.prepare('SELECT user_id FROM streams WHERE id = ?').get(currentStreamId);
      if (!stream) return;

      if (currentUser.id === stream.user_id || currentUser.role === 'admin') {
        db.prepare('DELETE FROM moderators WHERE channel_id = ? AND user_id = ?').run(stream.user_id, userId);
        io.to('stream_' + currentStreamId).emit('badge', { userId, badge: null });
      }
    });

    socket.on('disconnect', () => {
      if (currentStreamId && streamRooms.has(currentStreamId)) {
        streamRooms.get(currentStreamId).delete(socket.id);
        const viewers = streamRooms.get(currentStreamId).size;
        io.to('stream_' + currentStreamId).emit('viewers', viewers);
      }
    });
  });
}

module.exports = { setupSocket };
