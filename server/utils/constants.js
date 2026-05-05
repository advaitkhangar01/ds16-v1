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

const DOCUMENT_TAGS = [
  "Adhar Card",
  "Pan Card",
  "Tax Receipt",
  "K Prata",
  "Mobile Number",
  "Email Id",
  "Final Proposal For Submission",
  "Sale Deed",
  "Layout Plan",
  "DP Plan Futala",
  "Property Card",
  "Architectural Projection",
  "Indemnity Bond",
  "Structural Stability",
  "शटिपूर्ती बंध",
  "Sanction Plan",
  "Center Line",
  "Foundation And Footing",
  "Plinth Beam",
  "Plinth Slab",
  "First Floor Slab",
  "Second Floor Slab",
  "Third Floor Slab",
  "Fourth Floor Slab",
  "Fifth Floor Slab",
  "Sixth Floor Slab",
  "Seventh Floor Slab",
  "Brick Plan",
  "Electrical",
  "Plumbing",
  "Sectional Details",
  "Elevation",
  "POP",
  "Grills And Railings",
  "Others"
];

module.exports = {
  ATTENDANCE_STATUS,
  LEAVE_STATUS,
  LEAVE_TYPE,
  USER_ROLES,
  DOCUMENT_TAGS
};
