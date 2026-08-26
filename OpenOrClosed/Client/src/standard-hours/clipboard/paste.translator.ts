import { UmbControllerBase } from '@umbraco-cms/backoffice/class-api';
import type { UmbClipboardPastePropertyValueTranslator } from '@umbraco-cms/backoffice/clipboard';
import { unwrapEntryValue, type OocClipboardEntryValue } from '../../clipboard/entry-value.js';
import type { StandardDay } from '../ooc-property-editor-ui-standard-hours.element.js';

/**
 * Standard hours need no sanitising here. `translate` gets no config - only `isCompatibleValue`
 * does - and every config-dependent correction already lives in the element: `_initializeValue`
 * rebuilds a default week from a value that is not an array, trims eight rows to seven or extends
 * seven to eight from `showBankHolidays`, and re-labels the bank-holiday row.
 */
export class OocStandardHoursClipboardPasteTranslator
    extends UmbControllerBase
    implements UmbClipboardPastePropertyValueTranslator<OocClipboardEntryValue<StandardDay[]>, StandardDay[]>
{
    async translate(entryValue: OocClipboardEntryValue<StandardDay[]>): Promise<StandardDay[]> {
        return unwrapEntryValue<StandardDay[]>(entryValue);
    }
}

export { OocStandardHoursClipboardPasteTranslator as api };
