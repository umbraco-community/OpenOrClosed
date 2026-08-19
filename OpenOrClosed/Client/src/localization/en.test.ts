import { describe, expect, it } from 'vitest';
import en from './en.js';
import type { HolidayError } from '../holidays/holiday.js';
import type { HoursRangeProblem } from '../timeline/time-range.js';

/**
 * Listed explicitly rather than derived: types vanish at runtime, so a test that enumerated them
 * dynamically would pass vacuously. Adding a code without adding it here is caught by the
 * exhaustiveness of the type annotation.
 */
const HOLIDAY_ERRORS: HolidayError[] = [
    'nameRequired',
    'startDateInvalid',
    'endDateInvalid',
    'endBeforeStart',
    'customNeedsHours',
];

const RANGE_PROBLEMS: Array<HoursRangeProblem['code']> = [
    'outsideDay',
    'endNotAfterStart',
    'tooShort',
    'overlaps',
];

const capitalise = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

describe('the en dictionary', () => {
    it('has an entry for every holiday error code', () => {
        // Without this, a new code renders to an editor as the raw key.
        for (const code of HOLIDAY_ERRORS) {
            expect(en.openOrClosed, `missing error${capitalise(code)}`).toHaveProperty(
                `error${capitalise(code)}`,
            );
        }
    });

    it('has an entry for every range problem code', () => {
        for (const code of RANGE_PROBLEMS) {
            expect(en.openOrClosed, `missing error${capitalise(code)}`).toHaveProperty(
                `error${capitalise(code)}`,
            );
        }
    });

    it('has no empty values', () => {
        for (const [key, value] of Object.entries(en.openOrClosed)) {
            if (typeof value === 'string') {
                expect(value.length, `${key} is empty`).toBeGreaterThan(0);
            }
        }
    });

    it('phrases the two argument-taking entries from their arguments', () => {
        expect(en.openOrClosed.errorTooShort(15)).toContain('15');
        expect(en.openOrClosed.openHolidayAction('Christmas')).toContain('Christmas');
        expect(en.openOrClosed.defaultHoursHint('09:00 – 17:00')).toContain('09:00 – 17:00');
    });

    it('falls back to a generic name when a holiday has none yet', () => {
        expect(en.openOrClosed.openHolidayAction('')).toBe('Edit holiday');
    });
});
