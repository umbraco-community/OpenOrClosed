# Preset hours as a palette — design

> **Amended 1 September 2026, mid-implementation.** The first version of this spec described preset
> hours as a *stamp*: ghosts on an empty track only, one click laying down the whole set. That
> shipped to the `feature/preset-hours` branch and was never released. It is replaced here by a
> *palette*: the preset offers itself as individually selectable sets, and you take the ones you
> want. The superseded decisions and the reasoning that produced them are recorded under
> *Superseded by the palette model*, so the change of direction does not have to be re-argued. Git
> history holds the earlier text.

## Context

Setting a week of hours means the same gesture seven times: click a track, drag the block into
shape, click it, type the exact times. For a site whose days are mostly identical — 09:00–12:00 and
13:00–17:00, Monday to Friday — that is six repetitions of a decision already made once.

The request is to move that decision into the data type: configure the blocks once, then take them
onto a day or a holiday without redrawing them.

The pieces are already in place. [`ooc-timeline`](../../../OpenOrClosed/Client/src/timeline/ooc-timeline.element.ts)
is deliberately day-agnostic — "knows nothing about days or holidays" — and three consumers already
mount it: the seven rows of Weekly Hours, the Holidays **Default holiday hours** track, and the
**Custom** track inside the holiday modal. A configured set of blocks reaches all three by adding
one property to that one element.

**This change touches no C#.** `DataTypeConfig` reads toggles only, and nothing on the read path
needs to know a preset existed — taking one writes ordinary ranges into the property value.

### The shape of the interaction

Hovering a track, or moving keyboard focus into it, reveals the preset blocks that would fit —
drawn faintly, in place, as the blocks they would become. Each one is a control: click it, or focus
it and press Enter, and that set alone lands. The others stay on offer. Clicking anywhere the
preset is not offering something creates an ad-hoc set, exactly as it did before this feature
existed.

Blocks that clash with hours already on the track are simply not offered, so what you see is always
what you can take.

## Scope

**In scope**

- A **Preset Hours** data type setting on Weekly Hours and Holidays, edited on a single 24-hour
  timeline through a config-only property editor UI.
- Ghosts of the *available* preset blocks, revealed on hover or focus-within, each individually
  selectable by pointer or keyboard.
- Clash filtering against the hours already on the track.
- All three existing `ooc-timeline` consumers pick this up with **no change to any of them**.
- Extraction of the time axis into its own element, so the config editor and the weekly editor share
  one copy of the tick maths.
- Unit tests for the new pure logic, dictionary coverage, README, and a manual backoffice checklist.

**Out of scope**

- **Applying the whole preset in one gesture.** Dropped deliberately; see *Superseded*.
- **Truncating a clashing block to fit.** A preset 09:00–17:00 against an existing 12:00–13:00 could
  be offered as 09:00–12:00 plus 13:00–17:00. It is instead not offered at all. Deferred rather than
  rejected — the rule "what you see is what you get" is worth more than the extra reach while the
  interaction is new.
- **An "apply to all days" control.** Not asked for.
- **A `Template` hours mode on holidays** — storing "whatever the preset says" as a mode rather than
  copied blocks. Considered and rejected: it turns a backoffice convenience into a read-path
  contract, and the C# converters, Delivery API output and models would all have to resolve data
  type configuration to answer what a holiday's hours are.
- **Standard and Special Business Hours.** Neither uses `ooc-timeline`; they have their own
  `defaultOpen`/`defaultClose` mechanism and are the legacy pair.
- **Any C# change.** None is needed.
- **Making the config editor honour `time_24hr`.** See *The constraints*.

## Settled decisions

| Decision | Choice | Why |
|---|---|---|
| The model | A **palette**: each available preset block is its own control | Taking two of three sets is a normal thing to want, and a stamp cannot express it. |
| Revealing the ghosts | On hover, or focus within the track | Chosen over always-on. A track that permanently displays dashed outlines it is not currently offering to act on reads as clutter, especially on the seven-row weekly editor. |
| Ghost semantics | Real `<button>` elements — focusable, labelled, in the tab order | They are controls now. `aria-hidden` decoration with `pointer-events: none` is exactly what they must stop being. |
| Keyboard reach | Ghosts are tab stops, but only while focus is inside their track | Native semantics, no bespoke arrow-key mode competing with the arrow keys that already move and resize real blocks. |
| Touch | `@media (hover: none)` keeps ghosts permanently visible | A touch device has no hover to reveal them with, and a reveal-then-pick double tap would be worse than showing them. |
| Clicking bare track | **Always** creates one ad-hoc set, as it did before this feature | With ghosts offering the preset, the track has no second job to do. This is the pre-feature behaviour restored, not a new rule. |
| Enter on the track | Creates one ad-hoc set in the largest gap, as it did before this feature | Ghosts carry their own Enter now, so the track's does not need to be overloaded. |
| Clash rule | A preset block overlapping anything already on the track is not offered; touching is not clashing | "What you see is what you can take." Consistent with the rest of `time-range.ts`, where touching has never counted as an overlap. |
| Setting name | **Preset Hours**, alias `presetHours`, default `[]` | "Preset" rather than "Default", because Holidays already has *Default holiday hours* as part of its **value**. The description draws that line explicitly. |
| Backwards compatibility | An empty preset leaves every gesture exactly as it was before the feature | Every existing data type defaults to `[]`, so nothing changes until someone configures a preset. |
| Preset editor location | `src/preset-hours/`, registered like `OpenOrClosed.PropertyEditorUi.TimeInput` — a config-only UI with no `propertyEditorSchemaAlias` | Same shape as the existing config editor in this package. |
| By-appointment blocks | The preset editor always offers the flag; **the consumer strips it as it reads the setting** when its own `showAppointmentOnly` is off | Never write a flag into a property value that the content editor cannot see or clear. Stripping on read also keeps the ghosts honest about what they will produce. |
| Overlapping presets | Dropped when the preset is read | The drag maths assumes sorted, non-overlapping input. See below. |
| Where the logic lives | `sanitizePreset` and `availablePreset` in the DOM-free `time-range.ts` | The elements cannot be unit-tested in this setup (no DOM in the node test run), so both decisions have to be testable without one. |

### Superseded by the palette model

Recorded so the reasoning is not lost, and so the change is not accidentally reverted later.

| Superseded decision | Why it went |
|---|---|
| **Ghosts only on an empty track.** The rule was: empty track click applies the whole preset, a track with hours keeps adding one ad-hoc block, so both gestures survive and applying can never destroy hand-tuned hours. | The palette makes the protection structural rather than conditional — a clashing block is never offered, so there is nothing to destroy. The empty/non-empty distinction stops earning its place. |
| **One click applies every block.** Answered the original request literally: "all pre-configured blocks of hours should be applied at once." | Superseded on request. It cannot coexist with per-ghost clicks without overloading bare-track clicks, and a palette that also stamps is two mental models for one surface. A three-block preset now costs three clicks; that was accepted explicitly. |
| **Always-on ghosts, chosen over hover-reveal for keyboard and touch reach.** | The reasoning was right and the conclusion is preserved by other means: focus-within reveals for the keyboard, `@media (hover: none)` for touch. Hover is now only one of three ways in, not the only one. |
| **The track's accessible name naming the whole preset**, and a `presetHoursApplied` announcement for the set. | Each ghost carries its own name now, and `_commit(ranges, index)` already announces a single range — so both the composed track name and the set-level announcement disappear. |

## The constraints

### A settings property editor UI cannot see its sibling settings' values

`config` on a settings UI carries that setting's own configuration, not the values of the other
settings in the same panel. So the preset editor cannot read `time_24hr` or `showAppointmentOnly`
from beside it. Two consequences, both accepted:

- **The preset editor always displays 24-hour times**, whatever the data type's `time_24hr` says. It
  is an admin surface configured once, so this is a smaller cost than the machinery to read a
  sibling value.
- **The preset editor always offers the by-appointment flag**, because it cannot know whether the
  editors will show it. The mismatch is resolved at the point of use instead: the consumer strips
  `byAppointmentOnly` when its own `showAppointmentOnly` is off, so no invisible flag is ever
  written into a document.

### The drag maths assumes sorted, non-overlapping ranges

`boundsFor` derives a range's limits from its immediate neighbours; `moveRange` and `resizeRange`
clamp against those limits. Overlapping input therefore does not merely look wrong, it makes the
neighbour clamps meaningless.

`sanitizeRanges` sorts and drops malformed entries but **tolerates overlaps** — a pre-existing
looseness that has not mattered, because every value it has seen was written by the editor, which
cannot produce an overlap. A preset can be written by hand through uSync or a data type import, so
`sanitizePreset` closes that gap: it drops any block that starts before the previous one ends,
keeping the earlier block.

`availablePreset` then guarantees the same property holds after a ghost is taken, because a block
that would overlap is never offered.

### A focusable control must not be invisible

This is the constraint that shapes the reveal, and the one part of the design that is not obvious.

Ghosts must be in the DOM to be tab stops. But a control that is focusable while invisible is an
accessibility defect in its own right — focus lands somewhere the user cannot see. `opacity: 0`
would do exactly that.

`visibility: hidden` is the resolution: it hides the ghost **and** removes it from the tab order,
and both reverse together. The reveal then works out of the order things are already in:

1. The track itself is `tabindex="0"`, and the ghosts are its children.
2. Tab reaches the **track** first. `:focus-within` fires on the host.
3. The ghosts become `visible`, and therefore focusable.
4. The next Tab lands on the first ghost. Focus is still inside the track, so they stay revealed.
5. Tabbing past the last ghost leaves the track; the ghosts hide and take their tab stops with them.

`:host(:hover)` drives the same reveal for the pointer, and `@media (hover: none)` pins them visible
where there is no hover to give.

## Architecture

### `sanitizePreset` — `src/timeline/time-range.ts`

```
sanitizePreset(raw: unknown, allowAppointmentOnly: boolean): HoursRange[]
```

`sanitizeRanges(raw)` first, for the coercion and the sort it already does, then drop overlaps
left-to-right, then clear `byAppointmentOnly` unless `allowAppointmentOnly`. Pure and DOM-free.
**Already implemented and tested** — unchanged by this amendment.

### `availablePreset` — `src/timeline/time-range.ts`

```
availablePreset(ranges: HoursRange[], preset: HoursRange[]): HoursRange[]
```

The preset blocks that overlap nothing already on the track, in preset order. The overlap test is
the one `validateRange` already uses — `start < other.end && end > other.start` — so touching ranges
are kept, consistent with every other rule in the module.

Pure, and the whole of the clash rule. It is what makes the interaction safe: nothing offered can
destroy anything present.

### `ooc-timeline` — ghosts become controls

The `preset` property stays as it is: consumers sanitise before passing, exactly as they already do
for `ranges`, which keeps this element free of the configuration it would otherwise have to read.

- **`_availableGhosts`** — `availablePreset(this.ranges, this.preset)`, computed per render.
- **`_renderGhosts`** — one `<button class="ghost">` per available block, positioned by the existing
  `_percent`, showing the times with the same `narrow` rule real blocks use, so a ghost reads as a
  preview of the block it becomes. Labelled from the new `addPresetHours` entry composed with the
  existing `_accessibleName`, giving *"Add 09:00 – 12:00, Lunch"*.
- **`_takeGhost(range)`** — inserts that block into `ranges`, sorted, and commits with the new
  block's index so the existing `_commit` announcement covers it. Then moves focus to the real block
  it became, found by start time the way the existing Enter path already does.
- **`_onTrackPointerDown`** and **`_onTrackKeydown`** revert to their pre-feature bodies. The
  `event.target === event.currentTarget` guard already on the track is what stops a click on a ghost
  also creating an ad-hoc set — the same mechanism real blocks have always relied on, which is why
  `pointer-events: none` can be deleted rather than replaced.
- **Removed:** `_presetApplies`, `_applyPreset`, `_presetSummary`, `_trackName`. The track's
  `aria-label` goes back to plain `trackLabel`.

The element comes out **smaller** than the stamp version it replaces.

### `ooc-time-axis`, `ooc-preset-hours`, and the consumers

Unchanged by this amendment, and all already implemented:

- `ooc-time-axis` — the 00:00–24:00 tick scale, extracted from `ooc-weekly-hours` so the config
  editor and the weekly editor share one copy.
- `ooc-preset-hours` — the config editor: an axis over one timeline, `edit-range` wired to
  `OOC_RANGE_MODAL`. It passes no `preset` to its own timeline, because a preset editor ghosting
  itself would be circular.
- `ooc-weekly-hours`, `ooc-holidays` and `ooc-holiday-modal` already pass `.preset` and need **no
  change**. That the interaction model can be replaced without touching a single consumer is the
  payoff for having put the gesture in the shared element.

### Files

| File | Change |
|---|---|
| `src/timeline/time-range.ts` | + `availablePreset` (`sanitizePreset` already landed) |
| `src/timeline/time-range.test.ts` | + `availablePreset` cases |
| `src/timeline/ooc-timeline.element.ts` | ghosts become buttons; clash filtering; the visibility reveal; track handlers reverted; `_presetApplies`, `_applyPreset`, `_presetSummary` and `_trackName` removed |
| `src/localization/en.ts` | `applyPresetHours` → `addPresetHours`; `presetHoursApplied` removed; `settingPresetHoursDescription` reworded away from "applied in one click to an empty timeline", which describes the stamp |
| `src/localization/en.test.ts` | the argument-taking entries case follows that swap |
| `src/timeline/ooc-time-axis.element.ts` | — already landed, unchanged |
| `src/preset-hours/*`, `src/bundle.manifests.ts` | — already landed, unchanged |
| `src/weekly-hours/*`, `src/holidays/*` | — already landed, **unchanged by this amendment** |
| `README.md` | the two feature paragraphs and the single 17.4.0 entry describe the palette |
| `docs/superpowers/plans/2026-09-01-preset-hours-checklist.md` | items covering the gesture rewritten |

### Dictionary entries

| Key | English |
|---|---|
| `settingPresetHours` | Preset Hours |
| `settingPresetHoursDescription` | Blocks of hours you can add to a day in one click. On Holidays this is a pattern held in the data type — not the *Default holiday hours* this node falls back to. Leave it empty to add hours one block at a time. |
| `presetHoursLabel` | Preset Hours |
| `addPresetHours(hours)` | Add `{hours}` |

`presetHoursApplied` is removed: `_commit(ranges, index)` already announces the range it added.

`en.test.ts` asserts `settings.length` against a literal, which the two manifest settings already
moved to 9. Its argument-taking-entries case swaps `applyPresetHours` for `addPresetHours` and drops
`presetHoursApplied`.

## Testing

**Unit — `availablePreset`**

| Case | Expectation |
|---|---|
| Empty track, three-block preset | All three offered |
| Empty preset, any track | `[]` |
| Preset block exactly matching an existing range | Not offered |
| Preset block overlapping an existing range at its start only | Not offered |
| Preset block overlapping at its end only | Not offered |
| Preset block strictly containing an existing range | Not offered |
| Preset block strictly inside an existing range | Not offered |
| Preset block ending exactly where an existing range starts | Offered — touching is not clashing |
| Preset block starting exactly where an existing range ends | Offered |
| Three-block preset, middle one clashing | First and third offered, in preset order |
| Full day of existing hours | `[]` |

**Unit — `sanitizePreset`** — already implemented and passing; unchanged.

**Unit — dictionary.** `en.test.ts` already fails on a manifest key the dictionary lacks, and covers
each argument-taking entry phrases its argument.

**Not unit tested.** Every element behaviour: the reveal, the tab order, the ghost buttons, the
focus move after taking one. There is no DOM in this package's test run and `ooc-timeline` imports
the backoffice runtime. That is why both decisions are pure functions and the element holds only
rendering and event wiring. The manual checklist carries the rest, and after this amendment it must
cover the tab-order sequence specifically — the visibility mechanism is the part most likely to be
subtly wrong.

## Delivery order

Tasks 1–6 of the original plan are committed on `feature/preset-hours`. This amendment is three
further steps, each building and testing green on its own.

1. `availablePreset` and its tests. Pure, nothing consumes it yet.
2. Rework `ooc-timeline`: ghosts as buttons, clash filtering, the visibility reveal, the reverted
   track handlers, the dictionary swap. No consumer changes.
3. README, checklist and this spec brought into line.

## Risks

| Risk | Handling |
|---|---|
| ~~**The range modal may not open from the data type settings panel.**~~ **Resolved during implementation — not a risk.** `UmbModalManagerContext` is instantiated once on the app host in the backoffice core entry point (`packages/core/entry-point.js`), not per workspace, so context resolution reaches it from anywhere in the tree. Core does exactly this from exactly this surface: `Umb.PropertyEditorUi.Collection.LayoutConfiguration` is a config-only property editor UI that calls `umbOpenModal(this, UMB_ICON_PICKER_MODAL, …)`. | — |
| **A focusable but invisible ghost.** The single most likely defect: `opacity: 0` instead of `visibility: hidden` leaves the ghosts in the tab order permanently, so a keyboard user tabs into something they cannot see. | `visibility: hidden`, never `opacity: 0`, for the hidden state. The checklist tests the tab sequence explicitly, including tabbing past the last ghost. |
| **Tab-order weight.** A three-block preset adds three tab stops per track, and the weekly editor has seven tracks. | The stops exist only while focus is inside that track, so a keyboard user meets at most one track's worth at a time. |
| **Discoverability.** Hover-reveal means an editor who never hovers a track never learns a preset exists — a real loss against the always-on ghosts this replaces. | Accepted as the cost of a quieter editor. Touch devices show them permanently; keyboard users meet them on the first Tab into a track. Noted in the README so the feature is at least documented. |
| **A ghost mistaken for a real block.** They sit on the same track, at the same height. | Dashed border, reduced opacity, and an accessible name beginning "Add". |
| **"Preset Hours" read as "Default holiday hours".** Two similar-sounding things on the same editor, one configuration and one value. | The setting description names the distinction, and so does the README. |
| **A preset carrying labels.** `HoursRange.label` travels with a preset block, so a taken block arrives labelled. | Intended — a label like "Lunch" is exactly the kind of thing worth configuring once. Noted in the README so it is not a surprise. |

## Deferred

- **Truncating a clashing block to fit** rather than withholding it.
- **Take every remaining block at once**, from a control that appears with the ghosts.
- **The preset editor honouring `time_24hr` and `showAppointmentOnly`** by reading its sibling
  settings through the data type workspace's property dataset context.
