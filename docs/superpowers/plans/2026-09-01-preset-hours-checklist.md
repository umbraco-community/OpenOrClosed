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
