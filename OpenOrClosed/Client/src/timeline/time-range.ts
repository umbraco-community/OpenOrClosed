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
