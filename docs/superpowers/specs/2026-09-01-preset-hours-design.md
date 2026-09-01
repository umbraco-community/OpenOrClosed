# Preset hours applied by clicking a track — design

## Context

Setting a week of hours means the same gesture seven times: click a track, drag the block into
shape, click it, type the exact times. For a site whose days are mostly identical — 09:00–12:00 and
13:00–17:00, Monday to Friday — that is six repetitions of a decision already made once.

The request is to move that decision into the data type: configure the blocks once, then apply them
to a day or a holiday in a single click.

The pieces are already in place. [`ooc-timeline`](../../../OpenOrClosed/Client/src/timeline/ooc-timeline.element.ts)
is deliberately day-agnostic — "knows nothing about days or holidays" — and three consumers already
mount it: the seven rows of Weekly Hours, the Holidays **Default holiday hours** track, and the
**Custom** track inside the holiday modal. A configured set of blocks reaches all three by adding
one property to that one element.

**This change touches no C#.** `DataTypeConfig` reads toggles only, and nothing on the read path
needs to know a preset existed — applying one writes ordinary ranges into the property value.

### What the gesture displaces

Clicking bare track is not currently inert. `_onTrackPointerDown` creates a single range at the
click point, running for `defaultClose − defaultOpen`. That behaviour is load-bearing for ad-hoc
hours, so the design keeps it rather than replacing it, and splits the two by whether the day has
anything on it (see *Settled decisions*).

## Scope

**In scope**

- A **Preset Hours** data type setting on Weekly Hours and Holidays, edited on a single 24-hour
  timeline through a new config-only property editor UI.
- Clicking (or pressing Enter on) an **empty** track applies every preset block at once.
- A ghost preview of the preset on empty tracks, so the gesture is visible.
- All three existing `ooc-timeline` consumers pick this up.
- Extraction of the time axis into its own element, so the config editor and the weekly editor share
  one copy of the tick maths.
- Unit tests for the new pure logic, dictionary coverage, README, and a manual backoffice checklist.

**Out of scope**

- **An "apply to all days" button.** A separate gesture with its own overwrite question; not asked
  for, and seven clicks is already the improvement being sought.
- **A `Template` hours mode on holidays** — storing "whatever the preset says" as a mode rather than
  copied blocks. Considered and rejected: it turns a backoffice convenience into a read-path
  contract, and the C# converters, Delivery API output and models would all have to resolve data
  type configuration to answer what a holiday's hours are.
- **Standard and Special Business Hours.** Neither uses `ooc-timeline`; they have their own
  `defaultOpen`/`defaultClose` mechanism and are the legacy pair.
- **Any C# change.** None is needed.
- **Making the config editor honour `time_24hr`.** See *The two constraints*.

## Settled decisions

| Decision | Choice | Why |
|---|---|---|
| The gesture | Click (or Enter on) bare track | Chosen over a clickable day name and a per-row apply button. No new chrome, and it reads as direct manipulation like the rest of the editor. |
| Collision with add-one-block | Preset applies **only when the track is empty**; a click in a gap on a track that already has blocks creates one block exactly as today | Both gestures survive, each in the case where it is the obvious one, and applying a preset can never destroy hand-tuned hours. |
| Reach into Holidays | Empty tracks only — the **Default holiday hours** track and a holiday's **Custom** track | Falls out of the `ooc-timeline` change for free. The holiday table row keeps opening the modal, which is the behaviour it must keep. |
| Affordance | Always-on ghost preview of the preset blocks on an empty track | The chosen gesture is otherwise invisible. Hover-only was rejected as unreachable for keyboard and touch; tooltip-only as undiscoverable. |
| Setting name | **Preset Hours**, alias `presetHours`, default `[]` | "Preset" rather than "Default", because Holidays already has *Default holiday hours* as part of its **value**. The description draws that line explicitly. |
| Backwards compatibility | An empty preset falls straight through to today's behaviour | Every existing data type defaults to `[]`, so nothing changes until someone configures a preset. |
| Preset editor location | New `src/preset-hours/`, registered like `OpenOrClosed.PropertyEditorUi.TimeInput` — a config-only UI with no `propertyEditorSchemaAlias` | Same shape as the existing config editor in this package. |
| By-appointment blocks | The preset editor always offers the flag; **the consumer strips it as it reads the setting** when its own `showAppointmentOnly` is off | Never write a flag into a property value that the content editor cannot see or clear. Stripping on read rather than on apply also keeps the ghost preview honest about what a click will produce. |
| Overlapping presets | Dropped when the preset is read | The drag maths assumes sorted, non-overlapping input. See below. |
| Where the logic lives | `sanitizePreset` in the DOM-free `time-range.ts` | The elements cannot be unit-tested in this setup (no DOM in the node test run), so the decision has to be testable without one. |

## The two constraints that shape it

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
`sanitizePreset` has to close that gap: it drops any block that starts before the previous one ends,
keeping the earlier block.

## Architecture

### `sanitizePreset` — `src/timeline/time-range.ts`

```
sanitizePreset(raw: unknown, allowAppointmentOnly: boolean): HoursRange[]
```

`sanitizeRanges(raw)` first, for the coercion and sort it already does, then drop overlaps
left-to-right, then clear `byAppointmentOnly` unless `allowAppointmentOnly`. Pure, DOM-free,
allocation-cheap, and the only new logic in the feature that can be got wrong quietly.

### `ooc-timeline` — one new property, one new rule

```ts
/** Blocks a click on an empty track lays down at once. Consumers sanitise, as they do for `ranges`. */
@property({ type: Array })
preset: HoursRange[] = [];
```

Trusting the caller matches how `ranges` already works: `ooc-weekly-hours._rangesFor` sanitises, and
the element stays dumb.

- **`_onTrackPointerDown`** — when `ranges` is empty and `preset` is not, commit the preset;
  otherwise `createRange` unchanged.
- **`_onTrackKeydown`** (Enter) — the same test ahead of the existing `largestGap` path, then focus
  the first block.
- **Announcement** — applying sets `_announcement` from the new `presetHoursApplied` entry, so the
  existing `aria-live` region reports the whole set rather than one range.
- **Accessible name** — an empty track carrying a preset composes `trackLabel` with the
  `applyPresetHours` entry: *"Monday, apply preset hours: 09:00–12:00, 13:00–17:00"*.
- **Ghost preview** — rendered only while `ranges` is empty and `preset` is not: one `<i class="ghost">`
  per block, positioned by the existing `_percent`, `aria-hidden="true"` and `pointer-events: none`.
  That last property is the whole guard — `_onTrackPointerDown` bails unless
  `event.target === event.currentTarget`, so a ghost that accepted pointer events would swallow the
  very click it advertises.

### `ooc-time-axis` — extracted, not written

`ooc-weekly-hours._renderAxis` holds the tick positions, the `first`/`last` transform classes and the
`formatAxis` calls. The preset editor wants the same axis over the same 24 hours, so this moves to
`src/timeline/ooc-time-axis.element.ts` with a `use24Hour` property, and both mount it. Behaviour is
unchanged; the weekly editor keeps its 90px label gutter by laying the axis out in the same grid row
it uses now.

This is the only refactor in the change.

### `ooc-preset-hours` — the config editor

`value: HoursRange[]`, an `ooc-time-axis` above one `ooc-timeline`, `edit-range` wired to the
existing `OOC_RANGE_MODAL`, and `UmbChangeEvent` on change. `use24Hour` fixed true,
`showAppointmentOnly` true, `defaultDurationMinutes` left at the element's own 8-hour default —
`defaultOpen`/`defaultClose` are sibling settings it cannot read, and an admin dragging a block into
place does not need them.

It is the weekly editor's single row with the day column removed, and needs no new logic of its own.

### Feeding the preset in

| Consumer | Source |
|---|---|
| `ooc-weekly-hours` | `sanitizePreset(this._setting('presetHours'), this._showAppointmentOnly)`, computed once in `render()` and passed to all seven tracks |
| `ooc-holidays` | the same value onto the **Default holiday hours** track, and into `OocHolidayModalData` |
| `ooc-holiday-modal` | `this.data?.presetHours` onto the **Custom** track |

The modal takes it as data rather than reading config, because it has no `UmbPropertyEditorConfigCollection` —
the same reason `use24Hour` and `showAppointmentOnly` are already passed in.

### Files

| File | Change |
|---|---|
| `src/timeline/time-range.ts` | + `sanitizePreset` |
| `src/timeline/time-range.test.ts` | + `sanitizePreset` cases |
| `src/timeline/ooc-timeline.element.ts` | + `preset`, the empty-track rule, ghost preview, accessible name, announcement |
| `src/timeline/ooc-time-axis.element.ts` | **new** — extracted from `ooc-weekly-hours` |
| `src/preset-hours/ooc-preset-hours.element.ts` | **new** — the config editor |
| `src/preset-hours/manifest.ts` | **new** — `OpenOrClosed.PropertyEditorUi.PresetHours` |
| `src/bundle.manifests.ts` | register `preset-hours` before `clipboard` |
| `src/weekly-hours/manifest.ts` | + `presetHours` setting and its `defaultData` entry |
| `src/weekly-hours/ooc-weekly-hours.element.ts` | mount `ooc-time-axis`, feed `.preset` |
| `src/holidays/manifest.ts` | + `presetHours` setting and its `defaultData` entry |
| `src/holidays/ooc-holidays.element.ts` | feed `.preset`, pass `presetHours` into the modal |
| `src/holidays/holiday-modal.token.ts` | + `presetHours` on the data type |
| `src/holidays/ooc-holiday-modal.element.ts` | feed `.preset` to the Custom track |
| `src/localization/en.ts` | + 5 entries |
| `src/localization/en.test.ts` | `settings.length` 7 → 9; cover the new argument-taking entries |
| `README.md` | Weekly Hours and Holidays sections, settings note, version history |
| `docs/superpowers/plans/2026-09-01-preset-hours-checklist.md` | **new** — manual backoffice checklist |

### Dictionary entries

| Key | English |
|---|---|
| `settingPresetHours` | Preset Hours |
| `settingPresetHoursDescription` | Blocks of hours applied in one click to an empty timeline. On Holidays this is a starting pattern held in the data type — not the *Default holiday hours* this node falls back to. Leave it empty to add hours one block at a time. |
| `presetHoursLabel` | Preset Hours |
| `applyPresetHours(hours)` | Apply preset hours: `{hours}` |
| `presetHoursApplied(hours)` | Preset hours applied: `{hours}` |

`en.test.ts` asserts `settings.length` against a literal, so adding one setting to each of the two
editor manifests moves that fixture to 9. Its *"phrases the two argument-taking entries"* case grows
to cover `applyPresetHours` and `presetHoursApplied` — and its name stops undercounting, since it
already checked three.

## Testing

**Unit — `sanitizePreset`**

| Case | Expectation |
|---|---|
| `undefined`, `null`, `{}`, `'09:00'` | `[]` |
| Two blocks, later one first | Sorted by start |
| `09:00–13:00` and `12:00–17:00` | Second dropped, first kept |
| Three blocks where the middle overlaps the first | Middle dropped, third kept — a drop must not shift the comparison point onto the dropped block |
| Adjacent blocks, `12:00` end and `12:00` start | Both kept; touching is not overlapping |
| `byAppointmentOnly: true` with `allowAppointmentOnly: false` | Flag cleared, block kept |
| `byAppointmentOnly: true` with `allowAppointmentOnly: true` | Flag preserved |
| A malformed entry between two valid ones | Dropped, the valid pair kept |

**Unit — dictionary.** `en.test.ts` already fails on a manifest key the dictionary lacks; the
fixture bump and the two argument-taking entries extend that cover to this change.

**Not unit tested.** The element behaviour — the empty-track rule, the ghost preview, the accessible
name. There is no DOM in this package's test run, and `ooc-timeline` imports the backoffice runtime.
That is why the decision is a pure function and the element change is a two-branch `if` around it;
the rest is covered by the manual checklist.

**Manual checklist** covers: preset configured then a click on an empty weekday; a click in a gap on
a non-empty weekday still adding one block; the ghost appearing and disappearing; Enter doing the
same as a click; keyboard focus landing on the first applied block; the Holidays default track and a
holiday's Custom track; `showAppointmentOnly` off stripping the flag; an unconfigured data type
behaving exactly as it does today; and the range modal opening from the data type settings panel.

## Delivery order

Each step builds and tests green on its own.

1. `sanitizePreset` and its tests. Pure, no UI, nothing consumes it yet.
2. Extract `ooc-time-axis`, switch `ooc-weekly-hours` over. No behaviour change — a pure refactor
   landed before anything depends on it.
3. `preset` on `ooc-timeline`: the rule, the ghost, the accessible name, the announcement. Inert
   until something passes a preset.
4. `ooc-preset-hours` and its manifest, registered in the bundle. The setting can now be configured,
   and nothing reads it yet.
5. Wire the three consumers, add the two manifest settings, add the dictionary entries, update
   `en.test.ts`.
6. README and the manual checklist.

## Risks

| Risk | Handling |
|---|---|
| **The range modal may not open from the data type settings panel.** `umbOpenModal(this, …)` needs a modal manager context, and a settings UI sits in the data type workspace rather than a content one. Unverified until it runs in the backoffice. | Step 4 is where this shows up, before any consumer depends on it. Fallback: the preset editor drops the modal and edits the selected block inline through a pair of `<uui-input type="time">` fields plus a label field, which needs no context. Drag, create and delete all keep working either way. |
| **A ghost block swallowing the click it advertises.** | `pointer-events: none`, and the checklist tests a click that lands squarely on a ghost. |
| **"Preset Hours" read as "Default holiday hours".** Two similar-sounding things on the same editor, one configuration and one value. | The setting description names the distinction, and so does the README. |
| **An empty day with a preset no longer honours where you clicked.** Clicking at 14:00 on an empty day lays down the preset, not a block starting at 14:00. | Inherent to the chosen gesture, and only for data types that opt in by configuring a preset. The ghost preview shows what the click will do before it happens, and the second click onwards behaves as it always has. |
| **A preset carrying labels.** `HoursRange.label` travels with a preset block, so applying copies the label onto every day. | Intended — a label like "Lunch" is exactly the kind of thing worth configuring once. Noted in the README so it is not a surprise. |

## Deferred

- **Apply the preset to every day at once**, from a single control above the week.
- **A `Template` hours mode on holidays**, resolved at read time instead of copied.
- **The preset editor honouring `time_24hr` and `showAppointmentOnly`** by reading its sibling
  settings through the data type workspace's property dataset context.
