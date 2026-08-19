import { describe, expect, it } from 'vitest';
import {
    compareDates,
    emptyHoliday,
    endFollowingStart,
    holidayConsistencyError,
    formatDateRange,
    isExpired,
    isValidDate,
    sanitizeSchedule,
    sortHolidays,
    todayIso,
    validateHoliday,
    type Holiday,
} from './holiday.js';

const holiday = (overrides: Partial<Holiday> = {}): Holiday => ({
    ...emptyHoliday('2026-08-20'),
    name: 'Stocktake',
    start: '2026-08-20',
    end: '2026-08-22',
    ...overrides,
});

describe('isValidDate', () => {
    it.each(['2026-08-20', '2024-02-29', '2026-12-31', '2026-01-01'])('accepts %s', (value) => {
        expect(isValidDate(value)).toBe(true);
    });

    it.each(['', '20-08-2026', '2026-13-01', '2026-02-30', '2026-8-2', 'nonsense', '2026-00-10'])(
        'rejects %s',
        (value) => {
            expect(isValidDate(value)).toBe(false);
        },
    );

    it('rejects 29 February in a non-leap year rather than rolling it forward', () => {
        // new Date('2026-02-29') would silently become 1 March.
        expect(isValidDate('2026-02-29')).toBe(false);
    });

    it('rejects non-strings', () => {
        expect(isValidDate(null)).toBe(false);
        expect(isValidDate(20260820)).toBe(false);
        expect(isValidDate(undefined)).toBe(false);
    });
});

describe('compareDates', () => {
    it('orders ISO dates lexicographically, which is chronological', () => {
        expect(compareDates('2026-01-02', '2026-01-10')).toBeLessThan(0);
        expect(compareDates('2027-01-01', '2026-12-31')).toBeGreaterThan(0);
        expect(compareDates('2026-08-20', '2026-08-20')).toBe(0);
    });
});

describe('todayIso', () => {
    it('returns a valid ISO date', () => {
        expect(isValidDate(todayIso())).toBe(true);
    });

    it('uses the local date, not UTC', () => {
        const now = new Date();
        const pad = (value: number) => String(value).padStart(2, '0');
        expect(todayIso()).toBe(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`);
    });
});

describe('isExpired', () => {
    const today = '2026-08-20';

    it('is false for a holiday ending today', () => {
        expect(isExpired(holiday({ start: '2026-08-18', end: today }), today)).toBe(false);
    });

    it('is true for a holiday that ended yesterday', () => {
        expect(isExpired(holiday({ start: '2026-08-17', end: '2026-08-19' }), today)).toBe(true);
    });

    it('is false for a future holiday', () => {
        expect(isExpired(holiday({ start: '2027-01-01', end: '2027-01-02' }), today)).toBe(false);
    });

    it('is never true for a repeating holiday, however old', () => {
        expect(
            isExpired(holiday({ start: '2001-12-25', end: '2001-12-25', repeatYearly: true }), today),
        ).toBe(false);
    });
});

describe('validateHoliday', () => {
    it('accepts a well-formed holiday', () => {
        expect(validateHoliday(holiday())).toBeNull();
    });

    it('requires a name', () => {
        expect(validateHoliday(holiday({ name: '   ' }))).toBe('nameRequired');
    });

    it('requires valid dates', () => {
        expect(validateHoliday(holiday({ start: '' }))).toBe('startDateInvalid');
        expect(validateHoliday(holiday({ end: 'nope' }))).toBe('endDateInvalid');
    });

    it('requires the end on or after the start', () => {
        expect(validateHoliday(holiday({ start: '2026-08-22', end: '2026-08-20' }))).toBe(
            'endBeforeStart',
        );
    });

    it('accepts a single-day holiday', () => {
        expect(validateHoliday(holiday({ start: '2026-08-20', end: '2026-08-20' }))).toBeNull();
    });

    it('requires at least one range when the mode is custom', () => {
        expect(validateHoliday(holiday({ hoursMode: 'custom', hours: [] }))).toBe(
            'customNeedsHours',
        );
    });

    it('ignores empty hours when the mode is not custom', () => {
        expect(validateHoliday(holiday({ hoursMode: 'closed', hours: [] }))).toBeNull();
        expect(validateHoliday(holiday({ hoursMode: 'default', hours: [] }))).toBeNull();
    });
});

describe('emptyHoliday', () => {
    it('starts and ends on the given day, closed and not repeating', () => {
        const fresh = emptyHoliday('2026-08-20');

        expect(fresh).toEqual({
            name: '',
            start: '2026-08-20',
            end: '2026-08-20',
            repeatYearly: false,
            hoursMode: 'default',
            hours: [],
        });
    });
});

describe('sanitizeSchedule', () => {
    it('turns null into an empty schedule', () => {
        expect(sanitizeSchedule(null)).toEqual({ defaultHours: [], holidays: [] });
    });

    it('turns junk into an empty schedule rather than throwing', () => {
        expect(sanitizeSchedule('nonsense')).toEqual({ defaultHours: [], holidays: [] });
        expect(sanitizeSchedule(42)).toEqual({ defaultHours: [], holidays: [] });
        expect(sanitizeSchedule(undefined)).toEqual({ defaultHours: [], holidays: [] });
        expect(sanitizeSchedule({ defaultHours: 'no', holidays: 'no' })).toEqual({
            defaultHours: [],
            holidays: [],
        });
    });

    it('keeps well-formed entries', () => {
        const result = sanitizeSchedule({
            defaultHours: [{ start: '10:00', end: '14:00' }],
            holidays: [
                {
                    name: 'Christmas',
                    start: '2026-12-25',
                    end: '2026-12-25',
                    repeatYearly: true,
                    hoursMode: 'closed',
                    hours: [],
                },
            ],
        });

        expect(result.defaultHours).toHaveLength(1);
        expect(result.holidays).toHaveLength(1);
        expect(result.holidays[0].repeatYearly).toBe(true);
        expect(result.holidays[0].hoursMode).toBe('closed');
    });

    it('drops holidays with unusable dates', () => {
        const result = sanitizeSchedule({
            holidays: [
                { name: 'Bad', start: 'nope', end: 'nope', hoursMode: 'closed' },
                { name: 'Good', start: '2026-12-25', end: '2026-12-25', hoursMode: 'closed' },
            ],
        });

        expect(result.holidays.map((h) => h.name)).toEqual(['Good']);
    });

    it('falls back to default for an unrecognised mode', () => {
        const result = sanitizeSchedule({
            holidays: [{ name: 'Odd', start: '2026-12-25', end: '2026-12-25', hoursMode: 'sideways' }],
        });

        expect(result.holidays[0].hoursMode).toBe('default');
    });

    it('reads a mode case-insensitively, like the server does', () => {
        const result = sanitizeSchedule({
            holidays: [{ name: 'Shouty', start: '2026-12-25', end: '2026-12-25', hoursMode: 'CLOSED' }],
        });

        expect(result.holidays[0].hoursMode).toBe('closed');
    });

    it('swaps a reversed date pair rather than dropping the holiday', () => {
        const result = sanitizeSchedule({
            holidays: [
                { name: 'Reversed', start: '2026-12-31', end: '2026-12-01', hoursMode: 'closed' },
            ],
        });

        expect(result.holidays[0].start).toBe('2026-12-01');
        expect(result.holidays[0].end).toBe('2026-12-31');
    });

    it('drops unusable ranges inside a holiday without dropping the holiday', () => {
        const result = sanitizeSchedule({
            holidays: [
                {
                    name: 'Partly bad hours',
                    start: '2026-12-25',
                    end: '2026-12-25',
                    hoursMode: 'custom',
                    hours: [{ start: 'nope', end: 'nope' }, { start: '09:00', end: '12:00' }],
                },
            ],
        });

        expect(result.holidays).toHaveLength(1);
        expect(result.holidays[0].hours).toHaveLength(1);
    });

    it('defaults a missing name to an empty string', () => {
        const result = sanitizeSchedule({
            holidays: [{ start: '2026-12-25', end: '2026-12-25', hoursMode: 'closed' }],
        });

        expect(result.holidays[0].name).toBe('');
    });
});

describe('sortHolidays', () => {
    it('orders by start date, then by name', () => {
        const sorted = sortHolidays([
            holiday({ name: 'Later', start: '2027-01-01', end: '2027-01-01' }),
            holiday({ name: 'Beta', start: '2026-08-20', end: '2026-08-20' }),
            holiday({ name: 'Alpha', start: '2026-08-20', end: '2026-08-20' }),
        ]);

        expect(sorted.map((h) => h.name)).toEqual(['Alpha', 'Beta', 'Later']);
    });

    it('does not mutate its argument', () => {
        const input = [
            holiday({ name: 'B', start: '2027-01-01' }),
            holiday({ name: 'A', start: '2026-01-01' }),
        ];

        sortHolidays(input);

        expect(input.map((h) => h.name)).toEqual(['B', 'A']);
    });
});

describe('formatDateRange', () => {
    it('shows a single date once', () => {
        expect(formatDateRange(holiday({ start: '2026-12-25', end: '2026-12-25' }))).toBe('2026-12-25');
    });

    it('shows both ends of a real range', () => {
        expect(formatDateRange(holiday({ start: '2026-12-27', end: '2027-01-02' }))).toBe(
            '2026-12-27 – 2027-01-02',
        );
    });
});

describe('endFollowingStart', () => {
    it('leaves an end that is already on or after the start alone', () => {
        expect(endFollowingStart('2026-12-25', '2026-12-27')).toBe('2026-12-27');
        expect(endFollowingStart('2026-12-25', '2026-12-25')).toBe('2026-12-25');
    });

    it('snaps an end that now falls before the start', () => {
        // The reported case: start moved to 25/12 while the end still read 19/09.
        expect(endFollowingStart('2026-12-25', '2026-09-19')).toBe('2026-12-25');
    });

    it('snaps across a year boundary', () => {
        expect(endFollowingStart('2027-01-05', '2026-12-30')).toBe('2027-01-05');
    });

    it('adopts the start when the end is missing or unusable', () => {
        expect(endFollowingStart('2026-12-25', '')).toBe('2026-12-25');
        expect(endFollowingStart('2026-12-25', 'nonsense')).toBe('2026-12-25');
        expect(endFollowingStart('2026-12-25', '2026-02-29')).toBe('2026-12-25');
    });

    it('leaves the end alone when the start itself is unusable', () => {
        // Nothing to anchor to, so do not destroy a value the editor may still fix.
        expect(endFollowingStart('', '2026-12-27')).toBe('2026-12-27');
        expect(endFollowingStart('nonsense', '2026-12-27')).toBe('2026-12-27');
    });
});

describe('holidayConsistencyError', () => {
    it('is null for a well-formed holiday', () => {
        expect(holidayConsistencyError(holiday())).toBeNull();
    });

    it('reports an end before the start', () => {
        expect(holidayConsistencyError(holiday({ start: '2026-12-25', end: '2026-09-19' }))).toBe(
            'endBeforeStart',
        );
    });

    it('reports custom mode with no hours', () => {
        expect(holidayConsistencyError(holiday({ hoursMode: 'custom', hours: [] }))).toBe(
            'customNeedsHours',
        );
    });

    it('stays quiet about a missing name', () => {
        // Required-field nagging belongs to Save, not to every keystroke.
        expect(holidayConsistencyError(holiday({ name: '' }))).toBeNull();
    });

    it('stays quiet while a date is still half-typed', () => {
        // Nothing to compare yet, and complaining mid-entry would be noise.
        expect(holidayConsistencyError(holiday({ start: '', end: '2026-12-27' }))).toBeNull();
        expect(holidayConsistencyError(holiday({ start: '2026-12-25', end: '2026-' }))).toBeNull();
    });
});

describe('validateHoliday still owns the required rules', () => {
    it('reports a missing name that holidayConsistencyError ignores', () => {
        const missingName = holiday({ name: '' });

        expect(holidayConsistencyError(missingName)).toBeNull();
        expect(validateHoliday(missingName)).toBe('nameRequired');
    });

    it('reports the same order problem as holidayConsistencyError', () => {
        const reversed = holiday({ start: '2026-12-25', end: '2026-09-19' });

        expect(validateHoliday(reversed)).toBe(holidayConsistencyError(reversed));
    });
});
