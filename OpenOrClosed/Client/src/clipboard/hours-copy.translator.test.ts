import { describe, expect, it } from 'vitest';
import { OOC_CLIPBOARD_ENTRY_VERSION } from './entry-value.js';
import { OocHoursClipboardCopyTranslator } from './hours-copy.translator.js';
import { createTestHost } from './test-host.js';

const translator = () => new OocHoursClipboardCopyTranslator(createTestHost());

describe('OocHoursClipboardCopyTranslator', () => {
    it('wraps an array property value', async () => {
        await expect(translator().translate([{ isOpen: true }])).resolves.toEqual({
            version: OOC_CLIPBOARD_ENTRY_VERSION,
            value: [{ isOpen: true }],
        });
    });

    it('wraps an object property value, as Holidays has', async () => {
        await expect(translator().translate({ defaultHours: [], holidays: [] })).resolves.toEqual({
            version: OOC_CLIPBOARD_ENTRY_VERSION,
            value: { defaultHours: [], holidays: [] },
        });
    });

    it('clones, so later edits in the editor do not reach the entry', async () => {
        const value = [{ isOpen: true }];
        const entry = await translator().translate(value);

        value[0].isOpen = false;

        expect((entry.value as Array<{ isOpen: boolean }>)[0].isOpen).toBe(true);
    });

    it.each([
        ['null', null],
        ['undefined', undefined],
    ])('rejects %s rather than writing an unusable entry', async (_label, value) => {
        await expect(translator().translate(value)).rejects.toThrow();
    });
});
