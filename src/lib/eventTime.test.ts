import { describe, expect, it } from 'vitest';
import { getEventDurationMinutes, type EnsembleEvent } from './domain';
import { formatEventTime } from '../components/formatters';
const event = { date: '2027-06-01', endDate: '2027-06-03', startTime: '19:00', endTime: '10:00' } as EnsembleEvent;
describe('multiday event times', () => {
  it('counts complete days even when the end clock time is earlier', () => {
    expect(getEventDurationMinutes(event)).toBe(39 * 60);
    expect(formatEventTime(event)).toContain('3. června 2027 10:00');
  });
  it('accounts for a DST change during the event', () => {
    expect(getEventDurationMinutes({ ...event, date: '2027-03-27', endDate: '2027-03-28', startTime: '12:00', endTime: '12:00' })).toBe(23 * 60);
    expect(getEventDurationMinutes({ ...event, date: '2027-10-30', endDate: '2027-10-31', startTime: '12:00', endTime: '12:00' })).toBe(25 * 60);
  });
  it('keeps the compact single-day time', () => {
    expect(formatEventTime({ ...event, endDate: event.date })).toBe('19:00–10:00');
  });
});
