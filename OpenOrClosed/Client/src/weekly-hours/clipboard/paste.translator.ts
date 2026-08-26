import { UmbControllerBase } from '@umbraco-cms/backoffice/class-api';
import type { UmbClipboardPastePropertyValueTranslator } from '@umbraco-cms/backoffice/clipboard';
import { unwrapEntryValue, type OocClipboardEntryValue } from '../../clipboard/entry-value.js';
import { sanitizeRanges } from '../../timeline/time-range.js';
import type { WeeklyHoursDay } from '../ooc-weekly-hours.element.js';

/**
 * Unlike the fixed-week editors, weekly hours stores a sparse day list, so a malformed entry cannot
 * be repaired on load - an out-of-range `day` would render a row belonging to no weekday. Sanitising
 * here is therefore the translator's job. `sanitizeRanges` already takes `unknown` and coerces,
 * which is the right contract at a trust boundary: an entry may have been written by an older build.
 */
export class OocWeeklyHoursClipboardPasteTranslator
    extends UmbControllerBase
    implements UmbClipboardPastePropertyValueTranslator<OocClipboardEntryValue<unknown>, WeeklyHoursDay[]>
{
    async translate(entryValue: OocClipboardEntryValue<unknown>): Promise<WeeklyHoursDay[]> {
        const raw = unwrapEntryValue<unknown>(entryValue);
        if (!Array.isArray(raw)) return [];

        const week: WeeklyHoursDay[] = [];

        for (const entry of raw) {
            if (entry === null || typeof entry !== 'object') continue;

            // System.DayOfWeek, so Sunday is 0 - `!day` would silently drop it.
            const { day } = entry as { day?: unknown };
            if (!Number.isInteger(day) || (day as number) < 0 || (day as number) > 6) continue;

            const ranges = sanitizeRanges((entry as { ranges?: unknown }).ranges);
            if (ranges.length === 0) continue;

            week.push({ day: day as number, ranges });
        }

        return week;
    }
}

export { OocWeeklyHoursClipboardPasteTranslator as api };
