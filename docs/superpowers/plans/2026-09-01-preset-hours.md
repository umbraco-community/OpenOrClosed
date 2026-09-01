# Preset Hours Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Configure blocks of hours once on a data type, then apply them all at once by clicking an empty timeline track.

**Architecture:** One new property on `ooc-timeline` (`preset`) plus one rule — a click on an *empty* track lays the whole preset down instead of creating a single block — reaches all three places the element is already mounted. The preset itself is edited by a new config-only property editor UI that mounts the same timeline. The only new logic that can be got wrong quietly is `sanitizePreset`, which is pure and unit-tested.

**Tech Stack:** TypeScript 5.8, Lit 3, Umbraco 17 backoffice (`@umbraco-cms/backoffice`), Vitest 3 (node environment, no DOM), Vite 7.

**Spec:** `docs/superpowers/specs/2026-09-01-preset-hours-design.md` — read it before Task 1. It records *why* each decision was made; this plan records *what to type*.

## Global Constraints

- **No C# changes.** Nothing outside `OpenOrClosed/Client/` and `README.md` is touched. `DataTypeConfig` reads toggles only, and applying a preset writes ordinary ranges into the property value.
- **An empty preset must behave exactly as today.** Both new settings default to `[]`, and every code path falls back to the existing `createRange` behaviour when the preset is empty. No existing data type may change behaviour.
- **Setting name:** label **Preset Hours**, alias `presetHours`, default `[]`. Never "Default" — the Holidays editor already has *Default holiday hours* as part of its **value**.
- **`byAppointmentOnly` is stripped when the setting is read**, not when the preset is applied, so the ghost preview shows exactly what a click will produce.
- **The preset config editor always shows 24-hour times and always offers the appointment flag.** A settings property editor UI cannot see the values of the settings beside it.
- **Ghost preview blocks must carry `aria-hidden="true"` and `pointer-events: none`.** `_onTrackPointerDown` bails unless `event.target === event.currentTarget`, so a ghost accepting pointer events would swallow the click it advertises.
- **All commands run from `OpenOrClosed/Client/`.** Tests: `npm test`. Type-check and build: `npm run build` (runs `tsc` first, and `noUnusedLocals` is on — a leftover import fails the build).
- **House style:** 4-space indent, single quotes, `.js` extensions on relative imports, `import type` for type-only imports, comments explain *why* not *what*.
- **Every commit message ends with the trailer** `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
- **Branch:** `feature/preset-hours`, already created off `master`. The spec is already committed on it.
- **Do not bump `OpenOrClosed.csproj`.** The changelog entry goes in on this branch; the version bump happens on a release branch, as it did for 17.3.0.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/timeline/time-range.ts` | + `sanitizePreset` — the only new pure logic |
| `src/timeline/time-range.test.ts` | + `sanitizePreset` cases |
| `src/timeline/ooc-time-axis.element.ts` | **new** — the 00:00–24:00 tick scale, extracted from the weekly editor so two consumers share one copy |
| `src/timeline/ooc-timeline.element.ts` | + `preset`, the empty-track rule, the ghost preview, the accessible name, the announcement |
| `src/preset-hours/ooc-preset-hours.element.ts` | **new** — edits the `presetHours` setting: an axis over one timeline |
| `src/preset-hours/manifest.ts` | **new** — `OpenOrClosed.PropertyEditorUi.PresetHours` |
| `src/bundle.manifests.ts` | register `preset-hours` |
| `src/weekly-hours/manifest.ts` | + the `presetHours` setting |
| `src/weekly-hours/ooc-weekly-hours.element.ts` | mount `ooc-time-axis`, feed `.preset` to all seven rows |
| `src/holidays/manifest.ts` | + the `presetHours` setting |
| `src/holidays/ooc-holidays.element.ts` | feed `.preset` to the default track, pass it into the holiday modal |
| `src/holidays/holiday-modal.token.ts` | + `presetHours` on the modal data |
| `src/holidays/ooc-holiday-modal.element.ts` | feed `.preset` to the Custom track |
| `src/localization/en.ts` | + 5 entries |
| `src/localization/en.test.ts` | fixture 7 → 9, cover the new argument-taking entries |
| `README.md` | Weekly Hours and Holidays sections, changelog |
| `docs/superpowers/plans/2026-09-01-preset-hours-checklist.md` | **new** — manual backoffice checklist |

---

## Task 1: `sanitizePreset`

The whole decision "what is a usable preset" as one pure function. Nothing consumes it yet, so this task is testable in complete isolation.

**Files:**
- Modify: `OpenOrClosed/Client/src/timeline/time-range.ts` (append after `sanitizeRanges`, at the end of the file)
- Test: `OpenOrClosed/Client/src/timeline/time-range.test.ts` (append after the `sanitizeRanges` block, around line 289)

**Interfaces:**
- Consumes: `sanitizeRanges(raw: unknown): HoursRange[]` and `parseTime(value: string): number`, both already exported from `time-range.ts`.
- Produces: `sanitizePreset(raw: unknown, allowAppointmentOnly: boolean): HoursRange[]` — used by Task 5 in both `ooc-weekly-hours` and `ooc-holidays`.

- [ ] **Step 1: Write the failing tests**

Add `sanitizePreset` to the existing import block at the top of `time-range.test.ts`, immediately before `sanitizeRanges` (the list is alphabetical). Then append this block after `describe('sanitizeRanges', …)`:

```ts
describe('sanitizePreset', () => {
    it('returns an empty preset for anything unusable', () => {
        expect(sanitizePreset(undefined, true)).toEqual([]);
        expect(sanitizePreset(null, true)).toEqual([]);
        expect(sanitizePreset({}, true)).toEqual([]);
        expect(sanitizePreset('09:00', true)).toEqual([]);
    });

    it('sorts the blocks it keeps', () => {
        expect(sanitizePreset([range('13:00', '17:00'), range('09:00', '12:00')], true)).toEqual([
            range('09:00', '12:00'),
            range('13:00', '17:00'),
        ]);
    });

    it('drops a block overlapping the one before it', () => {
        // sanitizeRanges tolerates this; a preset can be hand-written through uSync, and the drag
        // maths clamps against neighbours that overlapping blocks make meaningless.
        expect(sanitizePreset([range('09:00', '13:00'), range('12:00', '17:00')], true)).toEqual([
            range('09:00', '13:00'),
        ]);
    });

    it('measures from the last block kept, not the last one seen', () => {
        // 10:00-20:00 overlaps 09:00-13:00 and goes. 14:00-17:00 must survive: it clears the block
        // that was kept, and only clashes with the one that never made it in.
        expect(
            sanitizePreset(
                [range('09:00', '13:00'), range('10:00', '20:00'), range('14:00', '17:00')],
                true,
            ),
        ).toEqual([range('09:00', '13:00'), range('14:00', '17:00')]);
    });

    it('keeps blocks that touch, because touching is not overlapping', () => {
        expect(sanitizePreset([range('09:00', '12:00'), range('12:00', '17:00')], true)).toEqual([
            range('09:00', '12:00'),
            range('12:00', '17:00'),
        ]);
    });

    it('clears the appointment flag when the editor does not offer it', () => {
        const raw = [{ start: '09:00', end: '17:00', label: 'Desk', byAppointmentOnly: true }];

        expect(sanitizePreset(raw, false)).toEqual([
            { start: '09:00', end: '17:00', label: 'Desk', byAppointmentOnly: false },
        ]);
    });

    it('keeps the appointment flag when the editor offers it', () => {
        const raw = [{ start: '09:00', end: '17:00', label: null, byAppointmentOnly: true }];

        expect(sanitizePreset(raw, true)).toEqual([
            { start: '09:00', end: '17:00', label: null, byAppointmentOnly: true },
        ]);
    });

    it('drops a malformed block without losing the valid ones around it', () => {
        const raw = [
            range('09:00', '12:00'),
            { start: 'nope', end: '13:00' },
            range('13:00', '17:00'),
        ];

        expect(sanitizePreset(raw, true)).toEqual([
            range('09:00', '12:00'),
            range('13:00', '17:00'),
        ]);
    });
});
```

`range(start, end)` is the helper already at the top of the file: it returns `{ start, end, label: null, byAppointmentOnly: false }`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd OpenOrClosed/Client && npm test -- time-range`
Expected: FAIL — `sanitizePreset is not a function`, or a TS resolution error on the import.

- [ ] **Step 3: Write the implementation**

Append to the end of `src/timeline/time-range.ts`:

```ts
/**
 * A preset read from data type configuration, fit to apply to a track.
 *
 * `sanitizeRanges` does the coercion and the sort, but tolerates overlaps - harmless for a value the
 * editor wrote, since it cannot produce one, but a preset can arrive by hand through uSync or a data
 * type import. Overlaps have to go: `boundsFor` derives a block's limits from its immediate
 * neighbours, so `moveRange` and `resizeRange` would clamp against nothing meaningful.
 *
 * `allowAppointmentOnly` is false when the editor's own appointment-only setting is off, so a flag
 * the content editor could neither see nor clear is never written into a document.
 */
export function sanitizePreset(raw: unknown, allowAppointmentOnly: boolean): HoursRange[] {
    const kept: HoursRange[] = [];

    for (const range of sanitizeRanges(raw)) {
        // Against the last block kept, not the last one seen: a dropped block must not become the
        // point everything after it is measured from.
        const previous = kept[kept.length - 1];
        if (previous && parseTime(range.start) < parseTime(previous.end)) continue;

        kept.push(allowAppointmentOnly ? range : { ...range, byAppointmentOnly: false });
    }

    return kept;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd OpenOrClosed/Client && npm test`
Expected: PASS — the whole suite, not just the new block.

- [ ] **Step 5: Type-check**

Run: `cd OpenOrClosed/Client && npm run build`
Expected: no `tsc` errors.

- [ ] **Step 6: Commit**

```bash
git add OpenOrClosed/Client/src/timeline/time-range.ts OpenOrClosed/Client/src/timeline/time-range.test.ts
git commit -F - <<'MSG'
feat: sanitizePreset, for hours read from data type configuration

sanitizeRanges tolerates overlapping blocks, which has been harmless
because only the editor has written those values and it cannot produce
one. A preset can arrive by hand through uSync, and an overlapping one
makes the neighbour clamps in moveRange and resizeRange meaningless, so
the preset path drops overlaps. The existing day path is left as it is.

Also clears byAppointmentOnly when the editor does not offer the flag,
so an invisible flag is never written into a document.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
```

---

## Task 2: Extract `ooc-time-axis`

A pure refactor, landed before anything depends on it. The preset editor needs the same 24-hour scale the weekly editor draws, and copying 25 lines of tick maths is the alternative.

**Files:**
- Create: `OpenOrClosed/Client/src/timeline/ooc-time-axis.element.ts`
- Modify: `OpenOrClosed/Client/src/weekly-hours/ooc-weekly-hours.element.ts` (imports at lines 9–16, `_renderAxis` at lines 136–153, the `.axis` and `.tick` styles at lines 111–127)

**Interfaces:**
- Consumes: `DAY_MINUTES` and `formatAxis(minutes: number, use24Hour: boolean): string` from `time-range.ts`.
- Produces: the custom element `<ooc-time-axis .use24Hour=${boolean}>`, registered in `HTMLElementTagNameMap`. Task 4 mounts it too.

**No new tests.** There is no DOM in this package's test run, so the guard here is `tsc` plus the existing `formatAxis` tests, which are untouched. Visual confirmation is item 1 of the manual checklist in Task 6.

- [ ] **Step 1: Create the element**

Create `src/timeline/ooc-time-axis.element.ts`:

```ts
import { css, customElement, html, property } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { DAY_MINUTES, formatAxis } from './time-range.js';

/**
 * The 00:00-24:00 scale drawn above a track. Presentational only - it has no ranges, no events and
 * no state, so both the weekly editor and the preset settings editor can mount it as-is.
 */
@customElement('ooc-time-axis')
export class OocTimeAxisElement extends UmbLitElement {
    @property({ type: Boolean })
    use24Hour = true;

    /** The two outer ticks are pulled inside the box; the rest are centred on their position. */
    private static readonly TICKS = [
        { at: 0, minutes: 0, cls: 'first' },
        { at: 25, minutes: 6 * 60, cls: '' },
        { at: 50, minutes: 12 * 60, cls: '' },
        { at: 75, minutes: 18 * 60, cls: '' },
        { at: 100, minutes: DAY_MINUTES, cls: 'last' },
    ];

    static styles = css`
        :host {
            display: block;
            position: relative;
            height: 18px;
        }
        .tick {
            position: absolute;
            font-size: var(--uui-type-small-size);
            color: var(--uui-color-text-alt);
            transform: translateX(-50%);
        }
        .tick.first {
            transform: none;
        }
        .tick.last {
            transform: translateX(-100%);
        }
    `;

    render() {
        return html`${OocTimeAxisElement.TICKS.map(
            (tick) => html`<span class="tick ${tick.cls}" style="left:${tick.at}%"
                >${formatAxis(tick.minutes, this.use24Hour)}</span
            >`,
        )}`;
    }
}

export default OocTimeAxisElement;

declare global {
    interface HTMLElementTagNameMap {
        'ooc-time-axis': OocTimeAxisElement;
    }
}
```

- [ ] **Step 2: Switch the weekly editor over**

In `src/weekly-hours/ooc-weekly-hours.element.ts`:

Replace the whole `_renderAxis` method with:

```ts
    private _renderAxis() {
        return html`<div class="row">
            <div></div>
            <ooc-time-axis .use24Hour=${this._use24Hour}></ooc-time-axis>
        </div>`;
    }
```

Delete the `.axis`, `.tick`, `.tick.first` and `.tick.last` rules from `static styles` — they now live in the new element. Keep `:host`, `.row` and `.day`.

Add the import beside the existing timeline import:

```ts
import '../timeline/ooc-time-axis.element.js';
```

Then trim the now-unused names from the `time-range.js` import — `DAY_MINUTES` and `formatAxis` are no longer referenced, and `noUnusedLocals` fails the build on either. The import becomes:

```ts
import { parseTime, sanitizeRanges, type HoursRange } from '../timeline/time-range.js';
```

- [ ] **Step 3: Type-check and test**

Run: `cd OpenOrClosed/Client && npm run build && npm test`
Expected: build clean (this is where a leftover `DAY_MINUTES` import surfaces), suite PASS with no change in count.

- [ ] **Step 4: Commit**

```bash
git add OpenOrClosed/Client/src/timeline/ooc-time-axis.element.ts OpenOrClosed/Client/src/weekly-hours/ooc-weekly-hours.element.ts
git commit -F - <<'MSG'
refactor: extract the time axis into its own element

The preset settings editor needs the same 00:00-24:00 scale the weekly
editor draws. Extracting it now means one copy of the tick positions and
the first/last transforms rather than two. No behaviour change.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
```

---

## Task 3: The empty-track rule in `ooc-timeline`

The gesture itself. Inert until something passes a preset, so this lands safely ahead of every consumer.

**Files:**
- Modify: `OpenOrClosed/Client/src/timeline/ooc-timeline.element.ts`
- Modify: `OpenOrClosed/Client/src/localization/en.ts` (the `// Timeline accessible names` block, around line 60)
- Test: `OpenOrClosed/Client/src/localization/en.test.ts` (the *phrases the two argument-taking entries* case, around line 56)

**Interfaces:**
- Consumes: `sanitizePreset` exists but is *not* called here — consumers sanitise, exactly as they already do for `ranges`. `formatRange`, `parseTime` and `largestGap` are already imported by this file.
- Produces: the `preset: HoursRange[]` property on `<ooc-timeline>`, plus dictionary entries `openOrClosed_applyPresetHours` and `openOrClosed_presetHoursApplied`. Task 5 sets `.preset` from three places.

**What is and is not tested.** The element behaviour — the rule, the ghost, the accessible name — cannot be unit-tested: the test run has no DOM and this file imports the backoffice runtime. That is exactly why the *decision* is a pure function (Task 1) and the element change is a two-branch `if` around it. The dictionary entries the element depends on **are** testable, and that is this task's red-green cycle. The rest is covered by the manual checklist.

- [ ] **Step 1: Write the failing dictionary test**

In `src/localization/en.test.ts`, replace this case:

```ts
    it('phrases the two argument-taking entries from their arguments', () => {
        expect(en.openOrClosed.errorTooShort(15)).toContain('15');
        expect(en.openOrClosed.openHolidayAction('Christmas')).toContain('Christmas');
        expect(en.openOrClosed.defaultHoursHint('09:00 – 17:00')).toContain('09:00 – 17:00');
    });
```

with:

```ts
    it('phrases the argument-taking entries from their arguments', () => {
        expect(en.openOrClosed.errorTooShort(15)).toContain('15');
        expect(en.openOrClosed.openHolidayAction('Christmas')).toContain('Christmas');
        expect(en.openOrClosed.defaultHoursHint('09:00 – 17:00')).toContain('09:00 – 17:00');
        expect(en.openOrClosed.applyPresetHours('09:00 – 12:00, 13:00 – 17:00')).toContain(
            '09:00 – 12:00, 13:00 – 17:00',
        );
        expect(en.openOrClosed.presetHoursApplied('09:00 – 12:00')).toContain('09:00 – 12:00');
    });
```

The old name said "two" while checking three; it now covers five and stops claiming a count.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd OpenOrClosed/Client && npm test -- en`
Expected: FAIL — `en.openOrClosed.applyPresetHours is not a function`.

- [ ] **Step 3: Add the dictionary entries**

In `src/localization/en.ts`, under the `// Timeline accessible names` comment, beside `byAppointmentOnlyShort`:

```ts
        applyPresetHours: (hours: string) => `Apply preset hours: ${hours}`,
        presetHoursApplied: (hours: string) => `Preset hours applied: ${hours}`,
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd OpenOrClosed/Client && npm test -- en`
Expected: PASS.

- [ ] **Step 5: Add the `preset` property and its helpers**

In `src/timeline/ooc-timeline.element.ts`, after the `defaultDurationMinutes` property:

```ts
    /**
     * Blocks a click on an *empty* track lays down all at once. Consumers sanitise, exactly as they
     * already do for `ranges`, which keeps this element free of the configuration it would otherwise
     * have to read.
     */
    @property({ type: Array })
    preset: HoursRange[] = [];
```

Then, beside the other private helpers (after `_accessibleName`):

```ts
    /** Whether a click should lay the preset down rather than create a single range. */
    private get _presetApplies(): boolean {
        return this.ranges.length === 0 && this.preset.length > 0;
    }

    private get _presetSummary(): string {
        return this.preset.map((range) => formatRange(range, this.use24Hour)).join(', ');
    }

    /** Lays the whole preset down and reports it as one change. */
    private _applyPreset() {
        // Cloned: the preset belongs to the data type configuration, and the ranges handed on from
        // here are about to be dragged around.
        this._commit(this.preset.map((range) => ({ ...range })));

        // _commit only announces a single range, by index. This one is about the whole set.
        this._announcement = this.localize.term(
            'openOrClosed_presetHoursApplied',
            this._presetSummary,
        );
    }
```

- [ ] **Step 6: Route the pointer and keyboard paths through it**

Replace the body of `_onTrackPointerDown` with:

```ts
    private _onTrackPointerDown = (event: PointerEvent) => {
        // Primary button only - right-clicking the track should open a context menu, not
        // silently add hours.
        if (event.button !== 0 || event.target !== event.currentTarget) return;

        if (this._presetApplies) {
            this._applyPreset();
            return;
        }

        const created = createRange(
            this.ranges,
            this.#minutesFromEvent(event),
            this.defaultDurationMinutes,
            this.snapMinutes,
        );

        if (created) this._commit(created);
    };
```

And insert the same test at the top of `_onTrackKeydown`, after the existing guard:

```ts
    private _onTrackKeydown = (event: KeyboardEvent) => {
        if (event.target !== event.currentTarget || event.key !== 'Enter') return;

        if (this._presetApplies) {
            event.preventDefault();
            this._applyPreset();
            void this._focusBlock(0);
            return;
        }

        const gap = largestGap(this.ranges);
        if (!gap) return;

        event.preventDefault();
        const created = createRange(this.ranges, gap.start, this.defaultDurationMinutes, this.snapMinutes);
        if (created) {
            this._commit(created);
            // The new range is wherever sorting put it - find it by its start time.
            void this._focusBlock(created.findIndex((range) => parseTime(range.start) === gap.start));
        }
    };
```

- [ ] **Step 7: Add the ghost preview**

Add the render helper beside `_renderBlock`:

```ts
    /**
     * A faint copy of the preset, shown only while the track is empty, so the gesture that applies
     * it is visible before it is used.
     *
     * `pointer-events: none` in the styles is load-bearing: _onTrackPointerDown bails unless the
     * event target is the track itself, so a ghost accepting pointer events would swallow the very
     * click it exists to advertise.
     */
    private _renderGhosts() {
        return this.preset.map((range) => {
            const start = parseTime(range.start);

            return html`<i
                class="ghost"
                aria-hidden="true"
                style="left:${this._percent(start)}%;width:${this._percent(
                    parseTime(range.end) - start,
                )}%"></i>`;
        });
    }
```

Add to `static styles`, after the `.block` rules:

```css
        /* The shape of a block without any of its interaction - see _renderGhosts. */
        .ghost {
            position: absolute;
            top: 3px;
            bottom: 3px;
            border: 1px dashed var(--uui-color-selected);
            border-radius: var(--uui-border-radius);
            background: var(--uui-color-surface-alt);
            opacity: 0.4;
            pointer-events: none;
        }
```

And mount it in `render`, before the real blocks:

```ts
                ${this._presetApplies ? this._renderGhosts() : ''}
                ${this.ranges.map((range, index) => this._renderBlock(range, index))}
```

- [ ] **Step 8: Say what Enter will do**

Add beside the other getters:

```ts
    /** What the track itself is called. With a preset waiting, it also says what a click will do. */
    private get _trackName(): string {
        if (!this._presetApplies) return this.trackLabel;

        return [
            this.trackLabel,
            this.localize.term('openOrClosed_applyPresetHours', this._presetSummary),
        ]
            .filter(Boolean)
            .join(', ');
    }
```

and in `render`, change the track's label:

```ts
                aria-label=${this._trackName}
```

- [ ] **Step 9: Type-check and test**

Run: `cd OpenOrClosed/Client && npm run build && npm test`
Expected: build clean, suite PASS.

- [ ] **Step 10: Commit**

```bash
git add OpenOrClosed/Client/src/timeline/ooc-timeline.element.ts OpenOrClosed/Client/src/localization/en.ts OpenOrClosed/Client/src/localization/en.test.ts
git commit -F - <<'MSG'
feat: clicking an empty track applies a preset

One property and one rule: with a preset set and the track empty, a
click or Enter lays down every block at once. A track that already has
blocks keeps today's behaviour exactly - clicking a gap adds one block -
so both gestures survive, each in the case where it is the obvious one,
and applying a preset can never destroy hand-tuned hours.

Empty tracks draw the preset faintly, because the gesture is otherwise
invisible. Those ghosts are aria-hidden and refuse pointer events:
_onTrackPointerDown requires the track itself as the event target, so a
ghost that took the click would swallow it.

Inert until a consumer passes a preset.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
```

---

## Task 4: The Preset Hours config editor

Where a preset is set. After this task the setting can be configured but nothing reads it — which is the point: it isolates the one real risk in the feature.

**Risk this task exists to surface early.** `umbOpenModal(this, …)` needs a modal manager context, and a settings UI sits in the data type workspace rather than a content one. If the range sidebar does not open from the data type settings panel, drop the modal from this element and edit the selected block inline instead — two `<uui-input type="time">` fields plus a label field, driven by the `edit-range` event's index — which needs no context. Drag, create and delete keep working either way. Do not carry on to Task 5 without knowing which of the two it is.

**Files:**
- Create: `OpenOrClosed/Client/src/preset-hours/ooc-preset-hours.element.ts`
- Create: `OpenOrClosed/Client/src/preset-hours/manifest.ts`
- Modify: `OpenOrClosed/Client/src/bundle.manifests.ts`
- Modify: `OpenOrClosed/Client/src/localization/en.ts`

**Interfaces:**
- Consumes: `<ooc-time-axis>` (Task 2), `<ooc-timeline>` (Task 3), `OOC_RANGE_MODAL` and `sanitizeRanges` (existing).
- Produces: the property editor UI alias `OpenOrClosed.PropertyEditorUi.PresetHours`, which Task 5 names in two manifests. Dictionary entry `openOrClosed_presetHoursLabel`.

- [ ] **Step 1: Add the label to the dictionary**

In `src/localization/en.ts`, in the `// Property editor manifests` block beside `weeklyHoursLabel`:

```ts
        presetHoursLabel: 'Preset Hours',
```

- [ ] **Step 2: Create the element**

Create `src/preset-hours/ooc-preset-hours.element.ts`:

```ts
import { css, customElement, html, property } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UmbChangeEvent } from '@umbraco-cms/backoffice/event';
import { umbOpenModal } from '@umbraco-cms/backoffice/modal';
import type {
    UmbPropertyEditorConfigCollection,
    UmbPropertyEditorUiElement,
} from '@umbraco-cms/backoffice/property-editor';
import { sanitizeRanges, type HoursRange } from '../timeline/time-range.js';
import { OOC_RANGE_MODAL } from '../timeline/range-modal.token.js';
import '../timeline/ooc-time-axis.element.js';
import '../timeline/ooc-timeline.element.js';

/**
 * Edits the Preset Hours data type setting: one 24-hour track of blocks that the editors then lay
 * onto an empty day in a single click.
 *
 * A settings editor cannot see the *values* of the settings beside it, so neither `time_24hr` nor
 * `showAppointmentOnly` is readable here. It therefore always shows 24-hour times - an admin
 * surface configured once, which is a smaller cost than the machinery to read a sibling value - and
 * always offers the appointment flag. The consumers strip that flag as they read the setting, so a
 * flag a content editor cannot see is never written into a document.
 */
@customElement('ooc-preset-hours')
export class OocPresetHoursElement extends UmbLitElement implements UmbPropertyEditorUiElement {
    @property({ type: Array })
    value: HoursRange[] = [];

    @property({ attribute: false })
    config?: UmbPropertyEditorConfigCollection;

    private get _ranges(): HoursRange[] {
        return sanitizeRanges(this.value);
    }

    private _setRanges(ranges: HoursRange[]) {
        this.value = ranges;
        this.dispatchEvent(new UmbChangeEvent());
    }

    private async _editRange(index: number) {
        try {
            const result = await umbOpenModal(this, OOC_RANGE_MODAL, {
                data: { ranges: this._ranges, index, showAppointmentOnly: true },
            });

            this._setRanges(result.ranges);
        } catch {
            // Dismissed - leave the preset as it was.
        }
    }

    static styles = css`
        :host {
            display: block;
        }
    `;

    render() {
        const label = this.localize.term('openOrClosed_presetHoursLabel');

        return html`
            <ooc-time-axis></ooc-time-axis>
            <ooc-timeline
                .ranges=${this._ranges}
                .showAppointmentOnly=${true}
                .trackLabel=${label}
                @change=${(e: CustomEvent) => this._setRanges(e.detail.ranges)}
                @edit-range=${(e: CustomEvent) => this._editRange(e.detail.index)}>
            </ooc-timeline>
        `;
    }
}

export default OocPresetHoursElement;

declare global {
    interface HTMLElementTagNameMap {
        'ooc-preset-hours': OocPresetHoursElement;
    }
}
```

No `preset` is passed to its own timeline: a preset editor showing a ghost of itself would be circular. Clicking its empty track creates one block, which is the right behaviour for building a preset from nothing.

- [ ] **Step 3: Create the manifest**

Create `src/preset-hours/manifest.ts`:

```ts
export const manifests: Array<UmbExtensionManifest> = [
    {
        type: 'propertyEditorUi',
        alias: 'OpenOrClosed.PropertyEditorUi.PresetHours',
        name: 'Preset Hours Property Editor UI',
        element: () => import('./ooc-preset-hours.element.js'),
        meta: {
            label: '#openOrClosed_presetHoursLabel',
            icon: 'icon-time',
            group: 'common',
        },
    },
];
```

No `propertyEditorSchemaAlias`: like `OpenOrClosed.PropertyEditorUi.TimeInput`, this is a config-only UI and is never picked as a document type's property editor.

- [ ] **Step 4: Register it in the bundle**

In `src/bundle.manifests.ts`, add the import in alphabetical position among the others:

```ts
import { manifests as presetHours } from './preset-hours/manifest'
```

and spread it beside the other config-only editor:

```ts
  ...timeInput,
  ...presetHours,
```

- [ ] **Step 5: Type-check, test and build the client**

Run: `cd OpenOrClosed/Client && npm run build && npm test`
Expected: build clean, suite PASS. `npm run build` also writes `OpenOrClosed/wwwroot/App_Plugins/OpenOrClosed`, which is what the backoffice loads for the next step.

- [ ] **Step 6: Verify the modal opens from the settings panel**

Nothing references the new UI yet, so add the setting temporarily. Append to `settings.properties` in `src/weekly-hours/manifest.ts`:

```ts
                    {
                        alias: 'presetHours',
                        label: '#openOrClosed_settingPresetHours',
                        description: '{#openOrClosed_settingPresetHoursDescription}',
                        propertyEditorUiAlias: 'OpenOrClosed.PropertyEditorUi.PresetHours',
                    },
```

`en.test.ts` will now fail on two counts — `settings.length` reads 8 against a literal 7, and the dictionary has neither key yet. Both are expected while this scaffold is in place, and Task 5 makes them permanently true. Do not commit this edit.

Run `npm run build`, start the test site, open **Settings → Data Types** and open a Weekly Hours data type. Confirm:

- the track renders with the axis above it;
- clicking bare track creates a block, and dragging its edges resizes it;
- clicking a block **opens the range sidebar** — this is the check the whole task exists for;
- saving the sidebar updates the block;
- saving the data type and reloading brings the blocks back.

If the sidebar does not open, take the inline-inputs fallback described at the top of this task, then re-verify.

Then revert the scaffold, so Task 5 adds it once and for real:

```bash
git checkout OpenOrClosed/Client/src/weekly-hours/manifest.ts
```

- [ ] **Step 7: Commit**

```bash
git add OpenOrClosed/Client/src/preset-hours OpenOrClosed/Client/src/bundle.manifests.ts OpenOrClosed/Client/src/localization/en.ts
git commit -F - <<'MSG'
feat: a Preset Hours data type settings editor

One 24-hour track for the blocks the editors will apply in a click,
built from the same ooc-timeline the content editors mount.

Always 24-hour, and always offering the appointment flag: a settings
editor cannot read the values of the settings beside it, so neither
time_24hr nor showAppointmentOnly is available here. The consumers strip
the appointment flag as they read the setting instead.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
```

---

## Task 5: Wire the three consumers

The feature becomes real here: the setting appears on both data types, and all three tracks honour it.

**Files:**
- Modify: `OpenOrClosed/Client/src/weekly-hours/manifest.ts`
- Modify: `OpenOrClosed/Client/src/weekly-hours/ooc-weekly-hours.element.ts`
- Modify: `OpenOrClosed/Client/src/holidays/manifest.ts`
- Modify: `OpenOrClosed/Client/src/holidays/ooc-holidays.element.ts`
- Modify: `OpenOrClosed/Client/src/holidays/holiday-modal.token.ts`
- Modify: `OpenOrClosed/Client/src/holidays/ooc-holiday-modal.element.ts`
- Modify: `OpenOrClosed/Client/src/localization/en.ts`
- Test: `OpenOrClosed/Client/src/localization/en.test.ts`

**Interfaces:**
- Consumes: `sanitizePreset(raw, allowAppointmentOnly)` (Task 1), the `preset` property on `<ooc-timeline>` (Task 3), the alias `OpenOrClosed.PropertyEditorUi.PresetHours` (Task 4).
- Produces: nothing further depends on this task.

- [ ] **Step 1: Write the failing manifest test**

In `src/localization/en.test.ts`, the *covers every editor and setting* case asserts the setting count against a literal. Change it:

```ts
        expect(settings.length).toBe(9);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd OpenOrClosed/Client && npm test -- en`
Expected: FAIL — `expected 7 to be 9`.

- [ ] **Step 3: Add the setting to both manifests**

In `src/weekly-hours/manifest.ts`, append to `settings.properties` (after `showAppointmentOnly`):

```ts
                    {
                        alias: 'presetHours',
                        label: '#openOrClosed_settingPresetHours',
                        description: '{#openOrClosed_settingPresetHoursDescription}',
                        propertyEditorUiAlias: 'OpenOrClosed.PropertyEditorUi.PresetHours',
                    },
```

and to `defaultData`:

```ts
                    { alias: 'presetHours', value: [] },
```

Make the identical two additions in `src/holidays/manifest.ts`.

A bare `#key` for the label and the `{#key}` UFM form for the description: `en.test.ts` enforces both, because a label goes through `localize.string` while a description is rendered by `umb-ufm-render`, which would print a bare `#key` verbatim.

- [ ] **Step 4: Add the setting's dictionary entries**

In `src/localization/en.ts`, in the `// Data type settings` block after `settingRemoveExpiredDescription`:

```ts
        settingPresetHours: 'Preset Hours',
        settingPresetHoursDescription:
            'Blocks of hours applied in one click to an empty timeline. On Holidays this is a pattern held in the data type — not the Default holiday hours this node falls back to. Leave it empty to add hours one block at a time.',
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd OpenOrClosed/Client && npm test -- en`
Expected: PASS. The *references only keys the dictionary defines* case covers the two new keys automatically.

- [ ] **Step 6: Feed the preset to the weekly editor**

In `src/weekly-hours/ooc-weekly-hours.element.ts`, add a getter beside `_defaultDuration`:

```ts
    /**
     * The configured blocks, ready to apply. The appointment flag is dropped here, as the setting is
     * read, rather than when a preset is applied - so the ghost preview shows exactly what a click
     * will produce.
     */
    private get _presetHours(): HoursRange[] {
        return sanitizePreset(this._setting('presetHours'), this._showAppointmentOnly);
    }
```

Add `sanitizePreset` to the `time-range.js` import. Then in `render`, hoist it out of the loop and pass it to every row:

```ts
    render() {
        const preset = this._presetHours;

        return html`
            ${this._renderAxis()}
            ${WEEK.map(
                (day) => html`
                    <div class="row">
                        <div class="day">${dayName(day)}</div>
                        <ooc-timeline
                            .ranges=${this._rangesFor(day)}
                            .preset=${preset}
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
        `;
    }
```

Sanitising once per render rather than seven times is the reason for the local.

- [ ] **Step 7: Add the preset to the holiday modal's data**

In `src/holidays/holiday-modal.token.ts`, add to `OocHolidayModalData`, after `defaultHours`:

```ts
    /** The data type's configured preset, for the Custom track. Already sanitised by the caller. */
    presetHours: HoursRange[];
```

It is required, not optional, so `tsc` names the call site that forgets it.

- [ ] **Step 8: Feed the preset to both holiday tracks**

In `src/holidays/ooc-holidays.element.ts`, add the getter beside `_showAppointmentOnly`:

```ts
    /**
     * The configured blocks, ready to apply. The appointment flag is dropped here, as the setting is
     * read, rather than when a preset is applied - so the ghost preview shows exactly what a click
     * will produce.
     */
    private get _presetHours(): HoursRange[] {
        return sanitizePreset(this._setting('presetHours'), this._showAppointmentOnly);
    }
```

Add `sanitizePreset` to its `time-range.js` import. Pass it to the default hours track in `render`:

```ts
                <ooc-timeline
                    .ranges=${schedule.defaultHours}
                    .preset=${this._presetHours}
                    .use24Hour=${this._use24Hour}
```

and into the modal, in `_editHoliday`:

```ts
                data: {
                    holiday,
                    defaultHours: schedule.defaultHours,
                    presetHours: this._presetHours,
                    use24Hour: this._use24Hour,
                    showAppointmentOnly: this._showAppointmentOnly,
                },
```

In `src/holidays/ooc-holiday-modal.element.ts`, pass it to the Custom track:

```ts
                              <ooc-timeline
                                  .ranges=${this._hours}
                                  .preset=${this.data?.presetHours ?? []}
                                  .use24Hour=${this.data?.use24Hour ?? true}
```

The modal reads it from `data` rather than from config for the same reason `use24Hour` and `showAppointmentOnly` already do: it has no `UmbPropertyEditorConfigCollection`.

- [ ] **Step 9: Type-check, test and build**

Run: `cd OpenOrClosed/Client && npm run build && npm test`
Expected: build clean, suite PASS.

- [ ] **Step 10: Commit**

```bash
git add OpenOrClosed/Client/src/weekly-hours OpenOrClosed/Client/src/holidays OpenOrClosed/Client/src/localization
git commit -F - <<'MSG'
feat: Preset Hours on the Weekly Hours and Holidays editors

Adds the setting to both data types and passes it to all three tracks:
the seven weekday rows, the Holidays default track, and a holiday's
Custom track. The holiday modal takes it as data, like use24Hour and
showAppointmentOnly, because it has no config collection of its own.

Both settings default to an empty array, and an empty preset falls
straight through to the existing click-to-add-one-block behaviour, so no
existing data type changes behaviour.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
```

---

## Task 6: README and the manual checklist

**Files:**
- Modify: `README.md`
- Create: `docs/superpowers/plans/2026-09-01-preset-hours-checklist.md`

**Interfaces:**
- Consumes: the finished feature.
- Produces: nothing in code.

- [ ] **Step 1: Document it in the Weekly Hours section**

In `README.md`, append to the `### Weekly Hours` section (after the paragraph ending "meaning open until midnight."):

```markdown
Set **Preset Hours** on the data type and an empty day draws them as a faint outline; clicking the
day lays them all down at once. A day that already has hours keeps the original behaviour — clicking
a gap adds a single block — so a preset can never overwrite hours you have tuned by hand. Labels and
the by-appointment flag travel with a preset block, so "Lunch" only has to be typed once.
```

- [ ] **Step 2: Document it in the Holidays section**

Append to the `### Holidays` section:

```markdown
**Preset Hours** works here too, on the **Default holiday hours** track and on a holiday's
**Custom** track. Mind the difference between the two names: *Preset Hours* is configuration, a
pattern held on the data type, while *Default holiday hours* is content — the hours this node's
holidays fall back to.
```

- [ ] **Step 3: Add the changelog entry**

In `README.md`, insert directly above `### Version 17.3.1`:

```markdown
### Version 17.4.0

* Added **Preset Hours** to the Weekly Hours and Holidays data types: configure blocks of hours
  once, then click an empty timeline to apply them all at once. Empty tracks show the preset as a
  faint outline so the gesture is visible; a track that already has hours behaves exactly as before.
  Leaving the setting empty changes nothing.
```

Do not touch `OpenOrClosed/OpenOrClosed.csproj` — the version bump belongs to a release branch.

- [ ] **Step 4: Write the manual checklist**

Create `docs/superpowers/plans/2026-09-01-preset-hours-checklist.md`:

```markdown
# Preset hours — manual checklist

**Status: not yet run.**

Written from `docs/superpowers/specs/2026-09-01-preset-hours-design.md`, not from its implementation
plan. A checklist derived from a plan cannot catch what the plan omitted.

Unit tests cover `sanitizePreset` only. Everything below is element behaviour, which this package
cannot test: the test run is node with no DOM, and `ooc-timeline` imports the backoffice runtime.

## Setup

- A backoffice on Umbraco 17 with the package installed and the client built (`npm run build` in
  `OpenOrClosed/Client`).
- A content node with both a Weekly Hours and a Holidays property.
- A second Weekly Hours data type with **no** preset configured, to prove the unconfigured path.
- A third with a preset and **Enable Appointment Only?** off.

## Checks

- [ ] **1. The axis still renders.** The Weekly Hours editor shows 00:00 / 06:00 / 12:00 / 18:00 /
  24:00 above the seven tracks, the first label flush left and the last flush right, unchanged from
  before this feature. Switching **Time Format** to 12-hour relabels them.
- [ ] **2. Configure a preset.** On a Weekly Hours data type, the **Preset Hours** setting shows an
  axis and one empty track. Click it to add a block; drag its edges; click it to open the range
  sidebar and set 09:00–12:00. Add a second block, 13:00–17:00. Save, reload the data type: both
  blocks are still there.
- [ ] **3. The ghost appears.** On a content node using that data type, every empty day shows two
  faint dashed outlines at 09:00–12:00 and 13:00–17:00.
- [ ] **4. A click applies the whole preset.** Click an empty day anywhere along the track — including
  squarely on top of a ghost, and at 14:00, away from where the blocks will land. Both real blocks
  appear at 09:00–12:00 and 13:00–17:00. The ghosts disappear.
- [ ] **5. A non-empty day is unaffected.** On the day from item 4, click a gap — 18:00, say. One
  single block appears, `defaultOpen`–`defaultClose` long, exactly as before the feature. The
  existing blocks are untouched.
- [ ] **6. Enter does the same as a click.** Tab to an empty day's track and press Enter: the preset
  applies, and focus lands on the first applied block. Arrow keys then move that block.
- [ ] **7. A screen reader announces both.** With a preset set, an empty track is announced as
  "Monday, apply preset hours: 09:00 – 12:00, 13:00 – 17:00". Applying it announces "Preset hours
  applied: 09:00 – 12:00, 13:00 – 17:00".
- [ ] **8. Save and reload.** The applied hours persist, and the document is **not** left dirty —
  no "Discard unsaved changes" prompt on navigating away without an edit.
- [ ] **9. Holidays: the default track.** With a preset on the Holidays data type, the empty
  **Default holiday hours** track shows ghosts and applies on click.
- [ ] **10. Holidays: a holiday's Custom track.** Add a holiday, set **Hours** to Custom. The empty
  track shows ghosts and applies on click. Save the holiday; the hours show in the table's Hours
  column.
- [ ] **11. The appointment flag is stripped.** On the data type with **Enable Appointment Only?**
  off, configure a preset block with the flag on (the setting editor always offers it). Apply it to
  a day: no appointment icon appears, and opening the block's sidebar shows the flag clear.
- [ ] **12. A label travels.** A preset block labelled "Lunch" applies with the label intact, and the
  notepad icon shows on the block.
- [ ] **13. No preset, no change.** On the data type with no preset configured: empty days show no
  ghosts, and clicking one creates a single block at the click point, `defaultOpen`–`defaultClose`
  long. This is the path every existing site is on.
- [ ] **14. An overlapping preset is repaired.** Hand-edit a data type's `presetHours` through uSync
  or a data type import so two blocks overlap (09:00–13:00 and 12:00–17:00). The editor shows one
  ghost and applies one block; it does not produce an overlapping day.
- [ ] **15. The preset editor has no ghost of its own.** The **Preset Hours** setting's own empty
  track shows no outlines, and clicking it creates a single block.
```

- [ ] **Step 5: Commit**

```bash
git add README.md docs/superpowers/plans/2026-09-01-preset-hours-checklist.md
git commit -F - <<'MSG'
docs: README and manual checklist for preset hours

The checklist is written from the spec, not the plan, and is not yet
run - items 1-15 need a real backoffice with three differently
configured data types.

README draws the line the two names invite confusion over: Preset Hours
is configuration on the data type, Default holiday hours is content on
the node.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
```

---

## Self-review

**Spec coverage**

| Spec section | Task |
|---|---|
| `sanitizePreset`, overlap dropping, flag stripping | 1 |
| `ooc-time-axis` extraction | 2 |
| `preset` property, empty-track rule, Enter, ghost preview, accessible name, announcement | 3 |
| `ooc-preset-hours` config editor + manifest + bundle | 4 |
| The three consumers, both manifest settings, `presetHours` on the modal token | 5 |
| Dictionary: 5 entries | 3 (2), 4 (1), 5 (2) |
| `en.test.ts` fixture 7 → 9, argument-taking entries | 5 (fixture), 3 (entries) |
| Unit test table — all 8 cases | 1 |
| README + manual checklist | 6 |
| Risk: modal in the settings panel | 4, with the fallback written out |
| Risk: ghost swallowing the click | 3 (`pointer-events: none`), 6 (checklist item 4) |
| Risk: "Preset Hours" vs "Default holiday hours" | 5 (setting description), 6 (README) |
| Risk: labels travelling with a preset | 6 (README, checklist item 12) |
| Deferred items | not implemented, by design |

**Type consistency**

- `sanitizePreset(raw: unknown, allowAppointmentOnly: boolean): HoursRange[]` — defined in Task 1, called with that signature in Task 5 twice.
- `preset: HoursRange[]` — declared in Task 3, set as `.preset` in Task 5 in three places, and deliberately not set in Task 4.
- `presetHours: HoursRange[]` on `OocHolidayModalData` — added and both call sites updated within Task 5.
- Dictionary keys: `applyPresetHours` and `presetHoursApplied` are added in Task 3 and consumed there; `presetHoursLabel` is added and consumed in Task 4; `settingPresetHours` / `settingPresetHoursDescription` are added and referenced in Task 5.
- `<ooc-time-axis>` with `use24Hour` — created in Task 2, mounted in Task 2 (weekly) and Task 4 (preset editor, default `true`).
