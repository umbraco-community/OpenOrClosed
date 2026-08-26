# Clipboard copy/paste — manual checklist

**Status: not yet run.**

Written from `docs/superpowers/specs/2026-08-26-clipboard-copy-paste-design.md`, not from its
implementation plan. A checklist derived from a plan cannot catch what the plan omitted.

Unit tests cover the translators (52 of them). They cannot reach the part that matters most:
whether a pasted value loads *clean*, or leaves the document dirty so the backoffice offers
"Discard unsaved changes" on navigate-away.

## Setup

- A backoffice on Umbraco 17.1+ with the package installed and the client built (`npm run build`
  in `OpenOrClosed/Client`).
- At least **two** content nodes sharing a document type that carries all four properties, so a
  value can be copied from one and pasted onto the other.
- A second data type for each of Standard and Special Business Hours, configured differently from
  the first (see items 5–8), to test config mismatches between source and target.
- The property action menu is the `…` on the property, or right-click.

## Checks

- [ ] **1. Cross-node copy and paste.** For each of Standard Business Hours, Special Business
  Hours, Weekly Hours and Holidays: set a value on node A, Copy, open node B, Replace. The value
  arrives intact.
- [ ] **2. Paste into an empty property.** No confirm dialog appears; the value lands.
- [ ] **3. Paste over an existing value.** The confirm dialog appears and names the clipboard entry.
  Cancelling leaves the existing value untouched.
- [ ] **4. Conditions gate the actions.** Copy is absent on a property with no value
  (`Umb.Condition.Property.HasValue`); Paste is absent on a read-only property
  (`Umb.Condition.Property.Writable`). Check read-only via a user group without write permission,
  or a property marked read-only on the document type.
- [ ] **5. Standard Hours, bank holidays on → off.** Copy from a data type with **Show Bank
  Holidays** on, paste into one with it off. 8 rows become 7. No orphan row, no eighth row hiding
  in the saved value.
- [ ] **6. Standard Hours, bank holidays off → on.** The reverse. 7 rows become 8, and the eighth
  is labelled from the target's **Bank Holidays Label** setting — not from the source's.
- [ ] **7. Special Hours, all-past entry is hidden.** On node A set only dates in the past, Copy.
  On node B, with **Remove Old Dates** on, open the paste picker: **the entry is not listed at
  all.** (Without this guard the paste succeeds and is then filtered to nothing, so the paste
  appears to do nothing.)
- [ ] **8. Special Hours, mixed entry.** An entry with both past and future dates pastes; past
  dates are dropped, future dates survive. With **Remove Old Dates** off, the past dates are kept.
- [ ] **9. Culture variants.** On a property varying by culture, copy on one culture and paste on
  another. The paste lands on the culture being edited and does not disturb the other.
- [ ] **10. Save, reload, publish.** After **every** paste above: save, navigate away and back,
  and confirm the document is not dirty on arrival. Then publish and confirm the front-end value
  converter output matches what a hand-entered equivalent produces. *A pasted value that loads
  dirty, or that the converter reads differently from a hand-entered one, is the failure this whole
  checklist exists to catch.*
- [ ] **11. Entry naming.** Clipboard entries read `<Node name> - <Property label>` in the picker.
- [ ] **12. Weekly Hours across time formats.** Copy from a node whose data type has **Time
  Format** set to 24-hour, paste into one set to 12-hour. Times render in the target's format and
  the stored values are unchanged.
- [ ] **13. Cross-editor paste is impossible.** With a Weekly Hours value on the clipboard, open the
  paste picker on Special Business Hours: the Weekly entry is not offered. Same in reverse. (Each
  editor has its own clipboard entry value type, so no translator matches.)

## Result

Record the date run and the outcome here. If an item fails, stop and fix it rather than ticking and
carrying on.
