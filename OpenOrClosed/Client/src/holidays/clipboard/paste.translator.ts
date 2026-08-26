import { UmbControllerBase } from '@umbraco-cms/backoffice/class-api';
import type { UmbClipboardPastePropertyValueTranslator } from '@umbraco-cms/backoffice/clipboard';
import { unwrapEntryValue, type OocClipboardEntryValue } from '../../clipboard/entry-value.js';
import { sanitizeSchedule, type HolidaySchedule } from '../holiday.js';

/**
 * The one object-valued editor. `sanitizeSchedule` already takes `unknown` and returns a well-formed
 * schedule, which is exactly the contract wanted here - a clipboard entry may have been written by
 * an older build of the package.
 *
 * Expired holidays are deliberately kept: `removeExpiredHolidays` governs the converted value and
 * the Delivery API, not the editor, so that a mistyped date can still be corrected.
 */
export class OocHolidaysClipboardPasteTranslator
    extends UmbControllerBase
    implements UmbClipboardPastePropertyValueTranslator<OocClipboardEntryValue<unknown>, HolidaySchedule>
{
    async translate(entryValue: OocClipboardEntryValue<unknown>): Promise<HolidaySchedule> {
        return sanitizeSchedule(unwrapEntryValue<unknown>(entryValue));
    }
}

export { OocHolidaysClipboardPasteTranslator as api };
