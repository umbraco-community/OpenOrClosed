# Copying Hours Between Days and Holidays — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each weekday row and each holiday row an action menu that copies its hours onto other rows, clears them, or (for holidays) duplicates the row.

**Architecture:** Two pure functions carry the decisions — `copyRangesTo` for the sparse weekly value, `duplicateHoliday` for cloning and naming. One shared sidebar modal picks the targets, parameterised by a list of `{ id, label, occupied }` so it serves days and holidays alike. Neither `ooc-timeline` nor `time-range.ts` is touched.

**Tech Stack:** TypeScript 5.8, Lit 3, Umbraco 17 backoffice (`@umbraco-cms/backoffice`), Vitest 3 (node environment, no DOM), Vite 7.

**Spec:** `docs/superpowers/specs/2026-09-01-copy-hours-between-days-design.md` — read it before Task 1, in particular *The word "Copy" is already taken* and the sparse-value paragraph under *Weekly*.

**Prior state:** `feature/preset-hours` carries the Preset Hours feature (11 commits) plus this plan's spec. This work continues on the same branch.

## Global Constraints

- **No C# changes**, and **no changes to `ooc-timeline.element.ts` or `time-range.ts`.** This feature lives in the two consumers plus one new modal.
- **Nothing is ever labelled bare "Copy".** The property action menu already carries **Copy** and **Replace** from #77, meaning node-to-node and localStorage-backed. In-editor items always name their target: *Copy hours to…*, *Duplicate*, *Clear hours*.
- **The weekly value is sparse.** A day with no hours has **no entry**; `_setRanges` removes it, and the server skips rows with no usable day (the 17.3.1 fix). Copying an empty day must delete the target's entry, never write an empty array.
- **Deep-clone on every copy.** Sharing a range array between two days, or between a holiday and its duplicate, means editing one edits the other.
- **Replace, never merge.** A copy target ends up matching its source exactly. The picker annotates occupied targets; there is **no** second confirm dialog.
- **Clear is disabled when it would do nothing**, and does not confirm — matching the range and holiday modals' existing **Remove**.
- **UUI elements (`uui-*`) need no import**; the backoffice registers them globally, as the existing use of `uui-box`, `uui-button-group` and `uui-icon` shows. The same appears true of `umb-*` — `ooc-holiday-modal` already uses `umb-body-layout` with no import. Follow that, with the fallback recorded in Task 3 Step 3.
- **All commands run from `OpenOrClosed/Client/`.** Tests: `npm test`. Type-check and build: `npm run build` (`tsc` first; `noUnusedLocals` is on).
- **House style:** 4-space indent, single quotes, `.js` extensions on relative imports, `import type` for type-only imports, comments explain *why* not *what*.
- **Every commit message ends with the trailer** `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
- **Branch:** `feature/preset-hours`. **Do not bump `OpenOrClosed.csproj`.**

---

## File Structure

| File | Responsibility |
|---|---|
| `src/weekly-hours/week.ts` | **new** — `WeeklyHoursDay` (moved here) and `copyRangesTo`. Pure. |
| `src/weekly-hours/week.test.ts` | **new** — `copyRangesTo` cases |
| `src/weekly-hours/ooc-weekly-hours.element.ts` | re-exports the type, adds the day menu, copy and clear, three-column grid |
| `src/weekly-hours/clipboard/paste.translator.ts` | imports the type from `week.js`, not from the element |
| `src/holidays/holiday.ts` | + `duplicateHoliday` |
| `src/holidays/holiday.test.ts` | + `duplicateHoliday` cases |
| `src/holidays/ooc-holidays.element.ts` | the row menu: duplicate, copy, clear |
| `src/copy-targets/copy-targets.token.ts` | **new** — `OOC_COPY_TARGETS_MODAL` and its types |
| `src/copy-targets/ooc-copy-targets-modal.element.ts` | **new** — the picker |
| `src/copy-targets/manifest.ts` | **new** — the modal manifest |
| `src/bundle.manifests.ts` | register `copy-targets` |
| `src/localization/en.ts` | + 13 entries, `general_all` noted in the header comment |
| `src/localization/en.test.ts` | cover the three new argument-taking entries |
| `README.md` | a section on copying within a property, and the changelog |
| `docs/superpowers/plans/2026-09-01-copy-hours-checklist.md` | **new** — manual checklist |

---

## Task 1: `week.ts` — the type, and `copyRangesTo`

Moves a type that should never have lived in a DOM module, and adds the one function in this feature that can corrupt data if it is wrong.

**Files:**
- Create: `OpenOrClosed/Client/src/weekly-hours/week.ts`
- Create: `OpenOrClosed/Client/src/weekly-hours/week.test.ts`
- Modify: `OpenOrClosed/Client/src/weekly-hours/ooc-weekly-hours.element.ts`
- Modify: `OpenOrClosed/Client/src/weekly-hours/clipboard/paste.translator.ts:5`

**Interfaces:**
- Consumes: `sanitizeRanges(raw: unknown): HoursRange[]` and `type HoursRange`, both from `../timeline/time-range.js`.
- Produces: `interface WeeklyHoursDay { day: number; ranges: HoursRange[] }` and `copyRangesTo(week: WeeklyHoursDay[], sourceDay: number, targetDays: number[]): WeeklyHoursDay[]`, both used by Task 4.

- [ ] **Step 1: Write the failing tests**

Create `src/weekly-hours/week.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { copyRangesTo, type WeeklyHoursDay } from './week.js';

/** Monday is 1 and Sunday is 0, following System.DayOfWeek, as the stored value does. */
const day = (n: number, ...times: Array<[string, string]>): WeeklyHoursDay => ({
    day: n,
    ranges: times.map(([start, end]) => ({ start, end, label: null, byAppointmentOnly: false })),
});

describe('copyRangesTo', () => {
    it('copies onto a day that had nothing', () => {
        const week = [day(1, ['09:00', '17:00'])];

        expect(copyRangesTo(week, 1, [2])).toEqual([
            day(1, ['09:00', '17:00']),
            day(2, ['09:00', '17:00']),
        ]);
    });

    it('replaces what the target had rather than merging', () => {
        const week = [day(1, ['09:00', '12:00'], ['13:00', '17:00']), day(2, ['10:00', '11:00'])];

        expect(copyRangesTo(week, 1, [2])).toEqual([
            day(1, ['09:00', '12:00'], ['13:00', '17:00']),
            day(2, ['09:00', '12:00'], ['13:00', '17:00']),
        ]);
    });

    it('removes the target entry when the source is empty', () => {
        // The stored value is sparse - an empty `ranges` array would be a row the server skips,
        // silently losing the day rather than clearing it.
        const week = [day(1), day(2, ['10:00', '11:00'])];

        expect(copyRangesTo(week, 1, [2])).toEqual([]);
    });

    it('treats a source absent from the week as empty', () => {
        const week = [day(2, ['10:00', '11:00'])];

        expect(copyRangesTo(week, 1, [2])).toEqual([]);
    });

    it('copies onto several days at once', () => {
        const week = [day(1, ['09:00', '17:00'])];

        expect(copyRangesTo(week, 1, [2, 3, 4])).toEqual([
            day(1, ['09:00', '17:00']),
            day(2, ['09:00', '17:00']),
            day(3, ['09:00', '17:00']),
            day(4, ['09:00', '17:00']),
        ]);
    });

    it('leaves days that were not named alone', () => {
        const week = [day(1, ['09:00', '17:00']), day(5, ['08:00', '12:00'])];

        expect(copyRangesTo(week, 1, [2])).toEqual([
            day(1, ['09:00', '17:00']),
            day(2, ['09:00', '17:00']),
            day(5, ['08:00', '12:00']),
        ]);
    });

    it('ignores a source listed among its own targets', () => {
        const week = [day(1, ['09:00', '17:00'])];

        expect(copyRangesTo(week, 1, [1])).toEqual([day(1, ['09:00', '17:00'])]);
    });

    it('deep-copies, so dragging the copy does not move the source', () => {
        const week = [day(1, ['09:00', '17:00'])];
        const copied = copyRangesTo(week, 1, [2]);

        const target = copied.find((entry) => entry.day === 2)!;
        target.ranges[0].start = '06:00';

        expect(copied.find((entry) => entry.day === 1)!.ranges[0].start).toBe('09:00');
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd OpenOrClosed/Client && npm test -- week`
Expected: FAIL — cannot resolve `./week.js`.

- [ ] **Step 3: Create the module**

Create `src/weekly-hours/week.ts`:

```ts
import { sanitizeRanges, type HoursRange } from '../timeline/time-range.js';

/**
 * One day of the week, exactly as it is persisted. The `day` values follow System.DayOfWeek, where
 * Sunday is 0.
 */
export interface WeeklyHoursDay {
    day: number;
    ranges: HoursRange[];
}

/**
 * The week after copying one day's hours onto others, sorted by day.
 *
 * The stored value is **sparse**: a day with no hours has no entry at all. So copying an *empty* day
 * has to remove each target's entry rather than write an empty array - a row carrying no usable day
 * is skipped on the server, which would lose the day silently rather than clear it.
 *
 * Ranges are deep-copied, or dragging Tuesday's block would move Monday's with it. Days not named as
 * targets are left exactly as they are, and a source listed among its own targets is ignored.
 */
export function copyRangesTo(
    week: WeeklyHoursDay[],
    sourceDay: number,
    targetDays: number[],
): WeeklyHoursDay[] {
    const targets = new Set(targetDays.filter((day) => day !== sourceDay));
    if (targets.size === 0) return week;

    const source = sanitizeRanges(week.find((entry) => entry.day === sourceDay)?.ranges);
    const kept = week.filter((entry) => !targets.has(entry.day));

    const copied =
        source.length === 0
            ? []
            : [...targets].map((day) => ({ day, ranges: source.map((range) => ({ ...range })) }));

    // Sorted so the result is deterministic. Nothing reads the order - the editor looks days up by
    // number - but a stable return is far easier to assert on.
    return [...kept, ...copied].sort((left, right) => left.day - right.day);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd OpenOrClosed/Client && npm test -- week`
Expected: PASS (8 tests).

- [ ] **Step 5: Point the element and the translator at the new module**

In `src/weekly-hours/ooc-weekly-hours.element.ts`, delete the local interface:

```ts
export interface WeeklyHoursDay {
    day: number;
    ranges: HoursRange[];
}
```

and re-export it from `week.js` instead, so nothing outside this folder has to change:

```ts
import { copyRangesTo, type WeeklyHoursDay } from './week.js';

export type { WeeklyHoursDay } from './week.js';
```

`copyRangesTo` is imported now and used in Task 4. If `noUnusedLocals` objects in the meantime, add it in Task 4 instead and keep only the type import here.

In `src/weekly-hours/clipboard/paste.translator.ts`, change line 5:

```ts
import type { WeeklyHoursDay } from '../week.js';
```

- [ ] **Step 6: Type-check and test**

Run: `cd OpenOrClosed/Client && npm run build && npm test`
Expected: build clean, 208 tests PASS (200 + 8).

- [ ] **Step 7: Commit**

```bash
git add OpenOrClosed/Client/src/weekly-hours
git commit -F - <<'MSG'
feat: copyRangesTo, and a pure home for WeeklyHoursDay

The stored week is sparse - a day with no hours has no entry - so
copying an empty day has to remove the target's entry rather than write
an empty one. A row with no usable day is skipped on the server, which
would lose the day silently rather than clear it. That is the whole
reason this is a tested function and not three lines in the element.

WeeklyHoursDay moves here with it: the clipboard paste translator was
importing the type from the element, dragging a pure module's dependency
into a DOM one.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
```

---

## Task 2: `duplicateHoliday`

**Files:**
- Modify: `OpenOrClosed/Client/src/holidays/holiday.ts` (append after `sortHolidays`)
- Test: `OpenOrClosed/Client/src/holidays/holiday.test.ts`

**Interfaces:**
- Consumes: `type Holiday` from the same module.
- Produces: `duplicateHoliday(holiday: Holiday, existingNames: string[], copyWord: string): Holiday`, used by Task 5.

- [ ] **Step 1: Write the failing tests**

Add `duplicateHoliday` to the existing import block at the top of `holiday.test.ts` (alphabetical, after `compareDates`). The file already has a `holiday(overrides)` helper. Append:

```ts
describe('duplicateHoliday', () => {
    it('names the copy after the original', () => {
        const copy = duplicateHoliday(holiday({ name: 'Christmas Day' }), ['Christmas Day'], 'copy');

        expect(copy.name).toBe('Christmas Day (copy)');
    });

    it('numbers the copy when that name is taken', () => {
        const copy = duplicateHoliday(holiday({ name: 'Christmas Day' }), [
            'Christmas Day',
            'Christmas Day (copy)',
        ], 'copy');

        expect(copy.name).toBe('Christmas Day (copy 2)');
    });

    it('keeps counting past the second copy', () => {
        const copy = duplicateHoliday(holiday({ name: 'Christmas Day' }), [
            'Christmas Day',
            'Christmas Day (copy)',
            'Christmas Day (copy 2)',
        ], 'copy');

        expect(copy.name).toBe('Christmas Day (copy 3)');
    });

    it('names a copy of an unnamed holiday', () => {
        expect(duplicateHoliday(holiday({ name: '' }), [], 'copy').name).toBe('(copy)');
    });

    it('carries every other field across', () => {
        const source = holiday({
            name: 'Stocktake',
            start: '2026-08-20',
            end: '2026-08-21',
            repeatYearly: true,
            hoursMode: 'custom',
            hours: [{ start: '09:00', end: '12:00', label: 'Morning', byAppointmentOnly: true }],
        });

        const copy = duplicateHoliday(source, [], 'copy');

        expect(copy).toEqual({ ...source, name: 'Stocktake (copy)' });
    });

    it('deep-copies the hours, so editing the copy leaves the original alone', () => {
        const source = holiday({
            hoursMode: 'custom',
            hours: [{ start: '09:00', end: '12:00', label: null, byAppointmentOnly: false }],
        });

        const copy = duplicateHoliday(source, [], 'copy');
        copy.hours[0].start = '06:00';

        expect(source.hours[0].start).toBe('09:00');
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd OpenOrClosed/Client && npm test -- holiday`
Expected: FAIL — `duplicateHoliday is not a function` on all 6.

- [ ] **Step 3: Write the implementation**

Append to `src/holidays/holiday.ts`:

```ts
/**
 * A copy of `holiday` under a name nothing in `existingNames` is using.
 *
 * `copyWord` is supplied by the caller because this module is DOM-free and cannot reach Umbraco's
 * localisation - the same reason HolidayError is a code rather than a sentence.
 *
 * `hours` is deep-copied: sharing the array would make editing the duplicate edit the original.
 */
export function duplicateHoliday(
    holiday: Holiday,
    existingNames: string[],
    copyWord: string,
): Holiday {
    const taken = new Set(existingNames);
    const base = holiday.name.trim();
    const suffix = (attempt: number) =>
        attempt === 1 ? `(${copyWord})` : `(${copyWord} ${attempt})`;
    const nameFor = (attempt: number) =>
        base ? `${base} ${suffix(attempt)}` : suffix(attempt);

    let attempt = 1;
    while (taken.has(nameFor(attempt))) attempt += 1;

    return {
        ...holiday,
        name: nameFor(attempt),
        hours: holiday.hours.map((range) => ({ ...range })),
    };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd OpenOrClosed/Client && npm run build && npm test`
Expected: build clean, 214 tests PASS (208 + 6).

- [ ] **Step 5: Commit**

```bash
git add OpenOrClosed/Client/src/holidays/holiday.ts OpenOrClosed/Client/src/holidays/holiday.test.ts
git commit -F - <<'MSG'
feat: duplicateHoliday, cloning a holiday under a free name

Two things worth having tested in one place: the name must not collide
with an existing holiday, and hours must be deep-copied or the duplicate
and the original would share an array.

copyWord is a parameter because this module is DOM-free and cannot reach
localisation - the same reason HolidayError is a code, not a sentence.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
```

---

## Task 3: The shared target picker

**Files:**
- Create: `OpenOrClosed/Client/src/copy-targets/copy-targets.token.ts`
- Create: `OpenOrClosed/Client/src/copy-targets/ooc-copy-targets-modal.element.ts`
- Create: `OpenOrClosed/Client/src/copy-targets/manifest.ts`
- Modify: `OpenOrClosed/Client/src/bundle.manifests.ts`
- Modify: `OpenOrClosed/Client/src/localization/en.ts`
- Test: `OpenOrClosed/Client/src/localization/en.test.ts`

**Interfaces:**
- Consumes: `UmbModalToken` and `UmbModalBaseElement` from `@umbraco-cms/backoffice/modal`.
- Produces: `OOC_COPY_TARGETS_MODAL`, plus the exported types `OocCopyTarget`, `OocCopyTargetGroup`, `OocCopyTargetsModalData`, `OocCopyTargetsModalValue`. Tasks 4 and 5 both open it.

- [ ] **Step 1: Write the failing dictionary test**

In `src/localization/en.test.ts`, add one line to the argument-taking-entries case, after the `addPresetHours` assertion:

```ts
        expect(en.openOrClosed.copyHoursFrom('Monday')).toContain('Monday');
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd OpenOrClosed/Client && npm test -- en`
Expected: FAIL — `en.openOrClosed.copyHoursFrom is not a function`.

- [ ] **Step 3: Add the modal's dictionary entries**

In `src/localization/en.ts`, append a new block after the range modal block:

```ts
        // Copy targets modal
        copyHoursFrom: (source: string) => `Copy hours from ${source}`,
        copyTargetsHint: 'Choose where to copy them. Anything already there is replaced.',
        copyTargetsOccupied: 'has hours, will be replaced',
        copyTargetsEmpty: 'There is nowhere else to copy these hours to.',
        copyHoursAction: 'Copy hours',
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd OpenOrClosed/Client && npm test -- en`
Expected: PASS.

- [ ] **Step 5: Create the token**

Create `src/copy-targets/copy-targets.token.ts`:

```ts
import { UmbModalToken } from '@umbraco-cms/backoffice/modal';

export interface OocCopyTarget {
    /** Opaque to the modal - the caller resolves it back to a day number or a holiday position. */
    id: string;
    label: string;
    /** Renders a "will be replaced" note. Nothing else acts on it. */
    occupied: boolean;
}

export interface OocCopyTargetGroup {
    label: string;
    ids: string[];
}

export interface OocCopyTargetsModalData {
    /** Named in the headline, e.g. "Monday". */
    sourceLabel: string;
    targets: OocCopyTarget[];
    /**
     * Quick selections such as Weekdays. Additive rather than modes: a group ticks its own boxes and
     * leaves the rest of the selection alone, so they compose with ticking by hand.
     */
    groups?: OocCopyTargetGroup[];
}

export interface OocCopyTargetsModalValue {
    ids: string[];
}

export const OOC_COPY_TARGETS_MODAL = new UmbModalToken<
    OocCopyTargetsModalData,
    OocCopyTargetsModalValue
>('OpenOrClosed.Modal.CopyTargets', {
    modal: {
        type: 'sidebar',
        size: 'small',
    },
});
```

- [ ] **Step 6: Create the modal element**

Create `src/copy-targets/ooc-copy-targets-modal.element.ts`:

```ts
import { css, customElement, html, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbModalBaseElement } from '@umbraco-cms/backoffice/modal';
import type { OocCopyTargetsModalData, OocCopyTargetsModalValue } from './copy-targets.token.js';

/**
 * Picks where a row's hours should be copied. Generic over what a target is, so the weekly editor
 * can pass days and the holidays editor can pass holidays.
 *
 * It knows nothing about copying: it returns ids and the caller does the work.
 */
@customElement('ooc-copy-targets-modal')
export class OocCopyTargetsModalElement extends UmbModalBaseElement<
    OocCopyTargetsModalData,
    OocCopyTargetsModalValue
> {
    @state()
    private _selected: string[] = [];

    private _toggle(id: string) {
        this._selected = this._selected.includes(id)
            ? this._selected.filter((entry) => entry !== id)
            : [...this._selected, id];
    }

    /** Additive, not a mode - see OocCopyTargetsModalData.groups. */
    private _selectGroup(ids: string[]) {
        this._selected = [...new Set([...this._selected, ...ids])];
    }

    private _copy() {
        this.updateValue({ ids: this._selected });
        this._submitModal();
    }

    static styles = css`
        .hint {
            margin-bottom: var(--uui-size-space-4);
            color: var(--uui-color-text-alt);
            font-size: var(--uui-type-small-size);
        }
        .groups {
            display: flex;
            flex-wrap: wrap;
            gap: var(--uui-size-space-2);
            margin-bottom: var(--uui-size-space-4);
        }
        .target {
            margin-bottom: var(--uui-size-space-2);
        }
        .occupied {
            margin-left: var(--uui-size-space-2);
            color: var(--uui-color-text-alt);
            font-size: var(--uui-type-small-size);
        }
    `;

    private _renderGroups() {
        const groups = this.data?.groups ?? [];
        if (groups.length === 0) return '';

        return html`<div class="groups">
            ${groups.map(
                (group) => html`<uui-button
                    look="secondary"
                    compact
                    label=${group.label}
                    @click=${() => this._selectGroup(group.ids)}>
                    ${group.label}
                </uui-button>`,
            )}
        </div>`;
    }

    render() {
        const targets = this.data?.targets ?? [];

        return html`
            <umb-body-layout
                headline=${this.localize.term(
                    'openOrClosed_copyHoursFrom',
                    this.data?.sourceLabel ?? '',
                )}>
                <uui-box>
                    ${targets.length === 0
                        ? html`<div class="hint">
                              ${this.localize.term('openOrClosed_copyTargetsEmpty')}
                          </div>`
                        : html`
                              <div class="hint">
                                  ${this.localize.term('openOrClosed_copyTargetsHint')}
                              </div>
                              ${this._renderGroups()}
                              ${targets.map(
                                  (target) => html`<div class="target">
                                      <uui-checkbox
                                          label=${target.label}
                                          .checked=${this._selected.includes(target.id)}
                                          @change=${() => this._toggle(target.id)}>
                                          ${target.label}
                                      </uui-checkbox>
                                      ${target.occupied
                                          ? html`<span class="occupied"
                                                >${this.localize.term(
                                                    'openOrClosed_copyTargetsOccupied',
                                                )}</span
                                            >`
                                          : ''}
                                  </div>`,
                              )}
                          `}
                </uui-box>

                <uui-button
                    slot="actions"
                    look="secondary"
                    label=${this.localize.term('general_cancel')}
                    @click=${() => this._rejectModal()}>
                    ${this.localize.term('general_cancel')}
                </uui-button>
                <uui-button
                    slot="actions"
                    look="primary"
                    color="positive"
                    ?disabled=${this._selected.length === 0}
                    label=${this.localize.term('openOrClosed_copyHoursAction')}
                    @click=${this._copy}>
                    ${this.localize.term('openOrClosed_copyHoursAction')}
                </uui-button>
            </umb-body-layout>
        `;
    }
}

export default OocCopyTargetsModalElement;

declare global {
    interface HTMLElementTagNameMap {
        'ooc-copy-targets-modal': OocCopyTargetsModalElement;
    }
}
```

**If `umb-body-layout` or `uui-checkbox` fails to render in the backoffice**, add
`import '@umbraco-cms/backoffice/components';` at the top. It should not be needed —
`ooc-holiday-modal` already uses `umb-body-layout` with no such import — but `noUncheckedSideEffectImports`
is on, so add it only if the browser proves it necessary.

- [ ] **Step 7: Create the manifest and register it**

Create `src/copy-targets/manifest.ts`:

```ts
export const manifests: Array<UmbExtensionManifest> = [
    {
        type: 'modal',
        alias: 'OpenOrClosed.Modal.CopyTargets',
        name: 'Open Or Closed Copy Targets Modal',
        element: () => import('./ooc-copy-targets-modal.element.js'),
    },
];
```

In `src/bundle.manifests.ts`, add the import in alphabetical position:

```ts
import { manifests as copyTargets } from './copy-targets/manifest'
```

and spread it beside the other modal manifests:

```ts
  ...rangeModal,
  ...copyTargets,
```

- [ ] **Step 8: Type-check and test**

Run: `cd OpenOrClosed/Client && npm run build && npm test`
Expected: build clean, 214 tests PASS. Nothing opens the modal yet — Task 4 is where it first renders.

- [ ] **Step 9: Commit**

```bash
git add OpenOrClosed/Client/src/copy-targets OpenOrClosed/Client/src/bundle.manifests.ts OpenOrClosed/Client/src/localization
git commit -F - <<'MSG'
feat: a shared sidebar modal for picking copy targets

Generic over what a target is - {id, label, occupied} - so the weekly
editor can pass days and the holidays editor can pass holidays, rather
than each growing its own picker. It knows nothing about copying: it
returns ids and the caller does the work.

A sidebar rather than a dropdown of checkboxes because a site can hold
thirty holidays, and because sidebar modals are already this package's
pattern for the range and holiday editors.

Group links are additive, not modes: Weekdays ticks those boxes and
leaves the rest of the selection alone.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
```

---

## Task 4: The weekday action menu

**Files:**
- Modify: `OpenOrClosed/Client/src/weekly-hours/ooc-weekly-hours.element.ts`
- Modify: `OpenOrClosed/Client/src/localization/en.ts`
- Test: `OpenOrClosed/Client/src/localization/en.test.ts`

**Interfaces:**
- Consumes: `copyRangesTo` and `WeeklyHoursDay` (Task 1); `OOC_COPY_TARGETS_MODAL` (Task 3).
- Produces: nothing further depends on this task.

- [ ] **Step 1: Write the failing dictionary test**

In `src/localization/en.test.ts`, add to the argument-taking-entries case:

```ts
        expect(en.openOrClosed.dayActions('Monday')).toContain('Monday');
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd OpenOrClosed/Client && npm test -- en`
Expected: FAIL — `en.openOrClosed.dayActions is not a function`.

- [ ] **Step 3: Add the entries**

In `src/localization/en.ts`, in the *Copy targets modal* block added in Task 3:

```ts
        copyHoursTo: 'Copy hours to…',
        clearHours: 'Clear hours',
        dayActions: (day: string) => `Actions for ${day}`,
        groupWeekdays: 'Weekdays',
        groupWeekend: 'Weekend',
```

Then extend the header comment's list of built-in keys, which currently ends `general_default, and buttons_save (there is no general_save)`, to include `general_all` — the **All** group label reuses it.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd OpenOrClosed/Client && npm test -- en`
Expected: PASS.

- [ ] **Step 5: Add the copy action**

In `src/weekly-hours/ooc-weekly-hours.element.ts`, add the import:

```ts
import { OOC_COPY_TARGETS_MODAL } from '../copy-targets/copy-targets.token.js';
```

and add these methods after `_setRanges`:

```ts
    /** Saturday and Sunday, as System.DayOfWeek numbers. */
    private static readonly WEEKEND = [6, 0];

    private async _copyDay(day: number) {
        const others = WEEK.filter((entry) => entry !== day);

        const groups = [
            {
                label: this.localize.term('openOrClosed_groupWeekdays'),
                ids: others.filter((entry) => !OocWeeklyHoursElement.WEEKEND.includes(entry)),
            },
            {
                label: this.localize.term('openOrClosed_groupWeekend'),
                ids: others.filter((entry) => OocWeeklyHoursElement.WEEKEND.includes(entry)),
            },
            { label: this.localize.term('general_all'), ids: others },
        ]
            // A group offering nothing - Weekend, when the source *is* the weekend's only other day.
            .filter((group) => group.ids.length > 0)
            .map((group) => ({ label: group.label, ids: group.ids.map(String) }));

        try {
            const result = await umbOpenModal(this, OOC_COPY_TARGETS_MODAL, {
                data: {
                    sourceLabel: dayName(day),
                    targets: others.map((entry) => ({
                        id: String(entry),
                        label: dayName(entry),
                        occupied: this._rangesFor(entry).length > 0,
                    })),
                    groups,
                },
            });

            const days = result.ids.map(Number).filter(Number.isInteger);
            if (days.length === 0) return;

            this.value = copyRangesTo(this.value ?? [], day, days);
            this.dispatchEvent(new UmbChangeEvent());
        } catch {
            // Dismissed - nothing copied.
        }
    }
```

- [ ] **Step 6: Add the menu**

Add the render helper before `_renderAxis`:

```ts
    private _renderDayMenu(day: number) {
        // Both actions need hours to act on, so an empty day offers a menu that does nothing -
        // which is better than no menu at all, because the row stays the same shape.
        const hasHours = this._rangesFor(day).length > 0;

        return html`
            <umb-dropdown
                compact
                hide-expand
                look="secondary"
                label=${this.localize.term('openOrClosed_dayActions', dayName(day))}>
                <uui-symbol-more slot="label"></uui-symbol-more>
                <uui-menu-item
                    label=${this.localize.term('openOrClosed_copyHoursTo')}
                    ?disabled=${!hasHours}
                    @click-label=${() => this._copyDay(day)}></uui-menu-item>
                <uui-menu-item
                    label=${this.localize.term('openOrClosed_clearHours')}
                    ?disabled=${!hasHours}
                    @click-label=${() => this._setRanges(day, [])}></uui-menu-item>
            </umb-dropdown>
        `;
    }
```

- [ ] **Step 7: Make room for it in the grid**

In `static styles`, widen the row:

```css
        .row {
            display: grid;
            grid-template-columns: 90px 24px 1fr;
            align-items: center;
            gap: var(--uui-size-space-3);
            margin-bottom: var(--uui-size-space-2);
        }
```

The axis row needs a second empty cell to stay aligned with the tracks:

```ts
    private _renderAxis() {
        return html`<div class="row">
            <div></div>
            <div></div>
            <ooc-time-axis .use24Hour=${this._use24Hour}></ooc-time-axis>
        </div>`;
    }
```

And mount the menu between the day name and the track, in `render`:

```ts
                    <div class="row">
                        <div class="day">${dayName(day)}</div>
                        ${this._renderDayMenu(day)}
                        <ooc-timeline
```

- [ ] **Step 8: Type-check and test**

Run: `cd OpenOrClosed/Client && npm run build && npm test`
Expected: build clean, 214 tests PASS.

- [ ] **Step 9: Verify in the backoffice**

Build the client, open a node with a Weekly Hours property. Confirm: the axis still lines up with the seven tracks; each day shows a `…` button; the menu opens; both items are disabled on an empty day; **Copy hours to…** opens the sidebar; **Weekdays** ticks Monday–Friday minus the source; copying replaces the targets; **Clear hours** empties the day.

If `umb-dropdown` does not render, add `import '@umbraco-cms/backoffice/components';` to the element.

- [ ] **Step 10: Commit**

```bash
git add OpenOrClosed/Client/src/weekly-hours OpenOrClosed/Client/src/localization
git commit -F - <<'MSG'
feat: a per-day action menu on Weekly Hours

Copy hours to... opens the shared target picker with the other six days
and Weekdays / Weekend / All group links, each minus the source so a
group can never offer to copy Monday onto Monday. Clear hours empties
the day. Both are disabled when the day has no hours to act on.

Neither is labelled bare "Copy": the property action menu already has
Copy and Replace from #77, meaning something entirely different.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
```

---

## Task 5: The holiday row action menu

**Files:**
- Modify: `OpenOrClosed/Client/src/holidays/ooc-holidays.element.ts`
- Modify: `OpenOrClosed/Client/src/localization/en.ts`
- Test: `OpenOrClosed/Client/src/localization/en.test.ts`

**Interfaces:**
- Consumes: `duplicateHoliday` (Task 2); `OOC_COPY_TARGETS_MODAL` (Task 3).
- Produces: nothing further depends on this task.

- [ ] **Step 1: Write the failing dictionary test**

In `src/localization/en.test.ts`, add to the argument-taking-entries case:

```ts
        expect(en.openOrClosed.holidayActions('Christmas')).toContain('Christmas');
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd OpenOrClosed/Client && npm test -- en`
Expected: FAIL — `en.openOrClosed.holidayActions is not a function`.

- [ ] **Step 3: Add the entries**

In `src/localization/en.ts`, alongside the other copy entries:

```ts
        duplicateHoliday: 'Duplicate',
        copyWord: 'copy',
        holidayActions: (name: string) => `Actions for ${name || 'holiday'}`,
```

`copyWord` is a bare word only because `duplicateHoliday` builds a parenthetical around it and cannot
localise for itself.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd OpenOrClosed/Client && npm test -- en`
Expected: PASS.

- [ ] **Step 5: Add the three actions**

In `src/holidays/ooc-holidays.element.ts`, add the imports:

```ts
import { OOC_COPY_TARGETS_MODAL } from '../copy-targets/copy-targets.token.js';
```

and add `duplicateHoliday` to the existing `./holiday.js` import block. Then add these methods after
`_editHoliday`:

```ts
    /** Appends a copy and opens it, because the date is the reason you duplicated it. */
    private async _duplicateHoliday(index: number) {
        const holidays = sortHolidays(this._schedule.holidays);
        const source = holidays[index];
        if (!source) return;

        const copy = duplicateHoliday(
            source,
            holidays.map((entry) => entry.name),
            this.localize.term('openOrClosed_copyWord'),
        );

        const appended = [...holidays, copy];
        this._setHolidays(appended);

        // Re-sorted, so the copy is not where it was appended.
        void this._editHoliday(sortHolidays(appended).indexOf(copy));
    }

    /** Copies one holiday's whole hours setting - mode and blocks - onto others. */
    private async _copyHolidayHours(index: number) {
        const holidays = sortHolidays(this._schedule.holidays);
        const source = holidays[index];
        if (!source) return;

        try {
            const result = await umbOpenModal(this, OOC_COPY_TARGETS_MODAL, {
                data: {
                    sourceLabel: source.name || this.localize.term('openOrClosed_holiday'),
                    targets: holidays
                        .map((entry, position) => ({ entry, position }))
                        .filter(({ position }) => position !== index)
                        .map(({ entry, position }) => ({
                            id: String(position),
                            label: entry.name || this.localize.term('openOrClosed_holiday'),
                            // Only custom blocks are work worth warning about losing.
                            occupied:
                                entry.hoursMode === 'custom' &&
                                sanitizeRanges(entry.hours).length > 0,
                        })),
                },
            });

            const positions = new Set(result.ids.map(Number).filter(Number.isInteger));
            if (positions.size === 0) return;

            this._setHolidays(
                holidays.map((entry, position) =>
                    positions.has(position)
                        ? {
                              ...entry,
                              hoursMode: source.hoursMode,
                              hours: source.hours.map((range) => ({ ...range })),
                          }
                        : entry,
                ),
            );
        } catch {
            // Dismissed - nothing copied.
        }
    }

    private _clearHolidayHours(index: number) {
        const holidays = sortHolidays(this._schedule.holidays);
        if (!holidays[index]) return;

        this._setHolidays(
            holidays.map((entry, position) =>
                position === index ? { ...entry, hoursMode: 'default' as const, hours: [] } : entry,
            ),
        );
    }
```

- [ ] **Step 6: Add the menu to the row**

Add the render helper before `_renderRow`:

```ts
    private _renderHolidayMenu(holiday: Holiday, index: number) {
        const hasOwnHours = holiday.hoursMode !== 'default' || holiday.hours.length > 0;

        return html`
            <umb-dropdown
                compact
                hide-expand
                look="secondary"
                label=${this.localize.term('openOrClosed_holidayActions', holiday.name)}>
                <uui-symbol-more slot="label"></uui-symbol-more>
                <uui-menu-item
                    label=${this.localize.term('openOrClosed_duplicateHoliday')}
                    @click-label=${() => this._duplicateHoliday(index)}></uui-menu-item>
                <uui-menu-item
                    label=${this.localize.term('openOrClosed_copyHoursTo')}
                    @click-label=${() => this._copyHolidayHours(index)}></uui-menu-item>
                <uui-menu-item
                    label=${this.localize.term('openOrClosed_clearHours')}
                    ?disabled=${!hasOwnHours}
                    @click-label=${() => this._clearHolidayHours(index)}></uui-menu-item>
            </umb-dropdown>
        `;
    }
```

Add a cell for it at the end of the row in `_renderRow`, after the Hours pill's `<td>`:

```ts
                <td class="actions" @click=${(e: Event) => e.stopPropagation()}>
                    ${this._renderHolidayMenu(holiday, index)}
                </td>
```

**That `stopPropagation` is not optional.** The `<tr>` has `@click=${() => this._editHoliday(index)}`,
so without it every click in this cell — opening the menu included — also opens the holiday sidebar.
The existing name button in the first cell already does the same thing for the same reason.

Add a header cell so the table still has matching columns, after the Hours `<th>`:

```ts
                                  <th scope="col"><span class="sr-only">${this.localize.term(
                                      'general_actions',
                                  )}</span></th>
```

`general_actions` is confirmed present in the core dictionary
(`node_modules/@umbraco-cms/backoffice/dist-cms/assets/lang/en.js:767`, in the `general` section), so
no fallback is needed. Add it to `en.ts`'s header comment listing the built-in keys this package uses,
alongside `general_all`.

Add the styles:

```css
        td.actions {
            width: 1%;
            text-align: right;
        }
        .sr-only {
            position: absolute;
            width: 1px;
            height: 1px;
            overflow: hidden;
            clip: rect(0 0 0 0);
            white-space: nowrap;
        }
```

- [ ] **Step 7: Type-check and test**

Run: `cd OpenOrClosed/Client && npm run build && npm test`
Expected: build clean, 214 tests PASS.

- [ ] **Step 8: Verify in the backoffice**

Open a node with a Holidays property holding at least three holidays. Confirm: each row shows a `…`;
**opening the menu does not open the holiday sidebar**; Duplicate appends `X (copy)` and opens it;
Copy hours to… lists the other holidays and copies mode plus blocks; Clear hours resets to Default
and is disabled on a holiday already on Default with no blocks.

- [ ] **Step 9: Commit**

```bash
git add OpenOrClosed/Client/src/holidays OpenOrClosed/Client/src/localization
git commit -F - <<'MSG'
feat: a per-row action menu on Holidays

Duplicate clones the row under a free name and opens it, because the date
is the reason you duplicated it. Copy hours to... copies the whole hours
setting - mode and blocks - so a Closed holiday makes its targets Closed.
Clear hours returns the row to Default with no blocks.

The actions cell stops click propagation: the row already opens the
holiday sidebar on click, so without it opening the menu would open the
holiday too.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
```

---

## Task 6: Documentation

**Files:**
- Modify: `README.md`
- Create: `docs/superpowers/plans/2026-09-01-copy-hours-checklist.md`

- [ ] **Step 1: Document it in the README**

Insert a new section immediately **before** `## Copying hours between nodes`, so the two copy
mechanisms are explained next to each other:

```markdown
## Copying hours within a property

Every day on **Weekly Hours**, and every row on **Holidays**, has a `…` action menu.

* **Copy hours to…** opens a list of the other days (or holidays) with **Weekdays**, **Weekend** and
  **All** shortcuts. Tick the targets and the source's hours replace theirs — targets that already
  have hours are marked as such before you commit.
* **Clear hours** empties the day, or returns a holiday to `Default`.
* **Duplicate**, on Holidays only, copies a whole holiday under a new name and opens it ready for its
  dates to be changed.

This is not the same thing as the property clipboard below. This copies **within one property on one
node**; the clipboard copies **a whole property value between nodes**.
```

- [ ] **Step 2: Add the changelog entry**

Add to the existing `### Version 17.4.0` block, after the Preset Hours bullet:

```markdown
* Every weekday row and holiday row now has an action menu: **Copy hours to…** replicates a row's
  hours onto any number of others, **Clear hours** empties it, and **Duplicate** copies a whole
  holiday. See [Copying hours within a property](#copying-hours-within-a-property).
```

- [ ] **Step 3: Write the manual checklist**

Create `docs/superpowers/plans/2026-09-01-copy-hours-checklist.md`:

```markdown
# Copying hours between days and holidays — manual checklist

**Status: not yet run.**

Written from `docs/superpowers/specs/2026-09-01-copy-hours-between-days-design.md`, not from its
implementation plan.

Unit tests cover `copyRangesTo` (8) and `duplicateHoliday` (6). The modal, the menus and the layout
are DOM and unreachable from this package's node test run. **Item 4 matters most** — it fails in a
way that looks like an unrelated bug.

## Setup

- A backoffice on Umbraco 17 with the package installed and the client built (`npm run build` in
  `OpenOrClosed/Client`).
- A node with a Weekly Hours property and a Holidays property.
- At least three holidays, one on `Custom` hours, one on `Closed`, one on `Default`.

## Checks

- [ ] **1. The axis still lines up.** The Weekly Hours axis labels sit above the tracks, not above
  the day names or the new menu column. 00:00 is flush with each track's left edge and 24:00 with
  its right.
- [ ] **2. Every day has a menu.** A `…` button sits between each day name and its track, and is
  reachable by Tab with the accessible name "Actions for Monday".
- [ ] **3. Both items are disabled on an empty day.** On a day with no hours, **Copy hours to…** and
  **Clear hours** are both greyed and do nothing when clicked.
- [ ] **4. The holidays menu does not open the holiday.** Click the `…` on a holiday row. The menu
  opens and the holiday sidebar does **not**. If both appear, the actions cell is missing its
  `stopPropagation`.
- [ ] **5. Copy one day to one day.** Fill Monday, Copy hours to… → tick Tuesday → Copy hours.
  Tuesday matches Monday exactly. Monday is unchanged.
- [ ] **6. Dragging the copy leaves the source alone.** Drag Tuesday's block. Monday's stays put.
  (This is the deep-clone check, visible.)
- [ ] **7. Group links are additive.** Open the picker, click **Weekdays**: Tuesday–Friday tick,
  the weekend does not. Click **Weekend** as well: Saturday and Sunday join them, and the weekdays
  stay ticked.
- [ ] **8. A group never offers the source.** Copying *from* Wednesday, the **Weekdays** link ticks
  Monday, Tuesday, Thursday and Friday — not Wednesday.
- [ ] **9. Occupied targets are named.** With hours already on Thursday, the picker shows
  "Thursday · has hours, will be replaced". Copying replaces them without a further prompt.
- [ ] **10. Replace, not merge.** Thursday had 10:00–11:00; after copying Monday's 09:00–12:00 and
  13:00–17:00, Thursday holds exactly those two and no 10:00–11:00.
- [ ] **11. Copying an empty day clears the target.** Clear Monday, then copy Monday to Friday.
  Friday ends up empty — and after **save and reload** it is *still* empty, not reverted. This is
  the sparse-value rule: an empty row written to the server would be dropped rather than cleared.
- [ ] **12. Clear hours.** On a day with three blocks, Clear hours empties it in one go. Save and
  reload: still empty.
- [ ] **13. Cancel does nothing.** Open the picker, tick two days, Cancel. Neither changes.
- [ ] **14. Copy hours is disabled with nothing ticked.** The primary button is greyed until at
  least one target is ticked.
- [ ] **15. Duplicate a holiday.** On "Christmas Day", Duplicate. A row named "Christmas Day (copy)"
  appears and its sidebar opens. Change the date to 26 December, save. Both rows are present and
  correctly sorted.
- [ ] **16. Duplicate twice.** Duplicate "Christmas Day" again: the new row is "Christmas Day
  (copy 2)", not a second "(copy)".
- [ ] **17. Duplicating a Custom holiday deep-copies.** Duplicate a holiday with Custom hours, then
  change the copy's blocks. The original's are unchanged.
- [ ] **18. Copy a Closed holiday's hours.** From a holiday set to Closed, Copy hours to… → a
  Custom holiday. The target becomes Closed. Its old blocks are gone.
- [ ] **19. Only Custom targets are flagged.** In that picker, the holiday on Custom shows "has
  hours, will be replaced"; the ones on Closed and Default do not.
- [ ] **20. Clear a holiday's hours.** On a Custom holiday, Clear hours: it returns to Default with
  no blocks, and the Hours column shows "Default". The item is disabled on a holiday already on
  Default.
- [ ] **21. One holiday only.** With a single holiday, Copy hours to… says there is nowhere else to
  copy to, and offers only Cancel.
- [ ] **22. Save and reload everything.** All copies, duplicates and clears persist, and the
  document is not left dirty — no "Discard unsaved changes" prompt on navigating away without an
  edit.
- [ ] **23. The two "copy" mechanisms stay distinct.** The property's own action menu (the `…` on
  the property, or right-click) still shows **Copy** and **Replace** for the whole property value,
  and nothing in the editor's own menus is labelled bare "Copy".
```

- [ ] **Step 4: Commit**

```bash
git add README.md docs/superpowers/plans/2026-09-01-copy-hours-checklist.md
git commit -F - <<'MSG'
docs: README and checklist for copying hours within a property

The README section sits immediately above the property clipboard section
so the two are explained side by side - one copies within a property on
one node, the other copies a whole property value between nodes.

23 checklist items, none of them run. Item 4 is the one to run first:
a missing stopPropagation in the holidays actions cell opens the holiday
sidebar along with the menu, which reads as an unrelated bug.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
```

---

## Self-review

**Spec coverage**

| Spec section | Task |
|---|---|
| `copyRangesTo`, sparse-value rule, deep clone | 1 |
| `WeeklyHoursDay` moved out of the element; translator import | 1 |
| `duplicateHoliday`, naming and deep clone, `copyWord` parameter | 2 |
| `ooc-copy-targets` modal, token, `{id,label,occupied}`, additive groups | 3 |
| Weekly menu: Copy hours to…, Clear hours; three-column grid; axis cell | 4 |
| Weekly groups: Weekdays / Weekend / All, each minus the source | 4 |
| Holidays menu: Duplicate, Copy hours to…, Clear hours | 5 |
| Holidays copy takes mode **and** blocks | 5 |
| Occupied = `custom` with blocks | 5 |
| Duplicate appends and opens the modal | 5 |
| Clear disabled when it would do nothing; no confirm | 4, 5 |
| Never a bare "Copy" | 4, 5 (labels), 6 (README), 6 (checklist 23) |
| Dictionary: 13 entries, `general_all` in the header comment | 3 (5), 4 (5), 5 (3) |
| Unit test tables — all 8 + 6 cases | 1, 2 |
| README, changelog, checklist | 6 |
| Risk: dropdown in a `<tr>` opening the holiday | 5 (step 6), 6 (checklist 4) |
| Risk: three-column grid and the axis | 4 (step 7), 6 (checklist 1) |
| Risk: positional holiday ids | 5 (resolved against the same sorted array) |
| Risk: clearing with no undo | 4, 5 (disabled when empty) |
| Deferred items | not implemented, by design |

**Placeholder scan** — no TBD/TODO, no "handle edge cases", no "similar to Task N". One step carries a
conditional — whether `umb-dropdown` needs `import '@umbraco-cms/backoffice/components';` — which
cannot be settled without a browser, so it names the exact import and the evidence against needing it
(`ooc-holiday-modal` already uses `umb-body-layout` with no such import). `general_all` and
`general_actions` were both verified present in the core dictionary while writing this plan.

**Type consistency**

- `copyRangesTo(week: WeeklyHoursDay[], sourceDay: number, targetDays: number[]): WeeklyHoursDay[]` — Task 1, called in Task 4 step 5.
- `duplicateHoliday(holiday: Holiday, existingNames: string[], copyWord: string): Holiday` — Task 2, called in Task 5 step 5 with all three arguments in that order.
- `OocCopyTargetsModalData` / `…Value` — Task 3; both callers pass `{ sourceLabel, targets, groups? }` and read `{ ids }`.
- Target ids are **strings** in the modal and converted with `Number` by both callers — weekdays to `System.DayOfWeek` numbers, holidays to positions in the sorted array.
- `WeeklyHoursDay` is re-exported from the element (Task 1 step 5), so `weekly-hours/clipboard/paste.translator.test.ts` and the clipboard manifest keep working untouched.
