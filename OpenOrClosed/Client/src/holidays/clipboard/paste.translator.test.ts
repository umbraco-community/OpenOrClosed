import { describe, expect, it } from 'vitest';
import { createTestHost } from '../../clipboard/test-host.js';
import { wrapEntryValue } from '../../clipboard/entry-value.js';
import { OocHolidaysClipboardPasteTranslator } from './paste.translator.js';
import type { Holiday } from '../holiday.js';

const translator = () => new OocHolidaysClipboardPasteTranslator(createTestHost());

const holiday = (name: string, start: string, end: string): Holiday => ({
    name,
    start,
    end,
    repeatYearly: false,
    hoursMode: 'closed',
    hours: [],
});

describe('OocHolidaysClipboardPasteTranslator', () => {
    it('returns the schedule the entry carries', async () => {
        const schedule = {
            defaultHours: [],
            holidays: [holiday('Christmas Day', '2026-12-25', '2026-12-25')],
        };

        await expect(translator().translate(wrapEntryValue(schedule))).resolves.toEqual(schedule);
    });

    it('keeps an expired holiday - removeExpiredHolidays is a converter setting, not an editor one', async () => {
        const schedule = {
            defaultHours: [],
            holidays: [holiday('Old Bank Holiday', '2020-01-01', '2020-01-01')],
        };

        const pasted = await translator().translate(wrapEntryValue(schedule));

        expect(pasted.holidays).toHaveLength(1);
    });

    it('fills in a schedule missing its keys', async () => {
        await expect(translator().translate(wrapEntryValue({}))).resolves.toEqual({
            defaultHours: [],
            holidays: [],
        });
    });

    it('drops a holiday with an impossible date', async () => {
        const schedule = {
            defaultHours: [],
            holidays: [holiday('Not A Day', '2026-02-30', '2026-02-30')],
        };

        const pasted = await translator().translate(wrapEntryValue(schedule));

        expect(pasted.holidays).toEqual([]);
    });

    it('clones, so editing the pasted schedule does not reach the entry', async () => {
        const entry = wrapEntryValue({
            defaultHours: [],
            holidays: [holiday('Christmas Day', '2026-12-25', '2026-12-25')],
        });

        const pasted = await translator().translate(entry);
        pasted.holidays[0].name = 'changed';

        expect(entry.value.holidays[0].name).toBe('Christmas Day');
    });

    it('rejects an unrecognised version', async () => {
        await expect(translator().translate({ version: 99, value: {} })).rejects.toThrow();
    });
});
