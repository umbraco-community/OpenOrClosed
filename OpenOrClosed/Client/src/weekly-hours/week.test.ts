import { describe, expect, it } from 'vitest';
import { copyRangesTo, type WeeklyHoursDay } from './week.js';

/** Monday is 1 and Sunday is 0, following System.DayOfWeek, as the stored value does. */
const day = (n: number, ...times: Array<[string, string]>): WeeklyHoursDay => ({
    day: n,
    ranges: times.map(([start, end]) => ({ start, end, label: null, byAppointmentOnly: false })),
});

describe('copyRangesTo', () => {
    it('copies onto a day that had nothing', () => {
        const week = [day(1, ['09:00', '17:00'])];

        expect(copyRangesTo(week, 1, [2])).toEqual([
            day(1, ['09:00', '17:00']),
            day(2, ['09:00', '17:00']),
        ]);
    });

    it('replaces what the target had rather than merging', () => {
        const week = [day(1, ['09:00', '12:00'], ['13:00', '17:00']), day(2, ['10:00', '11:00'])];

        expect(copyRangesTo(week, 1, [2])).toEqual([
            day(1, ['09:00', '12:00'], ['13:00', '17:00']),
            day(2, ['09:00', '12:00'], ['13:00', '17:00']),
        ]);
    });

    it('removes the target entry when the source is empty', () => {
        // The stored value is sparse - an empty `ranges` array would be a row the server skips,
        // silently losing the day rather than clearing it.
        //
        // Day 1 is the source, not a target, so its own empty entry is left exactly as it was:
        // tidying a value this function was not asked to touch would be worse than leaving it.
        const week = [day(1), day(2, ['10:00', '11:00'])];

        expect(copyRangesTo(week, 1, [2])).toEqual([day(1)]);
    });

    it('treats a source absent from the week as empty', () => {
        const week = [day(2, ['10:00', '11:00'])];

        expect(copyRangesTo(week, 1, [2])).toEqual([]);
    });

    it('copies onto several days at once', () => {
        const week = [day(1, ['09:00', '17:00'])];

        expect(copyRangesTo(week, 1, [2, 3, 4])).toEqual([
            day(1, ['09:00', '17:00']),
            day(2, ['09:00', '17:00']),
            day(3, ['09:00', '17:00']),
            day(4, ['09:00', '17:00']),
        ]);
    });

    it('leaves days that were not named alone', () => {
        const week = [day(1, ['09:00', '17:00']), day(5, ['08:00', '12:00'])];

        expect(copyRangesTo(week, 1, [2])).toEqual([
            day(1, ['09:00', '17:00']),
            day(2, ['09:00', '17:00']),
            day(5, ['08:00', '12:00']),
        ]);
    });

    it('ignores a source listed among its own targets', () => {
        const week = [day(1, ['09:00', '17:00'])];

        expect(copyRangesTo(week, 1, [1])).toEqual([day(1, ['09:00', '17:00'])]);
    });

    it('deep-copies, so dragging the copy does not move the source', () => {
        const week = [day(1, ['09:00', '17:00'])];
        const copied = copyRangesTo(week, 1, [2]);

        const target = copied.find((entry) => entry.day === 2)!;
        target.ranges[0].start = '06:00';

        expect(copied.find((entry) => entry.day === 1)!.ranges[0].start).toBe('09:00');
    });
});
