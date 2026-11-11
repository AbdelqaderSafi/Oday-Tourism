const DAY_MS = 86_400_000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Hotel nights are Egyptian calendar dates, whatever the server's time zone.
const hotelDateFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Cairo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const toTime = (date: string) => Date.parse(`${date}T00:00:00Z`);
const fromTime = (time: number) => new Date(time).toISOString().slice(0, 10);

export function isCalendarDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const time = toTime(value);
  return !Number.isNaN(time) && fromTime(time) === value;
}

export function addDays(date: string, days: number): string {
  return fromTime(toTime(date) + days * DAY_MS);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toTime(to) - toTime(from)) / DAY_MS);
}

export function stayNights(checkIn: string, checkOut: string): string[] {
  const count = Math.max(daysBetween(checkIn, checkOut), 0);
  return Array.from({ length: count }, (_, index) => addDays(checkIn, index));
}

export function hotelToday(now: Date = new Date()): string {
  const parts = new Map(
    hotelDateFormat.formatToParts(now).map((part) => [part.type, part.value]),
  );
  return `${parts.get('year')}-${parts.get('month')}-${parts.get('day')}`;
}
