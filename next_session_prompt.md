# Next Session Instruction

**Context**: We are stabilizing the DS16 CRM production attendance.
**Reference File**: `d:\Freelance\ds16-v1\session_summary.md`

**Current Problem**:
The attendance history is loading 113 records, but displaying "Absent" badges incorrectly. This is a case-sensitivity mismatch: Database uses `'present'`, code expects `'PRESENT'`. Additionally, Abhijit's check-in for today (May 5) is missing from the database dump.

**Task for AI**:
1.  Provide a single, clean `server/routes/attendance.js` file that:
    *   Uses `LOWER(status)` in SQL queries to prevent case-sensitivity bugs.
    *   Uses `LEFT JOIN` for the `/today` endpoint so all 5 users are visible.
    *   Uses `JOIN` for the `/all` (history) endpoint so only actual records are shown.
2.  Verify the `user_id` mapping (1:Abhijit, 2:Chaitali, 3:Rahul, 5:Ashwini, 6:Sahil) is consistent across the API.
3.  Suggest a way to re-trigger Abhijit's check-in now that the API is stable.

**Data is SAFE**: The 113 records are confirmed in `attendance_debug.sql`. Do not truncate or drop the attendance table.
