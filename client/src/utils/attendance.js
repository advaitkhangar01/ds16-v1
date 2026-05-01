export function mapAttendance(data) {
  if (!data || Object.keys(data).length === 0) return null;
  const attendance = {
    ...data,
    id: data.id,
    userId: data.user_id || data.userId,
    checkIn: data.check_in || data.checkIn,
    checkOut: data.check_out || data.checkOut,
    lat: data.lat,
    lng: data.lng,
    date: data.date,
  };

  // Ensure status is calculated if missing (helpful for dashboard consistency)
  if (!attendance.status) {
    if (attendance.checkOut) attendance.status = 'completed';
    else if (attendance.checkIn) attendance.status = 'working';
    else attendance.status = 'absent';
  }

  return attendance;
}
