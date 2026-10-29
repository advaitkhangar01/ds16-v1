const fs = require('fs');
let c = fs.readFileSync('client/src/pages/admin/StaffDetailPage.jsx', 'utf8');

// 1. Destructure periodStats and leaveEstimate
const oldDestructure = 'const { employee, projects, tasks, attendanceStats, financialStats, attendance, leaveStats, leaves, leaveBalances = [], payroll, currentMonthPayroll } = data;';
const newDestructure = 'const { employee, projects, tasks, attendanceStats, financialStats, periodStats, leaveEstimate, attendance, leaveStats, leaves, leaveBalances = [], payroll, currentMonthPayroll } = data;';

if (c.includes(oldDestructure)) {
  c = c.replace(oldDestructure, newDestructure);
} else {
  console.error('Destructure not found');
}

// 2. In calculateAttendanceMetrics, check periodStats first
const oldFilter = `    if (isFiltered) {
      let periodEarnings = 0;
      let periodLateCount = 0;
      if (attendance && attendance.length > 0) {
        attendance.forEach(att => {
          const isUpcomingOrPending = att.status === 'upcoming' || att.status === 'future' || att.status === 'today_pending';
          if (!isUpcomingOrPending) {
            periodEarnings += Number(att.earnings || 0);
            if (att.is_late && att.status !== 'half_day' && att.status !== 'absent') {
              periodLateCount++;
            }
          }
        });
      }

      const baseSalary = Number(employee?.base_salary || currentMonthPayroll?.employee?.base_salary || 0);
      const perDaySalary = baseSalary > 0 ? baseSalary / 30 : 0;
      const lateGroups = Math.floor(periodLateCount / 3);
      const latePenaltyAmount = lateGroups * 0.15 * perDaySalary;
      const totalPeriodDeductions = latePenaltyAmount;

      const roundedEarnings = Math.round(periodEarnings);
      const roundedDeductions = Math.round(totalPeriodDeductions * 100) / 100;
      const periodNetPayable = Math.max(0, Math.round(roundedEarnings - roundedDeductions));
      return {
        totalEarnings: roundedEarnings,
        totalDeduction: roundedDeductions,
        periodAttendanceDeduction: 0,
        periodLatePenalty: roundedDeductions,
        netPayable: periodNetPayable,
        earningsThisMonth: 0,
        deductionsThisMonth: 0
      };
    }`;

const newFilter = `    if (isFiltered) {
      if (periodStats) {
        return {
          totalEarnings: periodStats.period_earnings,
          totalDeduction: periodStats.period_deductions,
          periodAttendanceDeduction: 0,
          periodLatePenalty: periodStats.period_late_penalty,
          netPayable: periodStats.period_net_payable,
          earningsThisMonth: 0,
          deductionsThisMonth: 0
        };
      }
      let periodEarnings = 0;
      let periodLateCount = 0;
      if (attendance && attendance.length > 0) {
        attendance.forEach(att => {
          const isUpcomingOrPending = att.status === 'upcoming' || att.status === 'future' || att.status === 'today_pending';
          if (!isUpcomingOrPending) {
            periodEarnings += Number(att.earnings || 0);
            if (att.is_late && att.status !== 'half_day' && att.status !== 'absent') {
              periodLateCount++;
            }
          }
        });
      }

      const baseSalary = Number(employee?.base_salary || currentMonthPayroll?.employee?.base_salary || 0);
      const perDaySalary = baseSalary > 0 ? baseSalary / 30 : 0;
      const lateGroups = Math.floor(periodLateCount / 3);
      const latePenaltyAmount = lateGroups * 0.15 * perDaySalary;
      const totalPeriodDeductions = latePenaltyAmount;

      const roundedEarnings = Math.round(periodEarnings);
      const roundedDeductions = Math.round(totalPeriodDeductions * 100) / 100;
      const periodNetPayable = Math.max(0, Math.round(roundedEarnings - roundedDeductions));
      return {
        totalEarnings: roundedEarnings,
        totalDeduction: roundedDeductions,
        periodAttendanceDeduction: 0,
        periodLatePenalty: roundedDeductions,
        netPayable: periodNetPayable,
        earningsThisMonth: 0,
        deductionsThisMonth: 0
      };
    }`;

// Normalize line endings for replacement
const cNorm = c.replace(/\r\n/g, '\n');
const oldFilterNorm = oldFilter.replace(/\r\n/g, '\n');
const newFilterNorm = newFilter.replace(/\r\n/g, '\n');

if (cNorm.includes(oldFilterNorm)) {
  const updatedNorm = cNorm.replace(oldFilterNorm, newFilterNorm);
  c = updatedNorm.replace(/\n/g, '\r\n');
} else {
  console.error('Filter block not found');
}

// 3. Use leaveEstimate if present
const oldLeaveCalc = `  const currentMonthLeavesTaken = calculateCurrentMonthLeavesTaken();
  const latestClosedBalance = leaveBalances.length > 0 ? parseFloat(leaveBalances[0].closing_balance) : 0.0;
  const currentMonthEarned = 1.5;
  const estCurrentMonthClosing = Math.max(0, latestClosedBalance + currentMonthEarned - currentMonthLeavesTaken);
  const estCurrentMonthUnpaid = Math.max(0, currentMonthLeavesTaken - (latestClosedBalance + currentMonthEarned));`;

const newLeaveCalc = `  const currentMonthLeavesTaken = leaveEstimate ? leaveEstimate.leaves_taken : calculateCurrentMonthLeavesTaken();
  const latestClosedBalance = leaveBalances.length > 0 ? parseFloat(leaveBalances[0].closing_balance) : 0.0;
  const currentMonthEarned = 1.5;
  const estCurrentMonthClosing = leaveEstimate ? leaveEstimate.closing_balance : Math.max(0, latestClosedBalance + currentMonthEarned - currentMonthLeavesTaken);
  const estCurrentMonthUnpaid = leaveEstimate ? leaveEstimate.unpaid_leaves : Math.max(0, currentMonthLeavesTaken - (latestClosedBalance + currentMonthEarned));`;

const cNorm2 = c.replace(/\r\n/g, '\n');
const oldLeaveCalcNorm = oldLeaveCalc.replace(/\r\n/g, '\n');
const newLeaveCalcNorm = newLeaveCalc.replace(/\r\n/g, '\n');

if (cNorm2.includes(oldLeaveCalcNorm)) {
  const updatedNorm = cNorm2.replace(oldLeaveCalcNorm, newLeaveCalcNorm);
  c = updatedNorm.replace(/\n/g, '\r\n');
} else {
  console.error('Leave calc block not found');
}

fs.writeFileSync('client/src/pages/admin/StaffDetailPage.jsx', c, 'utf8');
console.log('StaffDetailPage.jsx updated successfully');
