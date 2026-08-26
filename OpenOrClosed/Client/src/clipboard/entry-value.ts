/**
 * Clipboard entries sit in the browser's localStorage indefinitely, so each one records the shape
 * version that wrote it. A build that does not recognise a version declines the entry instead of
 * guessing: the paste action then surfaces the failure, rather than writing rubbish into a document.
 */
export const OOC_CLIPBOARD_ENTRY_VERSION = 1;

export interface OocClipboardEntryValue<T> {
    version: number;
    value: T;
}

/** Stamps and deep-clones a live property value, ready to be serialised into the clipboard. */
export function wrapEntryValue<T>(value: T): OocClipboardEntryValue<T> {
    return { version: OOC_CLIPBOARD_ENTRY_VERSION, value: structuredClone(value) };
}

/**
 * The inner value of an entry this build understands. Throws for anything else - including a bare
 * value written by a build that predates the wrapper.
 */
export function unwrapEntryValue<T>(entryValue: unknown): T {
    if (entryValue === null || typeof entryValue !== 'object' || Array.isArray(entryValue)) {
        throw new Error('Clipboard entry value is not an OpenOrClosed entry.');
    }

    const { version, value } = entryValue as Partial<OocClipboardEntryValue<T>>;

    if (version !== OOC_CLIPBOARD_ENTRY_VERSION) {
        throw new Error(`Unsupported OpenOrClosed clipboard entry version: ${String(version)}.`);
    }

    // The copy action refuses a falsy property value, so a written entry always has one. Missing
    // here means a corrupted entry, not an empty editor.
    if (value === undefined || value === null) {
        throw new Error('Clipboard entry value is empty.');
    }

    return structuredClone(value);
}
