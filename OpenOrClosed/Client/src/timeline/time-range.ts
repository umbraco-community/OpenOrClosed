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
