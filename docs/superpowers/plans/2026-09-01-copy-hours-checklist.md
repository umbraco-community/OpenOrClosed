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
