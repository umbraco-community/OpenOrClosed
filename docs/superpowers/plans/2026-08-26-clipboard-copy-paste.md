# Clipboard copy/paste Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give all four OpenOrClosed property editors Umbraco's native clipboard copy and paste (replace), so opening hours can be copied from one content node and pasted onto another.

**Architecture:** Umbraco 17.1's clipboard is opt-in per property editor: register a `propertyContext` of kind `clipboard`, two `propertyAction`s of kinds `copyToClipboard` and `pasteFromClipboard`, and a pair of value translators. All four editors register the identical set, so a factory emits it from `(uiAlias, entryValueType, pasteTranslatorAlias)`. Copy is one shared translator that stamps a version onto a deep clone; paste is one thin translator per editor that unwraps and sanitises. No C# changes and no new localisation keys.

**Tech Stack:** TypeScript 5.8, Lit 3, vitest 3 (node environment), `@umbraco-cms/backoffice` 17.1 as a peer dependency.

**Spec:** `docs/superpowers/specs/2026-08-26-clipboard-copy-paste-design.md`

## Global Constraints

- Work in `OpenOrClosed/Client/`. All paths below are relative to that directory unless stated otherwise.
- **No C# changes.** Both editors are already `ValueTypes.Json` with a `propertyEditorSchemaAlias`, which is all the clipboard needs.
- **No new localisation keys.** The `copyToClipboard` and `pasteFromClipboard` kinds carry their own icon and label ("Copy", "Replace") from core.
- Run tests with `npx vitest run <path>` for one file, `npm test` for all. Test files are `src/**/*.test.ts`, colocated with the code, and run in vitest's **node** environment — no DOM.
- Import sibling modules with the `.js` extension (`./entry-value.js`), matching every existing file.
- `tsconfig.json` sets `strict`, `noUnusedLocals`, `noUnusedParameters` and `verbatimModuleSyntax`. Prefix deliberately unused parameters with `_`, and use `import type` for type-only imports.
- Final gate before the last commit: `npm run build` (runs `tsc && vite build`).
- Entry value type strings, verbatim:
  - `openOrClosed.standardHours`
  - `openOrClosed.specialHours`
  - `openOrClosed.weeklyHours`
  - `openOrClosed.holidays`
- Entry shape version: `1`.
- These import paths are all verified to resolve and typecheck: `@umbraco-cms/backoffice/class-api` (`UmbControllerBase`), `@umbraco-cms/backoffice/controller-api` (`UmbControllerHost`), `@umbraco-cms/backoffice/clipboard` (both translator interfaces, type-only), `@umbraco-cms/backoffice/property` (both condition aliases).
- Manifest interfaces are declared into the global `UmbExtensionManifestMap` by the backoffice package. Keep the existing `Array<UmbExtensionManifest>` annotation and import nothing for it.
- Property editor UI aliases, verbatim: `OpenOrClosed.PropertyEditorUi.StandardHours`, `OpenOrClosed.PropertyEditorUi.SpecialHours`, `OpenOrClosed.PropertyEditorUi.WeeklyHours`, `OpenOrClosed.PropertyEditorUi.Holidays`.

---

### Task 1: Versioned clipboard entry wrapper

Clipboard entries live in the browser's `localStorage` indefinitely, so every entry carries the shape version that wrote it. A build that does not recognise a version must decline the entry rather than guess — a wrong guess writes rubbish into a document. Everything else in this plan depends on this module, so it goes first.

**Files:**
- Create: `src/clipboard/constants.ts`
- Create: `src/clipboard/entry-value.ts`
- Test: `src/clipboard/entry-value.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `OOC_STANDARD_HOURS_CLIPBOARD_ENTRY_VALUE_TYPE`, `OOC_SPECIAL_HOURS_CLIPBOARD_ENTRY_VALUE_TYPE`, `OOC_WEEKLY_HOURS_CLIPBOARD_ENTRY_VALUE_TYPE`, `OOC_HOLIDAYS_CLIPBOARD_ENTRY_VALUE_TYPE` — `const` strings.
  - `OOC_CLIPBOARD_ENTRY_VERSION: number`
  - `interface OocClipboardEntryValue<T> { version: number; value: T }`
  - `wrapEntryValue<T>(value: T): OocClipboardEntryValue<T>`
  - `unwrapEntryValue<T>(entryValue: unknown): T`

- [ ] **Step 1: Write the entry value type constants**

`src/clipboard/constants.ts`:

```ts
/**
 * One clipboard entry value type per editor. The type string is the whole compatibility contract:
 * because Standard and Weekly hours do not share one, a weekly value can never reach a date-keyed
 * editor and no translator has to check for it.
 */
export const OOC_STANDARD_HOURS_CLIPBOARD_ENTRY_VALUE_TYPE = 'openOrClosed.standardHours';
export const OOC_SPECIAL_HOURS_CLIPBOARD_ENTRY_VALUE_TYPE = 'openOrClosed.specialHours';
export const OOC_WEEKLY_HOURS_CLIPBOARD_ENTRY_VALUE_TYPE = 'openOrClosed.weeklyHours';
export const OOC_HOLIDAYS_CLIPBOARD_ENTRY_VALUE_TYPE = 'openOrClosed.holidays';
```

- [ ] **Step 2: Write the failing test**

`src/clipboard/entry-value.test.ts`:

```ts
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/clipboard/entry-value.test.ts`
Expected: FAIL — `Failed to resolve import "./entry-value.js"`.

- [ ] **Step 4: Write the implementation**

`src/clipboard/entry-value.ts`:

```ts
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/clipboard/entry-value.test.ts`
Expected: PASS — 13 tests (4 named, plus 9 from the `it.each`).

- [ ] **Step 6: Commit**

```bash
git add src/clipboard/constants.ts src/clipboard/entry-value.ts src/clipboard/entry-value.test.ts
git commit -m "feat: versioned clipboard entry wrapper for the hours editors"
```

---

### Task 2: Shared copy translator

Every editor copies the same way, and the translator never needs to know its own entry value type — the manifest's `toClipboardEntryValueType` supplies it. So one class serves all four. A copy translator is **not** optional: `UmbClipboardCopyPropertyValueTranslatorValueResolver.resolve` throws `No clipboard copy translators found.` when no manifest matches the editor, so registering the actions without one gives an action that only errors.

**Files:**
- Create: `src/clipboard/test-host.ts`
- Create: `src/clipboard/hours-copy.translator.ts`
- Test: `src/clipboard/hours-copy.translator.test.ts`

**Interfaces:**
- Consumes: `wrapEntryValue`, `OocClipboardEntryValue` from Task 1.
- Produces:
  - `createTestHost(): UmbControllerHost` — the stub host every translator test uses to construct a controller outside the backoffice.
  - `class OocHoursClipboardCopyTranslator` with `translate(propertyValue: unknown): Promise<OocClipboardEntryValue<unknown>>`, also exported as `api`.

- [ ] **Step 1: Write the test host helper**

`src/clipboard/test-host.ts`:

```ts
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';

/**
 * The least a controller needs to be constructed outside the backoffice. The translators only ever
 * touch their own argument - they consume no contexts - so none of this has to do real work.
 */
export function createTestHost(): UmbControllerHost {
    return {
        addUmbController() {},
        removeUmbController() {},
        getHostElement: () => undefined,
    } as unknown as UmbControllerHost;
}
```

- [ ] **Step 2: Write the failing test**

`src/clipboard/hours-copy.translator.test.ts`:

```ts
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/clipboard/hours-copy.translator.test.ts`
Expected: FAIL — `Failed to resolve import "./hours-copy.translator.js"`.

- [ ] **Step 4: Write the implementation**

`src/clipboard/hours-copy.translator.ts`:

```ts
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/clipboard/hours-copy.translator.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 6: Commit**

```bash
git add src/clipboard/test-host.ts src/clipboard/hours-copy.translator.ts src/clipboard/hours-copy.translator.test.ts
git commit -m "feat: shared clipboard copy translator for the hours editors"
```

---

### Task 3: Manifest factory and Standard Business Hours end to end

The first editor through, so the factory gets proven against a real registration before it is repeated three times. Standard Hours needs no sanitising of its own: `_initializeValue` in `ooc-property-editor-ui-standard-hours.element.ts` already rebuilds a default week when the value is not an array, slices 8 rows to 7 or extends 7 to 8 from `showBankHolidays`, and re-labels the bank-holiday row from config. That is why `translate` is an unwrap and nothing more.

**Files:**
- Create: `src/clipboard/manifest-factory.ts`
- Create: `src/standard-hours/clipboard/paste.translator.ts`
- Test: `src/standard-hours/clipboard/paste.translator.test.ts`
- Modify: `src/standard-hours/ooc-property-editor-ui-standard-hours.element.ts` — export the `StandardDay` interface (line 5, currently unexported)
- Modify: `src/standard-hours/manifest.ts` — spread the factory output

**Interfaces:**
- Consumes: `OocClipboardEntryValue`, `unwrapEntryValue` (Task 1); `createTestHost` (Task 2); `OOC_STANDARD_HOURS_CLIPBOARD_ENTRY_VALUE_TYPE` (Task 1).
- Produces:
  - `oocClipboardManifests(args: OocClipboardManifestArgs): Array<UmbExtensionManifest>` where
    ```ts
    interface OocClipboardManifestArgs {
        editorName: string;        // e.g. 'Standard Business Hours' - used in manifest names only
        aliasSegment: string;      // e.g. 'StandardHours' - used to build manifest aliases
        propertyEditorUiAlias: string;
        entryValueType: string;
        pasteTranslatorApi: () => Promise<unknown>;
    }
    ```
  - `export type StandardDay` from the standard hours element.
  - `class OocStandardHoursClipboardPasteTranslator` with `translate(entryValue: OocClipboardEntryValue<StandardDay[]>): Promise<StandardDay[]>`, also exported as `api`.

- [ ] **Step 1: Write the manifest factory**

`src/clipboard/manifest-factory.ts`:

```ts
import {
    UMB_PROPERTY_HAS_VALUE_CONDITION_ALIAS,
    UMB_WRITABLE_PROPERTY_CONDITION_ALIAS,
} from '@umbraco-cms/backoffice/property';

export interface OocClipboardManifestArgs {
    /** Human-readable editor name, for the manifest `name` fields only. */
    editorName: string;
    /** PascalCase segment that builds the manifest aliases, e.g. `StandardHours`. */
    aliasSegment: string;
    propertyEditorUiAlias: string;
    entryValueType: string;
    pasteTranslatorApi: () => Promise<unknown>;
}

/**
 * The five manifests that opt one property editor into Umbraco's property clipboard, matching what
 * core's Block List registers. All four OpenOrClosed editors need exactly this set, differing only
 * in their aliases and entry value type.
 *
 * The copy translator is shared by every editor; the paste translator is per editor, because each
 * sanitises its own shape.
 */
export function oocClipboardManifests(args: OocClipboardManifestArgs): Array<UmbExtensionManifest> {
    const forPropertyEditorUis = [args.propertyEditorUiAlias];

    return [
        {
            type: 'propertyContext',
            kind: 'clipboard',
            alias: `OpenOrClosed.PropertyContext.${args.aliasSegment}.Clipboard`,
            name: `${args.editorName} Clipboard Property Context`,
            forPropertyEditorUis,
        },
        {
            type: 'propertyAction',
            kind: 'copyToClipboard',
            alias: `OpenOrClosed.PropertyAction.${args.aliasSegment}.Clipboard.Copy`,
            name: `${args.editorName} Copy To Clipboard Property Action`,
            forPropertyEditorUis,
            conditions: [{ alias: UMB_PROPERTY_HAS_VALUE_CONDITION_ALIAS }],
        },
        {
            type: 'propertyAction',
            kind: 'pasteFromClipboard',
            alias: `OpenOrClosed.PropertyAction.${args.aliasSegment}.Clipboard.Paste`,
            name: `${args.editorName} Paste From Clipboard Property Action`,
            forPropertyEditorUis,
            conditions: [{ alias: UMB_WRITABLE_PROPERTY_CONDITION_ALIAS }],
        },
        {
            type: 'clipboardCopyPropertyValueTranslator',
            alias: `OpenOrClosed.ClipboardCopyPropertyValueTranslator.${args.aliasSegment}`,
            name: `${args.editorName} Clipboard Copy Property Value Translator`,
            api: () => import('./hours-copy.translator.js'),
            fromPropertyEditorUi: args.propertyEditorUiAlias,
            toClipboardEntryValueType: args.entryValueType,
        },
        {
            type: 'clipboardPastePropertyValueTranslator',
            alias: `OpenOrClosed.ClipboardPastePropertyValueTranslator.${args.aliasSegment}`,
            name: `${args.editorName} Clipboard Paste Property Value Translator`,
            api: args.pasteTranslatorApi,
            fromClipboardEntryValueType: args.entryValueType,
            toPropertyEditorUi: args.propertyEditorUiAlias,
        },
    ];
}
```

- [ ] **Step 2: Export the `StandardDay` type**

In `src/standard-hours/ooc-property-editor-ui-standard-hours.element.ts`, change line 5 from `interface StandardDay extends BaseDayInterface {` to `export interface StandardDay extends BaseDayInterface {`. Nothing else in the file changes — `import type` is erased under `verbatimModuleSyntax`, so importing this type pulls in no custom-element registration.

- [ ] **Step 3: Write the failing test**

`src/standard-hours/clipboard/paste.translator.test.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run src/standard-hours/clipboard/paste.translator.test.ts`
Expected: FAIL — `Failed to resolve import "./paste.translator.js"`.

- [ ] **Step 5: Write the implementation**

`src/standard-hours/clipboard/paste.translator.ts`:

```ts
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
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/standard-hours/clipboard/paste.translator.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 7: Wire the manifests**

In `src/standard-hours/manifest.ts`, add the imports at the top of the file and spread the factory output into the exported array. The file currently exports a single-element array; it becomes:

```ts
import { oocClipboardManifests } from '../clipboard/manifest-factory.js';
import { OOC_STANDARD_HOURS_CLIPBOARD_ENTRY_VALUE_TYPE } from '../clipboard/constants.js';

export const manifests: Array<UmbExtensionManifest> = [
	{
		type: 'propertyEditorUi',
		alias: 'OpenOrClosed.PropertyEditorUi.StandardHours',
		// ... the existing manifest is untouched ...
	},
	...oocClipboardManifests({
		editorName: 'Standard Business Hours',
		aliasSegment: 'StandardHours',
		propertyEditorUiAlias: 'OpenOrClosed.PropertyEditorUi.StandardHours',
		entryValueType: OOC_STANDARD_HOURS_CLIPBOARD_ENTRY_VALUE_TYPE,
		pasteTranslatorApi: () => import('./clipboard/paste.translator.js'),
	}),
];
```

`bundle.manifests.ts` needs no change — it already spreads `standardHours`.

- [ ] **Step 8: Typecheck and run the whole suite**

Run: `npx tsc --noEmit && npm test`
Expected: tsc silent; all tests pass, including the pre-existing ones.

- [ ] **Step 9: Commit**

```bash
git add src/clipboard/manifest-factory.ts src/standard-hours/
git commit -m "feat: clipboard copy/paste on the Standard Business Hours editor"
```

---

### Task 4: Special Business Hours

The only editor with an `isCompatibleValue`, and the reason it exists is concrete: with `removeOldDates` on, pasting an entry whose dates are all in the past succeeds and then `_removeOldDates` immediately filters everything out, so the editor watches a paste do nothing. The guard hides such an entry from the picker instead.

Dates are compared as calendar dates against the browser's own today, not UTC — `new Date('2026-08-19')` parses as UTC midnight, which drops today's entry in negative UTC offsets. `_removeOldDates` in the element already carries a comment about exactly this. Reuse that approach rather than inventing another.

`config` arrives as Umbraco's array form, `Array<{ alias: string; value: unknown }>` — the same shape `_mergeConfig` reads in `shared/business-hours-base.element.ts`, including the string `'1'`/`'0'` booleans it has to coerce.

**Files:**
- Create: `src/special-hours/clipboard/paste.translator.ts`
- Test: `src/special-hours/clipboard/paste.translator.test.ts`
- Modify: `src/special-hours/ooc-property-editor-ui-special-hours.element.ts` — export the `SpecialDay` interface (line 6)
- Modify: `src/special-hours/manifest.ts`

**Interfaces:**
- Consumes: `unwrapEntryValue`, `OocClipboardEntryValue`, `OOC_SPECIAL_HOURS_CLIPBOARD_ENTRY_VALUE_TYPE` (Task 1); `createTestHost` (Task 2); `oocClipboardManifests` (Task 3).
- Produces:
  - `export type SpecialDay` from the special hours element.
  - `class OocSpecialHoursClipboardPasteTranslator` with `translate(entryValue: OocClipboardEntryValue<SpecialDay[]>): Promise<SpecialDay[]>` and `isCompatibleValue(propertyValue: SpecialDay[], config: OocPropertyEditorConfig): Promise<boolean>`, also exported as `api`.
  - `type OocPropertyEditorConfig = Array<{ alias: string; value: unknown }>`, exported because it appears in `isCompatibleValue`'s public signature.

- [ ] **Step 1: Export the `SpecialDay` type**

In `src/special-hours/ooc-property-editor-ui-special-hours.element.ts`, change line 6 from `interface SpecialDay extends BaseDayInterface {` to `export interface SpecialDay extends BaseDayInterface {`.

- [ ] **Step 2: Write the failing test**

`src/special-hours/clipboard/paste.translator.test.ts`:

```ts
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/special-hours/clipboard/paste.translator.test.ts`
Expected: FAIL — `Failed to resolve import "./paste.translator.js"`.

- [ ] **Step 4: Write the implementation**

`src/special-hours/clipboard/paste.translator.ts`:

```ts
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/special-hours/clipboard/paste.translator.test.ts`
Expected: PASS — 13 tests.

- [ ] **Step 6: Wire the manifests**

In `src/special-hours/manifest.ts`, add the two imports and spread the factory output after the existing `propertyEditorUi` manifest:

```ts
import { oocClipboardManifests } from '../clipboard/manifest-factory.js';
import { OOC_SPECIAL_HOURS_CLIPBOARD_ENTRY_VALUE_TYPE } from '../clipboard/constants.js';

// ... existing propertyEditorUi manifest ...
	...oocClipboardManifests({
		editorName: 'Special Business Hours',
		aliasSegment: 'SpecialHours',
		propertyEditorUiAlias: 'OpenOrClosed.PropertyEditorUi.SpecialHours',
		entryValueType: OOC_SPECIAL_HOURS_CLIPBOARD_ENTRY_VALUE_TYPE,
		pasteTranslatorApi: () => import('./clipboard/paste.translator.js'),
	}),
```

- [ ] **Step 7: Typecheck and run the whole suite**

Run: `npx tsc --noEmit && npm test`
Expected: tsc silent; all tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/special-hours/
git commit -m "feat: clipboard copy/paste on the Special Business Hours editor"
```

---

### Task 5: Weekly Hours

Weekly Hours stores a sparse `{ day, ranges }` list rather than a fixed week, so a malformed entry cannot be repaired by the element the way a Standard Hours week can — an out-of-range `day` would render a row that maps to no weekday. This translator therefore does sanitise, reusing `sanitizeRanges` from `timeline/time-range.ts`, which already takes `unknown` and coerces.

**Files:**
- Create: `src/weekly-hours/clipboard/paste.translator.ts`
- Test: `src/weekly-hours/clipboard/paste.translator.test.ts`
- Modify: `src/weekly-hours/ooc-weekly-hours.element.ts` — export the `WeeklyHoursDay` interface (line 19)
- Modify: `src/weekly-hours/manifest.ts`

**Interfaces:**
- Consumes: `unwrapEntryValue`, `OocClipboardEntryValue`, `OOC_WEEKLY_HOURS_CLIPBOARD_ENTRY_VALUE_TYPE` (Task 1); `createTestHost` (Task 2); `oocClipboardManifests` (Task 3); `sanitizeRanges` from `src/timeline/time-range.ts`.
- Produces:
  - `export type WeeklyHoursDay` from the weekly hours element.
  - `class OocWeeklyHoursClipboardPasteTranslator` with `translate(entryValue: OocClipboardEntryValue<unknown>): Promise<WeeklyHoursDay[]>`, also exported as `api`.

- [ ] **Step 1: Export the `WeeklyHoursDay` type**

In `src/weekly-hours/ooc-weekly-hours.element.ts`, change line 19 from `interface WeeklyHoursDay {` to `export interface WeeklyHoursDay {`.

- [ ] **Step 2: Write the failing test**

`src/weekly-hours/clipboard/paste.translator.test.ts`:

```ts
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/weekly-hours/clipboard/paste.translator.test.ts`
Expected: FAIL — `Failed to resolve import "./paste.translator.js"`.

- [ ] **Step 4: Write the implementation**

`src/weekly-hours/clipboard/paste.translator.ts`:

```ts
import { UmbControllerBase } from '@umbraco-cms/backoffice/class-api';
import type { UmbClipboardPastePropertyValueTranslator } from '@umbraco-cms/backoffice/clipboard';
import { unwrapEntryValue, type OocClipboardEntryValue } from '../../clipboard/entry-value.js';
import { sanitizeRanges } from '../../timeline/time-range.js';
import type { WeeklyHoursDay } from '../ooc-weekly-hours.element.js';

/**
 * Unlike the fixed-week editors, weekly hours stores a sparse day list, so a malformed entry cannot
 * be repaired on load - an out-of-range `day` would render a row belonging to no weekday. Sanitising
 * here is therefore the translator's job. `sanitizeRanges` already takes `unknown` and coerces,
 * which is the right contract at a trust boundary: an entry may have been written by an older build.
 */
export class OocWeeklyHoursClipboardPasteTranslator
    extends UmbControllerBase
    implements UmbClipboardPastePropertyValueTranslator<OocClipboardEntryValue<unknown>, WeeklyHoursDay[]>
{
    async translate(entryValue: OocClipboardEntryValue<unknown>): Promise<WeeklyHoursDay[]> {
        const raw = unwrapEntryValue<unknown>(entryValue);
        if (!Array.isArray(raw)) return [];

        const week: WeeklyHoursDay[] = [];

        for (const entry of raw) {
            if (entry === null || typeof entry !== 'object') continue;

            // System.DayOfWeek, so Sunday is 0 - `!day` would silently drop it.
            const { day } = entry as { day?: unknown };
            if (!Number.isInteger(day) || (day as number) < 0 || (day as number) > 6) continue;

            const ranges = sanitizeRanges((entry as { ranges?: unknown }).ranges);
            if (ranges.length === 0) continue;

            week.push({ day: day as number, ranges });
        }

        return week;
    }
}

export { OocWeeklyHoursClipboardPasteTranslator as api };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/weekly-hours/clipboard/paste.translator.test.ts`
Expected: PASS — 10 tests.

- [ ] **Step 6: Wire the manifests**

In `src/weekly-hours/manifest.ts`, add the two imports and spread the factory output after the existing `propertyEditorUi` manifest:

```ts
import { oocClipboardManifests } from '../clipboard/manifest-factory.js';
import { OOC_WEEKLY_HOURS_CLIPBOARD_ENTRY_VALUE_TYPE } from '../clipboard/constants.js';

// ... existing propertyEditorUi manifest ...
        ...oocClipboardManifests({
            editorName: 'Weekly Hours',
            aliasSegment: 'WeeklyHours',
            propertyEditorUiAlias: 'OpenOrClosed.PropertyEditorUi.WeeklyHours',
            entryValueType: OOC_WEEKLY_HOURS_CLIPBOARD_ENTRY_VALUE_TYPE,
            pasteTranslatorApi: () => import('./clipboard/paste.translator.js'),
        }),
```

- [ ] **Step 7: Typecheck and run the whole suite**

Run: `npx tsc --noEmit && npm test`
Expected: tsc silent; all tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/weekly-hours/
git commit -m "feat: clipboard copy/paste on the Weekly Hours editor"
```

---

### Task 6: Holidays

The only object-valued editor: `{ defaultHours, holidays }`. `sanitizeSchedule` in `holidays/holiday.ts` already takes `unknown` and returns a well-formed schedule, so this translator is the thinnest of the four.

It deliberately does **not** drop expired holidays. `removeExpiredHolidays` affects the converted value and the Delivery API, not the editor — precisely so a mistyped date can still be corrected — and a paste that filtered them would contradict that.

**Files:**
- Create: `src/holidays/clipboard/paste.translator.ts`
- Test: `src/holidays/clipboard/paste.translator.test.ts`
- Modify: `src/holidays/manifest.ts`

**Interfaces:**
- Consumes: `unwrapEntryValue`, `OocClipboardEntryValue`, `OOC_HOLIDAYS_CLIPBOARD_ENTRY_VALUE_TYPE` (Task 1); `createTestHost` (Task 2); `oocClipboardManifests` (Task 3); `sanitizeSchedule` and `HolidaySchedule` from `src/holidays/holiday.ts` (both already exported).
- Produces: `class OocHolidaysClipboardPasteTranslator` with `translate(entryValue: OocClipboardEntryValue<unknown>): Promise<HolidaySchedule>`, also exported as `api`.

- [ ] **Step 1: Write the failing test**

`src/holidays/clipboard/paste.translator.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/holidays/clipboard/paste.translator.test.ts`
Expected: FAIL — `Failed to resolve import "./paste.translator.js"`.

- [ ] **Step 3: Write the implementation**

`src/holidays/clipboard/paste.translator.ts`:

```ts
import { UmbControllerBase } from '@umbraco-cms/backoffice/class-api';
import type { UmbClipboardPastePropertyValueTranslator } from '@umbraco-cms/backoffice/clipboard';
import { unwrapEntryValue, type OocClipboardEntryValue } from '../../clipboard/entry-value.js';
import { sanitizeSchedule, type HolidaySchedule } from '../holiday.js';

/**
 * The one object-valued editor. `sanitizeSchedule` already takes `unknown` and returns a well-formed
 * schedule, which is exactly the contract wanted here - a clipboard entry may have been written by
 * an older build of the package.
 *
 * Expired holidays are deliberately kept: `removeExpiredHolidays` governs the converted value and
 * the Delivery API, not the editor, so that a mistyped date can still be corrected.
 */
export class OocHolidaysClipboardPasteTranslator
    extends UmbControllerBase
    implements UmbClipboardPastePropertyValueTranslator<OocClipboardEntryValue<unknown>, HolidaySchedule>
{
    async translate(entryValue: OocClipboardEntryValue<unknown>): Promise<HolidaySchedule> {
        return sanitizeSchedule(unwrapEntryValue<unknown>(entryValue));
    }
}

export { OocHolidaysClipboardPasteTranslator as api };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/holidays/clipboard/paste.translator.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Wire the manifests**

In `src/holidays/manifest.ts`, add the two imports and spread the factory output after the existing `propertyEditorUi` manifest:

```ts
import { oocClipboardManifests } from '../clipboard/manifest-factory.js';
import { OOC_HOLIDAYS_CLIPBOARD_ENTRY_VALUE_TYPE } from '../clipboard/constants.js';

// ... existing propertyEditorUi manifest ...
        ...oocClipboardManifests({
            editorName: 'Holidays',
            aliasSegment: 'Holidays',
            propertyEditorUiAlias: 'OpenOrClosed.PropertyEditorUi.Holidays',
            entryValueType: OOC_HOLIDAYS_CLIPBOARD_ENTRY_VALUE_TYPE,
            pasteTranslatorApi: () => import('./clipboard/paste.translator.js'),
        }),
```

- [ ] **Step 6: Build and run the whole suite**

Run: `npm run build && npm test`
Expected: `tsc` silent, vite build writes to `../wwwroot/App_Plugins/OpenOrClosed`, all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/holidays/
git commit -m "feat: clipboard copy/paste on the Holidays editor"
```

---

### Task 7: Manual checklist, README and changelog

Unit tests cannot reach the part that matters most: whether a pasted value loads clean, or leaves the document *dirty* so the backoffice offers "Discard unsaved changes" on navigate-away. This checklist is written from the spec rather than from this plan, deliberately — a checklist derived from a plan cannot catch what the plan omitted.

**Files:**
- Create: `docs/superpowers/plans/2026-08-26-clipboard-copy-paste-checklist.md` (repository root, not `Client/`)
- Modify: `README.md` (repository root) — feature note and changelog line

**Interfaces:**
- Consumes: everything above.
- Produces: nothing further depends on this task.

- [ ] **Step 1: Write the manual checklist**

Create `docs/superpowers/plans/2026-08-26-clipboard-copy-paste-checklist.md` with a heading, a note that it is run against a real backoffice with at least two content nodes sharing the same document type, and these items as unchecked boxes:

1. Copy on node A, paste on node B — for each of Standard Business Hours, Special Business Hours, Weekly Hours and Holidays.
2. Paste into an empty property — no confirm dialog appears, the value lands.
3. Paste into a property that already has a value — the confirm dialog names the clipboard entry; cancelling changes nothing.
4. The Copy action is absent on an empty property (the `HasValue` condition), and the Paste action is absent on a read-only property (the `Writable` condition).
5. Standard Hours copied from a data type with bank holidays, pasted into one without — 8 rows become 7, with no orphan row.
6. The reverse — 7 rows become 8, with a correctly labelled bank-holiday row.
7. A Special Hours entry containing only past dates, pasted into an editor with `removeOldDates` on — the entry does not appear in the picker at all.
8. A Special Hours entry with mixed past and future dates — past ones are dropped after paste, future ones survive.
9. A culture-variant property: copy on one culture, paste on another.
10. Save and reload after **every** paste above; then publish and confirm the front-end value converter output is unchanged in shape. A pasted value that loads dirty, or that the converter reads differently from a hand-entered one, is the failure this whole checklist exists to catch.
11. Clipboard entry names read `<Node name> - <Property label>`.
12. Weekly Hours copied from a node, pasted into a node whose editor has a different `time_24hr` setting — times render in the target's format, values unchanged.

- [ ] **Step 2: Add the README feature note and changelog line**

In `README.md`, add clipboard copy/paste to the feature description for the property editors, and add a changelog line recording that all four editors now support Umbraco's property clipboard, with copy and replace-paste. Note explicitly that the clipboard is per-browser `localStorage` and that pasting is one node at a time — there is no bulk apply — so the README does not promise what issue #77 assumed.

- [ ] **Step 3: Run the checklist**

Work through every item against a real backoffice. Tick each box. If an item fails, stop and fix it before continuing — do not tick and carry on.

- [ ] **Step 4: Record the result**

Add a line at the top of the checklist stating the date it was run and whether it came back clean, matching how `2026-08-20-timeline-hours-editor-phase-2-checklist.md` records its passes.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/plans/2026-08-26-clipboard-copy-paste-checklist.md README.md
git commit -m "docs: manual checklist and README note for clipboard copy/paste"
```

---

## Self-review notes

Checked against the spec:

- **Spec coverage** — every spec section maps to a task. The five manifests → Task 3's factory. The wrapper and version → Task 1. One shared copy translator → Task 2. The four paste translators, including the Special Hours `isCompatibleValue` and the two reused sanitisers → Tasks 3–6. Testing section → the test steps in Tasks 1–6 plus Task 7's checklist. README/changelog → Task 7. The spec's *Deferred: merge/append* section is deliberately unimplemented; nothing in this plan touches it.
- **Type consistency** — `OocClipboardEntryValue<T>`, `wrapEntryValue`, `unwrapEntryValue`, `createTestHost`, `oocClipboardManifests` and `OocClipboardManifestArgs` are used with the same names and signatures in every task that consumes them. The four `api` exports each live in their own module, which is what the extension loader requires.
- **Verified against the real packages** — every import path in this plan (`class-api`, `controller-api`, `clipboard`, `property`), both condition alias constants, the `implements` clauses against `UmbControllerBase`, and all five manifest shapes were compiled with `tsc --noEmit` before this plan was written. `UmbControllerBase` was also confirmed to construct under vitest's node environment with the `createTestHost` stub, which is what makes the translators directly unit-testable.
- **Known gap** — the manifest factory has no unit test of its own. It emits static objects with no branching, and Task 3 Step 8's `tsc --noEmit` typechecks every field against the backoffice's manifest union, which is the check that would actually catch a mistake. Its real verification is checklist items 1–4.
