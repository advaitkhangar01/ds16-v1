// client/src/utils/time.js
// IST timezone helpers

export function formatIST(dateString, options = {}) {
  if (!dateString) return '—';
  try {
    return new Date(dateString).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      ...options,
    });
  } catch {
    return '—';
  }
}

export function formatTimeIST(dateString) {
  if (!dateString) return '—';
  try {
    return new Date(dateString).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return '—';
  }
}

export function formatDateIST(dateString) {
  if (!dateString) return '—';
  try {
    return new Date(dateString).toLocaleDateString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

export function todayIST() {
  return new Date().toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Returns today's date in YYYY-MM-DD format for IST timezone
 */
export function getISODateIST() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function timeAgo(dateString) {
  if (!dateString) return '';
  const diff = Date.now() - new Date(dateString).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'just now';
}

// Parse @mentions in text and highlight them
export function parseMentions(text) {
  return text.replace(/@(\w+)/g, '<span class="text-[#E05A1E] font-semibold">@$1</span>');
}

/**
 * Calculates the number of days a task is overdue based on start_date.
 * If the task is completed (status is passed or done) or start_date is not set, returns 0.
 */
export function getTaskOverdueDays(task) {
  if (!task || ['passed', 'done'].includes(task.status)) return 0;
  if (!task.start_date) return 0;
  try {
    const todayStr = getISODateIST();
    const startStr = task.start_date.substring(0, 10);
    
    const todayDate = new Date(todayStr);
    const startDate = new Date(startStr);
    
    const diffTime = todayDate.getTime() - startDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays > 0 ? diffDays : 0;
  } catch {
    return 0;
  }
}

/**
 * Checks if a task is overdue by more than 7 days from its start_date.
 */
export function isTaskOverdue(task) {
  return getTaskOverdueDays(task) > 7;
}
