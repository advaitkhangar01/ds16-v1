/**
 * DS16 — Apply Policy A Migration & Restore Attendance Late Marks
 * 
 * 1. Executes migration 024_policy_a_preserve_late_on_half_day.sql
 *    - Drops chk_attendance_half_day_absent_no_late
 *    - Adds chk_attendance_absent_leave_no_late
 * 2. Restores is_late & late_minutes on attendance records (including half-day shifts)
 *    based on employee batch start_time and late_threshold_time.
 * 
 * Usage:
 *   node scripts/apply_policy_a_migration.js
 */

const fs = require('fs');
const path = require('path');
const pool = require('../server/db');

function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const parts = timeStr.split(':');
  const hours = parseInt(parts[0], 10) || 0;
  const minutes = parseInt(parts[1], 10) || 0;
  return hours * 60 + minutes;
}

async function run() {
  console.log('\n================================================================');
  console.log('   🛠️  DS16 POLICY A MIGRATION & LATE MARKS RESTORATION');
  console.log('================================================================\n');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── STEP 1: Apply Migration 024 ───────────────────────────────────────────
    console.log('▶ [1/2] Applying Migration 024 (Database Constraints update)...');
    const migrationSqlPath = path.join(__dirname, '../server/db/migrations/024_policy_a_preserve_late_on_half_day.sql');
    const sql = fs.readFileSync(migrationSqlPath, 'utf8');
    await client.query(sql);
    console.log('  ✅ Database constraint updated: half_day shifts can now legally preserve late flags.');

    // ── STEP 2: Restore Late Flags on Attendance Records ─────────────────────
    console.log('\n▶ [2/2] Scanning and restoring late marks on attendance records...');

    // Fetch batch defaults
    const { rows: settingsRows } = await client.query(
      "SELECT key, value FROM app_settings WHERE key = ANY('{office_start_time,late_threshold_time,half_day_cutoff_time,late_threshold_mins}')"
    );
    const settings = settingsRows.reduce((acc, r) => { acc[r.key] = r.value; return acc; }, {});
    const defaultStart = settings.office_start_time || '10:00';
    const defaultThreshold = settings.late_threshold_time || '10:15';
    const defaultCutoff = settings.half_day_cutoff_time || '13:00';

    const { rows: records } = await client.query(`
      SELECT a.id, a.user_id, u.name, a.date, a.check_in, a.check_out, a.status,
             a.is_late, a.late_minutes,
             COALESCE(b.office_start_time, $1) as batch_start,
             COALESCE(b.late_threshold_time, $2) as batch_threshold,
             COALESCE(b.half_day_cutoff_time, $3) as batch_cutoff
      FROM attendance a
      JOIN users u ON u.id = a.user_id
      LEFT JOIN attendance_batches b ON b.id = COALESCE(a.batch_id, u.batch_id)
      WHERE a.check_in IS NOT NULL
        AND LOWER(COALESCE(a.status, '')) NOT IN ('absent', 'leave')
      ORDER BY a.date DESC, a.id DESC;
    `, [defaultStart, defaultThreshold, defaultCutoff]);

    let updatedCount = 0;
    const restoredSummary = [];

    for (const row of records) {
      const checkInDate = new Date(row.check_in);
      const timeStr = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(checkInDate);

      const checkInMins = timeToMinutes(timeStr);
      const startMins = timeToMinutes(row.batch_start.substring(0, 5));
      const thresholdMins = timeToMinutes(row.batch_threshold.substring(0, 5));
      const cutoffMins = timeToMinutes(row.batch_cutoff.substring(0, 5));

      let expectedIsLate = false;
      let expectedLateMins = 0;

      if (cutoffMins > 0 && checkInMins > cutoffMins) {
        // Afternoon arrival -> half-day, not late
        expectedIsLate = false;
        expectedLateMins = 0;
      } else {
        if (checkInMins > thresholdMins) {
          expectedIsLate = true;
        }
        if (checkInMins > startMins) {
          expectedLateMins = checkInMins - startMins;
        }
      }

      if (row.is_late !== expectedIsLate || row.late_minutes !== expectedLateMins) {
        await client.query(`
          UPDATE attendance
          SET is_late = $1, late_minutes = $2
          WHERE id = $3
        `, [expectedIsLate, expectedLateMins, row.id]);

        updatedCount++;
        restoredSummary.push({
          id: row.id,
          name: row.name,
          date: row.date ? (row.date.toISOString ? row.date.toISOString().slice(0, 10) : String(row.date)) : '',
          in_time: timeStr,
          status: row.status,
          old_is_late: row.is_late,
          old_late_minutes: row.late_minutes,
          new_is_late: expectedIsLate,
          new_late_minutes: expectedLateMins
        });
      }
    }

    await client.query('COMMIT');

    console.log(`  ✅ Successfully updated/restored ${updatedCount} attendance record(s).`);
    if (restoredSummary.length > 0) {
      console.log('\n  Restored Records (Sample):');
      console.table(restoredSummary.slice(0, 15));
    }

    console.log('\n================================================================');
    console.log('   🎉 POLICY A MIGRATION COMPLETE');
    console.log('================================================================\n');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', err);
    process.exit(1);
  } finally {
    client.release();
    pool.end();
  }
}

run();
