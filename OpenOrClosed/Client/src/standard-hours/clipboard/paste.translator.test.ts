import { describe, expect, it } from 'vitest';
import { createTestHost } from '../../clipboard/test-host.js';
import { wrapEntryValue } from '../../clipboard/entry-value.js';
import { OocStandardHoursClipboardPasteTranslator } from './paste.translator.js';
import type { StandardDay } from '../ooc-property-editor-ui-standard-hours.element.js';

const translator = () => new OocStandardHoursClipboardPasteTranslator(createTestHost());

const day = (dayoftheweek: string, day: number | null): StandardDay => ({
    dayoftheweek,
    day,
    isOpen: true,
    openComment: '',
    closedComment: '',
    hoursOfBusiness: [{ opensAt: '09:00:00', closesAt: '17:00:00', comment: '' }],
});

describe('OocStandardHoursClipboardPasteTranslator', () => {
    it('returns the week the entry carries', async () => {
        const week = [day('Monday', 1), day('Tuesday', 2)];

        await expect(translator().translate(wrapEntryValue(week))).resolves.toEqual(week);
    });

    it('keeps an eight-row week intact - the element trims it from config, not the translator', async () => {
        const week = [day('Monday', 1), day('Bank Holidays', null)];

        const pasted = await translator().translate(wrapEntryValue(week));

        expect(pasted).toHaveLength(2);
        expect(pasted[1].dayoftheweek).toBe('Bank Holidays');
    });

    it('clones, so editing the pasted week does not reach the entry', async () => {
        const entry = wrapEntryValue([day('Monday', 1)]);

        const pasted = await translator().translate(entry);
        pasted[0].isOpen = false;

        expect(entry.value[0].isOpen).toBe(true);
    });

    it.each([
        ['an unrecognised version', { version: 99, value: [] }],
        ['a bare unwrapped week', [day('Monday', 1)]],
    ])('rejects %s', async (_label, entryValue) => {
        await expect(translator().translate(entryValue as never)).rejects.toThrow();
    });
});
