import { sanitizeRanges, type HoursRange } from '../timeline/time-range.js';

export type HolidayHoursMode = 'default' | 'closed' | 'custom';

const MODES: HolidayHoursMode[] = ['default', 'closed', 'custom'];

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface Holiday {
    name: string;
    /** ISO `YYYY-MM-DD`. */
    start: string;
    /** ISO `YYYY-MM-DD`, inclusive. */
    end: string;
    repeatYearly: boolean;
    hoursMode: HolidayHoursMode;
    /** Ignored unless `hoursMode` is `custom`. */
    hours: HoursRange[];
}

export interface HolidaySchedule {
    defaultHours: HoursRange[];
    holidays: Holiday[];
}

/** Today as ISO `YYYY-MM-DD` in the browser's own timezone, not UTC. */
export function todayIso(): string {
    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * Whether `value` is a real calendar date in ISO form. Rejects 2026-02-29, which `new Date()`
 * would silently roll forward to 1 March.
 */
export function isValidDate(value: unknown): value is string {
    if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;

    const [year, month, day] = value.split('-').map(Number);
    if (month < 1 || month > 12 || day < 1) return false;

    // Day 0 of the next month is the last day of this one.
    return day <= new Date(year, month, 0).getDate();
}

/** ISO dates sort lexicographically, so no parsing is needed to compare them. */
export function compareDates(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}

/** A repeating holiday never expires, because it recurs. Mirrors the server rule exactly. */
export function isExpired(holiday: Holiday, today: string): boolean {
    return !holiday.repeatYearly && compareDates(holiday.end, today) < 0;
}

/**
 * The end date to use after `start` changed: the existing `end` when it still makes sense, or
 * `start` itself when it has fallen behind or is unusable.
 *
 * An unusable `start` leaves `end` untouched - there is nothing to anchor to, and discarding a
 * value the editor may still be part-way through typing would be worse than leaving it invalid.
 */
export function endFollowingStart(start: string, end: string): string {
    if (!isValidDate(start)) return end;
    if (!isValidDate(end)) return start;

    return compareDates(end, start) < 0 ? start : end;
}

export function emptyHoliday(today: string): Holiday {
    return { name: '', start: today, end: today, repeatYearly: false, hoursMode: 'default', hours: [] };
}

/** Returns the first problem with `holiday`, or null when it is fit to save. */
export function validateHoliday(holiday: Holiday): string | null {
    if (holiday.name.trim().length === 0) return 'A name is required';
    if (!isValidDate(holiday.start)) return 'A valid start date is required';
    if (!isValidDate(holiday.end)) return 'A valid end date is required';
    if (compareDates(holiday.end, holiday.start) < 0) {
        return 'The end date must be on or after the start date';
    }
    if (holiday.hoursMode === 'custom' && holiday.hours.length === 0) {
        return 'Custom hours need at least one set of hours';
    }

    return null;
}

function sanitizeMode(raw: unknown): HolidayHoursMode {
    const value = typeof raw === 'string' ? (raw.toLowerCase() as HolidayHoursMode) : 'default';
    return MODES.includes(value) ? value : 'default';
}

function sanitizeHoliday(raw: unknown): Holiday | null {
    if (raw === null || typeof raw !== 'object') return null;

    const source = raw as Record<string, unknown>;
    if (!isValidDate(source.start) || !isValidDate(source.end)) return null;

    // A reversed pair is a fixable mistake, so swap rather than discard the holiday - the same
    // reasoning that keeps expired holidays visible in the editor.
    const [start, end] =
        compareDates(source.start, source.end) <= 0
            ? [source.start, source.end]
            : [source.end, source.start];

    return {
        name: typeof source.name === 'string' ? source.name : '',
        start,
        end,
        repeatYearly: source.repeatYearly === true,
        hoursMode: sanitizeMode(source.hoursMode),
        hours: sanitizeRanges(source.hours),
    };
}

/** Coerces a stored value of unknown provenance into a usable schedule. */
export function sanitizeSchedule(raw: unknown): HolidaySchedule {
    if (raw === null || typeof raw !== 'object') return { defaultHours: [], holidays: [] };

    const source = raw as Record<string, unknown>;
    const holidays = Array.isArray(source.holidays) ? source.holidays : [];

    return {
        defaultHours: sanitizeRanges(source.defaultHours),
        holidays: holidays
            .map(sanitizeHoliday)
            .filter((holiday): holiday is Holiday => holiday !== null),
    };
}

/** Start date first, then name, so the table has a stable order. */
export function sortHolidays(holidays: Holiday[]): Holiday[] {
    return [...holidays].sort(
        (left, right) => compareDates(left.start, right.start) || left.name.localeCompare(right.name),
    );
}

export function formatDateRange(holiday: Holiday): string {
    return holiday.start === holiday.end ? holiday.start : `${holiday.start} – ${holiday.end}`;
}
