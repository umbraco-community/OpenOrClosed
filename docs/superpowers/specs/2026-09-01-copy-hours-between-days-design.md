# Copying hours between days and holidays — design

## Context

A week is usually not seven decisions. It is one decision and six repetitions of it, and the editor
currently makes you draw each repetition by hand. The same is true of holidays: a run of reduced-hours
days differs only in its dates.

Preset Hours ([its own design](2026-09-01-preset-hours-design.md)) solves the case where the pattern
is known in advance and lives in the data type. It does nothing for the case where the pattern was
invented five seconds ago on Monday's track. This is that case: take what a day already has and put
it on other days.

**This change touches no C#**, and it touches neither `ooc-timeline` nor `time-range.ts`. It lives
entirely in the two consumers plus one new shared modal — the opposite locus from the preset work.

### The word "Copy" is already taken

The property action menu carries **Copy** and **Replace**, added for
[issue #77](https://github.com/umbraco-community/OpenOrClosed/issues/77). Those are Umbraco's
property clipboard: node to node, whole property value, held in the browser's localStorage, invisible
to colleagues.

What this design adds sits inches away in the same editor and means something entirely different:
within one property value, from one row to other rows, no storage involved. Two things called "Copy"
on one screen, with different scopes and different lifetimes, is a support question waiting to
happen — so **nothing here is ever labelled bare "Copy"**. Every item names its target:
*Copy hours to…*, *Duplicate*, *Clear hours*.

## Scope

**In scope**

- A per-day action menu on Weekly Hours: **Copy hours to…**, **Clear hours**.
- A per-row action menu on Holidays: **Duplicate**, **Copy hours to…**, **Clear hours**.
- One shared sidebar modal that picks copy targets, used by both.
- Two pure functions carrying the decisions, with unit tests.
- README and a manual backoffice checklist.

**Out of scope**

- **A menu on the Holidays *Default holiday hours* track.** It is a single track: there is nothing to
  copy it to, nothing to duplicate, and clearing it means deleting two blocks by hand — which already
  works.
- **Copying between nodes.** That is the #77 property clipboard's job and it already does it.
- **Undo.** The editor has none today. An unsaved document is still recoverable by navigating away
  without saving, which is the only safety net this change relies on.
- **Any C# change.** None is needed.

## Settled decisions

| Decision | Choice | Why |
|---|---|---|
| Copy model | Pick the targets, then apply once | Chosen over copy-then-paste (invisible held state, one interaction per target) and over fixed *Copy to weekdays / weekend / all* shortcuts (Monday→Wednesday alone becomes impossible). The quick-selects survive as group links *inside* the picker, so the common case stays fast. |
| Picker surface | A sidebar modal via `UmbModalToken`, shared by both editors | A site can hold thirty holidays, which a dropdown of checkboxes handles badly. Sidebar modals are already this package's pattern for the range and holiday editors, and one component then serves both cases instead of a dropdown for one and a modal for the other. |
| Overwrite | Replace, with occupied targets annotated in the picker; **no** second confirm dialog | "Replicate Monday to Tuesday" means Tuesday matches Monday, so replace is the semantics asked for. The annotation is the warning; a confirm dialog on top would be friction on an action the editor just described in full. |
| What "copy hours" copies on a holiday | The whole hours **setting** — `hoursMode` *and* `hours` | A `Closed` holiday makes its targets `Closed`; a `Custom` one copies the blocks. Restricting the action to `Custom` would hide it on two of three modes for no gain. |
| Occupied, for a holiday | `hoursMode === 'custom'` with blocks on it | The only case where hand-made work is destroyed. `Closed` and `Default` cost nothing to set again. |
| Duplicate | Clones the row, names it `X (copy)`, appends it, and **opens it in the holiday modal** | The date always needs changing, so stopping short of opening it would mean an extra click every single time. |
| Clear hours | Resets the row; **disabled** when there is nothing to clear; no confirm dialog | Matches the package's existing destructive actions — neither the range modal's **Remove** nor the holiday modal's **Remove** confirms. Disabling it when empty removes the only case where it could surprise. |
| Clear, on a holiday | Back to `hoursMode: 'default'`, `hours: []` | The state `emptyHoliday` produces. "Clear the hours setting", not "close the holiday". |
| Menu component | `umb-dropdown` + `uui-menu-item`, on both editors | Two items each, so a menu rather than a bare icon button is now plainly right. |
| Naming | Never a bare "Copy" | See *The word "Copy" is already taken*. |
| Where the logic lives | Pure functions in `weekly-hours/week.ts` and `holidays/holiday.ts` | The modal and the menus are DOM, and this package's test run is node with no DOM. Anything that can be got wrong quietly has to be reachable without a browser. |

## Architecture

### `ooc-copy-targets` — the shared picker

One sidebar modal, generic over what a target is:

```
data:  {
    sourceLabel: string;
    targets: Array<{ id: string; label: string; occupied: boolean }>;
    groups?: Array<{ label: string; ids: string[] }>;
}
value: { ids: string[] }
```

- **Weekly** passes the six other weekdays, and groups for **Weekdays**, **Weekend** and **All** —
  each minus the source day, so a group link never offers to copy Monday onto Monday.
- **Holidays** passes the other holidays and no groups.
- `occupied` renders as *"has hours, will be replaced"* beside the label. Nothing else acts on it.

Group links are additive selections, not modes: clicking **Weekdays** ticks those boxes and leaves
the rest alone, so they compose with hand-ticking.

Target ids are strings because the two callers key differently — weekdays by `System.DayOfWeek`
number, holidays by position in the sorted list. Positional ids are safe here precisely because the
modal is modal: nothing can re-sort the list while it is open, and the caller resolves the ids
against the same sorted array it built them from.

### The row menus

An `umb-dropdown` in a new 24px grid column beside the day name — `grid-template-columns: 90px 24px 1fr`,
which means the axis row gains a second empty cell.

**The trap on the Holidays side:** the `<tr>` already has a click handler that opens the holiday
modal, and the existing name button already has to `stopPropagation` to stop the modal opening twice.
A dropdown inside that row needs the same treatment, or opening the menu also opens the holiday.

### Weekly: `copyRangesTo`, and a module that should already exist

```
copyRangesTo(week: WeeklyHoursDay[], sourceDay: number, targetDays: number[]): WeeklyHoursDay[]
```

The one thing here that is easy to get wrong: **the weekly value is sparse.** A day with no hours has
no entry at all — `_setRanges` removes it rather than storing an empty array, and the C# side skips
rows without a usable day. So copying an *empty* day must **delete** each target's entry, not write
an empty one. Copying a full day must deep-clone, or dragging Tuesday's block would move Monday's
too. Days not named as targets are untouched, and a `sourceDay` that appears in its own target list
is ignored.

`WeeklyHoursDay` currently lives in `ooc-weekly-hours.element.ts`, and the clipboard paste translator
imports the type *from the element* — a pure module reaching into a DOM one. `copyRangesTo` needs the
same shape, so both move to a new `weekly-hours/week.ts` and the translator's import gets shorter.
That is the only refactor in this change.

### Holidays: `duplicateHoliday`

```
duplicateHoliday(holiday: Holiday, existingNames: string[], copyWord: string): Holiday
```

Two concerns worth having in one tested place: the **name** must not collide (`X` → `X (copy)` →
`X (copy 2)`), and `hours` must be **deep-cloned**, or the duplicate and the original would share an
array and editing one would edit both.

`copyWord` is passed in because this module is DOM-free and cannot reach Umbraco's localisation —
the same reason `HolidayError` is a code rather than a sentence. The element supplies the localised
word and the function builds the name around it.

### Clear

No new logic. Weekly clear is `_setRanges(day, [])`, which already removes the sparse entry.
Holiday clear writes `{ ...holiday, hoursMode: 'default', hours: [] }`. Both menu items are disabled
when they would do nothing.

### Files

| File | Change |
|---|---|
| `src/weekly-hours/week.ts` | **new** — `WeeklyHoursDay` moved here, + `copyRangesTo` |
| `src/weekly-hours/week.test.ts` | **new** — `copyRangesTo` cases |
| `src/weekly-hours/ooc-weekly-hours.element.ts` | re-export `WeeklyHoursDay` for compatibility, the day menu, copy and clear, the three-column grid |
| `src/weekly-hours/clipboard/paste.translator.ts` | import `WeeklyHoursDay` from `week.js`, not from the element |
| `src/holidays/holiday.ts` | + `duplicateHoliday` |
| `src/holidays/holiday.test.ts` | + `duplicateHoliday` cases |
| `src/holidays/ooc-holidays.element.ts` | the row menu, duplicate, copy and clear |
| `src/copy-targets/copy-targets.token.ts` | **new** — `OOC_COPY_TARGETS_MODAL` |
| `src/copy-targets/ooc-copy-targets-modal.element.ts` | **new** — the picker |
| `src/copy-targets/manifest.ts` | **new** — the modal manifest |
| `src/bundle.manifests.ts` | register `copy-targets` |
| `src/localization/en.ts` | + 13 entries, and `general_all` added to the header comment's list of built-in keys |
| `src/localization/en.test.ts` | cover the new argument-taking entries |
| `README.md` | a section on copying within a property, and the changelog |
| `docs/superpowers/plans/2026-09-01-copy-hours-checklist.md` | **new** — manual checklist |

### Dictionary entries

| Key | English |
|---|---|
| `copyHoursTo` | Copy hours to… |
| `clearHours` | Clear hours |
| `duplicateHoliday` | Duplicate |
| `copyWord` | copy |
| `dayActions(day)` | Actions for `{day}` |
| `holidayActions(name)` | Actions for `{name}` |
| `copyHoursFrom(source)` | Copy hours from `{source}` |
| `copyTargetsHint` | Choose where to copy them. Anything already there is replaced. |
| `copyTargetsOccupied` | has hours, will be replaced |
| `copyTargetsEmpty` | There is nowhere else to copy these hours to. |
| `copyHoursAction` | Copy hours |
| `groupWeekdays` | Weekdays |
| `groupWeekend` | Weekend |

The **All** group label reuses the core `general_all` key, which is present in the backoffice
dictionary (`assets/lang/en.js`, in the `general` section). **Weekdays** and **Weekend** are not
weekday names and have no core equivalent, so they are ours. The weekly editor builds all three
group labels and is the only caller that passes groups; `en.ts`'s header comment listing the
built-in keys this package relies on gains `general_all`.

## Testing

**Unit — `copyRangesTo`**

| Case | Expectation |
|---|---|
| Full source, one empty target | Target gains a deep copy; source unchanged |
| Full source, target that already has hours | Target replaced entirely, not merged |
| **Empty source, full target** | Target's entry **removed**, not written empty — the sparse-value rule |
| Two targets at once | Both replaced in one call |
| A day not named as a target | Untouched |
| `sourceDay` included in `targetDays` | Ignored; source unchanged |
| Deep-clone check | Mutating the target's first range leaves the source's alone |
| Source day absent from the week entirely | Treated as empty: targets removed |

**Unit — `duplicateHoliday`**

| Case | Expectation |
|---|---|
| `Christmas Day`, no collision | `Christmas Day (copy)` |
| `Christmas Day (copy)` already exists | `Christmas Day (copy 2)` |
| `(copy)` and `(copy 2)` both exist | `Christmas Day (copy 3)` |
| Unnamed holiday | `(copy)` |
| Dates, repeat, mode all preserved | Identical to the source |
| Deep-clone check | Mutating the copy's hours leaves the original's alone |

**Unit — dictionary.** `en.test.ts` already fails on a manifest key the dictionary lacks and on an
argument-taking entry that ignores its argument.

**Not unit tested.** The modal, the menus, the dropdown-inside-a-table-row bubbling, the grid change.
All DOM. The manual checklist carries them, and the bubbling case gets its own item because it fails
in a way that looks like a different bug entirely — two modals opening at once.

## Delivery order

Each step builds and tests green on its own.

1. `weekly-hours/week.ts`: move `WeeklyHoursDay`, add `copyRangesTo`, update the translator import.
   Pure, and a refactor nothing depends on yet.
2. `duplicateHoliday` in `holidays/holiday.ts`. Pure, unused.
3. The `ooc-copy-targets` modal, its token and manifest, registered in the bundle. Nothing opens it
   yet — verify it renders by opening it from the weekly editor in step 4.
4. The weekly day menu: **Copy hours to…** and **Clear hours**.
5. The holidays row menu: **Duplicate**, **Copy hours to…** and **Clear hours**.
6. README and the manual checklist.

## Risks

| Risk | Handling |
|---|---|
| **A dropdown inside the holidays `<tr>` opening the holiday modal too.** The row's own click handler fires on anything that does not stop propagation, and the existing name button already had to work around exactly this. | `stopPropagation` on the menu's own click, following what `_renderRow` already does. Its own checklist item, because the symptom — two sidebars opening — reads as an unrelated bug. |
| **The three-column grid knocking the axis out of alignment.** The axis row currently supplies one empty cell before the axis; it needs two. | Checklist item 1 compares the axis against the tracks. |
| **Seven more tab stops in the weekly editor**, one menu per day. | Unavoidable if every day is to have an action menu, and each stop is a labelled button — *Actions for Monday*. Real blocks and preset offers already outnumber them. |
| **Positional holiday target ids going stale.** Ids are indices into the sorted list. | The modal blocks interaction while open, and the caller resolves the returned ids against the same sorted array it built them from. Never stored, never persisted. |
| **"Copy hours to…" confused with the property menu's "Copy".** | No in-editor item is ever labelled bare "Copy", and the README documents both in one place so the difference is stated rather than inferred. |
| **Clearing a full day with one menu click, and no undo.** | Disabled when there is nothing to clear, so it cannot fire by accident on an empty day; consistent with the package's other Remove actions, which also do not confirm. An unsaved document is still recoverable by navigating away. |

## Deferred

- **A menu on the Holidays default hours track**, if it ever grows more than one action's worth of
  behaviour.
- **Copy hours from a *holiday* to a *weekday*, or the reverse.** Different shapes, and no evidence
  anyone wants it.
- **Undo within the editor.** Would benefit every destructive action in the package, not just this
  one, and belongs to its own design.
