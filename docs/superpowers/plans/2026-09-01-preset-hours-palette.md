# Preset Hours as a Palette — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the preset from a stamp into a palette — hovering or tabbing into a track offers the preset blocks that fit, and you click the ones you want.

**Architecture:** One new pure function (`availablePreset`) holds the clash rule; `ooc-timeline`'s ghosts become real `<button>`s revealed by `:hover` / `:focus-within`, hidden with `visibility: hidden` so they leave the tab order when hidden. The track's own click and Enter handlers revert to their pre-feature behaviour, and no consumer changes at all.

**Tech Stack:** TypeScript 5.8, Lit 3, Umbraco 17 backoffice (`@umbraco-cms/backoffice`), Vitest 3 (node environment, no DOM), Vite 7.

**Spec:** `docs/superpowers/specs/2026-09-01-preset-hours-design.md` — amended for this model. Read it before Task 1, in particular *A focusable control must not be invisible* and *Superseded by the palette model*.

**Prior state:** Tasks 1–6 of `docs/superpowers/plans/2026-09-01-preset-hours.md` are committed on `feature/preset-hours` (`525339e`..`826c943`). This plan amends that work; it does not start from nothing.

## Global Constraints

- **No C# changes**, and **no consumer changes.** `ooc-weekly-hours`, `ooc-holidays` and `ooc-holiday-modal` already pass `.preset` and must be left untouched. If a change to one of them seems necessary, stop — something has gone wrong.
- **`visibility: hidden`, never `opacity: 0`, for a hidden ghost.** `visibility` also removes the button from the tab order; `opacity` would leave a keyboard user focusing a control they cannot see. This is the single most likely defect in the change.
- **Ghosts render after the real blocks in DOM order**, so the tab sequence is track → existing blocks → offers.
- **A clashing block is withheld whole, never truncated.** Touching is not clashing, consistent with `validateRange`.
- **An empty preset must leave every gesture exactly as it was before the feature.** Bare-track click and Enter revert to their pre-feature bodies, so this is structural rather than conditional.
- **All commands run from `OpenOrClosed/Client/`.** Tests: `npm test`. Type-check and build: `npm run build` (runs `tsc` first; `noUnusedLocals` is on, so a leftover import fails the build).
- **House style:** 4-space indent, single quotes, `.js` extensions on relative imports, `import type` for type-only imports, comments explain *why* not *what*.
- **Every commit message ends with the trailer** `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
- **Branch:** `feature/preset-hours`. The amended spec is already committed there (`d33836d`).
- **Do not bump `OpenOrClosed.csproj`.** The single 17.4.0 changelog entry is rewritten in place; 17.4.0 was never released.

---

## File Structure

| File | Responsibility in this change |
|---|---|
| `src/timeline/time-range.ts` | + `availablePreset` — the whole clash rule, pure |
| `src/timeline/time-range.test.ts` | + `availablePreset` cases |
| `src/timeline/ooc-timeline.element.ts` | ghosts as buttons, the reveal, `_rangeName` extracted, four members deleted, track handlers reverted |
| `src/localization/en.ts` | `addPresetHours` replaces two entries; setting description reworded |
| `src/localization/en.test.ts` | follows that swap |
| `README.md` | the two feature paragraphs and the 17.4.0 entry describe the palette |
| `docs/superpowers/plans/2026-09-01-preset-hours-checklist.md` | rewritten around the new gesture, plus a tab-order check |

Unchanged and not to be touched: `ooc-time-axis.element.ts`, `preset-hours/*`, `bundle.manifests.ts`, `weekly-hours/*`, `holidays/*`.

---

## Task 1: `availablePreset`

The clash rule as one pure function. Nothing consumes it yet, so this is testable in isolation.

**Files:**
- Modify: `OpenOrClosed/Client/src/timeline/time-range.ts` (append at the end, after `sanitizePreset`)
- Test: `OpenOrClosed/Client/src/timeline/time-range.test.ts` (append after the `sanitizePreset` block)

**Interfaces:**
- Consumes: `parseTime(value: string): number`, already exported from `time-range.ts`.
- Produces: `availablePreset(ranges: HoursRange[], preset: HoursRange[]): HoursRange[]` — used by Task 2 in `ooc-timeline`.

- [ ] **Step 1: Write the failing tests**

Add `availablePreset` to the existing import block at the top of `time-range.test.ts`, in alphabetical position (first in the list, before `boundsFor`). Then append after `describe('sanitizePreset', …)`:

```ts
describe('availablePreset', () => {
    const preset = [range('09:00', '12:00'), range('13:00', '17:00'), range('18:00', '20:00')];

    it('offers everything on an empty track', () => {
        expect(availablePreset([], preset)).toEqual(preset);
    });

    it('offers nothing when there is no preset', () => {
        expect(availablePreset([range('09:00', '17:00')], [])).toEqual([]);
    });

    it('withholds a block matching an existing range exactly', () => {
        expect(availablePreset([range('13:00', '17:00')], preset)).toEqual([
            range('09:00', '12:00'),
            range('18:00', '20:00'),
        ]);
    });

    it('withholds a block overlapping an existing range at its start', () => {
        expect(availablePreset([range('08:00', '10:00')], [range('09:00', '12:00')])).toEqual([]);
    });

    it('withholds a block overlapping an existing range at its end', () => {
        expect(availablePreset([range('11:00', '14:00')], [range('09:00', '12:00')])).toEqual([]);
    });

    it('withholds a block that contains an existing range', () => {
        expect(availablePreset([range('10:00', '11:00')], [range('09:00', '12:00')])).toEqual([]);
    });

    it('withholds a block that sits inside an existing range', () => {
        expect(availablePreset([range('08:00', '18:00')], [range('09:00', '12:00')])).toEqual([]);
    });

    it('offers a block ending exactly where an existing range starts', () => {
        // Touching is not overlapping - the same rule validateRange applies.
        expect(availablePreset([range('12:00', '15:00')], [range('09:00', '12:00')])).toEqual([
            range('09:00', '12:00'),
        ]);
    });

    it('offers a block starting exactly where an existing range ends', () => {
        expect(availablePreset([range('06:00', '09:00')], [range('09:00', '12:00')])).toEqual([
            range('09:00', '12:00'),
        ]);
    });

    it('keeps preset order when the middle block clashes', () => {
        expect(availablePreset([range('13:30', '14:30')], preset)).toEqual([
            range('09:00', '12:00'),
            range('18:00', '20:00'),
        ]);
    });

    it('offers nothing against a full day', () => {
        expect(availablePreset([range('00:00', '24:00')], preset)).toEqual([]);
    });
});
```

`range(start, end)` is the helper already at the top of the file: it returns `{ start, end, label: null, byAppointmentOnly: false }`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd OpenOrClosed/Client && npm test -- time-range`
Expected: FAIL — `availablePreset is not a function` on all 11.

- [ ] **Step 3: Write the implementation**

Append to the end of `src/timeline/time-range.ts`:

```ts
/**
 * The preset blocks that fit: those overlapping nothing already on the track.
 *
 * The overlap test is the one `validateRange` uses, so touching ranges are kept - a preset block
 * ending exactly where an existing one starts is still offered, consistent with every other rule in
 * this module.
 *
 * This is the whole of the clash rule, and what makes the palette safe to click at: nothing on offer
 * can displace anything already present.
 */
export function availablePreset(ranges: HoursRange[], preset: HoursRange[]): HoursRange[] {
    return preset.filter((candidate) => {
        const start = parseTime(candidate.start);
        const end = parseTime(candidate.end);

        return !ranges.some(
            (existing) => start < parseTime(existing.end) && end > parseTime(existing.start),
        );
    });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd OpenOrClosed/Client && npm test`
Expected: PASS — the whole suite (200 tests: the 189 already there plus these 11).

- [ ] **Step 5: Type-check**

Run: `cd OpenOrClosed/Client && npm run build`
Expected: no `tsc` errors.

- [ ] **Step 6: Commit**

```bash
git add OpenOrClosed/Client/src/timeline/time-range.ts OpenOrClosed/Client/src/timeline/time-range.test.ts
git commit -F - <<'MSG'
feat: availablePreset, the preset blocks that fit

The clash rule as one pure function: a preset block overlapping anything
already on the track is not offered. Touching is not overlapping, the
same rule validateRange applies.

This is what makes a clickable palette safe - nothing on offer can
displace anything present - so the empty-track-only rule that protected
hand-tuned hours has nothing left to do.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
```

---

## Task 2: Ghosts become controls

The change itself. Four members come out, one small refactor goes in, and the track handlers go back to what they were before the feature.

**Files:**
- Modify: `OpenOrClosed/Client/src/timeline/ooc-timeline.element.ts`
- Modify: `OpenOrClosed/Client/src/localization/en.ts`
- Test: `OpenOrClosed/Client/src/localization/en.test.ts`

**Interfaces:**
- Consumes: `availablePreset(ranges, preset)` (Task 1); `sortRanges(ranges: HoursRange[]): HoursRange[]`, `parseTime`, `formatRange` and `createRange`, all already exported from `time-range.ts`.
- Produces: nothing further depends on this task. The `preset` property keeps its name and type, which is why no consumer changes.

**What is and is not tested.** Every behaviour here is element behaviour — the reveal, the tab order, the buttons, the focus move — and none of it is reachable from this package's test run: node, no DOM, and this file imports the backoffice runtime. The dictionary swap **is** testable and is this task's red-green cycle. The rest is Task 3's checklist, which is why the checklist gains a tab-order item.

- [ ] **Step 1: Write the failing dictionary test**

In `src/localization/en.test.ts`, replace the two preset assertions in the argument-taking-entries case. The case currently reads:

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

Replace it with:

```ts
    it('phrases the argument-taking entries from their arguments', () => {
        expect(en.openOrClosed.errorTooShort(15)).toContain('15');
        expect(en.openOrClosed.openHolidayAction('Christmas')).toContain('Christmas');
        expect(en.openOrClosed.defaultHoursHint('09:00 – 17:00')).toContain('09:00 – 17:00');
        expect(en.openOrClosed.addPresetHours('09:00 – 12:00')).toContain('09:00 – 12:00');
    });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd OpenOrClosed/Client && npm test -- en`
Expected: FAIL — `en.openOrClosed.addPresetHours is not a function`.

- [ ] **Step 3: Swap the dictionary entries**

In `src/localization/en.ts`, under `// Timeline accessible names`, replace these two lines:

```ts
        applyPresetHours: (hours: string) => `Apply preset hours: ${hours}`,
        presetHoursApplied: (hours: string) => `Preset hours applied: ${hours}`,
```

with one:

```ts
        addPresetHours: (hours: string) => `Add ${hours}`,
```

`presetHoursApplied` has no replacement: `_commit(ranges, index)` already announces the range at that index, which is exactly the block just added.

Then reword the setting description, which currently describes the stamp. Replace:

```ts
        settingPresetHoursDescription:
            'Blocks of hours applied in one click to an empty timeline. On Holidays this is a pattern held in the data type — not the Default holiday hours this node falls back to. Leave it empty to add hours one block at a time.',
```

with:

```ts
        settingPresetHoursDescription:
            'Blocks of hours you can add to a day in one click. On Holidays this is a pattern held in the data type — not the Default holiday hours this node falls back to. Leave it empty to add hours one block at a time.',
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd OpenOrClosed/Client && npm test -- en`
Expected: PASS (22 tests).

- [ ] **Step 5: Extract `_rangeName` from `_accessibleName`**

A ghost is named "Monday, Add 09:00 – 12:00, Lunch" — the track label, then "Add", then the range. `_accessibleName` bakes the track label in ahead of the range, so the range half has to come out on its own first.

In `src/timeline/ooc-timeline.element.ts`, replace `_accessibleName`:

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

with:

```ts
    /** The range on its own: the times, then whatever else it carries. */
    private _rangeName(range: HoursRange): string {
        const parts = [formatRange(range, this.use24Hour)];
        if (range.label) parts.push(range.label);
        if (range.byAppointmentOnly) {
            parts.push(this.localize.term('openOrClosed_byAppointmentOnlyShort'));
        }
        return parts.join(', ');
    }

    protected _accessibleName(range: HoursRange): string {
        return [this.trackLabel, this._rangeName(range)].filter(Boolean).join(', ');
    }
```

Output is identical for every existing caller.

- [ ] **Step 6: Replace the four preset members**

Delete `_presetApplies`, `_presetSummary`, `_trackName` and `_applyPreset` entirely — all four, in the block that follows `_accessibleName`. In their place:

```ts
    /** The preset blocks that fit alongside whatever is already on this track. */
    private get _availableGhosts(): HoursRange[] {
        return availablePreset(this.ranges, this.preset);
    }

    /** What a ghost answers to: "Monday, Add 09:00 – 12:00, Lunch". */
    private _ghostName(range: HoursRange): string {
        return [
            this.trackLabel,
            this.localize.term('openOrClosed_addPresetHours', this._rangeName(range)),
        ]
            .filter(Boolean)
            .join(', ');
    }

    /** Takes one offered block onto the track. The others stay on offer. */
    private _takeGhost(range: HoursRange) {
        // Cloned: the preset belongs to the data type configuration, and this copy is about to be
        // dragged around.
        const taken = { ...range };
        const updated = sortRanges([...this.ranges, taken]);

        // sortRanges preserves object identity, so this finds the block just added wherever
        // sorting put it - and _commit announces the range at that index for us.
        const index = updated.findIndex((entry) => entry === taken);

        this._commit(updated, index);
        void this._focusBlock(index);
    }
```

Update the imports from `./time-range.js` to add `availablePreset` and `sortRanges`, keeping the list alphabetical:

```ts
import {
    availablePreset,
    createRange,
    DAY_MINUTES,
    DEFAULT_SNAP_MINUTES,
    formatRange,
    largestGap,
    moveRange,
    parseTime,
    resizeRange,
    sortRanges,
    type HoursRange,
} from './time-range.js';
```

And update the `preset` property's comment, which still describes the stamp:

```ts
    /**
     * Blocks this track offers to add, one at a time. Consumers sanitise, exactly as they already do
     * for `ranges`, which keeps this element free of the configuration it would otherwise have to
     * read. Those clashing with what is already here never reach the screen.
     */
    @property({ type: Array })
    preset: HoursRange[] = [];
```

- [ ] **Step 7: Revert the two track handlers**

Both gained a preset branch that now has no reason to exist. In `_onTrackPointerDown`, delete:

```ts
        if (this._presetApplies) {
            this._applyPreset();
            return;
        }

```

and in `_onTrackKeydown`, delete:

```ts
        if (this._presetApplies) {
            event.preventDefault();
            this._applyPreset();
            void this._focusBlock(0);
            return;
        }

```

Both are then byte-for-byte their pre-feature selves. The `event.target !== event.currentTarget` guard already at the top of `_onTrackPointerDown` is what stops a click on a ghost also creating an ad-hoc range — the same mechanism real blocks have always relied on.

- [ ] **Step 8: Make the ghosts buttons**

Replace the whole of `_renderGhosts`:

```ts
    /**
     * The blocks the preset is offering, drawn in place as the blocks they would become.
     *
     * Real buttons, not decoration: each is separately selectable, by pointer or by keyboard. The
     * track's own pointerdown handler bails unless the event target is the track itself, so a click
     * landing here never also creates an ad-hoc range.
     */
    private _renderGhosts() {
        return this._availableGhosts.map((range) => {
            const start = parseTime(range.start);
            const widthPercent = this._percent(parseTime(range.end) - start);
            const narrow = widthPercent < OocTimelineElement.NARROW_PERCENT;

            return html`
                <button
                    type="button"
                    class="ghost ${narrow ? 'narrow' : ''}"
                    part="ghost"
                    style="left:${this._percent(start)}%;width:${widthPercent}%"
                    aria-label=${this._ghostName(range)}
                    @click=${() => this._takeGhost(range)}>
                    <span class="times">${formatRange(range, this.use24Hour)}</span>
                </button>
            `;
        });
    }
```

- [ ] **Step 9: Rewrite the ghost styles**

Replace the existing `.ghost` rule:

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

with:

```css
        /*
         * Hidden by visibility, deliberately, and never by opacity: visibility also takes the button
         * out of the tab order, so a ghost is never a focus target nobody can see. The track itself
         * is tabbable and comes first, so Tab reaches it, :focus-within fires, and the offers appear
         * in time for the next Tab to land on one.
         */
        .ghost {
            position: absolute;
            top: 3px;
            bottom: 3px;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 0 4px;
            border: 1px dashed var(--uui-color-selected);
            border-radius: var(--uui-border-radius);
            background: var(--uui-color-surface-alt);
            color: var(--uui-color-selected);
            font-size: var(--uui-type-small-size);
            white-space: nowrap;
            cursor: pointer;
            opacity: 0.45;
            visibility: hidden;
            transition: opacity 80ms ease-in-out;
        }

        :host(:hover) .ghost,
        :host(:focus-within) .ghost {
            visibility: visible;
        }

        /* Nothing to hover with, so there is no reveal to wait for. */
        @media (hover: none) {
            .ghost {
                visibility: visible;
            }
        }

        .ghost:hover,
        .ghost:focus-visible {
            opacity: 1;
        }

        .ghost:focus-visible {
            outline: 2px solid var(--uui-color-focus);
            outline-offset: 1px;
        }
```

Then extend the two rules that currently name `.block` alone, so a ghost's times behave the same way. Replace:

```css
        .block .times {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
```

with:

```css
        .block .times,
        .ghost .times {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
```

and replace:

```css
        /* Too narrow to read - the label and appointment icons carry the meaning. */
        .block.narrow .times {
            display: none;
        }
```

with:

```css
        /* Too narrow to read - the label and appointment icons carry the meaning. */
        .block.narrow .times,
        .ghost.narrow .times {
            display: none;
        }
```

- [ ] **Step 10: Mount the ghosts after the blocks**

In `render`, the track's label goes back to the plain property and the ghosts move below the blocks, so the tab sequence is track → existing blocks → offers:

```ts
    render() {
        return html`
            <div
                class="track"
                part="track"
                tabindex="0"
                role="group"
                aria-label=${this.trackLabel}
                @pointerdown=${this._onTrackPointerDown}
                @keydown=${this._onTrackKeydown}>
                ${[6, 12, 18].map(
                    (hour) => html`<i class="divider" style="left:${this._percent(hour * 60)}%"></i>`,
                )}
                ${this.ranges.map((range, index) => this._renderBlock(range, index))}
                ${this._renderGhosts()}
            </div>
            <span class="sr-only" aria-live="polite">${this._announcement}</span>
        `;
    }
```

No condition is needed around `_renderGhosts()` — it returns an empty array when nothing is on offer.

- [ ] **Step 11: Type-check and test**

Run: `cd OpenOrClosed/Client && npm run build && npm test`
Expected: build clean — this is where a missed `_presetApplies` reference or an unused `sortRanges` import surfaces — and 200 tests PASS.

- [ ] **Step 12: Confirm nothing outside the timeline changed**

Run: `git status --short OpenOrClosed/Client/src`
Expected: exactly three modified files — `timeline/ooc-timeline.element.ts`, `localization/en.ts`, `localization/en.test.ts`. If `weekly-hours/`, `holidays/` or `preset-hours/` appear, something has gone wrong: the whole point is that the interaction model changes without them.

- [ ] **Step 13: Commit**

```bash
git add OpenOrClosed/Client/src/timeline/ooc-timeline.element.ts OpenOrClosed/Client/src/localization/en.ts OpenOrClosed/Client/src/localization/en.test.ts
git commit -F - <<'MSG'
feat: the preset offers its blocks one at a time

Hovering a track, or tabbing into it, offers the preset blocks that fit;
clicking one takes that set and leaves the rest on offer. Blocks clashing
with hours already present are never offered, so the empty-track-only
rule that protected hand-tuned hours is now structural.

Ghosts are real buttons rather than aria-hidden decoration, hidden by
visibility rather than opacity: visibility takes them out of the tab
order too, so a keyboard user never focuses something invisible. The
track is tabbable and comes first, so Tab reaches it, :focus-within
fires, and the next Tab lands on an offer. Touch devices, having no
hover, keep them visible.

Bare-track clicks and Enter revert to their pre-feature bodies, and
pointer-events: none is deleted rather than replaced - the track's
existing event.target check already keeps the two apart. _presetApplies,
_applyPreset, _presetSummary and _trackName all go, along with one
dictionary entry: _commit already announces the range it added.

No consumer changes.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
```

---

## Task 3: Documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-09-01-preset-hours-checklist.md`

**Interfaces:**
- Consumes: the finished feature.
- Produces: nothing in code.

- [ ] **Step 1: Rewrite the Weekly Hours paragraph**

In `README.md`, replace the paragraph added for the stamp:

```markdown
Set **Preset Hours** on the data type and an empty day draws them as a faint outline; clicking the
day lays them all down at once. A day that already has hours keeps the original behaviour — clicking
a gap adds a single block — so a preset can never overwrite hours you have tuned by hand. Labels and
the by-appointment flag travel with a preset block, so "Lunch" only has to be typed once.
```

with:

```markdown
Set **Preset Hours** on the data type and hovering a day — or tabbing into it — offers those blocks
as faint outlines. Click one and that set alone lands; the others stay on offer, so you can take
one, two or all of them, in any order. Blocks that would clash with hours already on the day are
never offered, and clicking anywhere the preset is not offering something adds an ad-hoc set exactly
as it always has. Labels and the by-appointment flag travel with a preset block, so "Lunch" only has
to be typed once.
```

- [ ] **Step 2: Rewrite the changelog entry**

Replace the 17.4.0 entry:

```markdown
* Added **Preset Hours** to the Weekly Hours and Holidays data types: configure blocks of hours
  once, then click an empty timeline to apply them all at once. Empty tracks show the preset as a
  faint outline so the gesture is visible; a track that already has hours behaves exactly as before.
  Leaving the setting empty changes nothing.
```

with:

```markdown
* Added **Preset Hours** to the Weekly Hours and Holidays data types: configure blocks of hours
  once, then hover a day — or tab into it — to be offered them as faint outlines, and click the ones
  you want. Blocks that clash with hours already on the day are not offered. Clicking bare timeline
  still adds a single ad-hoc set, and leaving the setting empty changes nothing.
```

The Holidays paragraph needs no change: it already says only that Preset Hours works on the
**Default holiday hours** and **Custom** tracks, and draws the line against *Default holiday hours*.

- [ ] **Step 3: Rewrite the manual checklist**

Replace the whole of `docs/superpowers/plans/2026-09-01-preset-hours-checklist.md` with:

```markdown
# Preset hours — manual checklist

**Status: not yet run.**

Written from `docs/superpowers/specs/2026-09-01-preset-hours-design.md`, not from either
implementation plan. A checklist derived from a plan cannot catch what the plan omitted.

Unit tests cover `sanitizePreset` (8) and `availablePreset` (11). Everything below is element
behaviour, which this package cannot test: the test run is node with no DOM, and `ooc-timeline`
imports the backoffice runtime. **Items 6 and 7 matter most** — the reveal mechanism is the part of
this design most likely to be subtly wrong.

The spec's one recorded risk — whether `umbOpenModal` reaches a modal manager from the data type
settings panel — was resolved during implementation without a browser: `UmbModalManagerContext` is
created once on the app host in the backoffice core entry point, not per workspace, and core's own
config-only `Umb.PropertyEditorUi.Collection.LayoutConfiguration` opens the icon picker the same
way. Item 2 confirms it in practice.

## Setup

- A backoffice on Umbraco 17 with the package installed and the client built (`npm run build` in
  `OpenOrClosed/Client`).
- A content node with both a Weekly Hours and a Holidays property.
- A second Weekly Hours data type with **no** preset configured, to prove the unconfigured path.
- A third with a preset and **Enable Appointment Only?** off.
- A touch device, or browser device emulation, for item 8.

## Checks

- [ ] **1. The axis still renders.** The Weekly Hours editor shows 00:00 / 06:00 / 12:00 / 18:00 /
  24:00 above the seven tracks, the first label flush left and the last flush right, unchanged from
  before this feature. Switching **Time Format** to 12-hour relabels them.
- [ ] **2. Configure a preset.** On a Weekly Hours data type, the **Preset Hours** setting shows an
  axis and one empty track. Click it to add a block; drag its edges; click it to open the range
  sidebar and set 09:00–12:00. Add two more, 13:00–17:00 and 18:00–20:00. Save, reload the data
  type: all three are still there.
- [ ] **3. Nothing shows at rest.** On a content node using that data type, an untouched empty day
  shows a plain empty track — no outlines until the pointer or focus arrives.
- [ ] **4. Hover offers the blocks.** Hovering an empty day fades in three faint dashed outlines at
  09:00–12:00, 13:00–17:00 and 18:00–20:00, each showing its times. Moving the pointer off the
  track hides them again.
- [ ] **5. Taking one leaves the rest.** Click the 13:00–17:00 outline. It becomes a real block; the
  other two stay on offer. Click 09:00–12:00: it lands too, and 18:00–20:00 is still offered. The
  day now holds two real blocks and offers one.
- [ ] **6. Tab reveals, and reaches.** With the pointer well away from the editor, Tab until focus
  reaches a day's track. The outlines appear on that track only. Tab again: focus lands on the
  first offer, with a visible focus ring. Tab through the rest of them, then once more — focus
  leaves the track and the outlines disappear with it.
- [ ] **7. No invisible tab stops.** Repeat item 6 but keep going, tabbing through several days.
  Focus must never land somewhere invisible: every stop is either a visible block, a visible
  outline, or a track. If focus seems to vanish, the ghosts are hidden with `opacity` instead of
  `visibility`.
- [ ] **8. Touch shows them permanently.** On a touch device, or with device emulation on, the
  outlines are visible without any hover. Tapping one takes it.
- [ ] **9. Enter takes an offer.** Focus an outline and press Enter: that set lands, and focus moves
  to the real block it became. Arrow keys then move that block.
- [ ] **10. A screen reader names the offers.** Each outline is announced as "Monday, add 09:00 –
  12:00". Taking one announces the range that landed.
- [ ] **11. Clashing blocks are withheld.** On an empty day, drag out a block covering 12:30–16:00.
  Hover the day: only 09:00–12:00 and 18:00–20:00 are offered — the 13:00–17:00 block overlaps and
  is not offered at all, rather than being offered truncated.
- [ ] **12. Touching is not clashing.** Set a block ending exactly at 13:00. The 13:00–17:00 offer
  is still there.
- [ ] **13. Bare track still adds ad-hoc.** Click a stretch of empty track where nothing is being
  offered — 21:00, say. One block appears at the click point, `defaultOpen`–`defaultClose` long,
  exactly as before this feature. Existing blocks are untouched.
- [ ] **14. Enter on a track adds ad-hoc.** Focus a track (not an offer) and press Enter: a single
  block appears in the largest gap — the pre-feature behaviour.
- [ ] **15. Save and reload.** Taken hours persist, and the document is **not** left dirty — no
  "Discard unsaved changes" prompt on navigating away without an edit.
- [ ] **16. Holidays: the default track.** With a preset on the Holidays data type, hovering the
  **Default holiday hours** track offers the blocks, and clicking one takes it.
- [ ] **17. Holidays: a holiday's Custom track.** Add a holiday, set **Hours** to Custom. Hovering
  the track offers the blocks. Take one, save the holiday; the hours show in the table's Hours
  column.
- [ ] **18. The appointment flag is stripped.** On the data type with **Enable Appointment Only?**
  off, configure a preset block with the flag on (the setting editor always offers it). The offer
  shows no appointment icon, and taking it produces a block with the flag clear.
- [ ] **19. A label travels.** A preset block labelled "Lunch" is offered with its label, and the
  taken block shows the notepad icon.
- [ ] **20. No preset, no change.** On the data type with no preset configured: hovering a day
  offers nothing, and clicking creates a single block at the click point,
  `defaultOpen`–`defaultClose` long. This is the path every existing site is on.
- [ ] **21. An overlapping preset is repaired.** Hand-edit a data type's `presetHours` through uSync
  or a data type import so two blocks overlap (09:00–13:00 and 12:00–17:00). Only one is ever
  offered, and taking it cannot produce an overlapping day.
- [ ] **22. The preset editor offers nothing to itself.** The **Preset Hours** setting's own track
  shows no outlines on hover, and clicking it creates a single block.
```

- [ ] **Step 4: Commit**

```bash
git add README.md docs/superpowers/plans/2026-09-01-preset-hours-checklist.md
git commit -F - <<'MSG'
docs: README and checklist for the preset hours palette

Rewrites both around taking blocks one at a time, and the single 17.4.0
changelog entry with them - that version was never released, so it
describes the behaviour that will actually ship rather than the stamp it
briefly was.

The checklist grows to 22 items, with 6 and 7 covering the reveal and the
tab order specifically: hiding the ghosts with opacity instead of
visibility would leave a keyboard user focusing controls they cannot see,
and no unit test in this package can reach that.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
```

---

## Self-review

**Spec coverage**

| Spec section | Task |
|---|---|
| `availablePreset`, clash rule, touching-is-not-clashing | 1 |
| Ghosts as real buttons, focusable and labelled | 2 (steps 8, 9) |
| The reveal: `visibility: hidden`, `:hover`, `:focus-within`, `@media (hover: none)` | 2 (step 9) |
| Tab order: track → blocks → offers | 2 (step 10) |
| `_takeGhost`, focus move, announcement via `_commit` | 2 (step 6) |
| Track handlers reverted to pre-feature bodies | 2 (step 7) |
| `_presetApplies`, `_applyPreset`, `_presetSummary`, `_trackName` removed | 2 (step 6) |
| `pointer-events: none` deleted, `event.target` guard relied on | 2 (steps 7, 9) |
| Dictionary: `addPresetHours` in, two entries out, description reworded | 2 (step 3) |
| No consumer changes | 2 (step 12 asserts it) |
| Unit test table — all 11 `availablePreset` cases | 1 |
| README, changelog, checklist | 3 |
| Risk: focusable-but-invisible ghost | 2 (step 9 comment), 3 (checklist 7) |
| Risk: tab-order weight | 2 (step 10), 3 (checklist 6) |
| Risk: discoverability of hover-reveal | 3 (README, checklist 3) |
| Risk: ghost mistaken for a real block | 2 (step 9 dashed border + opacity), 2 (step 6 "Add" label) |
| Deferred items | not implemented, by design |
| `sanitizePreset`, `ooc-time-axis`, `ooc-preset-hours`, consumers | already landed, untouched |

**Placeholder scan** — no TBD/TODO, no "handle edge cases", no "similar to Task N". Every code step carries the code.

**Type consistency**

- `availablePreset(ranges: HoursRange[], preset: HoursRange[]): HoursRange[]` — defined in Task 1, called in Task 2 step 6 with that signature.
- `_rangeName(range: HoursRange): string` — extracted in Task 2 step 5, consumed by `_accessibleName` (same step) and `_ghostName` (step 6).
- `_ghostName(range: HoursRange): string` and `_takeGhost(range: HoursRange)` — both defined in step 6, both called in step 8. `_takeGhost` takes a range rather than an index, because an index into the *available* list is not an index into `ranges` or into `preset`.
- `_availableGhosts` — defined step 6, read in step 8.
- `sortRanges` and `availablePreset` — added to the import list in step 6, used in step 6.
- `addPresetHours` — added to the dictionary in step 3, referenced by `_ghostName` in step 6, asserted in step 1.
- `preset: HoursRange[]` — name and type unchanged, which is what keeps the three consumers untouched.
