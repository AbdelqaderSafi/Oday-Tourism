import {
  addDays,
  daysBetween,
  hotelToday,
  isCalendarDate,
  stayNights,
} from './stay-dates';

describe('stay dates', () => {
  it('accepts only real YYYY-MM-DD dates', () => {
    expect(isCalendarDate('2026-11-20')).toBe(true);
    expect(isCalendarDate('2028-02-29')).toBe(true);
    for (const value of [
      '2026-02-29',
      '2026-13-01',
      '2026-11-31',
      '2026-1-01',
      '20261120',
      ' 2026-11-20',
      '2026-11-20T00:00',
    ]) {
      expect(isCalendarDate(value)).toBe(false);
    }
  });

  it('moves across month and year boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(daysBetween('2026-11-20', '2026-11-22')).toBe(2);
    expect(daysBetween('2026-11-22', '2026-11-20')).toBe(-2);
  });

  it('lists occupied nights and never the checkout date', () => {
    expect(stayNights('2026-11-20', '2026-11-22')).toEqual([
      '2026-11-20',
      '2026-11-21',
    ]);
    expect(stayNights('2026-11-22', '2026-11-22')).toEqual([]);
  });

  it('uses the Cairo calendar date, including daylight saving time', () => {
    expect(hotelToday(new Date('2026-11-09T21:59:00Z'))).toBe('2026-11-09');
    expect(hotelToday(new Date('2026-11-09T22:30:00Z'))).toBe('2026-11-10');
    expect(hotelToday(new Date('2026-07-15T21:30:00Z'))).toBe('2026-07-16');
  });
});
