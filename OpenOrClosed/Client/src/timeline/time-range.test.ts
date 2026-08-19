import { describe, expect, it } from 'vitest';
import { DAY_MINUTES, formatDisplay, formatTime, isValidTime, parseTime } from './time-range.js';

describe('parseTime', () => {
    it.each([
        ['00:00', 0],
        ['09:00', 540],
        ['09:15', 555],
        ['23:45', 1425],
        ['24:00', DAY_MINUTES],
    ])('reads %s as %i minutes', (value, expected) => {
        expect(parseTime(value as string)).toBe(expected);
    });

    it('accepts a stored value carrying seconds', () => {
        // The existing editors persist "09:00:00"; a shared data type could hand us one.
        expect(parseTime('09:00:00')).toBe(540);
    });

    it.each(['', 'nine', '9', '25:00', '09:60', '-01:00'])('rejects %s', (value) => {
        expect(isValidTime(value)).toBe(false);
        expect(() => parseTime(value)).toThrow();
    });
});

describe('formatTime', () => {
    it.each([
        [0, '00:00'],
        [540, '09:00'],
        [1425, '23:45'],
        [DAY_MINUTES, '24:00'],
    ])('writes %i as %s', (minutes, expected) => {
        expect(formatTime(minutes as number)).toBe(expected);
    });

    it('round-trips every snap point in the day', () => {
        for (let m = 0; m <= DAY_MINUTES; m += 15) {
            expect(parseTime(formatTime(m))).toBe(m);
        }
    });
});

describe('formatDisplay', () => {
    it.each([
        [0, '12:00 AM'],
        [540, '9:00 AM'],
        [720, '12:00 PM'],
        [1020, '5:00 PM'],
        [DAY_MINUTES, '12:00 AM'],
    ])('renders %i as %s on a 12-hour clock', (minutes, expected) => {
        expect(formatDisplay(minutes as number, false)).toBe(expected);
    });

    it('renders midnight at the end of the day as 24:00 on a 24-hour clock', () => {
        expect(formatDisplay(DAY_MINUTES, true)).toBe('24:00');
    });
});
