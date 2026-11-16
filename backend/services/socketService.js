const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const db = require('../config/db');

let ioInstance = null;
// Track online users: userId -> Set of socketIds
const onlineUsers = new Map();

/**
 * Initialize Socket.IO with HTTP server and allowed origins
 */
function initSocket(httpServer, allowedOrigins) {
  const io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(null, true); // fallback allow for same-network intranet dev
        }
      },
      methods: ['GET', 'POST', 'PATCH'],
      credentials: true,
    },
    pingTimeout: 30000,
    pingInterval: 15000,
  });

  // ── Authentication Middleware ──────────────────────────────────────────
  io.use(async (socket, next) => {
    try {
      let token = socket.handshake.auth?.token;
      if (!token && socket.handshake.headers?.authorization) {
        const parts = socket.handshake.headers.authorization.split(' ');
        if (parts.length === 2 && parts[0] === 'Bearer') {
          token = parts[1];
        }
      }
      if (!token && socket.handshake.query?.token) {
        token = socket.handshake.query.token;
      }

      if (!token) {
        return next(new Error('Authentication token required'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (!decoded || !decoded.id) {
        return next(new Error('Invalid token'));
      }

      // Query database for up-to-date user info & status
      const [[user]] = await db.query(
        `SELECT id, name, email, role, is_active FROM users WHERE id = ?`,
        [decoded.id]
      );

      if (!user) {
        return next(new Error('User not found'));
      }

      if (user.is_active !== 1) {
        return next(new Error('Account is inactive or deactivated'));
      }

      // If employee, check communication permission
      let hasCommAccess = false;
      if (user.role === 'admin') {
        hasCommAccess = true;
      } else if (user.role === 'employee') {
        const [[perm]] = await db.query(
          `SELECT has_access FROM employee_communication_access WHERE employee_id = ?`,
          [user.id]
        );
        hasCommAccess = perm ? perm.has_access === 1 : false;
      }

      socket.user = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        hasCommAccess,
      };

      next();
    } catch (err) {
      return next(new Error('Authentication failed: ' + err.message));
    }
  });

  // ── Connection Handler ────────────────────────────────────────────────
  io.on('connection', async (socket) => {
    const user = socket.user;
    const userId = user.id;

    // Track online state
    if (!onlineUsers.has(userId)) {
      onlineUsers.set(userId, new Set());
    }
    const userSockets = onlineUsers.get(userId);
    const wasOffline = userSockets.size === 0;
    userSockets.add(socket.id);

    // Join personal user room for direct alerts, notifications, announcements
    socket.join(`user:${userId}`);

    // Join Company Group room if user is active admin or authorized employee
    if (user.role === 'admin' || (user.role === 'employee' && user.hasCommAccess)) {
      socket.join('group:company');
    }

    // Broadcast online status to Company Group if newly online
    if (wasOffline) {
      io.to('group:company').emit('user:presence', {
        userId,
        status: 'online',
        timestamp: new Date().toISOString(),
      });
    }

    // Send current list of online user IDs to the connected client
    socket.emit('presence:initial', {
      onlineUserIds: Array.from(onlineUsers.keys()).filter((uid) => onlineUsers.get(uid).size > 0),
    });

    // ── Room Join / Leave Handlers for 1-on-1 Conversations ───────────
    socket.on('conversation:join', async (data) => {
      try {
        const conversationId = parseInt(data?.conversationId, 10);
        if (!conversationId) return;

        // Security check: verify this user is allowed to join this 1-on-1 conversation
        if (user.role === 'admin') {
          socket.join(`conv:${conversationId}`);
        } else if (user.role === 'employee') {
          const [[conv]] = await db.query(
            `SELECT id, employee_id FROM private_conversations WHERE id = ? AND employee_id = ?`,
            [conversationId, user.id]
          );
          if (conv) {
            socket.join(`conv:${conversationId}`);
          }
        }
      } catch (err) {
        console.error('[Socket conversation:join error]:', err.message);
      }
    });

    socket.on('conversation:leave', (data) => {
      const conversationId = parseInt(data?.conversationId, 10);
      if (conversationId) {
        socket.leave(`conv:${conversationId}`);
      }
    });

    // ── Real-time Typing Indicators ──────────────────────────────────
    socket.on('typing:start', (data) => {
      const { channel, conversationId } = data || {};
      if (channel === 'group') {
        socket.to('group:company').emit('typing:status', {
          channel: 'group',
          userId: user.id,
          userName: user.name,
          role: user.role,
          isTyping: true,
        });
      } else if (channel === 'conversation' && conversationId) {
        socket.to(`conv:${conversationId}`).emit('typing:status', {
          channel: 'conversation',
          conversationId,
          userId: user.id,
          userName: user.name,
          isTyping: true,
        });
      }
    });

    socket.on('typing:stop', (data) => {
      const { channel, conversationId } = data || {};
      if (channel === 'group') {
        socket.to('group:company').emit('typing:status', {
          channel: 'group',
          userId: user.id,
          userName: user.name,
          role: user.role,
          isTyping: false,
        });
      } else if (channel === 'conversation' && conversationId) {
        socket.to(`conv:${conversationId}`).emit('typing:status', {
          channel: 'conversation',
          conversationId,
          userId: user.id,
          userName: user.name,
          isTyping: false,
        });
      }
    });

    // ── Disconnect Handler ───────────────────────────────────────────
    socket.on('disconnect', () => {
      if (onlineUsers.has(userId)) {
        const set = onlineUsers.get(userId);
        set.delete(socket.id);
        if (set.size === 0) {
          onlineUsers.delete(userId);
          // Broadcast offline event to group
          io.to('group:company').emit('user:presence', {
            userId,
            status: 'offline',
            timestamp: new Date().toISOString(),
          });
        }
      }
    });
  });

  ioInstance = io;
  return io;
}

/**
 * Get Socket.IO instance
 */
function getIO() {
  return ioInstance;
}

/**
 * Check if a specific user is currently connected online
 */
function isUserOnline(userId) {
  const set = onlineUsers.get(Number(userId));
  return set ? set.size > 0 : false;
}

/**
 * Get array of online user IDs
 */
function getOnlineUserIds() {
  return Array.from(onlineUsers.keys()).filter((uid) => onlineUsers.get(uid).size > 0);
}

/**
 * Broadcast newly posted Group message
 */
function emitGroupMessage(message) {
  if (!ioInstance) return;
  ioInstance.to('group:company').emit('group:message:new', message);
}

/**
 * Broadcast emoji reaction update on group/private message
 */
function emitMessageReaction(reactionData) {
  if (!ioInstance) return;
  ioInstance.to('group:company').emit('message:reaction:update', reactionData);
  if (reactionData.conversationId) {
    ioInstance.to(`conv:${reactionData.conversationId}`).emit('message:reaction:update', reactionData);
  }
}

/**
 * Broadcast pinned message update for group
 */
function emitGroupPin(pinData) {
  if (!ioInstance) return;
  ioInstance.to('group:company').emit('group:pin:update', pinData);
}

/**
 * Broadcast 1-on-1 private conversation message
 */
function emit1on1Message(conversationId, message, recipientUserId) {
  if (!ioInstance) return;
  // Send to active conversation room
  ioInstance.to(`conv:${conversationId}`).emit('conversation:message:new', {
    conversationId,
    message,
  });
  // Also send directly to recipient's personal room for conversation list update / badge
  if (recipientUserId) {
    ioInstance.to(`user:${recipientUserId}`).emit('conversation:message:alert', {
      conversationId,
      message,
    });
  }
}

/**
 * Broadcast message read receipt
 */
function emit1on1MessageRead(conversationId, readerRole, readerId) {
  if (!ioInstance) return;
  ioInstance.to(`conv:${conversationId}`).emit('conversation:messages:read', {
    conversationId,
    readerRole,
    readerId,
    readAt: new Date().toISOString(),
  });
}

/**
 * Broadcast group read receipt update
 */
function emitGroupRead(messageId, userId, readAt) {
  if (!ioInstance) return;
  ioInstance.to('group:company').emit('group:read:update', {
    messageId,
    userId,
    readAt,
  });
}

/**
 * Broadcast announcement to target recipients
 */
function emitAnnouncement(announcement, recipientIds) {
  if (!ioInstance) return;
  if (!recipientIds || recipientIds.length === 0) {
    // Broadcast to all connected users
    ioInstance.emit('announcement:new', announcement);
  } else {
    for (const rid of recipientIds) {
      ioInstance.to(`user:${rid}`).emit('announcement:new', announcement);
    }
  }
}

/**
 * Broadcast notification bell count update to specific user
 */
function emitNotificationUpdate(userId, data) {
  if (!ioInstance) return;
  ioInstance.to(`user:${userId}`).emit('notification:count:update', data);
}

module.exports = {
  initSocket,
  getIO,
  isUserOnline,
  getOnlineUserIds,
  emitGroupMessage,
  emitMessageReaction,
  emitGroupPin,
  emit1on1Message,
  emit1on1MessageRead,
  emitGroupRead,
  emitAnnouncement,
  emitNotificationUpdate,
};
