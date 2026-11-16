const jwt = require('jsonwebtoken');
const db = require('../config/db');

// In-memory real-time connection maps
// Map<userId, Set<ServerResponse>>
const userConnections = new Map();
// Set<ServerResponse> for all active Admins
const adminConnections = new Set();
// Map<employeeId, Set<ServerResponse>> for active Employees
const employeeConnections = new Map();

/**
 * Formats and writes an SSE event to a single client response stream
 */
function sendToRes(res, eventName, payload) {
  try {
    if (!res.writableEnded && !res.finished) {
      res.write(`event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`);
      if (typeof res.flush === 'function') res.flush();
      return true;
    }
  } catch (err) {
    console.warn('[SSE] Error writing to client stream:', err.message);
  }
  return false;
}

/**
 * Handle incoming SSE stream connection for Admin or Employee
 */
async function handleSSEStream(req, res) {
  // Extract token from query param ?token=... or standard Bearer header
  let token = req.query.token;
  if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ success: false, message: 'Authentication token required for notification stream.' });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token.' });
  }

  const userId = decoded.id;
  const userRole = decoded.role;

  // Verify user in database
  try {
    const [[user]] = await db.query('SELECT id, name, role, is_active FROM users WHERE id = ?', [userId]);
    if (!user || !user.is_active) {
      return res.status(403).json({ success: false, message: 'User account not found or inactive.' });
    }
  } catch (dbErr) {
    return res.status(500).json({ success: false, message: 'Database error during authentication.' });
  }

  // Set SSE Headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
    'Access-Control-Allow-Origin': req.headers.origin || '*'
  });

  // Register in userConnections map
  if (!userConnections.has(userId)) {
    userConnections.set(userId, new Set());
  }
  userConnections.get(userId).add(res);

  // Register by role
  if (userRole === 'admin') {
    adminConnections.add(res);
  } else {
    if (!employeeConnections.has(userId)) {
      employeeConnections.set(userId, new Set());
    }
    employeeConnections.get(userId).add(res);
  }

  console.log(`[SSE] Connected: User #${userId} (${userRole}). Active connections for user: ${userConnections.get(userId).size}`);

  // Send initial connected handshake
  sendToRes(res, 'connected', {
    status: 'connected',
    userId,
    role: userRole,
    connectedAt: new Date().toISOString()
  });

  // Keep-alive heartbeat every 20 seconds
  const heartbeatTimer = setInterval(() => {
    try {
      if (!res.writableEnded && !res.finished) {
        res.write(': heartbeat\n\n');
        if (typeof res.flush === 'function') res.flush();
      }
    } catch (_) {
      clearInterval(heartbeatTimer);
    }
  }, 20000);

  // Clean up on disconnect
  req.on('close', () => {
    clearInterval(heartbeatTimer);

    if (userConnections.has(userId)) {
      const set = userConnections.get(userId);
      set.delete(res);
      if (set.size === 0) userConnections.delete(userId);
    }

    if (userRole === 'admin') {
      adminConnections.delete(res);
    } else {
      if (employeeConnections.has(userId)) {
        const empSet = employeeConnections.get(userId);
        empSet.delete(res);
        if (empSet.size === 0) employeeConnections.delete(userId);
      }
    }

    console.log(`[SSE] Disconnected: User #${userId} (${userRole}).`);
  });
}

/**
 * Push an event to a specific user (across all their open tabs)
 */
function pushToUser(userId, eventName, payload) {
  const numericId = Number(userId);
  const streams = userConnections.get(numericId);
  if (!streams || streams.size === 0) return 0;

  let count = 0;
  for (const res of streams) {
    if (sendToRes(res, eventName, payload)) count++;
  }
  return count;
}

/**
 * Push an event to all connected Admins
 */
function pushToAdmins(eventName, payload) {
  let count = 0;
  for (const res of adminConnections) {
    if (sendToRes(res, eventName, payload)) count++;
  }
  return count;
}

/**
 * Push an event to specific employees or all connected employees
 */
function pushToEmployees(employeeIds, eventName, payload) {
  let count = 0;
  if (employeeIds === 'all' || !Array.isArray(employeeIds)) {
    for (const [empId, streams] of employeeConnections) {
      for (const res of streams) {
        if (sendToRes(res, eventName, payload)) count++;
      }
    }
  } else {
    for (const empId of employeeIds) {
      count += pushToUser(empId, eventName, payload);
    }
  }
  return count;
}

/**
 * Broadcast an event to every single connected client
 */
function broadcast(eventName, payload) {
  let count = 0;
  for (const [userId, streams] of userConnections) {
    for (const res of streams) {
      if (sendToRes(res, eventName, payload)) count++;
    }
  }
  return count;
}

/**
 * Diagnostic stats
 */
function getActiveStats() {
  let totalStreams = 0;
  for (const streams of userConnections.values()) {
    totalStreams += streams.size;
  }
  return {
    totalStreams,
    uniqueUsers: userConnections.size,
    adminStreams: adminConnections.size,
    activeEmployeeCount: employeeConnections.size
  };
}

module.exports = {
  handleSSEStream,
  pushToUser,
  pushToAdmins,
  pushToEmployees,
  broadcast,
  getActiveStats
};
