const db = require('../config/db');

// Exact 30 days in milliseconds (30 * 24 * 60 * 60 * 1000)
const EXPIRATION_DAYS = 30;
const EXPIRATION_MS = EXPIRATION_DAYS * 24 * 60 * 60 * 1000;

/**
 * Calculates expiration timestamp (assigned_at + 30 days)
 * @param {Date|string|number} assignedAt 
 * @returns {Date}
 */
function calculateExpiresAt(assignedAt) {
  const d = new Date(assignedAt);
  return new Date(d.getTime() + EXPIRATION_MS);
}

/**
 * Determines whether an assignment is expired.
 * Checks both explicit expires_at and assigned_at + 30 days.
 * @param {object} assignment
 * @returns {boolean}
 */
function isAssignmentExpired(assignment) {
  if (!assignment) return true;
  if (assignment.lifecycle_status === 'Expired' || assignment.lifecycle_status === 'Archived') {
    return true;
  }
  const now = Date.now();
  if (assignment.expires_at) {
    return new Date(assignment.expires_at).getTime() <= now;
  }
  if (assignment.assigned_at) {
    return (new Date(assignment.assigned_at).getTime() + EXPIRATION_MS) <= now;
  }
  return false;
}

/**
 * SQL snippet to filter out expired assignments in queries.
 * @param {string} tableAlias Alias for excel_assignments table (default: 'ea')
 * @returns {string}
 */
function getActiveAssignmentCondition(tableAlias = 'ea') {
  return `(
    ${tableAlias}.lifecycle_status != 'Expired'
    AND ${tableAlias}.lifecycle_status != 'Archived'
    AND (${tableAlias}.expires_at IS NULL OR ${tableAlias}.expires_at > NOW())
    AND ${tableAlias}.assigned_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
  )`;
}

/**
 * Periodic / background job to archive expired assignments.
 * Updates lifecycle_status to 'Expired' for any assignments that have passed 30 days.
 */
async function processExpiredAssignments() {
  try {
    const [result] = await db.query(`
      UPDATE excel_assignments
      SET lifecycle_status = 'Expired', updated_at = NOW()
      WHERE lifecycle_status = 'Active'
        AND (
          (expires_at IS NOT NULL AND expires_at <= NOW())
          OR (assigned_at < DATE_SUB(NOW(), INTERVAL 30 DAY))
        )
    `);

    if (result && result.affectedRows > 0) {
      console.log(`[ExcelExpiry] Archived ${result.affectedRows} expired assignment(s).`);
    }
    return result ? result.affectedRows : 0;
  } catch (err) {
    console.error('[ExcelExpiry] Error processing expired assignments:', err.message);
    return 0;
  }
}

module.exports = {
  EXPIRATION_DAYS,
  EXPIRATION_MS,
  calculateExpiresAt,
  isAssignmentExpired,
  getActiveAssignmentCondition,
  processExpiredAssignments
};
