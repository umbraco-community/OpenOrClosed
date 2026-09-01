# Preset hours — manual checklist

**Status: not yet run.**

Written from `docs/superpowers/specs/2026-09-01-preset-hours-design.md`, not from its implementation
plan. A checklist derived from a plan cannot catch what the plan omitted.

Unit tests cover `sanitizePreset` only (8 of them). Everything below is element behaviour, which
this package cannot test: the test run is node with no DOM, and `ooc-timeline` imports the backoffice
runtime.

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
