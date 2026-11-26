import { describe, expect, it } from 'vitest';
import { minutesToTime, parseTime } from './time';

describe('time helpers', () => {
  it('parses HH:MM into minutes', () => {
    expect(parseTime('00:00')).toBe(0);
    expect(parseTime('17:30')).toBe(1050);
    expect(parseTime('23:59')).toBe(1439);
  });

  it('rejects invalid time', () => {
    expect(parseTime('24:00')).toBeNull();
    expect(parseTime('12:60')).toBeNull();
    expect(parseTime('abc')).toBeNull();
  });

  it('formats minutes into HH:MM', () => {
    expect(minutesToTime(0)).toBe('00:00');
    expect(minutesToTime(1050)).toBe('17:30');
    expect(minutesToTime(1440)).toBe('24:00');
  });
});
