# Localisation, Accessibility and Defect Sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Localise every user-facing string in the OpenOrClosed client behind an `en` dictionary, and close the twelve accessibility and functional defects the phase 1/2 audit found.

**Architecture:** A single `localization` extension manifest registers one `openOrClosed` dictionary area. Elements resolve keys through `this.localize` — which requires `ooc-timeline` to become an `UmbLitElement`. The two DOM-free, unit-tested modules (`holiday.ts`, `time-range.ts`) cannot localise, so they return **error codes** and the elements translate them; that refactor is the largest single piece of churn and it lands early, while attention is on it.

**Tech Stack:** Lit 3, TypeScript 5.8, Vite 7, vitest 3 (node environment — no DOM), `@umbraco-cms/backoffice` 17.1.0, .NET 10 / xUnit + FluentAssertions for the one server-side fix.

**Spec:** `docs/superpowers/specs/2026-08-20-localisation-and-accessibility-design.md`

## Global Constraints

- **`en` only.** No other culture files. The dictionary is the single place English lives.
- **One dictionary area: `openOrClosed`.** Keys are camelCase and referenced as `openOrClosed_<key>`.
- **Reuse built-in keys where they exist** — verified present in `node_modules/@umbraco-cms/backoffice/dist-cms/assets/lang/en.js`: `general_name`, `general_cancel`, `general_remove`, `general_label`, `general_yes`, `general_no`, `general_default`. **Save is `buttons_save`** — there is no `general_save`.
- **`this.localize` exists only on `UmbLitElement` and its descendants.** `UmbModalBaseElement extends UmbLitElement`, so both modals already have it. `ooc-timeline` does not until Task 4 changes it.
- **Never name a type `RangeError`.** It is a JS built-in that `parseTime` in `time-range.ts` already throws. The range validation type is `HoursRangeProblem`.
- **`property-value-change` is the only event that may leave a property editor's shadow tree.** Never a `composed` `change` event — Umbraco's `<umb-property>` rejects those.
- **Test commands:** `npm test` and `npm run build` from `OpenOrClosed/Client`; `dotnet test OpenOrClosed.slnx` from the repo root.
- **`npm run build` runs `tsc` first**, so a type error fails the build. Run it after every task that touches an element.

---

## File Structure

**Create:**

| File | Responsibility |
|---|---|
| `Client/src/localization/en.ts` | The `openOrClosed` dictionary — the only place English lives |
| `Client/src/localization/manifest.ts` | The `localization` extension manifest |
| `Client/src/localization/en.test.ts` | Asserts a key exists for every error code |

**Modify:**

| File | Change |
|---|---|
| `Client/src/bundle.manifests.ts` | Register the localisation manifest first |
| `Client/src/timeline/time-range.ts` | `validateRange` returns `HoursRangeProblem \| null` |
| `Client/src/timeline/time-range.test.ts` | Assert codes, not sentences |
| `Client/src/holidays/holiday.ts` | Validators return `HolidayError \| null` |
| `Client/src/holidays/holiday.test.ts` | Assert codes, not sentences |
| `Client/src/timeline/ooc-timeline.element.ts` | `UmbLitElement`; localise; defects 2, 3, 4, 5, 8, 9 |
| `Client/src/timeline/ooc-range-modal.element.ts` | Localise; resolve codes; remove `use24Hour` |
| `Client/src/timeline/range-modal.token.ts` | Drop `use24Hour` from the data interface |
| `Client/src/weekly-hours/ooc-weekly-hours.element.ts` | Day names via `Intl`; axis via a new `formatAxis` |
| `Client/src/weekly-hours/manifest.ts` | `#openOrClosed_*` label and description references |
| `Client/src/holidays/ooc-holidays.element.ts` | Localise; defects 1, 6 |
| `Client/src/holidays/ooc-holiday-modal.element.ts` | Localise; resolve codes |
| `Client/src/holidays/manifest.ts` | `#openOrClosed_*` references |
| `OpenOrClosed/PropertyValueConverters/HolidaysConverter.cs` | Sort holidays (defect 10) |
| `tests/OpenOrClosed.Tests/DeliveryApi/HolidaysDeliveryApiTests.cs` | Assert that sort |

---

## Task 1: The dictionary and its manifest

**Files:**
- Create: `Client/src/localization/en.ts`
- Create: `Client/src/localization/manifest.ts`
- Modify: `Client/src/bundle.manifests.ts`

**Interfaces:**
- Produces: a default-exported dictionary with an `openOrClosed` area; manifest alias `OpenOrClosed.Localization.En`. Every key listed here is consumed by Tasks 2–9.

**Why the dictionary lands before anything uses it:** later tasks each localise one element and can be verified on their own. Registering the dictionary first means every one of them has something to resolve against.

- [ ] **Step 1: Write the dictionary**

Create `Client/src/localization/en.ts`. This is the complete set — later tasks add no keys:

```ts
/**
 * The only place English lives. Keys are referenced as `openOrClosed_<key>`.
 *
 * Built-in Umbraco keys are used instead of duplicating them here: general_name,
 * general_cancel, general_remove, general_label, general_yes, general_no,
 * general_default, and buttons_save (there is no general_save).
 */
export default {
    openOrClosed: {
        // Property editor manifests
        weeklyHoursLabel: 'Weekly Hours',
        holidaysLabel: 'Holidays',

        // Data type settings
        settingTimeFormat: 'Time Format',
        settingTimeFormatDescription: '12/24 hour clock',
        settingDefaultOpen: 'Default Open Time',
        settingDefaultOpenDescription:
            'Start time for a newly added set of hours — defaults to 09:00',
        settingDefaultClose: 'Default Close Time',
        settingDefaultCloseDescription:
            'End time for a newly added set of hours — defaults to 17:00',
        settingAppointmentOnly: 'Enable Appointment Only?',
        settingAppointmentOnlyDescription:
            'Show the appointment only option for a set of hours',
        settingRemoveExpired: 'Remove Expired Holidays?',
        settingRemoveExpiredDescription:
            'Hide finished holidays from the converted value and the Delivery API. They stay visible in this editor so a mistyped date can still be corrected.',

        // Holidays editor
        defaultHolidayHours: 'Default holiday hours',
        noHolidaysYet: 'No holidays yet.',
        addHoliday: '+ Add holiday',
        removeExpired: 'Remove expired',
        columnDates: 'Dates',
        columnYearly: 'Yearly',
        columnHours: 'Hours',
        expiredSuffix: '(Expired)',
        hoursClosed: 'Closed',
        hoursCustom: 'Custom',
        openHolidayAction: (name: string) => `Edit ${name || 'holiday'}`,

        // Holiday modal
        holiday: 'Holiday',
        startsOn: 'Starts on',
        endsOn: 'Ends on',
        repeatYearly: 'Repeat yearly',
        repeatYearlyHint: 'A repeating holiday never expires.',
        defaultHoursHint: (hours: string) => `Uses the default holiday hours: ${hours}.`,
        defaultHoursEmptyHint:
            'No default holiday hours are set, so this holiday is closed.',

        // Range modal
        editHours: 'Edit hours',
        startsAt: 'Starts at',
        endsAt: 'Ends at',
        allDay: 'All day',
        labelOptional: '(optional)',
        byAppointmentOnly: 'By appointment only',

        // Timeline accessible names
        byAppointmentOnlyShort: 'by appointment only',

        // Validation — one key per error code
        errorNameRequired: 'A name is required',
        errorStartDateInvalid: 'A valid start date is required',
        errorEndDateInvalid: 'A valid end date is required',
        errorEndBeforeStart: 'The end date must be on or after the start date',
        errorCustomNeedsHours: 'Custom hours need at least one set of hours',
        errorOutsideDay: 'Hours must fall within the day.',
        errorEndNotAfterStart: 'The end time must be after the start time.',
        errorTooShort: (minutes: number) => `Hours must be at least ${minutes} minutes long.`,
        errorOverlaps: 'These hours overlap another set on the same day.',
    },
};
```

- [ ] **Step 2: Write the manifest**

Create `Client/src/localization/manifest.ts`:

```ts
export const manifests: Array<UmbExtensionManifest> = [
    {
        type: 'localization',
        alias: 'OpenOrClosed.Localization.En',
        name: 'Open Or Closed English',
        meta: { culture: 'en' },
        js: () => import('./en.js'),
    },
];
```

- [ ] **Step 3: Register it first in the bundle**

Modify `Client/src/bundle.manifests.ts` — add the import and spread it **before** every other entry, so the dictionary is registered before any element resolves against it:

```ts
import { manifests as localization } from './localization/manifest'
```

```ts
export const manifests: Array<UmbExtensionManifest> = [
  ...localization,
  ...standardHours,
  ...specialHours,
  ...weeklyHours,
  ...holidays,
  ...rangeModal,
  ...timeInput
];
```

- [ ] **Step 4: Verify it builds**

Run: `cd OpenOrClosed/Client && npm run build`
Expected: `tsc` clean, and an `en-*.js` chunk in the Vite output listing.

- [ ] **Step 5: Commit**

```bash
git add OpenOrClosed/Client/src/localization/ OpenOrClosed/Client/src/bundle.manifests.ts
git commit -m "feat: register an en localisation dictionary"
```

---

## Task 2: `validateRange` returns a code

**Files:**
- Modify: `Client/src/timeline/time-range.ts`
- Test: `Client/src/timeline/time-range.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type HoursRangeProblem =
      | { code: 'outsideDay' }
      | { code: 'endNotAfterStart' }
      | { code: 'tooShort'; minutes: number }
      | { code: 'overlaps' };

  export function validateRange(
      ranges: HoursRange[], index: number, startMinutes: number, endMinutes: number,
  ): HoursRangeProblem | null;
  ```
- Consumed by: Task 6 (`ooc-range-modal`).

**Do not name it `RangeError`** — `parseTime` in this same module throws the built-in `RangeError`, and shadowing it would be a live bug.

- [ ] **Step 1: Change the existing tests to expect codes**

In `Client/src/timeline/time-range.test.ts`, find the `validateRange` assertions and replace each expected sentence with its code. Add the `minutes`-carrying case, which is new:

```ts
describe('validateRange', () => {
    const ranges: HoursRange[] = [
        { start: '09:00', end: '12:00', label: null, byAppointmentOnly: false },
        { start: '13:00', end: '17:00', label: null, byAppointmentOnly: false },
    ];

    it('accepts a range that fits a gap', () => {
        expect(validateRange(ranges, 0, 9 * 60, 11 * 60)).toBeNull();
    });

    it('rejects a range outside the day', () => {
        expect(validateRange(ranges, 0, -30, 11 * 60)).toEqual({ code: 'outsideDay' });
        expect(validateRange(ranges, 0, 9 * 60, DAY_MINUTES + 30)).toEqual({ code: 'outsideDay' });
    });

    it('rejects an end at or before the start', () => {
        expect(validateRange(ranges, 0, 11 * 60, 11 * 60)).toEqual({ code: 'endNotAfterStart' });
        expect(validateRange(ranges, 0, 11 * 60, 10 * 60)).toEqual({ code: 'endNotAfterStart' });
    });

    it('rejects a range shorter than the minimum, and reports the minimum', () => {
        // The code carries the number so the message can be localised without the
        // dictionary needing to know MIN_RANGE_MINUTES.
        expect(validateRange(ranges, 0, 9 * 60, 9 * 60 + 5)).toEqual({
            code: 'tooShort',
            minutes: MIN_RANGE_MINUTES,
        });
    });

    it('rejects an overlap with another range', () => {
        expect(validateRange(ranges, 0, 11 * 60, 14 * 60)).toEqual({ code: 'overlaps' });
    });

    it('ignores the range being edited when checking overlaps', () => {
        expect(validateRange(ranges, 1, 13 * 60, 16 * 60)).toBeNull();
    });
});
```

Make sure `MIN_RANGE_MINUTES` and `DAY_MINUTES` are in the file's import list.

- [ ] **Step 2: Run to verify it fails**

Run: `cd OpenOrClosed/Client && npx vitest run src/timeline/time-range.test.ts`
Expected: FAIL — received strings, expected objects.

- [ ] **Step 3: Change the implementation**

In `Client/src/timeline/time-range.ts`, add the type above `validateRange` and rewrite its returns:

```ts
/**
 * Why a range is not acceptable. A code rather than a sentence, because this module is
 * DOM-free and cannot reach Umbraco's localisation - the element translates it.
 *
 * Named HoursRangeProblem, not RangeError: that is a JS built-in which parseTime throws.
 */
export type HoursRangeProblem =
    | { code: 'outsideDay' }
    | { code: 'endNotAfterStart' }
    | { code: 'tooShort'; minutes: number }
    | { code: 'overlaps' };

export function validateRange(
    ranges: HoursRange[],
    index: number,
    startMinutes: number,
    endMinutes: number,
): HoursRangeProblem | null {
    if (startMinutes < 0 || endMinutes > DAY_MINUTES) {
        return { code: 'outsideDay' };
    }

    if (endMinutes <= startMinutes) {
        return { code: 'endNotAfterStart' };
    }

    if (endMinutes - startMinutes < MIN_RANGE_MINUTES) {
        return { code: 'tooShort', minutes: MIN_RANGE_MINUTES };
    }

    const overlaps = ranges.some(
        (other, i) =>
            i !== index && startMinutes < parseTime(other.end) && endMinutes > parseTime(other.start),
    );

    return overlaps ? { code: 'overlaps' } : null;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd OpenOrClosed/Client && npx vitest run src/timeline/time-range.test.ts`
Expected: PASS. `npm run build` will still fail until Task 6 — that is expected and fine.

- [ ] **Step 5: Commit**

```bash
git add OpenOrClosed/Client/src/timeline/time-range.ts OpenOrClosed/Client/src/timeline/time-range.test.ts
git commit -m "refactor: validateRange returns a code rather than English"
```

---

## Task 3: Holiday validators return codes

**Files:**
- Modify: `Client/src/holidays/holiday.ts`
- Test: `Client/src/holidays/holiday.test.ts`
- Create: `Client/src/localization/en.test.ts`

**Interfaces:**
- Consumes: the dictionary from Task 1; `HoursRangeProblem` from Task 2.
- Produces:
  ```ts
  export type HolidayError = 'nameRequired' | 'startDateInvalid' | 'endDateInvalid'
      | 'endBeforeStart' | 'customNeedsHours';

  export function holidayConsistencyError(holiday: Holiday): HolidayError | null;
  export function validateHoliday(holiday: Holiday): HolidayError | null;
  ```
- Consumed by: Task 7 (`ooc-holiday-modal`).

- [ ] **Step 1: Change the existing tests to expect codes**

In `Client/src/holidays/holiday.test.ts`, replace the expected sentences in the `validateHoliday`, `holidayConsistencyError` and `validateHoliday still owns the required rules` blocks:

```ts
// validateHoliday
expect(validateHoliday(holiday({ name: '   ' }))).toBe('nameRequired');
expect(validateHoliday(holiday({ start: '' }))).toBe('startDateInvalid');
expect(validateHoliday(holiday({ end: 'nope' }))).toBe('endDateInvalid');
expect(validateHoliday(holiday({ start: '2026-08-22', end: '2026-08-20' }))).toBe('endBeforeStart');
expect(validateHoliday(holiday({ hoursMode: 'custom', hours: [] }))).toBe('customNeedsHours');

// holidayConsistencyError
expect(holidayConsistencyError(holiday({ start: '2026-12-25', end: '2026-09-19' })))
    .toBe('endBeforeStart');
expect(holidayConsistencyError(holiday({ hoursMode: 'custom', hours: [] })))
    .toBe('customNeedsHours');

// the required-rules block
expect(validateHoliday(holiday({ name: '' }))).toBe('nameRequired');
```

The `toBeNull()` assertions do not change.

- [ ] **Step 2: Write the dictionary-completeness test**

Create `Client/src/localization/en.test.ts`. This is what stops a future code reaching an editor as a raw key:

```ts
import { describe, expect, it } from 'vitest';
import en from './en.js';
import type { HolidayError } from '../holidays/holiday.js';
import type { HoursRangeProblem } from '../timeline/time-range.js';

/**
 * Listed explicitly rather than derived: types vanish at runtime, so a test that
 * enumerated them dynamically would pass vacuously.
 */
const HOLIDAY_ERRORS: HolidayError[] = [
    'nameRequired',
    'startDateInvalid',
    'endDateInvalid',
    'endBeforeStart',
    'customNeedsHours',
];

const RANGE_PROBLEMS: Array<HoursRangeProblem['code']> = [
    'outsideDay',
    'endNotAfterStart',
    'tooShort',
    'overlaps',
];

const capitalise = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

describe('the en dictionary', () => {
    it('has an entry for every holiday error code', () => {
        for (const code of HOLIDAY_ERRORS) {
            expect(en.openOrClosed, `missing error${capitalise(code)}`).toHaveProperty(
                `error${capitalise(code)}`,
            );
        }
    });

    it('has an entry for every range problem code', () => {
        for (const code of RANGE_PROBLEMS) {
            expect(en.openOrClosed, `missing error${capitalise(code)}`).toHaveProperty(
                `error${capitalise(code)}`,
            );
        }
    });

    it('has no empty values', () => {
        for (const [key, value] of Object.entries(en.openOrClosed)) {
            if (typeof value === 'string') {
                expect(value.length, `${key} is empty`).toBeGreaterThan(0);
            }
        }
    });
});
```

- [ ] **Step 3: Run to verify both fail**

Run: `cd OpenOrClosed/Client && npx vitest run src/holidays/holiday.test.ts src/localization/en.test.ts`
Expected: `holiday.test.ts` FAILs on received sentences; `en.test.ts` FAILs to import `HolidayError`.

- [ ] **Step 4: Change the implementation**

In `Client/src/holidays/holiday.ts`, add the type near the top and rewrite both validators:

```ts
/**
 * Why a holiday is not acceptable. A code rather than a sentence, because this module is
 * DOM-free and cannot reach Umbraco's localisation - the element translates it.
 */
export type HolidayError =
    | 'nameRequired'
    | 'startDateInvalid'
    | 'endDateInvalid'
    | 'endBeforeStart'
    | 'customNeedsHours';
```

```ts
export function holidayConsistencyError(holiday: Holiday): HolidayError | null {
    if (
        isValidDate(holiday.start) &&
        isValidDate(holiday.end) &&
        compareDates(holiday.end, holiday.start) < 0
    ) {
        return 'endBeforeStart';
    }

    if (holiday.hoursMode === 'custom' && holiday.hours.length === 0) {
        return 'customNeedsHours';
    }

    return null;
}

export function validateHoliday(holiday: Holiday): HolidayError | null {
    if (holiday.name.trim().length === 0) return 'nameRequired';
    if (!isValidDate(holiday.start)) return 'startDateInvalid';
    if (!isValidDate(holiday.end)) return 'endDateInvalid';

    return holidayConsistencyError(holiday);
}
```

Leave both doc comments in place — they explain why the required rules are split out, and that reasoning has not changed.

- [ ] **Step 5: Run to verify both pass**

Run: `cd OpenOrClosed/Client && npm test`
Expected: PASS — all files. `npm run build` still fails until Tasks 6 and 7.

- [ ] **Step 6: Commit**

```bash
git add OpenOrClosed/Client/src/holidays/holiday.ts OpenOrClosed/Client/src/holidays/holiday.test.ts \
        OpenOrClosed/Client/src/localization/en.test.ts
git commit -m "refactor: holiday validators return codes, and guard the dictionary"
```

---

## Task 4: `ooc-timeline` becomes localisable, and gets its accessibility fixes

**Files:**
- Modify: `Client/src/timeline/ooc-timeline.element.ts`

**Interfaces:**
- Consumes: the dictionary from Task 1.
- Produces: no API change. `ranges`, `snapMinutes`, `use24Hour`, `showAppointmentOnly`, `trackLabel`, `defaultDurationMinutes`, and the `change` / `edit-range` events all keep their current shape.

This task carries spec defects **2, 3, 5, 8, 9** and the localisation of one string. Defect 4 (tooltip on focus) is Task 5, kept separate because it is the largest and the most likely to be cut.

- [ ] **Step 1: Change the base class**

Replace the import and the `extends` clause:

```ts
import {
    css,
    customElement,
    html,
    property,
    state,
} from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
```

```ts
/**
 * One 00:00-24:00 track carrying any number of non-overlapping ranges.
 *
 * Knows nothing about days or holidays, so the weekly editor, the holidays default track and
 * the per-holiday track can all use it unchanged. It does depend on Umbraco, for localisation.
 */
@customElement('ooc-timeline')
export class OocTimelineElement extends UmbLitElement {
```

Remove `LitElement` from the lit import list. The old doc comment claimed it "knows nothing about … Umbraco"; that is no longer true, so it must not keep saying so.

- [ ] **Step 2: Localise the one string and fix the live region**

`_accessibleName` currently hardcodes `'by appointment only'`:

```ts
    protected _accessibleName(range: HoursRange): string {
        const parts = [this.trackLabel, formatRange(range, this.use24Hour)];
        if (range.label) parts.push(range.label);
        if (range.byAppointmentOnly) {
            parts.push(this.localize.term('openOrClosed_byAppointmentOnlyShort'));
        }
        return parts.filter(Boolean).join(', ');
    }
```

In `static styles`, give the host a positioning context so the `aria-live` region stops resolving against the initial containing block (defect 5):

```css
        :host {
            display: block;
            position: relative;
        }
```

- [ ] **Step 3: Ignore non-primary pointer buttons (defect 9)**

`_onTrackPointerDown` currently creates a range on right-click:

```ts
    private _onTrackPointerDown = (event: PointerEvent) => {
        // Primary button only - right-clicking the track should open a context menu, not
        // silently add hours.
        if (event.button !== 0 || event.target !== event.currentTarget) return;
```

- [ ] **Step 4: Hide the times on a narrow block (defect 8)**

The spec asks that a block too narrow for text shows its indicator icons alone. Add a `narrow` class driven by the width the element already computes, and hide `.times` when it is set:

```ts
    /** Below this, the times are unreadable and the icons carry the meaning instead. */
    private static readonly NARROW_PERCENT = 6;
```

In `_renderBlock`, where the width is already known:

```ts
        const widthPercent = this._percent(end - start);
        const narrow = widthPercent < OocTimelineElement.NARROW_PERCENT;
```

```ts
                class="block ${this._dragIndex === index ? 'dragging' : ''} ${narrow ? 'narrow' : ''}"
```

and in `static styles`:

```css
        /* Too narrow to read - the label and appointment icons carry the meaning. */
        .block.narrow .times {
            display: none;
        }
```

- [ ] **Step 5: Move focus after a destructive or creative keyboard action (defects 2 and 3)**

Add a helper, then call it from the two places that change which blocks exist:

```ts
    /**
     * Puts focus on a block after the set has changed. Without this, deleting a block drops the
     * keyboard user at the top of the document, and creating one leaves focus behind on the track.
     */
    private async _focusBlock(index: number) {
        await this.updateComplete;

        const blocks = [...this.renderRoot.querySelectorAll<HTMLElement>('.block')];
        if (blocks.length === 0) {
            this.renderRoot.querySelector<HTMLElement>('.track')?.focus();
            return;
        }

        // Clamp: deleting the last block means focusing the one that is now last.
        blocks[Math.min(index, blocks.length - 1)].focus();
    }
```

In `_onBlockKeydown`, the Delete/Backspace branch:

```ts
            case 'Delete':
            case 'Backspace':
                event.preventDefault();
                this._commit(this.ranges.filter((_, i) => i !== index));
                void this._focusBlock(index);
                return;
```

In `_onTrackKeydown`, after a successful create:

```ts
        const created = createRange(this.ranges, gap.start, this.defaultDurationMinutes, this.snapMinutes);
        if (created) {
            this._commit(created);
            // The new range is wherever sorting put it - find it by its start time.
            void this._focusBlock(created.findIndex((range) => parseTime(range.start) === gap.start));
        }
```

- [ ] **Step 6: Verify it builds**

Run: `cd OpenOrClosed/Client && npm run build`
Expected: `tsc` clean. Tasks 6 and 7 have not landed yet, so if the build reports errors in `ooc-range-modal.element.ts` or `ooc-holiday-modal.element.ts` about `HoursRangeProblem` or `HolidayError`, that is expected — confirm the only errors are those two files, and no error is in `ooc-timeline.element.ts`.

- [ ] **Step 7: Commit**

```bash
git add OpenOrClosed/Client/src/timeline/ooc-timeline.element.ts
git commit -m "feat: localise ooc-timeline and fix its keyboard and pointer defects"
```

---

## Task 5: Tooltip on hover and keyboard focus (defect 4)

**Files:**
- Modify: `Client/src/timeline/ooc-timeline.element.ts`

**Interfaces:**
- Consumes: `_accessibleName` from Task 4.
- Produces: no API change.

**Why this is its own task:** the native `title` attribute cannot fire on keyboard focus, so satisfying the spec means rendering a tooltip. It is the largest single item in the phase and the one the spec names as first to cut — a reviewer may reject it while accepting Task 4.

- [ ] **Step 1: Replace the title with a rendered tooltip**

In `_renderBlock`, drop `title=` from the `<span class="times">` and add a tooltip element as the block's last child:

```ts
                <span class="times">${formatRange(range, this.use24Hour)}</span>
                <span class="tooltip" role="presentation">${this._accessibleName(range)}</span>
```

`role="presentation"` matters: `aria-label` already carries this text to screen readers, and without it the tooltip would be announced twice.

- [ ] **Step 2: Style it to appear on hover and focus**

```css
        .tooltip {
            position: absolute;
            bottom: calc(100% + 4px);
            left: 50%;
            transform: translateX(-50%);
            z-index: 1;
            padding: 2px 6px;
            border-radius: var(--uui-border-radius);
            background: var(--uui-color-invariant, #1b264f);
            color: var(--uui-color-invariant-contrast, #fff);
            font-size: var(--uui-type-small-size);
            white-space: nowrap;
            pointer-events: none;
            opacity: 0;
            transition: opacity 80ms ease-in-out;
        }

        /* :focus-visible is what makes this work for keyboard users - a native title cannot. */
        .block:hover .tooltip,
        .block:focus-visible .tooltip {
            opacity: 1;
        }
```

The block is `overflow: hidden`, which would clip a tooltip drawn above it, so that must be relaxed. `.times` already clips its own text, so move the clipping there:

```css
        .block {
            /* ... existing declarations, with overflow: hidden REMOVED ... */
        }

        .block .times {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
```

- [ ] **Step 3: Verify it builds**

Run: `cd OpenOrClosed/Client && npm run build`
Expected: `tsc` clean, no new errors in `ooc-timeline.element.ts`.

- [ ] **Step 4: Commit**

```bash
git add OpenOrClosed/Client/src/timeline/ooc-timeline.element.ts
git commit -m "feat: show block tooltips on keyboard focus as well as hover"
```

---

## Task 6: Range modal — localise, resolve codes, drop `use24Hour`

**Files:**
- Modify: `Client/src/timeline/ooc-range-modal.element.ts`
- Modify: `Client/src/timeline/range-modal.token.ts`
- Modify: `Client/src/holidays/ooc-holiday-modal.element.ts` (call site only)
- Modify: `Client/src/holidays/ooc-holidays.element.ts` (call site only)
- Modify: `Client/src/weekly-hours/ooc-weekly-hours.element.ts` (call site only)

**Interfaces:**
- Consumes: `HoursRangeProblem` and `validateRange` from Task 2; the dictionary from Task 1.
- Produces: `OocRangeModalData` **without** `use24Hour`:
  ```ts
  export interface OocRangeModalData {
      ranges: HoursRange[];
      index: number;
      showAppointmentOnly: boolean;
  }
  ```

**Why `use24Hour` goes rather than gets used:** the phase 1 spec wanted a custom hour/minute/AM-PM control with the meridiem hidden when `time_24hr` is on. The spec for this phase amends that — native `<input type="time">` is better for keyboard and mobile and follows the OS locale. The field is currently set by all three callers and read by none; deleting it records the decision in the type instead of leaving dead data.

- [ ] **Step 1: Drop the field from the token**

In `Client/src/timeline/range-modal.token.ts`, remove `use24Hour` from `OocRangeModalData`, leaving a note so nobody re-adds it:

```ts
export interface OocRangeModalData {
    /** Every range on the day, so the modal can validate against its neighbours. */
    ranges: HoursRange[];
    index: number;
    showAppointmentOnly: boolean;
    // Deliberately no use24Hour: the times are entered through a native <input type="time">,
    // whose 12/24-hour presentation follows the operating system, not our setting.
}
```

- [ ] **Step 2: Remove it from all three call sites**

Delete the `use24Hour: ...` line from the `umbOpenModal(this, OOC_RANGE_MODAL, { data: { ... } })` calls in:
- `Client/src/weekly-hours/ooc-weekly-hours.element.ts` — in `_editRange`
- `Client/src/holidays/ooc-holidays.element.ts` — in `_editDefaultRange`
- `Client/src/holidays/ooc-holiday-modal.element.ts` — in `_editRange`

Leave every other field untouched.

- [ ] **Step 3: Localise the modal and resolve the error code**

In `Client/src/timeline/ooc-range-modal.element.ts`, add a translator and use it in place of the raw string:

```ts
    /** Turns a validation code into a sentence. The pure module cannot localise; this can. */
    private _problemText(problem: HoursRangeProblem | null): string | null {
        if (!problem) return null;

        return problem.code === 'tooShort'
            ? this.localize.term('openOrClosed_errorTooShort', problem.minutes)
            : this.localize.term(
                  `openOrClosed_error${problem.code.charAt(0).toUpperCase()}${problem.code.slice(1)}`,
              );
    }
```

Change `_error` to hold a code rather than a sentence, and `_visibleError` to return one:

```ts
    @state() private _error: HoursRangeProblem | null = null;
```

```ts
    private get _visibleError(): HoursRangeProblem | null {
        if (!this.data || !isValidTime(this._start) || !isValidTime(this._end)) return this._error;

        return validateRange(
            this.data.ranges, this.data.index, parseTime(this._start), parseTime(this._end));
    }
```

In `render`, translate at the point of display:

```ts
                    ${this._visibleError
                        ? html`<div class="error">${this._problemText(this._visibleError)}</div>`
                        : ''}
```

Replace the remaining literals with `this.localize.term(...)`, reusing built-ins where they exist:

| Literal | Replacement |
|---|---|
| `headline="Edit hours"` | `headline=${this.localize.term('openOrClosed_editHours')}` |
| `Starts at` (label div and `label=`) | `openOrClosed_startsAt` |
| `Ends at` | `openOrClosed_endsAt` |
| `All day` | `openOrClosed_allDay` |
| `Label` | `general_label` |
| `(optional)` | `openOrClosed_labelOptional` |
| `By appointment only` | `openOrClosed_byAppointmentOnly` |
| `Remove` | `general_remove` |
| `Cancel` | `general_cancel` |
| `Save` | `buttons_save` |

- [ ] **Step 4: Verify it builds and tests pass**

Run: `cd OpenOrClosed/Client && npm run build && npm test`
Expected: `tsc` reports errors only in `ooc-holiday-modal.element.ts` (Task 7 has not landed). All tests pass.

- [ ] **Step 5: Commit**

```bash
git add OpenOrClosed/Client/src/timeline/ooc-range-modal.element.ts \
        OpenOrClosed/Client/src/timeline/range-modal.token.ts \
        OpenOrClosed/Client/src/weekly-hours/ooc-weekly-hours.element.ts \
        OpenOrClosed/Client/src/holidays/ooc-holidays.element.ts \
        OpenOrClosed/Client/src/holidays/ooc-holiday-modal.element.ts
git commit -m "feat: localise the range modal and remove the dead use24Hour field"
```

---

## Task 7: Holiday modal — localise and resolve codes

**Files:**
- Modify: `Client/src/holidays/ooc-holiday-modal.element.ts`

**Interfaces:**
- Consumes: `HolidayError`, `validateHoliday`, `holidayConsistencyError` from Task 3; the dictionary from Task 1.
- Produces: no API change to `OocHolidayModalData` or `OocHolidayModalValue`.

- [ ] **Step 1: Hold codes in state and translate at the edge**

```ts
    @state() private _error: HolidayError | null = null;
```

```ts
    /** Turns a validation code into a sentence. The pure module cannot localise; this can. */
    private _errorText(error: HolidayError | null): string | null {
        return error
            ? this.localize.term(
                  `openOrClosed_error${error.charAt(0).toUpperCase()}${error.slice(1)}`,
              )
            : null;
    }

    private get _visibleError(): HolidayError | null {
        return holidayConsistencyError(this._current) ?? this._error;
    }
```

In `render`:

```ts
                    ${this._visibleError
                        ? html`<div class="error">${this._errorText(this._visibleError)}</div>`
                        : ''}
```

`_save` is unchanged in shape — `validateHoliday` now returns a code, which `_error` now holds.

- [ ] **Step 2: Localise the remaining literals**

| Literal | Replacement |
|---|---|
| `'Holiday'` fallback in `headline` | `openOrClosed_holiday` |
| `Name` | `general_name` |
| `Starts on` | `openOrClosed_startsOn` |
| `Ends on` | `openOrClosed_endsOn` |
| `Repeat yearly` | `openOrClosed_repeatYearly` |
| `A repeating holiday never expires.` | `openOrClosed_repeatYearlyHint` |
| `Default` mode button | `general_default` |
| `Closed` mode button | `openOrClosed_hoursClosed` |
| `Custom` mode button | `openOrClosed_hoursCustom` |
| `Remove` / `Cancel` / `Save` | `general_remove` / `general_cancel` / `buttons_save` |

`MODES` currently carries English labels. Change it to carry keys and resolve them at render time:

```ts
const MODES: Array<{ value: HolidayHoursMode; key: string }> = [
    { value: 'default', key: 'general_default' },
    { value: 'closed', key: 'openOrClosed_hoursClosed' },
    { value: 'custom', key: 'openOrClosed_hoursCustom' },
];
```

```ts
                    ${MODES.map(
                        (mode) => html`
                            <uui-button
                                look=${this._hoursMode === mode.value ? 'primary' : 'secondary'}
                                label=${this.localize.term(mode.key)}
                                @click=${() => (this._hoursMode = mode.value)}>
                                ${this.localize.term(mode.key)}
                            </uui-button>
                        `,
                    )}
```

- [ ] **Step 3: Localise the two Default hints, one of which takes an argument**

```ts
    private _renderDefaultHint() {
        const ranges = sanitizeRanges(this.data?.defaultHours);
        const use24Hour = this.data?.use24Hour ?? true;

        return html`<div class="field hint">
            ${ranges.length === 0
                ? this.localize.term('openOrClosed_defaultHoursEmptyHint')
                : this.localize.term(
                      'openOrClosed_defaultHoursHint',
                      ranges.map((range) => formatRange(range, use24Hour)).join(', '),
                  )}
        </div>`;
    }
```

Note this modal keeps its own `use24Hour` — that one is read, and drives the custom-hours timeline. Only the *range modal's* copy was dead.

- [ ] **Step 4: Verify everything builds and passes**

Run: `cd OpenOrClosed/Client && npm run build && npm test`
Expected: `tsc` fully clean for the first time since Task 2, all tests pass.

- [ ] **Step 5: Commit**

```bash
git add OpenOrClosed/Client/src/holidays/ooc-holiday-modal.element.ts
git commit -m "feat: localise the holiday modal"
```

---

## Task 8: Holidays editor — localise, and make rows keyboard-operable

**Files:**
- Modify: `Client/src/holidays/ooc-holidays.element.ts`
- Modify: `Client/src/holidays/manifest.ts`

**Interfaces:**
- Consumes: the dictionary from Task 1.
- Produces: no API change.

Carries spec defects **1** and **6**.

- [ ] **Step 1: Make the Name cell a real button (defect 1)**

The row is currently `<tr class="row" @click>` with no `tabindex` and no keydown, so a keyboard user cannot open a holiday at all. Put a real `<button>` in the Name cell and keep the row click as a pointer convenience:

```ts
    private _renderRow(holiday: Holiday, index: number, today: string) {
        const expired = isExpired(holiday, today);

        return html`
            <tr class="row ${expired ? 'expired' : ''}" @click=${() => this._editHoliday(index)}>
                <td>
                    <!--
                      A real button, not tabindex+role on the <tr>: role="button" on a row
                      destroys the table semantics screen readers rely on.
                    -->
                    <button
                        class="row-action"
                        type="button"
                        aria-label=${this.localize.term('openOrClosed_openHolidayAction', holiday.name)}
                        @click=${(e: Event) => {
                            // The row also handles click; without this the modal opens twice.
                            e.stopPropagation();
                            this._editHoliday(index);
                        }}>
                        ${holiday.name}
                    </button>
                    ${expired
                        ? html` <em>${this.localize.term('openOrClosed_expiredSuffix')}</em>`
                        : ''}
                </td>
                <td>${formatDateRange(holiday)}</td>
                <td>${this.localize.term(holiday.repeatYearly ? 'general_yes' : 'general_no')}</td>
                <td><span class="pill">${this._hoursSummary(holiday)}</span></td>
            </tr>
        `;
    }
```

Style it to look like the text it replaces:

```css
        .row-action {
            padding: 0;
            border: none;
            background: none;
            color: inherit;
            font: inherit;
            text-align: left;
            cursor: pointer;
        }

        .row-action:focus-visible {
            outline: 2px solid var(--uui-color-focus);
            outline-offset: 2px;
        }
```

- [ ] **Step 2: Add `scope="col"` to the headers (defect 6) and localise them**

```ts
                          <thead>
                              <tr>
                                  <th scope="col">${this.localize.term('general_name')}</th>
                                  <th scope="col">${this.localize.term('openOrClosed_columnDates')}</th>
                                  <th scope="col">${this.localize.term('openOrClosed_columnYearly')}</th>
                                  <th scope="col">${this.localize.term('openOrClosed_columnHours')}</th>
                              </tr>
                          </thead>
```

- [ ] **Step 3: Localise the rest of the element**

| Literal | Replacement |
|---|---|
| `Default holiday hours` (heading and `trackLabel`) | `openOrClosed_defaultHolidayHours` |
| `Holidays` heading | `openOrClosed_holidaysLabel` |
| `No holidays yet.` | `openOrClosed_noHolidaysYet` |
| `Remove expired` (label and text) | `openOrClosed_removeExpired` |
| `+ Add holiday` | `openOrClosed_addHoliday` |

And in `_hoursSummary`:

```ts
    private _hoursSummary(holiday: Holiday): string {
        if (holiday.hoursMode === 'closed') return this.localize.term('openOrClosed_hoursClosed');
        if (holiday.hoursMode === 'default') return this.localize.term('general_default');

        const ranges = sanitizeRanges(holiday.hours);
        if (ranges.length === 0) return this.localize.term('openOrClosed_hoursClosed');

        const first = formatRange(ranges[0], this._use24Hour);
        return ranges.length > 1 ? `${first} +${ranges.length - 1}` : first;
    }
```

- [ ] **Step 4: Point the manifest at the dictionary**

In `Client/src/holidays/manifest.ts`, replace the English `label` and `description` values with `#` references:

```ts
            label: '#openOrClosed_holidaysLabel',
```

```ts
                    {
                        alias: 'removeExpiredHolidays',
                        label: '#openOrClosed_settingRemoveExpired',
                        description: '#openOrClosed_settingRemoveExpiredDescription',
                        propertyEditorUiAlias: 'Umb.PropertyEditorUi.Toggle',
                    },
                    {
                        alias: 'time_24hr',
                        label: '#openOrClosed_settingTimeFormat',
                        description: '#openOrClosed_settingTimeFormatDescription',
                        propertyEditorUiAlias: 'Umb.PropertyEditorUi.Toggle',
                    },
                    {
                        alias: 'showAppointmentOnly',
                        label: '#openOrClosed_settingAppointmentOnly',
                        description: '#openOrClosed_settingAppointmentOnlyDescription',
                        propertyEditorUiAlias: 'Umb.PropertyEditorUi.Toggle',
                    },
```

Leave `name` alone — that is the extension's own identity in the registry, not user-facing copy.

- [ ] **Step 5: Verify**

Run: `cd OpenOrClosed/Client && npm run build && npm test`
Expected: `tsc` clean, all tests pass.

- [ ] **Step 6: Commit**

```bash
git add OpenOrClosed/Client/src/holidays/ooc-holidays.element.ts OpenOrClosed/Client/src/holidays/manifest.ts
git commit -m "feat: localise the holidays editor and make its rows keyboard-operable"
```

---

## Task 9: Weekly editor — culture-aware day names and a `time_24hr`-aware axis

**Files:**
- Modify: `Client/src/weekly-hours/ooc-weekly-hours.element.ts`
- Modify: `Client/src/weekly-hours/manifest.ts`

**Interfaces:**
- Consumes: `DAY_MINUTES` from `../timeline/time-range.js`; the dictionary from Task 1.
- Produces: `export function formatAxis(minutes: number, use24Hour: boolean): string` in
  `time-range.ts` — a compact axis label, distinct from `formatDisplay`.

Carries spec defects **11** and **12**. Both are the same kind of bug — a hardcoded English constant where a derived value belongs.

- [ ] **Step 1: Derive day names from the browser's culture (defect 11)**

`WEEK` currently hardcodes English names while the *server* uses `CultureInfo.CurrentCulture`, so the backoffice shows English days in every culture and disagrees with the rendered site. Keep the `day` numbers — they are the stored `System.DayOfWeek` convention — and derive the name:

```ts
/**
 * Monday first. The stored `day` values follow System.DayOfWeek, where Sunday is 0.
 *
 * Names are not listed here: they come from the browser's culture, which is also what keeps
 * them in step with the server's CultureInfo.CurrentCulture.
 */
const WEEK = [1, 2, 3, 4, 5, 6, 0];

/** 4 January 2026 is a Sunday, so this array is indexed directly by System.DayOfWeek. */
const DAY_NAME_REFERENCE = [4, 5, 6, 7, 8, 9, 10].map((date) => new Date(2026, 0, date));

function dayName(day: number): string {
    return new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(
        DAY_NAME_REFERENCE[day],
    );
}
```

In `render`, iterate the numbers and call `dayName`:

```ts
            ${WEEK.map(
                (day) => html`
                    <div class="row">
                        <div class="day">${dayName(day)}</div>
                        <ooc-timeline
                            .ranges=${this._rangesFor(day)}
                            .use24Hour=${this._use24Hour}
                            .showAppointmentOnly=${this._showAppointmentOnly}
                            .defaultDurationMinutes=${this._defaultDuration}
                            .trackLabel=${dayName(day)}
                            @change=${(e: CustomEvent) => this._setRanges(day, e.detail.ranges)}
                            @edit-range=${(e: CustomEvent) => this._editRange(day, e.detail.index)}>
                        </ooc-timeline>
                    </div>
                `,
            )}
```

- [ ] **Step 2: Write the failing test for a compact axis formatter (defect 12)**

The ticks currently hardcode `12 AM / 06 AM / 12 PM / 06 PM / 12 AM`, so with `time_24hr` on the axis reads AM/PM while the blocks read `09:00`.

**Do not reuse `formatDisplay` for this.** It yields `12:00 AM / 6:00 AM / 12:00 PM / 6:00 PM / 12:00 AM` — around 65% wider than the labels it replaces, and the ticks are centred with `translateX(-50%)` on a narrow axis, so they collide. A dedicated formatter keeps the compact look, and being pure it is the only part of the axis that vitest can cover.

Add to `Client/src/timeline/time-range.test.ts`:

```ts
describe('formatAxis', () => {
    it('gives 24-hour labels in full, including 24:00', () => {
        expect(formatAxis(0, true)).toBe('00:00');
        expect(formatAxis(6 * 60, true)).toBe('06:00');
        expect(formatAxis(DAY_MINUTES, true)).toBe('24:00');
    });

    it('drops the minutes in 12-hour mode, so the labels stay narrow', () => {
        // formatDisplay would give "12:00 AM" here, which overflows the axis.
        expect(formatAxis(0, false)).toBe('12 AM');
        expect(formatAxis(6 * 60, false)).toBe('6 AM');
        expect(formatAxis(12 * 60, false)).toBe('12 PM');
        expect(formatAxis(18 * 60, false)).toBe('6 PM');
        expect(formatAxis(DAY_MINUTES, false)).toBe('12 AM');
    });

    it('keeps the minutes when they are not zero', () => {
        expect(formatAxis(6 * 60 + 30, false)).toBe('6:30 AM');
    });
});
```

Add `formatAxis` to that file's import list.

- [ ] **Step 3: Run to verify it fails**

Run: `cd OpenOrClosed/Client && npx vitest run src/timeline/time-range.test.ts`
Expected: FAIL — `formatAxis` is not exported.

- [ ] **Step 4: Implement `formatAxis` and use it**

In `Client/src/timeline/time-range.ts`, beside `formatDisplay`:

```ts
/**
 * A compact label for the time axis. Unlike formatDisplay this drops a zero minute component,
 * because "12:00 AM" is too wide for the axis gutter and the ticks are centre-aligned.
 */
export function formatAxis(minutes: number, use24Hour: boolean): string {
    if (use24Hour) return formatTime(minutes);

    const display = formatDisplay(minutes, false);
    return display.replace(':00', '');
}
```

Then in `Client/src/weekly-hours/ooc-weekly-hours.element.ts`:

```ts
    private _renderAxis() {
        const ticks = [
            { at: 0, minutes: 0, cls: 'first' },
            { at: 25, minutes: 6 * 60, cls: '' },
            { at: 50, minutes: 12 * 60, cls: '' },
            { at: 75, minutes: 18 * 60, cls: '' },
            { at: 100, minutes: DAY_MINUTES, cls: 'last' },
        ];

        return html`<div class="row">
            <div></div>
            <div class="axis">
                ${ticks.map(
                    (tick) => html`<span class="tick ${tick.cls}" style="left:${tick.at}%"
                        >${formatAxis(tick.minutes, this._use24Hour)}</span
                    >`,
                )}
            </div>
        </div>`;
    }
```

Add `DAY_MINUTES` and `formatAxis` to the import from `../timeline/time-range.js`. The last tick reads `24:00` in 24-hour mode and `12 AM` in 12-hour mode.

- [ ] **Step 5: Point the manifest at the dictionary**

In `Client/src/weekly-hours/manifest.ts`:

```ts
            label: '#openOrClosed_weeklyHoursLabel',
```

and for the four settings, in the order they already appear:

```ts
                        label: '#openOrClosed_settingTimeFormat',
                        description: '#openOrClosed_settingTimeFormatDescription',
```
```ts
                        label: '#openOrClosed_settingDefaultOpen',
                        description: '#openOrClosed_settingDefaultOpenDescription',
```
```ts
                        label: '#openOrClosed_settingDefaultClose',
                        description: '#openOrClosed_settingDefaultCloseDescription',
```
```ts
                        label: '#openOrClosed_settingAppointmentOnly',
                        description: '#openOrClosed_settingAppointmentOnlyDescription',
```

- [ ] **Step 6: Verify**

Run: `cd OpenOrClosed/Client && npm run build && npm test`
Expected: `tsc` clean, all tests pass including the new `formatAxis` cases.

- [ ] **Step 7: Commit**

```bash
git add OpenOrClosed/Client/src/weekly-hours/ OpenOrClosed/Client/src/timeline/time-range.ts \
        OpenOrClosed/Client/src/timeline/time-range.test.ts
git commit -m "feat: derive day names and axis labels rather than hardcoding English"
```

---

## Task 10: Sort holidays in the converter (defect 10)

**Files:**
- Modify: `OpenOrClosed/PropertyValueConverters/HolidaysConverter.cs`
- Test: `tests/OpenOrClosed.Tests/DeliveryApi/HolidaysDeliveryApiTests.cs`

**Interfaces:**
- Consumes: `HolidaysConverter.Project(HolidaySchedule?, bool, DateOnly)`.
- Produces: no signature change.

`Project` sorts `DefaultHours` and each holiday's `Hours`, but not the holiday list, so Razor and Delivery API consumers get stored order while the editor displays chronological order. The client's `sortHolidays` orders by start then name; this matches it.

- [ ] **Step 1: Write the failing test**

Add to `tests/OpenOrClosed.Tests/DeliveryApi/HolidaysDeliveryApiTests.cs`:

```csharp
    [Fact]
    public void Project_SortsHolidaysByStartThenName()
    {
        // Stored out of order, and with two sharing a start so the name tiebreak is exercised.
        const string unsorted = """
            { "defaultHours": [], "holidays": [
                { "name": "Later", "start": "2027-03-01", "end": "2027-03-01",
                  "repeatYearly": false, "hoursMode": "closed", "hours": [] },
                { "name": "Beta", "start": "2027-01-01", "end": "2027-01-01",
                  "repeatYearly": false, "hoursMode": "closed", "hours": [] },
                { "name": "Alpha", "start": "2027-01-01", "end": "2027-01-01",
                  "repeatYearly": false, "hoursMode": "closed", "hours": [] } ] }
            """;

        Project(unsorted, removeExpired: true).Holidays
            .Select(holiday => holiday.Name)
            .Should().Equal("Alpha", "Beta", "Later");
    }

    [Fact]
    public void Project_SortOrderMatchesWhatTheEditorDisplays()
    {
        // The client's sortHolidays orders by start then name; a consumer reading the converted
        // value should see the same order the editor showed.
        Project(StoredValue, removeExpired: false).Holidays
            .Select(holiday => holiday.Start)
            .Should().BeInAscendingOrder();
    }
```

- [ ] **Step 2: Run to verify it fails**

Run: `dotnet test OpenOrClosed.slnx --filter HolidaysDeliveryApiTests`
Expected: FAIL — `Project_SortsHolidaysByStartThenName` gets `Later, Beta, Alpha`.

- [ ] **Step 3: Sort in `Project`**

In `OpenOrClosed/PropertyValueConverters/HolidaysConverter.cs`, change the `Holidays` projection so the ordering is applied:

```csharp
            Holidays =
            [
                // Start then name, matching the editor's sortHolidays - a consumer should not
                // see a different order than the person who typed them in.
                .. holidays
                    .OrderBy(holiday => holiday.Start)
                    .ThenBy(holiday => holiday.Name, StringComparer.CurrentCulture)
                    .Select(holiday => new Holiday
                    {
                        Name = holiday.Name,
                        Start = holiday.Start,
                        End = holiday.End,
                        RepeatYearly = holiday.RepeatYearly,
                        HoursMode = holiday.HoursMode,
                        Hours = Copy(holiday.Hours),
                    }),
            ],
```

- [ ] **Step 4: Run to verify it passes**

Run: `dotnet test OpenOrClosed.slnx`
Expected: PASS — all 149 tests.

- [ ] **Step 5: Commit**

```bash
git add OpenOrClosed/PropertyValueConverters/HolidaysConverter.cs \
        tests/OpenOrClosed.Tests/DeliveryApi/HolidaysDeliveryApiTests.cs
git commit -m "fix: sort holidays in the converter to match the editor"
```

---

## Task 11: Manual checklist and README

**Files:**
- Create: `docs/superpowers/plans/2026-08-20-localisation-and-accessibility-checklist.md`
- Modify: `README.md`

**Why the checklist is written from the spec, not this plan:** phase 1's manual pass came back clean while five spec requirements were unimplemented, because the checklist was derived from a plan that had already dropped them. A checklist cannot catch what its source omitted.

- [ ] **Step 1: Run both suites**

Run: `dotnet test OpenOrClosed.slnx` and `cd OpenOrClosed/Client && npm test && npm run build`
Expected: all green, `tsc` clean.

- [ ] **Step 2: Write the checklist**

Create `docs/superpowers/plans/2026-08-20-localisation-and-accessibility-checklist.md`:

```markdown
# Localisation and accessibility manual checklist

Derived from `docs/superpowers/specs/2026-08-20-localisation-and-accessibility-design.md`,
deliberately not from its plan.

## Localisation

- [ ] Data type settings for **Weekly Hours** show all four labels and descriptions — a raw
      `#openOrClosed_...` on screen means the key is missing or the dictionary did not register.
- [ ] Data type settings for **Holidays** show all three.
- [ ] Every string in both editors and both sidebars is in English and none reads as a raw key.
- [ ] Set the backoffice user's language to a non-English culture: day names and the axis follow it,
      every dictionary string falls back to English, and nothing renders blank.

## Day names and axis (defects 11, 12)

- [ ] Day names match the backoffice language, not always English.
- [ ] With **Time Format** on, the axis reads `00:00 / 06:00 / 12:00 / 18:00 / 24:00` and the blocks
      read `09:00` — they agree.
- [ ] With **Time Format** off, the axis reads `12 AM / 6 AM / 12 PM / 6 PM / 12 AM` — no `:00`
      components — and the blocks read `9:00 AM`.
- [ ] Neither axis overflows its gutter or collides with the next label, at a narrow window width.

## Keyboard (defects 1, 2, 3, 4)

- [ ] Tab reaches every holiday row's name; Enter and Space both open that holiday's sidebar.
- [ ] Clicking a row still opens it, and opens it **once** — not twice.
- [ ] Focus a block, press Delete: the block is removed and focus lands on a neighbouring block,
      not at the top of the document.
- [ ] Delete the only block on a day: focus lands on the track.
- [ ] Focus an empty track, press Enter: a range is created **and focused**.
- [ ] Tab to a block: its tooltip appears. Tab away: it disappears.
- [ ] Hover a block: the same tooltip appears.
- [ ] Arrow keys move a block, Shift+arrows resize it, and the change is announced.

## Narrow blocks (defect 8)

- [ ] A 15-minute range shows its icons with no text, rather than a truncated `00:…`.
- [ ] A range wide enough for its times still shows them.
- [ ] The tooltip is not clipped by the block it belongs to — check on the first and last range of
      a day, where it would overflow the track.

## Screen reader

- [ ] With a screen reader running, focusing a block announces day, times, label and appointment
      state once — not twice. (The tooltip is `role="presentation"` precisely to prevent doubling.)
- [ ] Moving a block announces the resulting range.
- [ ] The holidays table is announced as a table with four column headers.

## Other defects

- [ ] Right-click empty track: a context menu appears and **no** range is created (defect 9).
- [ ] The range sidebar's times are entered through the native time control, and the **All day**
      toggle still produces a true `24:00` end (defect 7 — `use24Hour` is gone by design).
- [ ] Holidays appear in the same order in a Razor `@foreach` and in the Delivery API as they do in
      the editor (defect 10).

## Regression

- [ ] Save, reload: every holiday, mode, date and custom hours survive.
- [ ] Navigating away straight after a save does not prompt "discard unsaved changes".
- [ ] The console is clean during drags — no "Property Editor received a Change Event" error.
```

- [ ] **Step 3: Note the dictionary in the README**

Add to the `### Version 17.2.0` changelog section:

```markdown
* The backoffice UI is now localisable. The package ships an `en` dictionary under the
  `openOrClosed` area; a translation is a single file plus a `localization` manifest entry.
* Backoffice day names and the timeline axis now follow the current culture and the
  **Time Format** setting rather than being hardcoded English.
* Accessibility: holiday rows are reachable and operable by keyboard, focus is kept when a
  range is added or deleted, and block tooltips appear on keyboard focus as well as hover.
```

- [ ] **Step 4: Commit**

```bash
git add README.md docs/superpowers/plans/2026-08-20-localisation-and-accessibility-checklist.md
git commit -m "docs: manual checklist for localisation and accessibility"
```

---

## Self-Review

**Spec coverage**

| Spec item | Task |
|---|---|
| Dictionary, manifest, bundle registration | 1 |
| Built-in key reuse | 1, 6, 7, 8, 9 |
| Validation codes — `HoursRangeProblem` | 2 |
| Validation codes — `HolidayError` | 3 |
| Dictionary-completeness test | 3 |
| `ooc-timeline` → `UmbLitElement` | 4 |
| Defect 5 — live region positioning | 4 |
| Defect 9 — right-click creates a range | 4 |
| Defect 8 — narrow blocks show indicators | 4 |
| Defects 2, 3 — focus after delete/create | 4 |
| Defect 4 — tooltip on keyboard focus | 5 |
| Defect 7 — dead `use24Hour` | 6 |
| Range modal strings | 6 |
| Holiday modal strings | 7 |
| Defect 1 — holiday rows keyboard-operable | 8 |
| Defect 6 — `scope="col"` | 8 |
| Holidays editor strings + manifest | 8 |
| Defect 11 — day names | 9 |
| Defect 12 — axis labels, via a tested `formatAxis` | 9 |
| Weekly manifest | 9 |
| Defect 10 — holiday sort | 10 |
| Manual checklist from the spec | 11 |
| README note | 11 |

All twenty-two spec items are covered. The spec's delivery order is preserved: localisation infrastructure (1), validation codes (2–3), element strings (4, 6–9), accessibility (4, 5, 8), remaining defects (4, 6, 9, 10), docs (11). Tasks 4 and 8 each carry both a localisation and an accessibility item because they are the same edit to the same file — splitting them would mean touching each file twice.

**Deliberate deviation from the spec's step ordering:** the spec lists accessibility as step 4 and functional defects as step 5, but defects 8 and 9 live in `ooc-timeline.element.ts` alongside the accessibility work, so Task 4 does them together. Splitting by category rather than by file would have a reviewer read the same file three times.

**Build is red between Tasks 2 and 7.** `tsc` fails from Task 2 (the return type changes) until Task 7 (the last consumer is updated). Every affected task's verification step says which files may legitimately error, so an executor does not mistake it for their own mistake. Tests stay green throughout.

**Type consistency:** `HolidayError` (a bare string union) and `HoursRangeProblem` (a discriminated object union) are defined once each, in Tasks 3 and 2, and referenced by those exact names in Tasks 3, 6, 7 and the completeness test. `_errorText` takes `HolidayError | null`; `_problemText` takes `HoursRangeProblem | null` — different names because the shapes differ and only one needs an argument. `dayName(day: number)` and `DAY_NAME_REFERENCE` are defined and used only in Task 9. `_focusBlock(index: number)` is defined in Task 4 and used twice there. `NARROW_PERCENT` is a static on the element, referenced as `OocTimelineElement.NARROW_PERCENT`.

**One thing an executor must not "tidy":** Task 7 keeps `use24Hour` in `OocHolidayModalData` while Task 6 deletes it from `OocRangeModalData`. That asymmetry is correct — the holiday modal reads its copy to drive the custom-hours timeline; the range modal's copy was dead. Task 7 Step 3 says so inline.
