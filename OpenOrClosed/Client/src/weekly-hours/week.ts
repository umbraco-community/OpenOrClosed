import { sanitizeRanges, type HoursRange } from '../timeline/time-range.js';

/**
 * One day of the week, exactly as it is persisted. The `day` values follow System.DayOfWeek, where
 * Sunday is 0.
 */
export interface WeeklyHoursDay {
    day: number;
    ranges: HoursRange[];
}

/**
 * The week after copying one day's hours onto others, sorted by day.
 *
 * The stored value is **sparse**: a day with no hours has no entry at all. So copying an *empty* day
 * has to remove each target's entry rather than write an empty array - a row carrying no usable day
 * is skipped on the server, which would lose the day silently rather than clear it.
 *
 * Ranges are deep-copied, or dragging Tuesday's block would move Monday's with it. Days not named as
 * targets are left exactly as they are, and a source listed among its own targets is ignored.
 */
export function copyRangesTo(
    week: WeeklyHoursDay[],
    sourceDay: number,
    targetDays: number[],
): WeeklyHoursDay[] {
    const targets = new Set(targetDays.filter((day) => day !== sourceDay));
    if (targets.size === 0) return week;

    const source = sanitizeRanges(week.find((entry) => entry.day === sourceDay)?.ranges);
    const kept = week.filter((entry) => !targets.has(entry.day));

    const copied =
        source.length === 0
            ? []
            : [...targets].map((day) => ({ day, ranges: source.map((range) => ({ ...range })) }));

    // Sorted so the result is deterministic. Nothing reads the order - the editor looks days up by
    // number - but a stable return is far easier to assert on.
    return [...kept, ...copied].sort((left, right) => left.day - right.day);
}
