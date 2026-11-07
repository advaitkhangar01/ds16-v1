const fs = require('fs');
const path = require('path');

// 1. client/src/pages/AttendancePage.jsx
const attPagePath = path.join(__dirname, '../client/src/pages/AttendancePage.jsx');
let attPage = fs.readFileSync(attPagePath, 'utf8').replace(/\r\n/g, '\n');

// Badge component target
const badgeTarget = `function AttendanceBadge({ status, checkIn, checkOut, settings, hours_worked: data_hours_worked, isLate: propIsLate }) {
  const officeStartTimeStr = settings?.office_start_time || '09:30';
  const lateThresholdTimeStr = settings?.late_threshold_time;
  const lateThresholdMins = parseInt(settings?.late_threshold_mins || 15);
  // Prefer half_day_threshold_hours; fall back to min_working_hours only if the former is absent
  const halfDayThresholdHours = parseFloat(settings?.half_day_threshold_hours || settings?.min_working_hours || 9);

  let isLate = propIsLate;
  if (isLate === undefined && checkIn) {
    const checkInTime = new Date(checkIn);
    // Format check-in time as HH:mm in IST
    const checkInStr = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(checkInTime);

    if (lateThresholdTimeStr) {
      isLate = checkInStr > lateThresholdTimeStr;
    } else {
      const [ciH, ciM] = checkInStr.split(':').map(Number);
      const [startH, startM] = officeStartTimeStr.split(':').map(Number);
      
      const diffMins = (ciH * 60 + ciM) - (startH * 60 + startM);
      isLate = diffMins > lateThresholdMins;
    }
  }

  const normStatus = (status || (checkIn ? (checkOut ? 'completed' : 'working') : '')).toLowerCase();

  // Trust the server's status for half_day — don't recalculate from hours in the frontend,
  // as that causes a collision with the late-arrival path (both use hoursWorked < threshold).
  const isHalfDay = normStatus === 'half_day';

  if (isHalfDay) {
    return (
      <span className="badge bg-amber-50 text-amber-700 border-amber-200 font-bold">
        ◑ {isLate ? 'Late Arrival + Irregular' : 'Irregular'}
      </span>
    );
  }
  if (normStatus === 'working' || normStatus === 'completed' || normStatus === 'present' || checkIn) {
    return (
      <span className={\`badge \${isLate ? 'bg-orange-50 text-orange-700 border-orange-200 font-bold' : 'badge-working'}\`}>
        ● {isLate ? 'Late Arrival + Regular' : 'Regular'}
      </span>
    );
  }`;

const badgeReplacement = `function AttendanceBadge({ status, checkIn, checkOut, settings, hours_worked: data_hours_worked, isLate: propIsLate, late_minutes: propLateMinutes }) {
  const officeStartTimeStr = settings?.office_start_time || '09:30';
  const lateThresholdTimeStr = settings?.late_threshold_time;
  const lateThresholdMins = parseInt(settings?.late_threshold_mins || 15);
  // Prefer half_day_threshold_hours; fall back to min_working_hours only if the former is absent
  const halfDayThresholdHours = parseFloat(settings?.half_day_threshold_hours || settings?.min_working_hours || 9);

  let isLate = propIsLate;
  let computedLateMinutes = parseInt(propLateMinutes || 0, 10);
  if (checkIn) {
    const checkInTime = new Date(checkIn);
    // Format check-in time as HH:mm in IST
    const checkInStr = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(checkInTime);

    if (isLate === undefined) {
      if (lateThresholdTimeStr) {
        isLate = checkInStr > lateThresholdTimeStr;
      } else {
        const [ciH, ciM] = checkInStr.split(':').map(Number);
        const [startH, startM] = officeStartTimeStr.split(':').map(Number);
        const diffMins = (ciH * 60 + ciM) - (startH * 60 + startM);
        isLate = diffMins > lateThresholdMins;
      }
    }

    if (!computedLateMinutes && officeStartTimeStr) {
      const [ciH, ciM] = checkInStr.split(':').map(Number);
      const [startH, startM] = officeStartTimeStr.split(':').map(Number);
      const diffMins = (ciH * 60 + ciM) - (startH * 60 + startM);
      if (diffMins > 0) computedLateMinutes = diffMins;
    }
  }

  const normStatus = (status || (checkIn ? (checkOut ? 'completed' : 'working') : '')).toLowerCase();

  // Trust the server's status for half_day — don't recalculate from hours in the frontend,
  // as that causes a collision with the late-arrival path (both use hoursWorked < threshold).
  const isHalfDay = normStatus === 'half_day';
  const lateTag = computedLateMinutes > 0 ? \`Late Arrival (+\${computedLateMinutes}m)\` : 'Late Arrival';

  if (isHalfDay) {
    return (
      <span className="badge bg-amber-50 text-amber-700 border-amber-200 font-bold">
        ◑ {isLate ? \`\${lateTag} + Irregular\` : 'Irregular'}
      </span>
    );
  }
  if (normStatus === 'working' || normStatus === 'completed' || normStatus === 'present' || checkIn) {
    return (
      <span className={\`badge \${isLate ? 'bg-orange-50 text-orange-700 border-orange-200 font-bold' : 'badge-working'}\`}>
        ● {isLate ? \`\${lateTag} + Regular\` : 'Regular'}
      </span>
    );
  }`;

if (!attPage.includes(badgeTarget)) {
  console.error('Badge target not found in AttendancePage.jsx');
} else {
  attPage = attPage.replace(badgeTarget, badgeReplacement);
  console.log('Successfully patched AttendanceBadge in AttendancePage.jsx');
}

// Calendar grid target
const gridTarget = `                        if (cellIsHalfDay && cellIsLate) {
                          statusText = 'Late Arrival + Irregular';
                          styleClass = 'bg-amber-50 text-amber-800 border-amber-500 hover:bg-amber-100 hover:scale-105';
                        } else if (cellIsHalfDay) {
                          statusText = 'Irregular';
                          styleClass = 'bg-amber-50 text-amber-700 border-amber-400 hover:bg-amber-100 hover:scale-105';
                        } else if (isPresent && cellIsLate) {
                          statusText = 'Late Arrival + Regular';
                          styleClass = 'bg-orange-50 text-orange-700 border-orange-500 hover:bg-orange-100 hover:scale-105';
                        } else if (isPresent) {`;

const gridReplacement = `                        const cellLateMins = parseInt(record?.late_minutes || 0, 10);
                        const cellLateTag = cellLateMins > 0 ? \`Late Arrival (+\${cellLateMins}m)\` : 'Late Arrival';

                        if (cellIsHalfDay && cellIsLate) {
                          statusText = \`\${cellLateTag} + Irregular\`;
                          styleClass = 'bg-amber-50 text-amber-800 border-amber-500 hover:bg-amber-100 hover:scale-105';
                        } else if (cellIsHalfDay) {
                          statusText = 'Irregular';
                          styleClass = 'bg-amber-50 text-amber-700 border-amber-400 hover:bg-amber-100 hover:scale-105';
                        } else if (isPresent && cellIsLate) {
                          statusText = \`\${cellLateTag} + Regular\`;
                          styleClass = 'bg-orange-50 text-orange-700 border-orange-500 hover:bg-orange-100 hover:scale-105';
                        } else if (isPresent) {`;

if (!attPage.includes(gridTarget)) {
  console.error('Grid target not found in AttendancePage.jsx');
} else {
  attPage = attPage.replace(gridTarget, gridReplacement);
  console.log('Successfully patched Calendar Grid in AttendancePage.jsx');
}

fs.writeFileSync(attPagePath, attPage, 'utf8');

// 2. client/src/pages/admin/ReportsPage.jsx
const repPagePath = path.join(__dirname, '../client/src/pages/admin/ReportsPage.jsx');
let repPage = fs.readFileSync(repPagePath, 'utf8').replace(/\r\n/g, '\n');

// Excel status
const repExcelTarget = `        'Status': (r.status === 'working' || r.status === 'completed' || r.status === 'present') ? 'Regular' :
                  r.status === 'half_day' ? 'Irregular' :
                  r.status === 'leave' ? 'Leave' :
                  r.status === 'sunday' ? 'Sunday' :
                  r.status === 'holiday' ? 'Holiday' :
                  (r.status === 'upcoming' || r.status === 'future') ? 'Upcoming' :
                  r.status === 'today_pending' ? 'Pending Check-in' : 'Absent',`;

const repExcelReplacement = `        'Status': (() => {
          const isPresent = (r.status === 'working' || r.status === 'completed' || r.status === 'present');
          const isHalfDay = r.status === 'half_day';
          const isLate = !!r.is_late && r.status !== 'absent' && r.status !== 'leave';
          const lateMins = parseInt(r.late_minutes || 0, 10);
          const lateTag = lateMins > 0 ? \`Late Arrival (+\${lateMins}m)\` : 'Late Arrival';
          if (isPresent && isLate) return \`\${lateTag} + Regular\`;
          if (isPresent) return 'Regular';
          if (isHalfDay && isLate) return \`\${lateTag} + Irregular\`;
          if (isHalfDay) return 'Irregular';
          if (r.status === 'leave') return 'Leave';
          if (r.status === 'sunday') return 'Sunday';
          if (r.status === 'holiday') return 'Holiday';
          if (r.status === 'upcoming' || r.status === 'future') return 'Upcoming';
          if (r.status === 'today_pending') return 'Pending Check-in';
          return 'Absent';
        })(),`;

if (!repPage.includes(repExcelTarget)) {
  console.error('Excel target not found in ReportsPage.jsx');
} else {
  repPage = repPage.replace(repExcelTarget, repExcelReplacement);
  console.log('Successfully patched Excel export in ReportsPage.jsx');
}

// Table badge
const repTableTarget = `                          <td className="px-6 py-3 text-center">
                            <span className={\`inline-flex px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tighter shadow-sm border \${
                              (row.status === 'working' || row.status === 'completed' || row.status === 'present') ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                              row.status === 'half_day' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                              row.status === 'leave' ? 'bg-purple-50 text-purple-600 border-purple-100' :
                              row.status === 'sunday' ? 'bg-slate-100 text-slate-600 border-slate-200' :
                              row.status === 'holiday' ? 'bg-cyan-50 text-cyan-600 border-cyan-100' :
                              row.status === 'future' ? 'bg-slate-50 text-slate-400 border-slate-100' :
                              'bg-red-50 text-red-500 border-red-100'
                            }\`}>
                              {(row.status === 'working' || row.status === 'completed' || row.status === 'present') ? 'Regular' : 
                               row.status === 'half_day' ? 'Irregular' :
                               row.status === 'leave' ? 'Leave' : 
                               row.status === 'sunday' ? 'Sunday' :
                               row.status === 'holiday' ? 'Holiday' :
                               row.status === 'future' ? 'Upcoming' : 'Absent'}
                            </span>
                          </td>`;

const repTableReplacement = `                          <td className="px-6 py-3 text-center">
                            {(() => {
                              const isPresent = (row.status === 'working' || row.status === 'completed' || row.status === 'present');
                              const isHalfDay = row.status === 'half_day';
                              const isLate = !!row.is_late && row.status !== 'absent' && row.status !== 'leave';
                              const lateMins = parseInt(row.late_minutes || 0, 10);
                              const lateTag = lateMins > 0 ? \`Late Arrival (+\${lateMins}m)\` : 'Late Arrival';

                              let badgeText = 'Absent';
                              let badgeClass = 'bg-red-50 text-red-500 border-red-100';

                              if (isPresent && isLate) {
                                badgeText = \`\${lateTag} + Regular\`;
                                badgeClass = 'bg-orange-50 text-orange-700 border-orange-200 font-bold';
                              } else if (isPresent) {
                                badgeText = 'Regular';
                                badgeClass = 'bg-emerald-50 text-emerald-600 border-emerald-100';
                              } else if (isHalfDay && isLate) {
                                badgeText = \`\${lateTag} + Irregular\`;
                                badgeClass = 'bg-amber-50 text-amber-800 border-amber-200 font-bold';
                              } else if (isHalfDay) {
                                badgeText = 'Irregular';
                                badgeClass = 'bg-amber-50 text-amber-600 border-amber-100';
                              } else if (row.status === 'leave') {
                                badgeText = 'Leave';
                                badgeClass = 'bg-purple-50 text-purple-600 border-purple-100';
                              } else if (row.status === 'sunday') {
                                badgeText = 'Sunday';
                                badgeClass = 'bg-slate-100 text-slate-600 border-slate-200';
                              } else if (row.status === 'holiday') {
                                badgeText = 'Holiday';
                                badgeClass = 'bg-cyan-50 text-cyan-600 border-cyan-100';
                              } else if (row.status === 'future' || row.status === 'upcoming') {
                                badgeText = 'Upcoming';
                                badgeClass = 'bg-slate-50 text-slate-400 border-slate-100';
                              }

                              return (
                                <span className={\`inline-flex px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tighter shadow-sm border \${badgeClass}\`}>
                                  {badgeText}
                                </span>
                              );
                            })()}
                          </td>`;

if (!repPage.includes(repTableTarget)) {
  console.error('Table target not found in ReportsPage.jsx');
} else {
  repPage = repPage.replace(repTableTarget, repTableReplacement);
  console.log('Successfully patched Table badge in ReportsPage.jsx');
}

fs.writeFileSync(repPagePath, repPage, 'utf8');
console.log('Work Package 4 patches complete!');
