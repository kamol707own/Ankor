export interface ReminderSettings {
  enabled: boolean;
  times: string[]; // "HH:MM", one or more
}

export const REMINDER_KEY = 'ankor-reminder';

export const getReminder = (): ReminderSettings => {
  try {
    const raw = localStorage.getItem(REMINDER_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Migrate the old single-time shape ({ enabled, time }).
      if (typeof parsed?.time === 'string' && !Array.isArray(parsed?.times)) {
        return { enabled: Boolean(parsed.enabled), times: [parsed.time] };
      }
      if (Array.isArray(parsed?.times)) {
        const times = parsed.times.filter((t: unknown): t is string => typeof t === 'string');
        return { enabled: Boolean(parsed.enabled), times: times.length ? times : ['20:00'] };
      }
    }
  } catch {}
  return { enabled: false, times: ['20:00'] };
};

export const saveReminder = (r: ReminderSettings) => {
  localStorage.setItem(REMINDER_KEY, JSON.stringify(r));
  scheduleReminder();
};

let timer: number | undefined;

const nextDelayFor = (time: string, now: Date): number | null => {
  const [h, m] = time.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  const next = new Date(now);
  next.setHours(h, m, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
};

export const scheduleReminder = () => {
  if (timer) { window.clearTimeout(timer); timer = undefined; }
  const r = getReminder();
  if (!r.enabled || r.times.length === 0) return;
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;

  const now = new Date();
  let nextDelay: number | null = null;
  for (const time of r.times) {
    const delay = nextDelayFor(time, now);
    if (delay !== null && (nextDelay === null || delay < nextDelay)) nextDelay = delay;
  }
  if (nextDelay === null) return;

  timer = window.setTimeout(() => {
    try {
      new Notification('AnKor', { body: 'Time to review your cards ✨' });
    } catch {}
    scheduleReminder();
  }, nextDelay);
};

export const requestReminderPermission = async (): Promise<boolean> => {
  if (typeof Notification === 'undefined') return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const p = await Notification.requestPermission();
  return p === 'granted';
};
