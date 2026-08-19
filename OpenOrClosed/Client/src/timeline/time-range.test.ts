import { describe, expect, it } from 'vitest';
import {
    boundsFor,
    DAY_MINUTES,
    formatDisplay,
    formatTime,
    isValidTime,
    MIN_RANGE_MINUTES,
    moveRange,
    parseTime,
    resizeRange,
    snap,
    sortRanges,
    type HoursRange,
} from './time-range.js';

const range = (start: string, end: string): HoursRange =>
    ({ start, end, label: null, byAppointmentOnly: false });

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

describe('snap', () => {
    it.each([
        [0, 0], [7, 0], [8, 15], [22, 15], [23, 30], [540, 540], [1439, DAY_MINUTES],
    ])('snaps %i to %i', (input, expected) => {
        expect(snap(input as number, 15)).toBe(expected);
    });

    it('never leaves the day', () => {
        expect(snap(-30, 15)).toBe(0);
        expect(snap(9999, 15)).toBe(DAY_MINUTES);
    });
});

describe('boundsFor', () => {
    const ranges = [range('09:00', '12:00'), range('13:00', '17:00')];

    it('bounds the first range by midnight and its neighbour', () => {
        expect(boundsFor(ranges, 0)).toEqual({ min: 0, max: 780 });
    });

    it('bounds the last range by its neighbour and the end of the day', () => {
        expect(boundsFor(ranges, 1)).toEqual({ min: 720, max: DAY_MINUTES });
    });
});

describe('resizeRange', () => {
    const ranges = [range('09:00', '12:00'), range('13:00', '17:00')];

    it('snaps the dragged edge', () => {
        expect(resizeRange(ranges, 0, 'end', 12 * 60 + 8, 15)[0].end).toBe('12:15');
    });

    it('clamps at the neighbour rather than overlapping it', () => {
        expect(resizeRange(ranges, 0, 'end', 15 * 60, 15)[0].end).toBe('13:00');
    });

    it('clamps at the start of the day', () => {
        expect(resizeRange(ranges, 0, 'start', -120, 15)[0].start).toBe('00:00');
    });

    it('allows an end of 24:00', () => {
        expect(resizeRange([range('18:00', '23:00')], 0, 'end', DAY_MINUTES, 15)[0].end).toBe('24:00');
    });

    it('will not let an edge cross its opposite', () => {
        const resized = resizeRange(ranges, 0, 'end', 9 * 60, 15)[0];
        expect(resized.end).toBe('09:15');
        expect(parseTime(resized.end) - parseTime(resized.start)).toBe(MIN_RANGE_MINUTES);
    });

    it('leaves the other ranges untouched and does not mutate the input', () => {
        const resized = resizeRange(ranges, 0, 'end', 11 * 60, 15);
        expect(resized[1]).toEqual(ranges[1]);
        expect(ranges[0].end).toBe('12:00');
    });
});

describe('moveRange', () => {
    const ranges = [range('09:00', '12:00'), range('13:00', '17:00')];

    it('keeps the duration', () => {
        const moved = moveRange(ranges, 0, 8 * 60, 15)[0];
        expect(moved.start).toBe('08:00');
        expect(moved.end).toBe('11:00');
    });

    it('stops when the trailing edge reaches the neighbour', () => {
        const moved = moveRange(ranges, 0, 20 * 60, 15)[0];
        expect(moved.start).toBe('10:00');
        expect(moved.end).toBe('13:00');
    });

    it('stops at the start of the day', () => {
        const moved = moveRange(ranges, 0, -300, 15)[0];
        expect(moved.start).toBe('00:00');
        expect(moved.end).toBe('03:00');
    });
});

describe('sortRanges', () => {
    it('orders by start time', () => {
        const sorted = sortRanges([range('13:00', '17:00'), range('09:00', '12:00')]);
        expect(sorted.map((r) => r.start)).toEqual(['09:00', '13:00']);
    });
});
