# Localisation, accessibility and defect sweep — design

## Context

Phases 1 and 2 of the timeline hours editors shipped (`docs/superpowers/specs/2026-08-19-hours-timeline-editor-design.md`). Both are functionally complete with 147 C# and 117 TypeScript tests passing, and the phase 1 manual backoffice pass came back clean.

An audit of the delivered code against that spec found **five requirements never implemented**, all in the UI layer the spec deliberately excluded from automated tests, and all traceable to the phase 1 *plan* rather than to execution. A separate pass for accessibility and for hardcoded strings found twelve defects. This phase closes all of it, and localises the client.

The audit's lesson is worth recording: the untested surface is exactly where the drift accumulated, and the hand-verification meant to catch it was written from the same plan that had already dropped the requirements. Checklists derived from a plan cannot catch what the plan omitted. The manual checklist in this phase is therefore written from **this spec**, not from its plan.

## Scope

**In scope**

- Localisation of every user-facing string in the client, with an `en` dictionary as the single source of truth.
- The twelve accessibility and functional defects listed below.
- Two of the five spec requirements the audit found missing (narrow-block indicators, tooltip on keyboard focus). A third — the range dialog's meridiem control — is resolved by amending the original spec rather than building it; see *Settled decisions*.

**Out of scope**

- Cultures other than `en`. The dictionary establishes the keys; translations are a later contribution.
- Localisation of server-side output. `WeeklyHoursDay.DayName` already uses `CultureInfo.CurrentCulture` and is correct.
- The two remaining spec deviations that are judged improvements on the spec: the tooltip's text format, and hiding rather than disabling the All day toggle. Both are recorded in *Settled decisions* as deliberate.
- Anything touching the Standard or Special Business Hours editors.

## Settled decisions

| Decision | Choice | Why |
|---|---|---|
| `ooc-timeline` base class | Becomes `UmbLitElement` | `this.localize` needs it. The element loses its framework independence, but `UmbLitElement` renders without an ancestor context and vitest here is node-only, so nothing testable is lost today. |
| Cultures shipped | `en` only | Establishes every key and the registration pattern. No machine-translated strings nobody has reviewed. |
| Validation message contract | Pure modules return **codes**, elements localise | `holiday.ts` and `time-range.ts` are DOM-free and unit-tested; they cannot call `this.localize`. A code is also a sounder contract than a sentence — today a copy-edit breaks a test. |
| Range dialog time entry | Keep native `<input type="time">`; **amend the phase 1 spec** | The original spec wanted a custom hour/minute/AM-PM control with the meridiem hidden when `time_24hr` is on. Native inputs are better for keyboard and mobile and follow the OS locale. `use24Hour` is removed from the modal's data rather than left dead. |
| Tooltip text format | Keep `Monday, 09:00 – 17:00, label` | The phase 1 spec asked for `9:00 AM – 5:00 PM · Kitchen closes 4:30`. The current form doubles as the `aria-label`, and one string serving both is worth more than the middot. |
| All day toggle when the day has other ranges | Keep hiding it | The phase 1 spec asked for disabled-with-a-title. A control that cannot ever apply is better absent than present-and-dead. |
| Key namespace | One `openOrClosed` area | Package-scoped, so keys read `openOrClosed_addHoliday`. Two areas would split arbitrarily. |
| Built-in keys | Reuse where they exist | Verified present in `dist-cms/assets/lang/en.js`. |

## Localisation

### Registration

```
Client/src/localization/
  en.ts          the dictionary — the only place English lives
  manifest.ts    the `localization` manifest
```

`manifest.ts`:

```ts
export const manifests: Array<UmbExtensionManifest> = [
    {
        type: 'localization',
        alias: 'OpenOrClosed.Localization.En',
        name: 'Open Or Closed English',
        meta: { culture: 'en' },
        js: () => import('./en.js'),
    },
];
```

Spread into `bundle.manifests.ts` **first**, so the dictionary is registered before any element that reads from it.

`en.ts` exports a default object keyed by area; `ManifestLocalization` types it as `ManifestPlainJs<{ default: UmbLocalizationDictionary }>`:

```ts
export default {
    openOrClosed: {
        // ...
    },
};
```

### Built-in keys to reuse, not redefine

Verified present in the shipped `en.js`:

| Use | Key |
|---|---|
| Name field label | `general_name` |
| Cancel button | `general_cancel` |
| Remove button | `general_remove` |
| Save button | `buttons_save` |
| Label field | `general_label` |
| Yes / No cell | `general_yes` / `general_no` |
| `Default` mode and pill | `general_default` |

There is no `general_save`; Save lives at `buttons_save`.

### New keys

Area `openOrClosed`. Keys are camelCase, referenced as `openOrClosed_<key>`.

**Weekly hours editor**

| Key | English |
|---|---|
| `weeklyHoursLabel` | Weekly Hours |
| `settingTimeFormat` | Time Format |
| `settingTimeFormatDescription` | 12/24 hour clock |
| `settingDefaultOpen` | Default Open Time |
| `settingDefaultOpenDescription` | Start time for a newly added set of hours — defaults to 09:00 |
| `settingDefaultClose` | Default Close Time |
| `settingDefaultCloseDescription` | End time for a newly added set of hours — defaults to 17:00 |
| `settingAppointmentOnly` | Enable Appointment Only? |
| `settingAppointmentOnlyDescription` | Show the appointment only option for a set of hours |

**Holidays editor**

| Key | English |
|---|---|
| `holidaysLabel` | Holidays |
| `defaultHolidayHours` | Default holiday hours |
| `noHolidaysYet` | No holidays yet. |
| `addHoliday` | + Add holiday |
| `removeExpired` | Remove expired |
| `columnDates` | Dates |
| `columnYearly` | Yearly |
| `columnHours` | Hours |
| `expiredSuffix` | (Expired) |
| `hoursClosed` | Closed |
| `hoursCustom` | Custom |
| `openHolidayAction` | Edit {0} |
| `settingRemoveExpired` | Remove Expired Holidays? |
| `settingRemoveExpiredDescription` | Hide finished holidays from the converted value and the Delivery API. They stay visible in this editor so a mistyped date can still be corrected. |

**Holiday modal**

| Key | English |
|---|---|
| `holiday` | Holiday |
| `startsOn` | Starts on |
| `endsOn` | Ends on |
| `repeatYearly` | Repeat yearly |
| `repeatYearlyHint` | A repeating holiday never expires. |
| `defaultHoursHint` | Uses the default holiday hours: {0}. |
| `defaultHoursEmptyHint` | No default holiday hours are set, so this holiday is closed. |

**Range modal**

| Key | English |
|---|---|
| `editHours` | Edit hours |
| `startsAt` | Starts at |
| `endsAt` | Ends at |
| `allDay` | All day |
| `labelOptional` | (optional) |
| `byAppointmentOnly` | By appointment only |

**Timeline accessible names**

| Key | English |
|---|---|
| `byAppointmentOnlyShort` | by appointment only |

**Validation** — one key per code (see below)

| Key | English |
|---|---|
| `errorNameRequired` | A name is required |
| `errorStartDateInvalid` | A valid start date is required |
| `errorEndDateInvalid` | A valid end date is required |
| `errorEndBeforeStart` | The end date must be on or after the start date |
| `errorCustomNeedsHours` | Custom hours need at least one set of hours |
| `errorOutsideDay` | Hours must fall within the day. |
| `errorEndNotAfterStart` | The end time must be after the start time. |
| `errorTooShort` | Hours must be at least {0} minutes long. |
| `errorOverlaps` | These hours overlap another set on the same day. |

### Day names and axis labels

Both are currently hardcoded English, and the axis additionally ignores `time_24hr`.

Day names come from the browser rather than the dictionary, so they need no translation and cannot drift from the server's `CultureInfo.CurrentCulture`:

```ts
new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(referenceDate)
```

`WEEK` keeps its `day` numbers (the stored `System.DayOfWeek` convention) and derives `name` at render time.

Axis labels derive from the existing `formatDisplay(minutes, use24Hour)`, so 24-hour mode shows `00:00 / 06:00 / 12:00 / 18:00 / 24:00` and 12-hour mode shows `12 AM / 6 AM / 12 PM / 6 PM / 12 AM`. This removes four hardcoded strings and fixes the axis/blocks disagreement in one change.

### Validation codes

`holiday.ts` and `time-range.ts` stop returning prose:

```ts
export type HolidayError = 'nameRequired' | 'startDateInvalid' | 'endDateInvalid'
    | 'endBeforeStart' | 'customNeedsHours';

export type HoursRangeProblem =
    | { code: 'outsideDay' }
    | { code: 'endNotAfterStart' }
    | { code: 'tooShort'; minutes: number }
    | { code: 'overlaps' };
```

`validateHoliday` and `holidayConsistencyError` return `HolidayError | null`. `validateRange` returns `HoursRangeProblem | null` — **not** `RangeError`, which is a JS built-in that `parseTime` in this very module already throws — an object rather than a bare string because `tooShort` carries `MIN_RANGE_MINUTES` into the message.

Elements resolve them:

```ts
private _errorText(error: HolidayError | null): string | null {
    return error ? this.localize.term(`openOrClosed_error${capitalise(error)}`) : null;
}
```

Existing tests change from asserting sentences to asserting codes. That is the whole of the churn, and it is mechanical.

## Accessibility

| # | Defect | Fix |
|---|---|---|
| 1 | Holiday rows are `<tr @click>` with no `tabindex` or keydown — unreachable by keyboard | The Name cell gains a real `<button>` carrying `aria-label` from `openHolidayAction`. The row keeps `@click` as a pointer convenience. `role="button"` on a `<tr>` is rejected: it destroys table semantics for screen readers. |
| 2 | Focus is lost when Delete/Backspace removes a block | After the commit, focus the block now at the same index, or the previous one, or the track if the day is empty. Needs `await this.updateComplete` before the query. |
| 3 | Enter on empty track creates a block but leaves focus on the track | Focus the created block by index after `updateComplete`. |
| 4 | Tooltips never appear on keyboard focus — native `title` is hover-only | Replace `title` with a rendered tooltip shown on `:hover` and `:focus-visible`. `aria-label` stays, so screen readers are unaffected either way; this is for sighted keyboard users. Largest single item in the phase, and the first to cut if it must be. |
| 5 | `.sr-only` live region resolves against the initial containing block | `:host { position: relative }`. |
| 6 | `<th>` elements lack `scope="col"` | Add it. |

## Functional defects

| # | Defect | Fix |
|---|---|---|
| 7 | `use24Hour` is passed to the range modal by all three callers and read by none | Remove it from `OocRangeModalData` and from the call sites. Dead data is how the unimplemented meridiem requirement shows from the inside; deleting it records the decision in the type. |
| 8 | Narrow blocks show ellipsised text (`00:…`), not the indicators alone the spec asked for | Hide `.times` when the block is narrower than a threshold, leaving the icons. A container query on the block is preferred over measuring in JS; fall back to a class computed from the range's percentage width if `@container` proves impractical inside the shadow tree. |
| 9 | Right-click on empty track creates a range | Guard `_onTrackPointerDown` with `event.button !== 0`. |
| 10 | `HolidaysConverter.Project` sorts `DefaultHours` and each holiday's `Hours`, but not the holiday list | Sort by `Start`, then `Name`, matching the editor's `sortHolidays`. Razor and Delivery API consumers currently get a different order than the editor displays. |
| 11 | Day names are hardcoded English in `ooc-weekly-hours` while the server uses the current culture | `Intl.DateTimeFormat`, as above. |
| 12 | Axis labels are hardcoded `12 AM / 06 AM / …` and ignore `time_24hr` | Derive from `formatDisplay`, as above. |

## Testing

**TypeScript (vitest, node — no DOM).** The validation-code refactor is where the real coverage is: every existing assertion on a message string becomes an assertion on a code, and `HoursRangeProblem`'s `tooShort` variant gains a case proving it carries `minutes`. `holiday.test.ts` and `time-range.test.ts` both change; no new test file is needed. A new test asserts the `en` dictionary contains a key for every member of `HolidayError` and `HoursRangeProblem['code']`, so a code added later without a translation fails the build rather than rendering a raw key to an editor.

**C#.** One new case in `HolidaysDeliveryApiTests`: holidays come back sorted by start then name, on both the Razor and Delivery API paths.

**Not covered.** Everything in the Accessibility table, plus the narrow-block threshold. Focus management, tooltip-on-focus and container queries need a real browser, and this project has no DOM test harness. They go to the manual checklist — written from this spec, for the reason given in *Context*.

## Delivery order

1. **Localisation infrastructure** — dictionary, manifest, bundle registration, and the manifest `#key` references. Independently verifiable: settings labels in the data type editor come from the dictionary.
2. **Validation codes** — the pure-module refactor and its test churn, then both modals resolving codes. Touches the most tested code, so it goes early while attention is on it.
3. **Element strings** — the four elements' remaining literals, plus day names and axis labels (defects 11 and 12, which are the same change).
4. **Accessibility** — defects 1–6.
5. **Remaining functional defects** — 7, 8, 9, 10.
6. **Manual checklist and README** — the checklist for everything above, and a README note that the package ships an `en` dictionary that translations can extend.

Steps 1–3 are the localisation strand and must run in order. 4 and 5 are independent of each other and of 1–3.

## Risks

- **The validation-code refactor touches the only well-tested client code.** Mitigated by it being mechanical and by the dictionary-completeness test, which turns a missing key from a silent raw-key render into a build failure.
- **Container queries inside a shadow root.** If `@container` on the block proves impractical, the fallback is a class derived from the range width, which the element already computes for positioning. Either way the threshold is a guess until seen in a browser, so it belongs in the manual pass.
- **`ooc-timeline` becoming an `UmbLitElement`** couples it to Umbraco. Accepted deliberately; the element is only ever used inside the backoffice, and no test depends on its independence.
- **Every accessibility fix is manually verified only.** This is the same exposure that let five spec requirements slip through phase 1. The checklist is written from this spec rather than from the plan, which is the one structural guard available without a DOM harness.
