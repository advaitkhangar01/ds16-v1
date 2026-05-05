// server/routes/attendance.js
const router = require('express').Router();
const pool = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { getISTDate } = require('../utils/date');
const { ATTENDANCE_STATUS, LEAVE_STATUS } = require('../utils/constants');
const { validateLocation, getDistance } = require('../utils/geofence');

// Helper: Get specific app setting
async function getSetting(key, defaultValue) {
  try {
    const { rows } = await pool.query('SELECT value FROM app_settings WHERE key = $1', [key]);
    return rows[0] ? rows[0].value : defaultValue;
  } catch (err) {
    return defaultValue;
  }
}

// Helper: Bulk-fetch multiple settings at once
async function getSettings(keys) {
  try {
    const { rows } = await pool.query(
      'SELECT key, value FROM app_settings WHERE key = ANY($1)',
      [keys]
    );
    return rows.reduce((acc, r) => { acc[r.key] = r.value; return acc; }, {});
  } catch (err) {
    return {};
  }
}

// Helper: Log a failed check-in attempt
async function logAttempt(userId, { lat, lng, accuracy, distance, zone, reason }) {
  try {
    await pool.query(
      `INSERT INTO attendance_attempts (user_id, lat, lng, accuracy, distance, zone, reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, lat || null, lng || null, accuracy || null, distance || null, zone || null, reason]
    );
  } catch (err) {
    // Non-critical — don't let logging failure break the flow
    console.error('[GeoFence] Failed to log attempt:', err.message);
  }
}

// ─── POST /api/attendance/checkin ─────────────────────────────────────────────
router.post('/checkin', authenticate, async (req, res) => {
  try {
    const { lat, lng, accuracy } = req.body;
    const userId = req.user.id;
    const today  = getISTDate();

    // Fetch all needed settings in one query
    const settings = await getSettings([
      'office_start_time', 'late_threshold_time', 'half_day_cutoff_time',
      'geofence_enabled', 'office_lat', 'office_lng',
      'geofence_strict_radius', 'geofence_buffer_radius', 'geofence_max_accuracy',
    ]);

    const officeStartTime  = settings.office_start_time  || '10:00';
    const lateThresholdTime = settings.late_threshold_time || '10:15';
    const halfDayCutoff    = settings.half_day_cutoff_time || '13:00';
    const geofenceEnabled  = settings.geofence_enabled === 'true';

    console.log(`[CheckIn] User ${userId} checking in for ${today} | geofence: ${geofenceEnabled}`);

    // ── Duplicate check ──────────────────────────────────────────────────────
    const { rows: existing } = await pool.query(
      'SELECT id, check_in FROM attendance WHERE user_id = $1 AND date = $2::date',
      [userId, today]
    );

    if (existing.length > 0 && existing[0].check_in) {
      return res.status(400).json({ error: 'Already checked in today' });
    }

    // ── Geo-fence validation ─────────────────────────────────────────────────
    let geoResult = {
      allowed:           true,
      zone:              null,
      distance:          null,
      effectiveDistance: null,
      isBoundaryCheckin: false,
      checkinVerified:   false,
      message:           null,
    };

    if (geofenceEnabled) {
      // Require location data when geo-fence is active
      if (lat == null || lng == null) {
        return res.status(403).json({
          error: 'Location is required for check-in. Please enable GPS and try again.',
          reason: 'no_location',
        });
      }

      geoResult = validateLocation(
        { lat: parseFloat(lat), lng: parseFloat(lng), accuracy: parseFloat(accuracy) || 999 },
        settings
      );

      if (!geoResult.allowed) {
        // Log the failed attempt
        await logAttempt(userId, {
          lat, lng,
          accuracy: parseFloat(accuracy) || null,
          distance: geoResult.distance,
          zone:     geoResult.zone,
          reason:   geoResult.reason,
        });

        return res.status(403).json({
          error:    geoResult.message,
          reason:   geoResult.reason,
          distance: geoResult.distance,
          zone:     geoResult.zone,
        });
      }
    } else if (lat != null && lng != null && settings.office_lat) {
      // Geo-fence disabled but location provided → still compute & store for audit
      try {
        const dist = getDistance(
          parseFloat(lat), parseFloat(lng),
          parseFloat(settings.office_lat), parseFloat(settings.office_lng)
        );
        geoResult.distance = Math.round(dist);
        const acc = parseFloat(accuracy) || 999;
        const eff = Math.max(0, dist - acc);
        const strictR = parseFloat(settings.geofence_strict_radius) || 25;
        const bufferR = parseFloat(settings.geofence_buffer_radius) || 50;
        geoResult.zone             = eff <= strictR ? 'strict' : eff <= bufferR ? 'buffer' : 'outside';
        geoResult.isBoundaryCheckin = geoResult.zone === 'buffer';
        geoResult.checkinVerified   = geoResult.zone === 'strict';
      } catch (_) { /* ignore */ }
    }

    // ── Time / lateness logic ────────────────────────────────────────────────
    const now    = new Date();
    const nowIso = now.toISOString();
    const timeStr = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      hour:     '2-digit',
      minute:   '2-digit',
      hour12:   false,
    }).format(now);

    let status  = ATTENDANCE_STATUS.WORKING;
    let isLate  = false;
    let lateMins = 0;

    if (timeStr > halfDayCutoff) {
      status = ATTENDANCE_STATUS.HALF_DAY;
      isLate = true;
    } else if (timeStr > lateThresholdTime) {
      isLate = true;
    }

    const [startH, startM] = officeStartTime.split(':').map(Number);
    const [nowH,   nowM  ] = timeStr.split(':').map(Number);
    if (nowH > startH || (nowH === startH && nowM > startM)) {
      lateMins = (nowH - startH) * 60 + (nowM - startM);
    }

    // ── Write attendance record ──────────────────────────────────────────────
    let row;
    const geoParams = [
      lat  || null,
      lng  || null,
      parseFloat(accuracy) || null,  // checkin_accuracy
      geoResult.distance,            // checkin_distance
      geoResult.zone,                // checkin_zone
      geoResult.isBoundaryCheckin,   // is_boundary_checkin
      geoResult.checkinVerified,     // checkin_verified
    ];

    if (existing.length > 0) {
      const { rows } = await pool.query(
        `UPDATE attendance SET
           check_in = $1, lat = $2, lng = $3,
           checkin_accuracy = $4, checkin_distance = $5, checkin_zone = $6,
           is_boundary_checkin = $7, checkin_verified = $8,
           status = $9, is_late = $10, late_minutes = $11
         WHERE user_id = $12 AND date = $13::date
         RETURNING *`,
        [nowIso, ...geoParams, status, isLate, lateMins, userId, today]
      );
      row = rows[0];
    } else {
      const { rows } = await pool.query(
        `INSERT INTO attendance
           (user_id, check_in, lat, lng,
            checkin_accuracy, checkin_distance, checkin_zone,
            is_boundary_checkin, checkin_verified,
            date, status, is_late, late_minutes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING *`,
        [userId, nowIso, lat || null, lng || null,
         parseFloat(accuracy) || null,
         geoResult.distance,
         geoResult.zone,
         geoResult.isBoundaryCheckin,
         geoResult.checkinVerified,
         today, status, isLate, lateMins]
      );
      row = rows[0];
    }

    res.json({
      message:           geoResult.isBoundaryCheckin
        ? 'Checked in (GPS variation detected)'
        : 'Checked in successfully',
      attendance:        row,
      zone:              geoResult.zone,
      distance:          geoResult.distance,
      isBoundaryCheckin: geoResult.isBoundaryCheckin,
      geoMessage:        geoResult.message,
    });

  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Already checked in today' });
    }
    console.error('Check-in error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── POST /api/attendance/checkout ────────────────────────────────────────────
router.post('/checkout', authenticate, async (req, res) => {
  try {
    const { lat, lng, accuracy } = req.body;
    const userId = req.user.id;
    const today  = getISTDate();

    const settings = await getSettings([
      'min_working_hours',
      'office_lat', 'office_lng',
      'geofence_strict_radius', 'geofence_buffer_radius',
    ]);

    const minWorkingHours = parseFloat(settings.min_working_hours || '4');

    const { rows: existing } = await pool.query(
      'SELECT id, check_in, check_out, status FROM attendance WHERE user_id = $1 AND date = $2::date',
      [userId, today]
    );

    if (!existing.length || !existing[0].check_in) {
      return res.status(400).json({ error: 'Please check in first' });
    }

    if (existing[0].check_out) {
      return res.status(400).json({ error: 'Already checked out today' });
    }

    const now        = new Date();
    const nowIso     = now.toISOString();
    const checkIn    = new Date(existing[0].check_in);
    const hoursWorked = (now - checkIn) / (1000 * 60 * 60);

    let newStatus = existing[0].status;
    if (hoursWorked < minWorkingHours) {
      newStatus = ATTENDANCE_STATUS.HALF_DAY;
    } else if (newStatus === ATTENDANCE_STATUS.WORKING || newStatus === 'present') {
      newStatus = ATTENDANCE_STATUS.COMPLETED;
    }

    // ── Checkout location (always optional, never blocks) ────────────────────
    let checkoutDistance      = null;
    let checkoutZone          = null;
    let checkoutOutsideZone   = false;

    if (lat != null && lng != null && settings.office_lat) {
      try {
        const dist = getDistance(
          parseFloat(lat), parseFloat(lng),
          parseFloat(settings.office_lat), parseFloat(settings.office_lng)
        );
        checkoutDistance = Math.round(dist);
        const acc  = parseFloat(accuracy) || 999;
        const eff  = Math.max(0, dist - acc);
        const strictR = parseFloat(settings.geofence_strict_radius) || 25;
        const bufferR = parseFloat(settings.geofence_buffer_radius) || 50;
        checkoutZone         = eff <= strictR ? 'strict' : eff <= bufferR ? 'buffer' : 'outside';
        checkoutOutsideZone  = checkoutZone === 'outside';
      } catch (_) { /* ignore */ }
    }

    const { rows } = await pool.query(
      `UPDATE attendance SET
         check_out = $1, status = $2,
         checkout_lat = $3, checkout_lng = $4, checkout_accuracy = $5,
         checkout_distance = $6, checkout_zone = $7, checkout_outside_zone = $8
       WHERE user_id = $9 AND date = $10::date
       RETURNING *`,
      [
        nowIso, newStatus,
        lat || null, lng || null, parseFloat(accuracy) || null,
        checkoutDistance, checkoutZone, checkoutOutsideZone,
        userId, today,
      ]
    );

    const msg = checkoutOutsideZone
      ? 'Checked out outside office location'
      : 'Checked out successfully';

    res.json({
      message:             msg,
      attendance:          rows[0],
      checkoutZone,
      checkoutDistance,
      checkoutOutsideZone,
    });

  } catch (err) {
    console.error('Check-out error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── GET /api/attendance/today ────────────────────────────────────────────────
router.get('/today', authenticate, async (req, res) => {
  try {
    const today = getISTDate();

    const { rows } = await pool.query(
      `SELECT
         u.id as user_id, u.name, u.role, u.department,
         a.check_in, a.check_out, a.lat, a.lng, a.date, a.is_late, a.late_minutes,
         a.checkin_zone, a.checkin_distance, a.checkin_accuracy,
         a.is_boundary_checkin, a.checkin_verified,
         a.checkout_zone, a.checkout_distance, a.checkout_outside_zone,
         CASE
           WHEN lr.id IS NOT NULL THEN $2
           ELSE LOWER(COALESCE(a.status, $3))
         END AS status
       FROM users u
       LEFT JOIN attendance a ON a.user_id = u.id AND a.date = $1::date
       LEFT JOIN leave_requests lr ON lr.user_id = u.id
         AND lr.status = $4
         AND $1::date BETWEEN lr.start_date AND lr.end_date
       ORDER BY a.check_in ASC NULLS LAST, u.name ASC`,
      [today, ATTENDANCE_STATUS.LEAVE, ATTENDANCE_STATUS.ABSENT, LEAVE_STATUS.APPROVED]
    );

    // Mask GPS for non-admins (except their own record)
    const sanitizedRows = rows.map(r => {
      if (req.user.role === 'admin' || r.user_id === req.user.id) return r;
      const { lat, lng, checkin_distance, checkin_zone, checkin_accuracy, ...rest } = r;
      return { ...rest, lat: null, lng: null, checkin_distance: null, checkin_zone: null, checkin_accuracy: null };
    });

    const myRecord = rows.find(r => r.user_id === req.user.id) || {};

    console.log(`[Today] User ${req.user.id} requested team attendance for ${today}.`);
    res.json({ attendance: sanitizedRows, my_attendance: myRecord, date: today });

  } catch (err) {
    console.error('Today attendance error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── GET /api/attendance/all ──────────────────────────────────────────────────
router.get('/all', authenticate, async (req, res) => {
  try {
    const { page = 1, limit = 50, from, to } = req.query;
    const offset = (page - 1) * limit;

    let dateFilter = '';
    const params = [parseInt(limit), offset];
    if (from && to) {
      params.push(from, to);
      dateFilter = `AND a.date BETWEEN $${params.length - 1} AND $${params.length}`;
    }

    const leaveStatusIdx   = params.length + 1;
    const absentStatusIdx  = params.length + 2;
    const approvedStatusIdx = params.length + 3;

    const { rows } = await pool.query(
      `SELECT
         u.id as user_id, u.name, u.role, u.department,
         a.check_in, a.check_out, a.lat, a.lng, a.date, a.is_late, a.late_minutes,
         a.checkin_zone, a.checkin_distance, a.checkin_accuracy,
         a.is_boundary_checkin, a.checkin_verified,
         a.checkout_zone, a.checkout_distance, a.checkout_outside_zone,
         CASE
           WHEN lr.id IS NOT NULL THEN $${leaveStatusIdx}
           ELSE LOWER(COALESCE(a.status, $${absentStatusIdx}))
         END AS status
       FROM users u
       LEFT JOIN attendance a ON a.user_id = u.id
       LEFT JOIN leave_requests lr ON lr.user_id = u.id
         AND lr.status = $${approvedStatusIdx}
         AND (a.date BETWEEN lr.start_date AND lr.end_date OR (a.date IS NULL AND CURRENT_DATE BETWEEN lr.start_date AND lr.end_date))
       WHERE 1=1 ${dateFilter}
       ORDER BY a.date DESC NULLS LAST, a.check_in ASC NULLS LAST, u.name
       LIMIT $1 OFFSET $2`,
      [...params, ATTENDANCE_STATUS.LEAVE, ATTENDANCE_STATUS.ABSENT, LEAVE_STATUS.APPROVED]
    );

    // Mask GPS for non-admins
    const sanitizedRows = rows.map(r => {
      if (req.user.role === 'admin' || r.user_id === req.user.id) return r;
      const { lat, lng, checkin_distance, checkin_zone, checkin_accuracy, ...rest } = r;
      return { ...rest, lat: null, lng: null, checkin_distance: null, checkin_zone: null, checkin_accuracy: null };
    });

    res.json({ attendance: sanitizedRows, page: parseInt(page), limit: parseInt(limit) });

  } catch (err) {
    console.error('All attendance error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── POST /api/attendance/manual — Admin mark attendance ──────────────────────
router.post('/manual', authenticate, requireAdmin, async (req, res) => {
  try {
    const { user_id, date, check_in, check_out, status, is_late, late_minutes } = req.body;

    if (!user_id || !date || !status) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const { rows: existing } = await pool.query(
      'SELECT id FROM attendance WHERE user_id = $1 AND date = $2::date',
      [user_id, date]
    );

    let row;
    if (existing.length > 0) {
      const { rows } = await pool.query(
        `UPDATE attendance SET
           check_in = $1, check_out = $2, status = $3,
           is_late = $4, late_minutes = $5
         WHERE id = $6
         RETURNING *`,
        [check_in, check_out, status, is_late, late_minutes, existing[0].id]
      );
      row = rows[0];
    } else {
      const { rows } = await pool.query(
        `INSERT INTO attendance (user_id, date, check_in, check_out, status, is_late, late_minutes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [user_id, date, check_in, check_out, status, is_late, late_minutes]
      );
      row = rows[0];
    }

    res.json({ message: 'Attendance record updated', attendance: row });
  } catch (err) {
    console.error('Manual attendance error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── GET /api/attendance/attempts — Admin view failed attempts ────────────────
router.get('/attempts', authenticate, requireAdmin, async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const { rows } = await pool.query(
      `SELECT aa.*, u.name as user_name
       FROM attendance_attempts aa
       LEFT JOIN users u ON u.id = aa.user_id
       ORDER BY aa.attempted_at DESC
       LIMIT $1`,
      [parseInt(limit)]
    );
    res.json({ attempts: rows });
  } catch (err) {
    console.error('Attempts fetch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
