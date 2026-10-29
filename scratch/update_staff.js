const fs = require('fs');
let c = fs.readFileSync('server/routes/staff.js', 'utf8');

const target = '    res.json({\r\n      employee,\r\n      projects,';
const addition = `    // Compute period stats for filtered views
    const periodEarnings = processedAttendance.reduce((sum, r) => {
      const isUpcomingOrPending = r.status === 'upcoming' || r.status === 'future' || r.status === 'today_pending';
      return isUpcomingOrPending ? sum : sum + (parseFloat(r.earnings) || 0);
    }, 0);
    const periodLates = processedAttendance.filter(r => r.is_late && r.status !== 'half_day' && r.status !== 'absent' && r.status !== 'upcoming' && r.status !== 'today_pending').length;
    const lateRuleCount = parseInt(settings.late_penalty_rule_count || 3, 10);
    const lateRuleDays = parseFloat(settings.late_penalty_rule_days || 0.15);
    const periodLatePenalty = Math.floor(periodLates / lateRuleCount) * lateRuleDays * (baseSalary > 0 ? baseSalary / 30 : 0);
    const periodNetPayable = Math.max(0, Math.round((periodEarnings - periodLatePenalty) * 100) / 100);

    const periodStats = {
      period_earnings: Math.round(periodEarnings * 100) / 100,
      period_late_penalty: Math.round(periodLatePenalty * 100) / 100,
      period_deductions: Math.round(periodLatePenalty * 100) / 100,
      period_net_payable: periodNetPayable,
      period_late_count: periodLates
    };

    // Compute current month leave estimate
    const latestClosedBalance = leaveBalances.length > 0 ? parseFloat(leaveBalances[0].closing_balance) : 0.0;
    const currentMonthEarned = 1.5;
    const startOfCurrentMonth = \`\${currentYear}-\${String(currentMonth).padStart(2, '0')}-01\`;
    const endOfCurrentMonth = \`\${currentYear}-\${String(currentMonth).padStart(2, '0')}-\${new Date(currentYear, currentMonth, 0).getDate()}\`;
    let currentMonthLeavesTaken = 0;
    for (const l of leaves) {
      if (l.status === 'approved') {
        const lStart = new Date(l.start_date);
        const lEnd = new Date(l.end_date);
        const overlapStart = new Date(Math.max(lStart.getTime(), new Date(startOfCurrentMonth).getTime()));
        const overlapEnd = new Date(Math.min(lEnd.getTime(), new Date(endOfCurrentMonth).getTime()));
        const diffMs = overlapEnd.getTime() - overlapStart.getTime();
        if (diffMs >= 0) {
          currentMonthLeavesTaken += Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1;
        }
      }
    }
    const currentMonthClosing = Math.max(0, latestClosedBalance + currentMonthEarned - currentMonthLeavesTaken);
    const currentMonthUnpaid = Math.max(0, currentMonthLeavesTaken - (latestClosedBalance + currentMonthEarned));

    const leaveEstimate = {
      opening_balance: latestClosedBalance,
      earned: currentMonthEarned,
      leaves_taken: currentMonthLeavesTaken,
      closing_balance: currentMonthClosing,
      unpaid_leaves: currentMonthUnpaid
    };

` + target;

if (c.includes(target)) {
  c = c.replace(target, addition);
  c = c.replace('payroll,\r\n      currentMonthPayroll\r\n    });', 'payroll,\r\n      currentMonthPayroll,\r\n      periodStats,\r\n      leaveEstimate\r\n    });');
  fs.writeFileSync('server/routes/staff.js', c, 'utf8');
  console.log('staff.js updated successfully');
} else {
  console.error('Target not found in staff.js');
}
