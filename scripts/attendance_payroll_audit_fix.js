/**
 * DS16 — Automated Attendance & Payroll Audit Remediation Migration Script
 * 
 * Safely corrects historical shift classifications, enforces Policy A compliance,
 * reconciles batch configurations, and protects admin manual approvals.
 * 
 * Execution Modes:
 *   node scripts/attendance_payroll_audit_fix.js --dry-run   (Audit & preview only)
 *   node scripts/attendance_payroll_audit_fix.js --apply     (Atomic transaction execution)
 */

const pool = require('../server/db');

async function runRemediation() {
  const isApply = process.argv.includes('--apply');
  const mode = isApply ? 'APPLY (EXECUTING FIXES)' : 'DRY-RUN (AUDIT & PREVIEW ONLY)';

  console.log('================================================================');
  console.log('   🛠️  DS16 ATTENDANCE & PAYROLL AUDIT REMEDIATION MIGRATION');
  console.log(`   Execution Mode: ${mode}`);
  console.log('================================================================\n');

  const client = await pool.connect();
  const report = {
    settingsUpdated: 0,
    batchesUpdated: 0,
    usersAssignedBatch: 0,
    attendanceRecordsCorrected: 0,
    manualApprovalsPreserved: 0,
    policyAPreservedLates: 0
  };

  try {
    await client.query('BEGIN');

    // ── 1. App Settings: Ensure min_working_hours = '9.00' ──────────────────
    console.log('▶ [1/5] Auditing Global App Settings...');
    const { rows: settingsRows } = await client.query(
      "SELECT value FROM app_settings WHERE key = 'min_working_hours'"
    );
    const currentMinHours = settingsRows[0]?.value;
    if (currentMinHours !== '9.00' && currentMinHours !== '9' && currentMinHours !== '9.0') {
      console.log(`  ⚠️ app_settings.min_working_hours is '${currentMinHours}' (expected '9.00')`);
      if (isApply) {
        await client.query(
          "INSERT INTO app_settings (key, value, description) VALUES ('min_working_hours', '9.00', 'Mandatory shift working hours') ON CONFLICT (key) DO UPDATE SET value = '9.00'"
        );
        report.settingsUpdated++;
        console.log("  ✅ app_settings.min_working_hours updated to '9.00'.");
      }
    } else {
      console.log("  ✅ app_settings.min_working_hours is already correctly configured ('9.00').");
    }

    // ── 2. Attendance Batches: Standardize min_working_hours = 9.00 ──────────
    console.log('\n▶ [2/5] Auditing Attendance Batches...');
    const { rows: nonStandardBatches } = await client.query(
      'SELECT id, name, min_working_hours FROM attendance_batches WHERE min_working_hours < 9.00'
    );
    if (nonStandardBatches.length > 0) {
      console.log(`  ⚠️ Found ${nonStandardBatches.length} batch(es) with min_working_hours < 9.00:`);
      nonStandardBatches.forEach(b => console.log(`     - Batch ID ${b.id} (${b.name}): ${b.min_working_hours}h`));
      if (isApply) {
        const { rowCount } = await client.query(
          'UPDATE attendance_batches SET min_working_hours = 9.00 WHERE min_working_hours < 9.00'
        );
        report.batchesUpdated = rowCount;
        console.log(`  ✅ Updated ${rowCount} batch(es) to 9.00 hours minimum.`);
      }
    } else {
      console.log('  ✅ All attendance batches adhere to 9.00 hours standard.');
    }

    // ── 3. Active Users: Assign Missing Batches ──────────────────────────────
    console.log('\n▶ [3/5] Auditing Active Staff Batch Assignments...');
    const { rows: unassignedUsers } = await client.query(
      'SELECT id, name, role, department FROM users WHERE is_active IS NOT FALSE AND batch_id IS NULL'
    );
    if (unassignedUsers.length > 0) {
      console.log(`  ⚠️ Found ${unassignedUsers.length} active staff member(s) without assigned batch:`);
      unassignedUsers.forEach(u => console.log(`     - User ID ${u.id}: ${u.name} (${u.role})`));
      if (isApply) {
        // Find default batch (10 AM Batch or ID 2)
        const { rows: defaultBatch } = await client.query(
          "SELECT id FROM attendance_batches WHERE name ILIKE '%10%' ORDER BY id ASC LIMIT 1"
        );
        const targetBatchId = defaultBatch[0]?.id || 2;
        const { rowCount } = await client.query(
          'UPDATE users SET batch_id = $1 WHERE is_active IS NOT FALSE AND batch_id IS NULL',
          [targetBatchId]
        );
        report.usersAssignedBatch = rowCount;
        console.log(`  ✅ Assigned ${rowCount} staff member(s) to Batch ID ${targetBatchId} (10 AM Batch).`);
      }
    } else {
      console.log('  ✅ All active staff members have an assigned attendance batch.');
    }

    // ── 4. Historical Attendance Records: Reclassify < 9h Shifts & Policy A ───
    console.log('\n▶ [4/5] Auditing Historical Attendance Records & Policy A Compliance...');

    // Fetch manually approved attendance IDs to strictly preserve admin overrides
    const { rows: manualAudits } = await client.query(`
      SELECT DISTINCT entity_id 
      FROM audit_logs 
      WHERE action = 'ATTENDANCE_MANUAL_MARK' AND entity_type = 'attendance' AND entity_id IS NOT NULL
    `);
    const manuallyApprovedIds = new Set(manualAudits.map(m => m.entity_id));

    // Select all check-out completed shifts with hours < 9.00
    const { rows: shortShifts } = await client.query(`
      SELECT a.id, a.user_id, a.date, a.check_in, a.check_out, a.hours_worked, a.status,
             a.is_late, a.late_minutes
      FROM attendance a
      WHERE a.check_out IS NOT NULL
        AND a.hours_worked < 9.00
        AND LOWER(COALESCE(a.status, '')) IN ('completed', 'working', 'present')
      ORDER BY a.date DESC
    `);

    console.log(`  - Found ${shortShifts.length} shift(s) with < 9.00h marked as completed/working.`);

    for (const shift of shortShifts) {
      if (manuallyApprovedIds.has(shift.id)) {
        report.manualApprovalsPreserved++;
        console.log(`     🛡️ Shift ID ${shift.id} (User ${shift.user_id}, ${shift.date}): Preserved manual admin approval.`);
        continue;
      }

      // Under Policy A: Keep is_late and late_minutes untouched!
      if (shift.is_late) {
        report.policyAPreservedLates++;
      }

      if (isApply) {
        await client.query(`
          UPDATE attendance
          SET status = 'half_day'
          WHERE id = $1
        `, [shift.id]);
        report.attendanceRecordsCorrected++;
      }
    }

    // Check 4B: Ensure absent/leave records do not carry late marks (constraint compliance)
    const { rows: invalidLatesOnAbsent } = await client.query(`
      SELECT id, user_id, date, status, is_late, late_minutes
      FROM attendance
      WHERE (is_late = TRUE OR late_minutes > 0)
        AND LOWER(COALESCE(status, '')) IN ('absent', 'leave')
    `);
    if (invalidLatesOnAbsent.length > 0) {
      console.log(`  ⚠️ Found ${invalidLatesOnAbsent.length} absent/leave record(s) carrying invalid late marks.`);
      if (isApply) {
        const { rowCount } = await client.query(`
          UPDATE attendance
          SET is_late = FALSE, late_minutes = 0
          WHERE (is_late = TRUE OR late_minutes > 0)
            AND LOWER(COALESCE(status, '')) IN ('absent', 'leave')
        `);
        console.log(`  ✅ Cleared late flags on ${rowCount} absent/leave record(s).`);
      }
    } else {
      console.log('  ✅ Zero absent/leave records carry invalid late marks.');
    }

    // ── 5. Unclosed Abandoned Check-ins (> 24 hours without checkout) ──────────
    console.log('\n▶ [5/5] Auditing Open Check-ins (> 24h old)...');
    const { rows: abandoned } = await client.query(`
      SELECT a.id, a.user_id, a.date, a.check_in
      FROM attendance a
      WHERE a.check_out IS NULL
        AND a.check_in < NOW() - INTERVAL '24 hours'
    `);
    console.log(`  - Found ${abandoned.length} abandoned open check-in(s).`);
    if (isApply && abandoned.length > 0) {
      for (const ab of abandoned) {
        const dateStr = ab.date.toISOString().slice(0, 10);
        const checkoutISO = `${dateStr}T16:00:00+05:30`;
        const coDate = new Date(checkoutISO);
        const ciDate = new Date(ab.check_in);
        const hrs = parseFloat((Math.max(0, coDate - ciDate) / 3600000).toFixed(2));
        await client.query(`
          UPDATE attendance
          SET check_out = $1, status = 'half_day', hours_worked = $2
          WHERE id = $3
        `, [checkoutISO, hrs, ab.id]);
      }
      console.log(`  ✅ Auto-closed ${abandoned.length} abandoned check-in(s) at 16:00 IST cutoff.`);
    }

    if (isApply) {
      await client.query('COMMIT');
      console.log('\n================================================================');
      console.log('   🎉 REMEDIATION SUCCESSFULLY APPLIED & COMMITTED');
      console.log(`   - Settings updated: ${report.settingsUpdated}`);
      console.log(`   - Batches normalized (9h): ${report.batchesUpdated}`);
      console.log(`   - Users assigned batch: ${report.usersAssignedBatch}`);
      console.log(`   - Attendance corrected (< 9h -> half_day): ${report.attendanceRecordsCorrected}`);
      console.log(`   - Manual approvals protected: ${report.manualApprovalsPreserved}`);
      console.log(`   - Policy A late marks preserved: ${report.policyAPreservedLates}`);
      console.log('================================================================\n');
    } else {
      await client.query('ROLLBACK');
      console.log('\n================================================================');
      console.log('   ℹ️ DRY-RUN COMPLETED (NO DATABASE CHANGES COMMITTED)');
      console.log('   To apply changes, run: node scripts/attendance_payroll_audit_fix.js --apply');
      console.log('================================================================\n');
    }

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Remediation error encountered:', err.message);
    process.exit(1);
  } finally {
    client.release();
    pool.end();
  }
}

if (require.main === module) {
  runRemediation();
}

module.exports = { runRemediation };
