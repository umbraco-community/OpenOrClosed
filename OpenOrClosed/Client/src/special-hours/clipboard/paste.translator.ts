import { UmbControllerBase } from '@umbraco-cms/backoffice/class-api';
import type { UmbClipboardPastePropertyValueTranslator } from '@umbraco-cms/backoffice/clipboard';
import { unwrapEntryValue, type OocClipboardEntryValue } from '../../clipboard/entry-value.js';
import type { SpecialDay } from '../ooc-property-editor-ui-special-hours.element.js';

/** Umbraco hands a property editor its config as this array, values sometimes stringified. */
export type OocPropertyEditorConfig = Array<{ alias: string; value: unknown }>;

/** `YYYY-MM-DD` for today in the browser's own timezone. `new Date(iso)` would parse as UTC. */
function todayKey(): string {
    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** `YYYY-MM-DD` from a stored date, ignoring any time or timezone that came with it. */
function dateKey(date: string): string {
    return /^(\d{4})-(\d{2})-(\d{2})/.exec(date)?.[0] ?? '';
}

function readBoolean(config: OocPropertyEditorConfig, alias: string, fallback: boolean): boolean {
    const entry = config.find((item) => item.alias === alias);
    if (entry === undefined) return fallback;
    if (typeof entry.value === 'string') return entry.value === '1' || entry.value === 'true';
    return !!entry.value;
}

/**
 * Special hours need no sanitising in `translate`: it gets no config, and the element's
 * `_removeOldDates` already runs against the pasted value.
 *
 * `isCompatibleValue` earns its place though. With `removeOldDates` on, an entry whose dates are
 * all in the past pastes successfully and is then filtered away to nothing, so the editor watches
 * a paste do nothing at all. Better to hide the entry from the picker.
 */
export class OocSpecialHoursClipboardPasteTranslator
    extends UmbControllerBase
    implements
        UmbClipboardPastePropertyValueTranslator<
            OocClipboardEntryValue<SpecialDay[]>,
            SpecialDay[],
            OocPropertyEditorConfig
        >
{
    async translate(entryValue: OocClipboardEntryValue<SpecialDay[]>): Promise<SpecialDay[]> {
        return unwrapEntryValue<SpecialDay[]>(entryValue);
    }

    async isCompatibleValue(
        propertyValue: SpecialDay[],
        config: OocPropertyEditorConfig,
    ): Promise<boolean> {
        // `removeOldDates` defaults to true in the data type's defaultData, so an absent setting is on.
        if (!readBoolean(config ?? [], 'removeOldDates', true)) return true;

        const today = todayKey();

        return (propertyValue ?? []).some((day) => !day.date || dateKey(day.date) >= today);
    }
}

export { OocSpecialHoursClipboardPasteTranslator as api };
