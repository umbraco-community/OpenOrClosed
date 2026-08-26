# Clipboard copy/paste for the property editors — design

## Context

[Issue #77](https://github.com/umbraco-community/OpenOrClosed/issues/77) asks for Umbraco's clipboard support on the Standard and Special Business Hours editors. The reporter manages opening hours for a large number of branch locations, each a separate content node. Standard weekly hours are set once per branch; special hours — bank holidays, Christmas closures, one-off events — need applying identically across most or all branches at the same time, and today that is done by hand, node by node.

Umbraco 17.1 ships a full property-value clipboard in `@umbraco-cms/backoffice/clipboard`: two `propertyAction` kinds, a `propertyContext` kind, and a pair of per-editor value translators. Nothing in it is editor-specific — a property editor opts in by registering five manifests. The Block List's registration (`packages/block/block-list/clipboard/manifests.js` in the backoffice package) is the reference implementation this design follows.

Both target editors are already `ValueTypes.Json` with a `propertyEditorSchemaAlias` set, which is everything the clipboard requires. **This change touches no C# and adds no localisation keys.**

### The issue's premise needs one correction

The issue treats "copy/paste" and Umbraco's "Copy to other nodes" as one mechanism. They are not, and the difference is material to what #77 can deliver:

- **The clipboard is real.** Copy on branch A, open branch B, paste. Entries are named `<Node name> - <Property label>` by the core copy action, so "Manchester - Special Business Hours" stays findable later.
- **There is no core bulk "apply this property value to N selected nodes."** The only document entity bulk actions in 17.1 are publish, unpublish, move-to, duplicate-to and trash. None writes a single property across a selection.
- **The clipboard is browser `localStorage`** (`clipboard-local-storage.manager.js`), per browser and per user. It is not a server-side clipboard shared between editors.

So the outcome for the reporter is: copy once, then one paste per branch. For a hundred branches that is a hundred pastes — a large improvement on typing a hundred dates, but not "a few clicks". A genuine bulk apply needs a server-side endpoint writing property values across documents, with permissions, variants, publish state and validation to answer for. That is a separate feature, not this one, and the issue should be answered plainly rather than left to imply it is covered.

## Scope

**In scope**

- Clipboard copy and paste (replace) on all four property editors: Standard Business Hours, Special Business Hours, Weekly Hours, Holidays.
- One clipboard entry value type per editor, versioned.
- One shared copy translator; four paste translators.
- Unit tests for every translator, and a manual backoffice checklist written from this spec.
- README feature note and changelog line.

**Out of scope**

- **Merge/append paste** for Special Business Hours. Deferred to a follow-up issue; decisions already settled for it are recorded under *Deferred: merge/append* so the follow-up does not have to re-litigate them.
- **Bulk paste across selected nodes.** Not possible with core extension points; see above.
- **Cross-editor pasting**, in particular Standard Hours ↔ Weekly Hours. Both are weekly, but the shapes are unrelated and a translator pair would re-implement the mapping in `Migrations/Upgrade/MigrateOpenOrClosedDataTypes.cs`.
- Any C# change. None is needed.
- The hardcoded English labels still in `standard-hours/manifest.ts` and `special-hours/manifest.ts`. Pre-existing drift from the localisation phase; unrelated to the clipboard and left alone.

## Settled decisions

| Decision | Choice | Why |
|---|---|---|
| Editors covered | All four | The factory makes each extra editor ~15 lines of manifest plus one paste translator. Weekly Hours has the same per-branch duplication problem, and a right-click action present on two editors but missing on the other two reads as a bug. |
| Paste semantics in this change | Replace only | Matches every clipboard-enabled core editor. Independently shippable and closes #77. |
| Entry value types | One per editor | Prevents a weekly value ever reaching a date-keyed editor. The type string is the compatibility contract; nothing else has to check. |
| Wire format | `{ version: 1, value: <property value> }` | Entries sit in `localStorage` indefinitely. The version lets a future shape change decline stale entries instead of writing a broken value. One generic wrapper covers both the array-valued editors and the object-valued Holidays. |
| Copy translator count | One, registered four times | It never needs to know the type — the manifest's `toClipboardEntryValueType` supplies it. The body is a clone and a wrap. |
| Paste normalisation | Per editor, reusing existing sanitisers | `translate()` receives **no config** (see below), so anything config-dependent must stay where it already is: in the elements. |
| New localisation keys | None | The `copyToClipboard` and `pasteFromClipboard` kinds carry their own icons and labels ("Copy", "Replace") from core. Deferring merge removed the only strings this change would have added. |
| Manifest location | Beside the editor each set belongs to | `bundle.manifests.ts` needs no change; the manifests ride along with the editor's own `manifest.ts`. |

## The constraint that shapes the paste side

`UmbClipboardPastePropertyValueTranslator.translate(clipboardEntryValue)` receives the clipboard value and nothing else. Only the optional `isCompatibleValue(propertyValue, config)` sees the property editor's configuration.

A paste translator therefore **cannot** normalise against `showBankHolidays`, `removeOldDates`, `excludeTimes` or any other setting. This is not a problem, because both legacy editors already self-heal on any incoming value: `_initializeValue` runs from `willUpdate` whenever `value` changes, so Standard Hours slices 8→7 or extends 7→8 and re-labels the bank-holiday row from config, and Special Hours re-runs `_removeOldDates`. The translators stay near-identity and the elements keep sole responsibility for config-dependent shape.

`isCompatibleValue` is used for one thing only, where it earns its place: hiding a Special Hours entry from the picker when every date in it is already past and `removeOldDates` is on. Without the guard the paste succeeds, the element immediately filters everything out, and the editor sees nothing happen.

## Architecture

### Manifests, per editor

Five manifests, the same five the Block List registers:

| Manifest | Detail |
|---|---|
| `propertyContext`, kind `clipboard` | `forPropertyEditorUis: [<ui alias>]`. Supplies `UMB_CLIPBOARD_PROPERTY_CONTEXT` to the actions. |
| `propertyAction`, kind `copyToClipboard` | Condition `UMB_PROPERTY_HAS_VALUE_CONDITION_ALIAS` (`Umb.Condition.Property.HasValue`). |
| `propertyAction`, kind `pasteFromClipboard` | Condition `UMB_WRITABLE_PROPERTY_CONDITION_ALIAS` (`Umb.Condition.Property.Writable`). Core confirms before overwriting a non-empty property. |
| `clipboardCopyPropertyValueTranslator` | `fromPropertyEditorUi` → `toClipboardEntryValueType`. |
| `clipboardPastePropertyValueTranslator` | `fromClipboardEntryValueType` → `toPropertyEditorUi`. |

A copy translator is **not** optional. `UmbClipboardCopyPropertyValueTranslatorValueResolver.resolve` throws `No clipboard copy translators found.` when no manifest matches the editor, so registering the actions without one gives an action that only errors.

All four registrations are structurally identical, so a factory emits the set from `(uiAlias, entryValueType, pasteTranslatorImport)` — the same sharing instinct as `shared/business-hours-base.element.ts`. Manifest interfaces are declared into the global `UmbExtensionManifestMap` by the backoffice package, so the existing `Array<UmbExtensionManifest>` annotation types them with no imports.

No `propertyValueCloner` is needed: `UmbPropertyValueCloneController` returns the value untouched when no cloner matches the editor alias, and these values are plain JSON.

### Files

```
Client/src/clipboard/
  constants.ts                     the four entry value types
  manifest-factory.ts              the five manifests for one editor
  manifest.ts                      all four editors' registrations
  hours-copy.translator.ts         shared by all four editors
  hours-copy.translator.test.ts
  entry-value.ts                   the versioned wrapper: type, wrap, unwrap
  entry-value.test.ts
Client/src/standard-hours/clipboard/paste.translator.ts   (+ .test.ts)
Client/src/special-hours/clipboard/paste.translator.ts    (+ .test.ts)
Client/src/weekly-hours/clipboard/paste.translator.ts     (+ .test.ts)
Client/src/holidays/clipboard/paste.translator.ts         (+ .test.ts)
```

All four registrations live in `src/clipboard/manifest.ts`, spread into `bundle.manifests.ts` last, after every property editor UI they reference.

> **Amended during implementation.** This originally had each editor's own `manifest.ts` spread its factory output, on the grounds that `bundle.manifests.ts` would then need no change. That does not work. The factory imports Umbraco's condition aliases at *runtime*, and `@umbraco-cms/backoffice/property` touches `document` while it loads — so any node test importing an editor's manifest module dies, and `localization/en.test.ts` imports two of them. Inlining the dependency for vitest only got as far as the DOM access, so the constraint is real rather than a config wrinkle: **an editor's `manifest.ts` cannot carry a runtime backoffice import.** Centralising fixes it, because nothing imports `src/clipboard/manifest.ts` but the bundle.
>
> The alternative — hardcoding the two alias strings, as these manifest files already do for `Umb.PropertyEditorUi.Toggle` — was rejected on a verified difference: a misspelled imported constant is a compile error, while a misspelled string literal is not. The `conditions[].alias` field does not constrain the string, so a typo there would silently hide the action instead of failing the build.

### Entry value types

```ts
export const OOC_STANDARD_HOURS_CLIPBOARD_ENTRY_VALUE_TYPE = 'openOrClosed.standardHours';
export const OOC_SPECIAL_HOURS_CLIPBOARD_ENTRY_VALUE_TYPE  = 'openOrClosed.specialHours';
export const OOC_WEEKLY_HOURS_CLIPBOARD_ENTRY_VALUE_TYPE   = 'openOrClosed.weeklyHours';
export const OOC_HOLIDAYS_CLIPBOARD_ENTRY_VALUE_TYPE       = 'openOrClosed.holidays';
```

### The wrapper

```ts
export const OOC_CLIPBOARD_ENTRY_VERSION = 1;

export interface OocClipboardEntryValue<T> {
    version: number;
    value: T;
}
```

`wrap(value)` clones and stamps. `unwrap(entryValue)` returns the inner value, or throws when the argument is not an object, when `version` is missing, or when `version` is anything other than a version this build understands. Throwing is right: the paste action surfaces the failure rather than silently writing rubbish into a document.

### Copy translator

One class for every editor. `translate(propertyValue)` returns `wrap(propertyValue)`. It must `structuredClone` — the property value it is handed is live editor state, and the entry is about to be serialised into `localStorage`.

### Paste translators

| Editor | `translate` | `isCompatibleValue` |
|---|---|---|
| Standard Hours | `unwrap`, clone | none |
| Special Hours | `unwrap`, clone | see below |
| Weekly Hours | `unwrap`, then per day: drop the day unless `day` is an integer 0–6, then `sanitizeRanges(day.ranges)`, then drop the day if no ranges survive | none |
| Holidays | `unwrap`, then `sanitizeSchedule(value)` | none |

Standard Hours needs no array check of its own: the element already rebuilds a default week when `value` is not an array, so a malformed entry degrades to a fresh week rather than a broken one.

Special Hours `isCompatibleValue` returns **false** when `removeOldDates` is on and the value contains no entry whose date is today or later. That covers both the all-past entry and the empty entry — in each case the paste would visibly do nothing. With `removeOldDates` off it always returns true.

`sanitizeRanges` (`timeline/time-range.ts`) and `sanitizeSchedule` (`holidays/holiday.ts`) already exist, are DOM-free and are already unit-tested. Both accept `unknown` and coerce, which is exactly the contract wanted at a trust boundary — a clipboard entry may have been written by an older build of the package.

Holidays deliberately does **not** filter expired holidays on paste. `removeExpiredHolidays` affects the converted value and the Delivery API, not the editor, precisely so a mistyped date can still be corrected; a paste that dropped them would contradict that.

## Testing

All translators are DOM-free, so vitest covers them directly, matching the `time-range.test.ts` convention.

- **Round trip** — copy then paste returns a value deep-equal to the original, for each of the four editors.
- **Version rejection** — `unwrap` throws on `version: 0`, `version: 2`, a missing `version`, `null`, and a bare unwrapped array.
- **Clone isolation** — mutating the value handed to the copy translator does not change the entry; mutating a pasted value does not change the entry it came from.
- **Weekly Hours sanitisation** — a day with no valid ranges is dropped; malformed ranges are coerced by `sanitizeRanges`.
- **Holidays sanitisation** — a schedule missing `defaultHours` or `holidays` comes back well-formed.
- **Special Hours compatibility** — all-past entry and empty entry rejected when `removeOldDates` is on, both accepted when off; a mixed past/future entry accepted either way. Dates are compared as calendar dates against the browser's own today, not UTC — the bug `_removeOldDates` already carries a comment about.

A manual checklist under `docs/superpowers/plans/`, written **from this spec** rather than from its plan, covering what unit tests cannot reach:

1. Copy on node A, paste on node B, for each of the four editors.
2. Paste into an empty property — no confirm dialog, value lands.
3. Paste into a property that already has a value — confirm dialog names the entry, cancelling changes nothing.
4. Copy action absent on an empty property (the `HasValue` condition); paste action absent on a read-only property (the `Writable` condition).
5. Standard Hours copied from a data type with bank holidays, pasted into one without — 8 rows become 7, no orphan row.
6. The reverse — 7 rows become 8 with a correctly labelled bank-holiday row.
7. Special Hours entry containing only past dates, pasted into an editor with `removeOldDates` on — the entry does not appear in the picker at all.
8. Special Hours entry with mixed dates — past ones are dropped after paste, future ones survive.
9. A culture-variant property: copy on one culture, paste on another.
10. Save and reload after every paste; then publish and confirm the front-end value converter output is unchanged in shape.
11. Clipboard entry names read `<Node name> - <Property label>`.

Item 10 matters more than it looks: a pasted value that loads dirty, or that the converter reads differently from a hand-entered one, is the failure mode worth catching before release.

## Delivery order

1. `entry-value.ts` + tests. Nothing else can be written honestly until the wrapper's failure behaviour is settled.
2. `hours-copy.translator.ts` + tests, and `constants.ts`.
3. `manifest-factory.ts`.
4. Standard Hours: paste translator, tests, manifest wiring. First editor through end to end — verify in the backoffice before repeating.
5. Special Hours, including `isCompatibleValue` and its tests.
6. Weekly Hours.
7. Holidays.
8. Manual checklist run; README feature note and changelog line.

## Risks

| Risk | Mitigation |
|---|---|
| A pasted value loads *dirty*, so the document shows "Discard unsaved changes" on navigate-away | The elements normalise incoming values in `_initializeValue`, which is exactly what would otherwise happen on load and mark the document dirty. Manual checklist item 10 is the check that this holds. |
| Stale `localStorage` entries after a future value-shape change | The `version` stamp, and `unwrap` throwing rather than coercing. |
| `translate()` being config-blind is discovered late to be insufficient | Both legacy elements already self-heal, verified by reading `_initializeValue` and `willUpdate`. Checklist items 5–8 exercise the config mismatches directly. |
| The reporter expects bulk apply and #77 does not deliver it | Answered explicitly on the issue when the work lands, with the follow-up issue for merge/append linked. |

## Deferred: merge/append

For the follow-up issue, so it does not start from scratch. Not built here.

A merge action for Special Business Hours is our own `propertyAction` — not a core kind — with a weight just under the core paste's 1190 so it sits below "Replace" in the menu. Its api consumes `UMB_PROPERTY_CONTEXT` and `UMB_CLIPBOARD_PROPERTY_CONTEXT`, calls `pick({ propertyEditorUiAlias, multiple: false })`, merges, and calls `setValue`. Condition: `UMB_WRITABLE_PROPERTY_CONDITION_ALIAS`. It needs the one localisation key this change avoided.

Settled merge rule: **dedupe by calendar date, incoming wins, result sorted ascending.** Incoming-wins matches "head office decides all branches close on this day". Keeping both entries was rejected — two entries for one date is ambiguous to the value converter and the Delivery API, with no UI to disambiguate. Date comparison reuses the element's existing `_dateKey` normalisation so a stored `2026-12-25T00:00:00` and a copied `2026-12-25` count as the same day; that logic should move to a pure, tested `mergeSpecialDays(existing, incoming)` module rather than living in the action.

Merge is meaningless for Standard Hours and Weekly Hours (fixed or day-keyed weeks) and for Holidays' `defaultHours`, so it is Special Hours only.
