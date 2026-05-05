/**
 * Backend constants for status and types
 */

const ATTENDANCE_STATUS = {
  WORKING: 'working',
  COMPLETED: 'completed',
  ABSENT: 'absent',
  HALF_DAY: 'half_day',
  LEAVE: 'leave'
};

const LEAVE_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected'
};

const LEAVE_TYPE = {
  CASUAL: 'casual',
  SICK: 'sick',
  EMERGENCY: 'emergency',
  UNPAID: 'unpaid'
};

const USER_ROLES = {
  ADMIN: 'admin',
  EMPLOYEE: 'employee'
};

module.exports = {
  ATTENDANCE_STATUS,
  LEAVE_STATUS,
  LEAVE_TYPE,
  USER_ROLES
};
