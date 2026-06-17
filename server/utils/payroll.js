// server/utils/payroll.js
const pool = require('../db');
const { getISTDate, getISTTime } = require('./date');

/**
 * Calculates unified payroll and attendance statistics for an employee for a given month and year.
 */
async function calculatePayrollForEmployee(userId, month, year, settings, dbPool = pool) {
  // 1. Fetch employee
  const { rows: userRows } = await dbPool.query(
    'SELECT id, name, department, role, base_salary, hourly_rate FROM users WHERE id = $1',
    [userId]
  );
  const employee = userRows[0];
  if (!employee) return null;

  const baseSalary = parseFloat(employee.base_salary || 0);
  const hourlyRate = parseFloat(employee.hourly_rate || 0);

  // 2. Fetch Attendance for the month
  const { rows: attendance } = await dbPool.query(
    `SELECT id, date, check_in, check_out, LOWER(status) AS status, is_late, late_minutes, hours_worked, checkin_distance, checkin_zone
     FROM attendance
     WHERE user_id = $1 AND EXTRACT(MONTH FROM date) = $2 AND EXTRACT(YEAR FROM date) = $3`,
    [userId, month, year]
  );

  // 3. Fetch Holidays for the month
  const { rows: holidays } = await dbPool.query(
    `SELECT date, is_paid FROM holidays 
     WHERE EXTRACT(MONTH FROM date) = $1 AND EXTRACT(YEAR FROM date) = $2`,
    [month, year]
  );
  const paidHolidayCount = holidays.filter(h => h.is_paid).length;

  // 4. Fetch Unpaid Leaves count from summary
  const { rows: leaveSummaryRows } = await dbPool.query(
    `SELECT unpaid_leaves FROM employee_leave_summary 
     WHERE user_id = $1 AND month = $2 AND year = $3`,
    [userId, month, year]
  );
  const unpaidLeaves = parseFloat(leaveSummaryRows[0]?.unpaid_leaves || 0);

  // 5. Fetch Leave Requests for the month
  const daysInMonth = new Date(year, month, 0).getDate();
  const startStr = `${year}-${String(month).padStart(2, '0')}-01`;
  const endStr = `${year}-${String(month).padStart(2, '0')}-${daysInMonth}`;
  const { rows: leaveRequests } = await dbPool.query(
    `SELECT start_date, end_date, type FROM leave_requests 
     WHERE user_id = $1 AND status = 'approved' 
       AND NOT (end_date < $2 OR start_date > $3)`,
    [userId, startStr, endStr]
  );

  // Parse settings
  const officeStartTimeStr = settings.office_start_time || '10:00';
  const lateThresholdMins = parseInt(settings.late_threshold_mins || 15);
  const latePenaltyAmount = parseFloat(settings.late_penalty_amount || 0);
  const halfDayThresholdHours = parseFloat(settings.half_day_threshold_hours || 4);
  const halfDayPenaltyPercent = parseFloat(settings.half_day_penalty_percent || 50);

  const formatDate = (dateInput) => {
    if (!dateInput) return '';
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const holidayDates = new Set(holidays.map(h => formatDate(h.date)));

  let fullDaysWorked = 0;
  let halfDaysWorked = 0;
  let sundaysCount = 0;
  let holidaysCount = 0;
  let leavesCount = 0;
  let unmarkedAbsentCount = 0;
  let lateCount = 0;
  let totalHours = 0;

  // Build a daily mapping to reconstruct detailed logs
  const dailyRecords = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const dateObj = new Date(year, month - 1, d);
    const dateStr = formatDate(dateObj);
    const isSunday = (dateObj.getDay() === 0);

    // Find if user has attendance for this day
    const record = attendance.find(r => formatDate(r.date) === dateStr);
    const status = record ? (record.status ? record.status.toLowerCase() : '') : '';

    // Check if user has an approved leave request covering this day
    const isOnApprovedLeave = leaveRequests.some(lr => {
      const start = formatDate(lr.start_date);
      const end = formatDate(lr.end_date);
      return dateStr >= start && dateStr <= end;
    });

    let dayStatus = 'absent';
    let isLate = false;
    let lateMins = 0;
    let dayHours = 0;
    let checkIn = null;
    let checkOut = null;
    let recordId = null;
    let checkinZone = null;
    let checkinDistance = null;

    if (record) {
      recordId = record.id;
      checkIn = record.check_in;
      checkOut = record.check_out;
      dayHours = parseFloat(record.hours_worked || 0);
      totalHours += dayHours;
      checkinZone = record.checkin_zone;
      checkinDistance = record.checkin_distance;

      // Lateness
      if (record.check_in) {
        const checkInTimeStr = getISTTime(record.check_in);
        const [ciH, ciM] = checkInTimeStr.split(':').map(Number);
        const [startH, startM] = officeStartTimeStr.split(':').map(Number);
        const diffMins = (ciH * 60 + ciM) - (startH * 60 + startM);
        if (diffMins > lateThresholdMins) {
          isLate = true;
          lateMins = diffMins;
        }
      }

      if (status === 'present' || status === 'working' || status === 'completed') {
        fullDaysWorked++;
        dayStatus = record.status || 'present';
      } else if (status === 'half_day') {
        halfDaysWorked++;
        dayStatus = 'half_day';
      } else if (status === 'absent') {
        unmarkedAbsentCount++;
        dayStatus = 'absent';
      } else {
        fullDaysWorked++;
        dayStatus = 'present';
      }

      if (isLate && status !== 'half_day' && status !== 'absent') {
        lateCount++;
      }
    } else if (isSunday) {
      sundaysCount++;
      dayStatus = 'sunday';
    } else if (holidayDates.has(dateStr)) {
      holidaysCount++;
      dayStatus = 'holiday';
    } else if (isOnApprovedLeave || status === 'leave') {
      leavesCount++;
      dayStatus = 'leave';
    } else {
      unmarkedAbsentCount++;
      dayStatus = 'absent';
    }

    dailyRecords.push({
      id: recordId || `temp-${dateStr}`,
      date: dateStr,
      check_in: checkIn,
      check_out: checkOut,
      status: dayStatus,
      is_late: isLate,
      late_minutes: lateMins,
      hours_worked: dayHours,
      checkin_zone: checkinZone,
      checkin_distance: checkinDistance
    });
  }

  // Calculate earnings and deductions for daily-wage (salaried) employees
  const perDaySalary = daysInMonth > 0 ? baseSalary / daysInMonth : 0;
  let suggestedSalary = 0;
  let totalEarnings = 0;
  let totalDeductions = 0;
  let calcMethod = 'daily';
  let effectiveDays = 0;
  let finalPayableDays = 0;
  let latePenaltyDays = 0;

  if (hourlyRate > 0) {
    calcMethod = 'hourly';
    totalEarnings = totalHours * hourlyRate;
    totalDeductions = 0;
    suggestedSalary = Math.round(totalEarnings);
    effectiveDays = totalHours;
    finalPayableDays = totalHours;
  } else {
    // Salaried calculation
    // effectiveDays = present + half_day*0.5 + holidays + sundays + paid_leaves
    effectiveDays = employee.role === 'admin' 
      ? daysInMonth 
      : (fullDaysWorked + (halfDaysWorked * 0.5) + paidHolidayCount + sundaysCount + (leavesCount - unpaidLeaves));
    
    // Check late penalty
    const latePenaltyRuleCount = parseInt(settings.late_penalty_rule_count || 3);
    const latePenaltyRuleDays = parseFloat(settings.late_penalty_rule_days || 0.5);
    latePenaltyDays = Math.floor(lateCount / latePenaltyRuleCount) * latePenaltyRuleDays;

    finalPayableDays = employee.role === 'admin' 
      ? daysInMonth 
      : Math.max(0, effectiveDays - latePenaltyDays);

    suggestedSalary = Math.round(perDaySalary * finalPayableDays);
    totalEarnings = baseSalary; // Gross expected earnings is baseSalary
    totalDeductions = Math.max(0, baseSalary - suggestedSalary);
  }

  // Pre-calculate earnings and deduction for each daily record
  const processedAttendance = dailyRecords.map(att => {
    let dayDeduction = 0;
    let dayEarnings = 0;
    let overtimeHours = 0;
    let regularHours = parseFloat(att.hours_worked || 0);

    // Overtime logic: check-out > 7:00 PM IST
    if (att.check_in && att.check_out) {
      const ci = new Date(att.check_in);
      const co = new Date(att.check_out);
      const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
      const dateStr = formatter.format(co);
      const cutoff = new Date(`${dateStr}T19:00:00+05:30`);
      if (co > cutoff) {
        const startForOt = ci > cutoff ? ci : cutoff;
        const otMs = co - startForOt;
        overtimeHours = otMs / (1000 * 60 * 60);
        regularHours = Math.max(0, regularHours - overtimeHours);
      }
    }

    if (hourlyRate > 0) {
      dayEarnings = regularHours * hourlyRate;
      dayDeduction = 0;
    } else {
      dayEarnings = perDaySalary;
      const statusLower = att.status.toLowerCase();
      if (statusLower === 'absent') {
        dayDeduction = perDaySalary;
      } else if (statusLower === 'half_day') {
        dayDeduction = perDaySalary * (halfDayPenaltyPercent / 100);
      } else if (statusLower === 'leave') {
        dayDeduction = 0; 
      } else {
        if (att.is_late && statusLower !== 'sunday' && statusLower !== 'holiday') {
          dayDeduction = latePenaltyAmount;
        }
      }
    }

    return {
      ...att,
      regular_hours: Math.round(regularHours * 100) / 100,
      overtime_hours: Math.round(overtimeHours * 100) / 100,
      earnings: Math.round(dayEarnings * 100) / 100,
      deduction: Math.round(dayDeduction * 100) / 100
    };
  });

  return {
    employee,
    full_days: fullDaysWorked,
    full_days_worked: fullDaysWorked,
    half_days: halfDaysWorked,
    half_days_worked: halfDaysWorked,
    late_count: lateCount,
    unpaid_leaves: unpaidLeaves,
    paid_holidays: paidHolidayCount,
    sundays_count: sundaysCount,
    holidays_count: holidaysCount,
    leaves_count: leavesCount,
    unmarked_absent_count: unmarkedAbsentCount,
    effective_days: effectiveDays,
    late_penalty_days: latePenaltyDays,
    payable_days: finalPayableDays,
    total_days: daysInMonth,
    total_hours: totalHours,
    calculation_method: calcMethod,
    suggested_salary: suggestedSalary < 0 ? 0 : suggestedSalary,
    earnings: Math.round(totalEarnings),
    deductions: Math.round(totalDeductions),
    total_present: fullDaysWorked + halfDaysWorked + sundaysCount + holidaysCount,
    total_absent: leavesCount + unmarkedAbsentCount,
    processedAttendance
  };
}

module.exports = {
  calculatePayrollForEmployee
};
