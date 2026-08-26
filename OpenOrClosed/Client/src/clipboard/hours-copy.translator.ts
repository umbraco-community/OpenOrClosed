import { UmbControllerBase } from '@umbraco-cms/backoffice/class-api';
import type { UmbClipboardCopyPropertyValueTranslator } from '@umbraco-cms/backoffice/clipboard';
import { wrapEntryValue, type OocClipboardEntryValue } from './entry-value.js';

/**
 * Every OpenOrClosed editor copies the same way: stamp the value with the entry version and clone
 * it. The entry value type is not this class's business - the manifest's `toClipboardEntryValueType`
 * supplies it - so one translator is registered for all four editors.
 */
export class OocHoursClipboardCopyTranslator
    extends UmbControllerBase
    implements UmbClipboardCopyPropertyValueTranslator<unknown, OocClipboardEntryValue<unknown>>
{
    async translate(propertyValue: unknown): Promise<OocClipboardEntryValue<unknown>> {
        if (propertyValue === undefined || propertyValue === null) {
            throw new Error('Property value is missing.');
        }

        return wrapEntryValue(propertyValue);
    }
}

export { OocHoursClipboardCopyTranslator as api };
