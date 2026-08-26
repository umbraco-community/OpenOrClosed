import { describe, expect, it } from 'vitest';
import {
    OOC_CLIPBOARD_ENTRY_VERSION,
    unwrapEntryValue,
    wrapEntryValue,
} from './entry-value.js';

describe('wrapEntryValue', () => {
    it('stamps the current entry version', () => {
        expect(wrapEntryValue([{ isOpen: true }])).toEqual({
            version: OOC_CLIPBOARD_ENTRY_VERSION,
            value: [{ isOpen: true }],
        });
    });

    it('clones deeply, so later edits to live editor state do not reach the entry', () => {
        const value = [{ hoursOfBusiness: [{ opensAt: '09:00:00' }] }];
        const entry = wrapEntryValue(value);

        value[0].hoursOfBusiness[0].opensAt = '11:00:00';

        expect(entry.value[0].hoursOfBusiness[0].opensAt).toBe('09:00:00');
    });
});

describe('unwrapEntryValue', () => {
    it('returns the inner value', () => {
        expect(unwrapEntryValue(wrapEntryValue(['monday']))).toEqual(['monday']);
    });

    it('clones deeply, so editing a pasted value does not reach the entry', () => {
        const entry = wrapEntryValue([{ isOpen: true }]);
        const unwrapped = unwrapEntryValue<Array<{ isOpen: boolean }>>(entry);

        unwrapped[0].isOpen = false;

        expect(entry.value[0].isOpen).toBe(true);
    });

    it.each([
        ['null', null],
        ['undefined', undefined],
        ['a string', 'openOrClosed.standardHours'],
        ['a bare unwrapped array', [{ isOpen: true }]],
        ['a missing version', { value: [] }],
        ['an older version', { version: 0, value: [] }],
        ['a newer version', { version: 2, value: [] }],
        ['a missing value', { version: OOC_CLIPBOARD_ENTRY_VERSION }],
        ['a null value', { version: OOC_CLIPBOARD_ENTRY_VERSION, value: null }],
    ])('throws for %s', (_label, entryValue) => {
        expect(() => unwrapEntryValue(entryValue)).toThrow();
    });
});
