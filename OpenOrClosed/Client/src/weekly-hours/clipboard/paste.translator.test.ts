import { describe, expect, it } from 'vitest';
import { createTestHost } from '../../clipboard/test-host.js';
import { wrapEntryValue } from '../../clipboard/entry-value.js';
import { OocWeeklyHoursClipboardPasteTranslator } from './paste.translator.js';
import type { HoursRange } from '../../timeline/time-range.js';

const translator = () => new OocWeeklyHoursClipboardPasteTranslator(createTestHost());

const range = (start: string, end: string): HoursRange =>
    ({ start, end, label: null, byAppointmentOnly: false });

describe('OocWeeklyHoursClipboardPasteTranslator', () => {
    it('returns the days the entry carries', async () => {
        const week = [{ day: 1, ranges: [range('09:00', '17:00')] }];

        await expect(translator().translate(wrapEntryValue(week))).resolves.toEqual(week);
    });

    it('keeps Sunday, which is day 0 and must not be treated as absent', async () => {
        const week = [{ day: 0, ranges: [range('10:00', '14:00')] }];

        await expect(translator().translate(wrapEntryValue(week))).resolves.toEqual(week);
    });

    it('drops a day whose ranges are all malformed', async () => {
        const week = [
            { day: 1, ranges: [{ start: 'nonsense', end: '17:00' }] },
            { day: 2, ranges: [range('09:00', '17:00')] },
        ];

        await expect(translator().translate(wrapEntryValue(week))).resolves.toEqual([
            { day: 2, ranges: [range('09:00', '17:00')] },
        ]);
    });

    it.each([
        ['a day above the week', 7],
        ['a negative day', -1],
        ['a fractional day', 1.5],
        ['a stringified day', '1'],
        ['a missing day', undefined],
    ])('drops %s', async (_label, day) => {
        const week = [{ day, ranges: [range('09:00', '17:00')] }];

        await expect(translator().translate(wrapEntryValue(week))).resolves.toEqual([]);
    });

    it('returns an empty week for a value that is not an array', async () => {
        await expect(translator().translate(wrapEntryValue({ day: 1 }))).resolves.toEqual([]);
    });

    it('rejects an unrecognised version', async () => {
        await expect(translator().translate({ version: 99, value: [] })).rejects.toThrow();
    });
});
