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
