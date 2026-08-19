import { describe, expect, it } from 'vitest';
import {
    boundsFor,
    createRange,
    DAY_MINUTES,
    formatDisplay,
    formatTime,
    gapAt,
    isValidTime,
    largestGap,
    MIN_RANGE_MINUTES,
    moveRange,
    parseTime,
    resizeRange,
    sanitizeRanges,
    snap,
    sortRanges,
    validateRange,
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

describe('gapAt', () => {
    const ranges = [range('09:00', '12:00'), range('13:00', '17:00')];

    it('finds the gap between two ranges', () => {
        expect(gapAt(ranges, 12 * 60 + 30)).toEqual({ start: 720, end: 780 });
    });

    it('finds the gap before the first range', () => {
        expect(gapAt(ranges, 60)).toEqual({ start: 0, end: 540 });
    });

    it('finds the gap after the last range', () => {
        expect(gapAt(ranges, 20 * 60)).toEqual({ start: 1020, end: DAY_MINUTES });
    });

    it('returns null inside an existing range', () => {
        expect(gapAt(ranges, 10 * 60)).toBeNull();
    });

    it('treats an empty day as one whole gap', () => {
        expect(gapAt([], 10 * 60)).toEqual({ start: 0, end: DAY_MINUTES });
    });
});

describe('largestGap', () => {
    it('picks the widest free stretch', () => {
        // Midnight to 09:00 is 9 hours; 17:00 to midnight is only 7.
        expect(largestGap([range('09:00', '10:00'), range('11:00', '17:00')]))
            .toEqual({ start: 0, end: 540 });
    });

    it('ignores a gap too small to hold a range', () => {
        expect(largestGap([range('00:00', '23:55')])).toBeNull();
    });

    it('returns null on a full day', () => {
        expect(largestGap([range('00:00', '24:00')])).toBeNull();
    });
});

describe('createRange', () => {
    it('starts at the click point and runs for the default duration', () => {
        const created = createRange([], 9 * 60, 8 * 60, 15)!;
        expect(created).toHaveLength(1);
        expect(created[0]).toEqual({ start: '09:00', end: '17:00', label: null, byAppointmentOnly: false });
    });

    it('truncates to fit the gap it was dropped into', () => {
        const ranges = [range('09:00', '12:00'), range('13:00', '17:00')];
        const created = createRange(ranges, 12 * 60, 8 * 60, 15)!;
        expect(created[1]).toMatchObject({ start: '12:00', end: '13:00' });
    });

    it('inserts in sorted order', () => {
        const created = createRange([range('13:00', '17:00')], 9 * 60, 60, 15)!;
        expect(created.map((r) => r.start)).toEqual(['09:00', '13:00']);
    });

    it('refuses when the gap is smaller than the minimum', () => {
        const ranges = [range('09:00', '12:00'), range('12:10', '17:00')];
        expect(createRange(ranges, 12 * 60 + 5, 60, 5)).toBeNull();
    });

    it('refuses inside an existing range', () => {
        expect(createRange([range('09:00', '17:00')], 10 * 60, 60, 15)).toBeNull();
    });
});

describe('validateRange', () => {
    const ranges = [range('09:00', '12:00'), range('13:00', '17:00')];

    it('accepts a range that fits', () => {
        expect(validateRange(ranges, 0, 9 * 60, 11 * 60)).toBeNull();
    });

    it('rejects an end at or before the start', () => {
        expect(validateRange(ranges, 0, 10 * 60, 10 * 60)).toEqual({ code: 'endNotAfterStart' });
    });

    it('rejects a range shorter than the minimum, and reports the minimum', () => {
        // The code carries the number so the dictionary does not need to know
        // MIN_RANGE_MINUTES to phrase the message.
        expect(validateRange(ranges, 0, 9 * 60, 9 * 60 + 5)).toEqual({
            code: 'tooShort',
            minutes: MIN_RANGE_MINUTES,
        });
    });

    it('rejects an overlap with another range', () => {
        expect(validateRange(ranges, 0, 9 * 60, 14 * 60)).toEqual({ code: 'overlaps' });
    });

    it('ignores the range being edited when checking overlaps', () => {
        expect(validateRange(ranges, 1, 12 * 60, 18 * 60)).toBeNull();
    });

    it('rejects a range leaving the day', () => {
        expect(validateRange(ranges, 0, 9 * 60, DAY_MINUTES + 60)).toEqual({ code: 'outsideDay' });
        expect(validateRange(ranges, 0, -30, 11 * 60)).toEqual({ code: 'outsideDay' });
    });
});

describe('sanitizeRanges', () => {
    it('drops entries that are not usable and sorts the rest', () => {
        const raw = [
            { start: '13:00', end: '17:00' },
            { start: 'nope', end: '10:00' },
            null,
            { start: '09:00', end: '12:00', label: 'Morning', byAppointmentOnly: true },
            { start: '18:00', end: '17:00' },
        ];

        expect(sanitizeRanges(raw)).toEqual([
            { start: '09:00', end: '12:00', label: 'Morning', byAppointmentOnly: true },
            { start: '13:00', end: '17:00', label: null, byAppointmentOnly: false },
        ]);
    });

    it('returns an empty array for anything that is not an array', () => {
        expect(sanitizeRanges(undefined)).toEqual([]);
        expect(sanitizeRanges('nope')).toEqual([]);
    });
});
