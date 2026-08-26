import { describe, expect, it } from 'vitest';
import { createTestHost } from '../../clipboard/test-host.js';
import { wrapEntryValue } from '../../clipboard/entry-value.js';
import { OocSpecialHoursClipboardPasteTranslator } from './paste.translator.js';
import type { SpecialDay } from '../ooc-property-editor-ui-special-hours.element.js';

const translator = () => new OocSpecialHoursClipboardPasteTranslator(createTestHost());

const specialDay = (date: string | null): SpecialDay => ({
    date,
    isOpen: false,
    openComment: '',
    closedComment: 'Bank holiday',
    hoursOfBusiness: [],
});

/** Today and a date safely either side of it, so the suite never straddles midnight. */
const isoOffsetFromToday = (days: number): string => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const PAST = isoOffsetFromToday(-30);
const TODAY = isoOffsetFromToday(0);
const FUTURE = isoOffsetFromToday(30);

const removeOldDates = (value: boolean) => [{ alias: 'removeOldDates', value }];

describe('OocSpecialHoursClipboardPasteTranslator translate', () => {
    it('returns the dates the entry carries, past ones included - the element filters them', async () => {
        const days = [specialDay(PAST), specialDay(FUTURE)];

        await expect(translator().translate(wrapEntryValue(days))).resolves.toEqual(days);
    });

    it('clones, so editing the pasted dates does not reach the entry', async () => {
        const entry = wrapEntryValue([specialDay(FUTURE)]);

        const pasted = await translator().translate(entry);
        pasted[0].closedComment = 'changed';

        expect(entry.value[0].closedComment).toBe('Bank holiday');
    });

    it('rejects an unrecognised version', async () => {
        await expect(translator().translate({ version: 99, value: [] } as never)).rejects.toThrow();
    });
});

describe('OocSpecialHoursClipboardPasteTranslator isCompatibleValue', () => {
    it('accepts a future date when removeOldDates is on', async () => {
        await expect(
            translator().isCompatibleValue([specialDay(FUTURE)], removeOldDates(true)),
        ).resolves.toBe(true);
    });

    it("accepts today's date when removeOldDates is on", async () => {
        await expect(
            translator().isCompatibleValue([specialDay(TODAY)], removeOldDates(true)),
        ).resolves.toBe(true);
    });

    it('accepts a mixed entry when removeOldDates is on', async () => {
        await expect(
            translator().isCompatibleValue([specialDay(PAST), specialDay(FUTURE)], removeOldDates(true)),
        ).resolves.toBe(true);
    });

    it('rejects an all-past entry when removeOldDates is on, because the paste would do nothing', async () => {
        await expect(
            translator().isCompatibleValue([specialDay(PAST)], removeOldDates(true)),
        ).resolves.toBe(false);
    });

    it('rejects an empty entry when removeOldDates is on', async () => {
        await expect(translator().isCompatibleValue([], removeOldDates(true))).resolves.toBe(false);
    });

    it('accepts an all-past entry when removeOldDates is off', async () => {
        await expect(
            translator().isCompatibleValue([specialDay(PAST)], removeOldDates(false)),
        ).resolves.toBe(true);
    });

    it('treats the string "1" as on, as the config array delivers it', async () => {
        await expect(
            translator().isCompatibleValue([specialDay(PAST)], [{ alias: 'removeOldDates', value: '1' }]),
        ).resolves.toBe(false);
    });

    it('defaults removeOldDates to on when the setting is absent, matching the editor default', async () => {
        await expect(translator().isCompatibleValue([specialDay(PAST)], [])).resolves.toBe(false);
    });

    it('keeps a dated entry when the stored date carries a time', async () => {
        await expect(
            translator().isCompatibleValue([specialDay(`${FUTURE}T00:00:00`)], removeOldDates(true)),
        ).resolves.toBe(true);
    });

    it('keeps an entry with a null date, which the element leaves alone', async () => {
        await expect(
            translator().isCompatibleValue([specialDay(null)], removeOldDates(true)),
        ).resolves.toBe(true);
    });
});
