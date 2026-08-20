/** Minutes in a day. Also the only legal end value above 23:59 — "24:00". */
export const DAY_MINUTES = 1440;

/** No range may be shorter than this. */
export const MIN_RANGE_MINUTES = 15;

export const DEFAULT_SNAP_MINUTES = 15;

/** One set of hours, exactly as it is persisted. */
export interface HoursRange {
    start: string;
    end: string;
    label: string | null;
    byAppointmentOnly: boolean;
}

const TIME_PATTERN = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;

function toMinutes(value: string): number | null {
    const match = TIME_PATTERN.exec(value);
    if (!match) return null;

    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (minutes > 59) return null;

    const total = hours * 60 + minutes;
    return total > DAY_MINUTES ? null : total;
}

export function isValidTime(value: string): boolean {
    return typeof value === 'string' && toMinutes(value) !== null;
}

/** Minutes since midnight. Throws on anything malformed — call isValidTime first for untrusted input. */
export function parseTime(value: string): number {
    const minutes = toMinutes(value);
    if (minutes === null) throw new RangeError(`'${value}' is not a time of day.`);
    return minutes;
}

/** The 24-hour wire format. 1440 becomes "24:00", which is legal as an end. */
export function formatTime(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${remainder.toString().padStart(2, '0')}`;
}

/** How a time is shown to a person, honouring the 12/24 hour setting. */
export function formatDisplay(minutes: number, use24Hour: boolean): string {
    if (use24Hour) return formatTime(minutes);

    const hours24 = Math.floor(minutes / 60) % 24;
    const remainder = minutes % 60;
    const hours12 = hours24 % 12 || 12;
    const meridiem = hours24 < 12 ? 'AM' : 'PM';

    return `${hours12}:${remainder.toString().padStart(2, '0')} ${meridiem}`;
}

/**
 * A compact label for the time axis. Unlike formatDisplay this drops a zero minute component,
 * because "12:00 AM" is too wide for the axis gutter and the ticks are centre-aligned.
 */
export function formatAxis(minutes: number, use24Hour: boolean): string {
    if (use24Hour) return formatTime(minutes);

    const display = formatDisplay(minutes, false);
    return display.replace(':00', '');
}

export function formatRange(range: HoursRange, use24Hour: boolean): string {
    return `${formatDisplay(parseTime(range.start), use24Hour)} – ${formatDisplay(parseTime(range.end), use24Hour)}`;
}

/** Rounds to the nearest step and holds the result inside the day. */
export function snap(minutes: number, step: number): number {
    const rounded = Math.round(minutes / step) * step;
    return Math.min(DAY_MINUTES, Math.max(0, rounded));
}

export function sortRanges(ranges: HoursRange[]): HoursRange[] {
    return [...ranges].sort((a, b) => parseTime(a.start) - parseTime(b.start));
}

/** How far a range may extend before it would touch a neighbour or leave the day. */
export function boundsFor(ranges: HoursRange[], index: number): { min: number; max: number } {
    const previous = ranges[index - 1];
    const next = ranges[index + 1];

    return {
        min: previous ? parseTime(previous.end) : 0,
        max: next ? parseTime(next.start) : DAY_MINUTES,
    };
}

function replaceAt(ranges: HoursRange[], index: number, start: number, end: number): HoursRange[] {
    const updated = [...ranges];
    updated[index] = { ...ranges[index], start: formatTime(start), end: formatTime(end) };
    return updated;
}

export function resizeRange(
    ranges: HoursRange[],
    index: number,
    edge: 'start' | 'end',
    minutes: number,
    step: number,
): HoursRange[] {
    const { min, max } = boundsFor(ranges, index);
    const start = parseTime(ranges[index].start);
    const end = parseTime(ranges[index].end);
    const snapped = snap(minutes, step);

    if (edge === 'start') {
        const clamped = Math.min(Math.max(snapped, min), end - MIN_RANGE_MINUTES);
        return replaceAt(ranges, index, clamped, end);
    }

    const clamped = Math.max(Math.min(snapped, max), start + MIN_RANGE_MINUTES);
    return replaceAt(ranges, index, start, clamped);
}

export function moveRange(
    ranges: HoursRange[],
    index: number,
    startMinutes: number,
    step: number,
): HoursRange[] {
    const { min, max } = boundsFor(ranges, index);
    const duration = parseTime(ranges[index].end) - parseTime(ranges[index].start);
    const snapped = snap(startMinutes, step);
    const clamped = Math.min(Math.max(snapped, min), max - duration);

    return replaceAt(ranges, index, clamped, clamped + duration);
}

interface Gap {
    start: number;
    end: number;
}

function gaps(ranges: HoursRange[]): Gap[] {
    const found: Gap[] = [];
    let cursor = 0;

    for (const range of ranges) {
        const start = parseTime(range.start);
        if (start > cursor) found.push({ start: cursor, end: start });
        cursor = parseTime(range.end);
    }

    if (cursor < DAY_MINUTES) found.push({ start: cursor, end: DAY_MINUTES });

    return found;
}

/** The free stretch containing this point, or null if it falls inside a range. */
export function gapAt(ranges: HoursRange[], minutes: number): Gap | null {
    return gaps(ranges).find((gap) => minutes >= gap.start && minutes < gap.end) ?? null;
}

export function largestGap(ranges: HoursRange[]): Gap | null {
    return gaps(ranges).reduce<Gap | null>(
        (widest, gap) =>
            gap.end - gap.start >= MIN_RANGE_MINUTES &&
            (widest === null || gap.end - gap.start > widest.end - widest.start)
                ? gap
                : widest,
        null,
    );
}

/**
 * Adds a range beginning at the given point, running for the default duration but never past the
 * end of the gap it lands in. Returns null when there is no room.
 */
export function createRange(
    ranges: HoursRange[],
    atMinutes: number,
    durationMinutes: number,
    step: number,
): HoursRange[] | null {
    const gap = gapAt(ranges, atMinutes);
    if (gap === null || gap.end - gap.start < MIN_RANGE_MINUTES) return null;

    const start = Math.min(Math.max(snap(atMinutes, step), gap.start), gap.end - MIN_RANGE_MINUTES);
    const end = Math.min(start + durationMinutes, gap.end);
    if (end - start < MIN_RANGE_MINUTES) return null;

    return sortRanges([
        ...ranges,
        { start: formatTime(start), end: formatTime(end), label: null, byAppointmentOnly: false },
    ]);
}

/** Checks a typed range. Dragging cannot produce these, but the dialog can. */
/**
 * Why a range is not acceptable. A code rather than a sentence, because this module is DOM-free
 * and cannot reach Umbraco's localisation - the element translates it.
 *
 * Named HoursRangeProblem, not RangeError: that is a JS built-in which parseTime throws.
 */
export type HoursRangeProblem =
    | { code: 'outsideDay' }
    | { code: 'endNotAfterStart' }
    | { code: 'tooShort'; minutes: number }
    | { code: 'overlaps' };

export function validateRange(
    ranges: HoursRange[],
    index: number,
    startMinutes: number,
    endMinutes: number,
): HoursRangeProblem | null {
    if (startMinutes < 0 || endMinutes > DAY_MINUTES) {
        return { code: 'outsideDay' };
    }

    if (endMinutes <= startMinutes) {
        return { code: 'endNotAfterStart' };
    }

    if (endMinutes - startMinutes < MIN_RANGE_MINUTES) {
        // The minimum travels with the code so the message can be phrased without the
        // dictionary knowing MIN_RANGE_MINUTES.
        return { code: 'tooShort', minutes: MIN_RANGE_MINUTES };
    }

    const overlaps = ranges.some(
        (other, i) =>
            i !== index && startMinutes < parseTime(other.end) && endMinutes > parseTime(other.start),
    );

    return overlaps ? { code: 'overlaps' } : null;
}

/** Turns a persisted value of unknown shape into ranges we can rely on. */
export function sanitizeRanges(raw: unknown): HoursRange[] {
    if (!Array.isArray(raw)) return [];

    const usable = raw.filter((entry): entry is HoursRange => {
        if (entry === null || typeof entry !== 'object') return false;

        const { start, end } = entry as Partial<HoursRange>;
        if (typeof start !== 'string' || typeof end !== 'string') return false;
        if (!isValidTime(start) || !isValidTime(end)) return false;

        return parseTime(end) > parseTime(start);
    });

    return sortRanges(usable).map((entry) => ({
        start: entry.start,
        end: entry.end,
        label: typeof entry.label === 'string' && entry.label.length > 0 ? entry.label : null,
        byAppointmentOnly: entry.byAppointmentOnly === true,
    }));
}
