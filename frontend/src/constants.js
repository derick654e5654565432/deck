// Status vocabulary — must match lib/db.js STATUSES.
// Each has a label and a colour used for the badge dot + tint.
export const STATUS_META = {
  idea:        { label: 'Idea',        color: '#9aa6bd' },
  planning:    { label: 'Planning',    color: '#8b95ff' },
  in_progress: { label: 'In progress', color: '#41d17f' },
  waiting:     { label: 'Waiting',     color: '#f5ac4b' },
  live:        { label: 'Live',        color: '#2fddb4' },
  paused:      { label: 'Paused',      color: '#a2acba' },
  done:        { label: 'Done',        color: '#7b8494' },
};

export const STATUS_ORDER = ['idea', 'planning', 'in_progress', 'waiting', 'live', 'paused', 'done'];

// Recurrence cadences — must match RECUR_DAYS in server.js.
export const RECURRENCE_META = {
  daily:     { label: 'Daily',         short: 'daily',   days: 1 },
  '3x_week': { label: '3× / week',     short: '3×/wk',   days: 2 },
  '2x_week': { label: '2× / week',     short: '2×/wk',   days: 3 },
  weekly:    { label: 'Weekly',        short: 'weekly',  days: 7 },
  biweekly:  { label: 'Every 2 weeks', short: '2-weekly', days: 14 },
  monthly:   { label: 'Monthly',       short: 'monthly', days: 30 },
};
export const RECURRENCE_ORDER = ['daily', '3x_week', '2x_week', 'weekly', 'biweekly', 'monthly'];

// For a recurring to-do, is it due again, and a human label. Null if not recurring.
export function recurDue(recurrence, lastDoneAt) {
  const meta = RECURRENCE_META[recurrence];
  if (!meta) return null;
  const now = Date.now();
  if (!lastDoneAt) return { due: true, label: 'due now · never done', color: '#e8853a' };
  const elapsed = now - lastDoneAt;
  const period = meta.days * 86400000;
  const daysAgo = Math.floor(elapsed / 86400000);
  const ago = daysAgo <= 0 ? 'today' : daysAgo === 1 ? '1 day ago' : `${daysAgo} days ago`;
  if (elapsed >= period) return { due: true, label: `due now · last done ${ago}`, color: '#e8636b' };
  return { due: false, label: `done ${ago}`, color: '#4cc38a' };
}

export function clientLogoUrl(id, v) {
  return `/api/clients/${id}/logo?v=${v || 0}`;
}

export function fileSize(bytes) {
  if (!bytes) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Turn a 'YYYY-MM-DD' deadline into { color, label, level } for the urgency pill.
// Returns null when there is no deadline.
export function deadlineInfo(deadline) {
  if (!deadline) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(`${deadline}T00:00:00`);
  if (isNaN(d)) return null;
  const days = Math.round((d - today) / 86400000);
  const date = `${d.getDate()} ${MONTHS[d.getMonth()]}`;

  let rel, color, level;
  if (days < 0) { level = 'overdue'; color = '#e8636b'; rel = `${Math.abs(days)}d overdue`; }
  else if (days === 0) { level = 'today'; color = '#e8636b'; rel = 'today'; }
  else if (days <= 2) { level = 'soon'; color = '#e8853a'; rel = `in ${days}d`; }
  else if (days <= 7) { level = 'week'; color = '#e8c13a'; rel = `in ${days}d`; }
  else { level = 'ok'; color = '#4cc38a'; rel = `in ${days}d`; }

  return { days, color, level, date, rel, label: `${date} · ${rel}` };
}
