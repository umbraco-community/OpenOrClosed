import { describe, expect, it } from 'vitest';
import en from './en.js';
import type { HolidayError } from '../holidays/holiday.js';
import type { HoursRangeProblem } from '../timeline/time-range.js';
import { manifests as holidayManifests } from '../holidays/manifest.js';
import { manifests as weeklyManifests } from '../weekly-hours/manifest.js';

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

    it('phrases the argument-taking entries from their arguments', () => {
        expect(en.openOrClosed.errorTooShort(15)).toContain('15');
        expect(en.openOrClosed.openHolidayAction('Christmas')).toContain('Christmas');
        expect(en.openOrClosed.defaultHoursHint('09:00 – 17:00')).toContain('09:00 – 17:00');
        expect(en.openOrClosed.addPresetHours('09:00 – 12:00')).toContain('09:00 – 12:00');
        expect(en.openOrClosed.copyHoursFrom('Monday')).toContain('Monday');
        expect(en.openOrClosed.dayActions('Monday')).toContain('Monday');
        expect(en.openOrClosed.holidayActions('Christmas')).toContain('Christmas');
    });

    it('falls back to a generic name when a holiday has none yet', () => {
        expect(en.openOrClosed.openHolidayAction('')).toBe('Edit holiday');
    });
});

/**
 * Only the structure these tests care about. The real manifest type is a wide union, and
 * narrowing it here would say more about the union than about the keys.
 */
type SettingsManifest = {
    meta?: {
        label?: string;
        settings?: { properties?: Array<{ label?: string; description?: string }> };
    };
};

const manifests = [...holidayManifests, ...weeklyManifests] as SettingsManifest[];
const settings = manifests.flatMap((manifest) => manifest.meta?.settings?.properties ?? []);
const dictionary = en.openOrClosed as Record<string, unknown>;

describe('manifest localisation references', () => {
    it('covers every editor and setting', () => {
        // Guards the fixtures below: an empty list would make every other case pass vacuously.
        expect(manifests.filter((manifest) => manifest.meta?.label).length).toBe(2);
        expect(settings.length).toBe(9);
    });

    it('marks setting labels with a bare #key', () => {
        // A label goes through localize.string, which resolves "#key" in place.
        for (const setting of settings) {
            expect(setting.label, JSON.stringify(setting)).toMatch(/^#openOrClosed_\w+$/);
        }
    });

    it('wraps setting descriptions in the UFM form', () => {
        // A description is rendered by umb-ufm-render, not localize.string, so a bare "#key"
        // reaches the screen verbatim. Braces make it the UFM localize component instead.
        for (const setting of settings) {
            expect(setting.description, JSON.stringify(setting)).toMatch(/^\{#openOrClosed_\w+\}$/);
        }
    });

    it('references only keys the dictionary defines', () => {
        const referenced = [
            ...manifests.map((manifest) => manifest.meta?.label),
            ...settings.flatMap((setting) => [setting.label, setting.description]),
        ].filter((value): value is string => typeof value === 'string');

        for (const reference of referenced) {
            const key = reference.replace(/^\{?#openOrClosed_/, '').replace(/\}$/, '');
            expect(dictionary, `manifest references ${reference}`).toHaveProperty(key);
        }
    });
});
