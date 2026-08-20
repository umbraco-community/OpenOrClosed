# Timeline Hours Editor — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the `OpenOrClosed.WeeklyHours` property editor — a Monday-to-Sunday timeline on which sets of hours are drawn, dragged and edited — together with its server-side model, value converter and Delivery API support.

**Architecture:** All non-trivial time arithmetic lives in `time-range.ts`, a pure TypeScript module with no DOM or Lit dependency, so it can be unit-tested with vitest. `<ooc-timeline>` renders one track and wires events over that module; it knows nothing about days, holidays or Umbraco. The weekly editor composes seven of them. On the server, a `TimeSpan`-based model with an `"HH:mm"` JSON converter keeps `24:00` expressible and the Delivery API payload clean.

**Tech Stack:** Lit 3 + TypeScript 5.8 (Umbraco backoffice), vite 7, vitest 3, .NET 10, Umbraco CMS 17–18, xUnit + FluentAssertions + NSubstitute.

**Spec:** `docs/superpowers/specs/2026-08-19-hours-timeline-editor-design.md`

## Global Constraints

- Target framework `net10.0`; Umbraco `[17.0.0,19)`. Do not change either.
- **System.Text.Json only.** Newtonsoft.Json must not be referenced by any file in `OpenOrClosed/` after Task 1.
- The existing `OpenOrClosed.StandardHours` and `OpenOrClosed.SpecialHours` editors keep their current behaviour and their current Delivery API output. Task 1 is a serializer swap, not a behaviour change.
- Times are stored as 24-hour `"HH:mm"` strings. `"24:00"` is valid as an end only.
- Snap step is 15 minutes; minimum range length is 15 minutes.
- Day values are `System.DayOfWeek` (0 = Sunday). Display order is Monday first.
- New C# code goes in namespace `OpenOrClosed.Core.*`, matching the existing project.
- Every C# test goes in the existing `tests/OpenOrClosed.Tests` project. Do not create another.
- Client tests are `*.test.ts` beside the module they test.
- Commit after every task. Never commit a failing build.

---

### Task 1: Replace Newtonsoft with System.Text.Json in the existing converters

The two existing converters call `JsonConvert.DeserializeObject`. STJ cannot read the stored values as-is for two reasons, both verified: it ignores `[DataContract]`/`[DataMember]`, and it rejects bare times like `"09:00:00"`. This task fixes both and removes the last Newtonsoft usage.

**Files:**
- Create: `OpenOrClosed/Serialization/BareTimeDateTimeJsonConverter.cs`
- Create: `OpenOrClosed/Serialization/StoredValueJson.cs`
- Create: `OpenOrClosed/Serialization/NullableBareTimeConverterFactory.cs`
- Modify: `OpenOrClosed/ViewModels/DaysViewModel.cs`
- Modify: `OpenOrClosed/ViewModels/HoursViewModel.cs`
- Modify: `OpenOrClosed/ViewModels/SpecialDaysViewModel.cs`
- Modify: `OpenOrClosed/PropertyValueConverters/StandardHoursConverter.cs`
- Modify: `OpenOrClosed/PropertyValueConverters/SpecialHoursConverter.cs`
- Test: `tests/OpenOrClosed.Tests/Serialization/StoredValueJsonTests.cs`

**Interfaces:**
- Consumes: nothing.
- Produces: `OpenOrClosed.Core.Serialization.StoredValueJson.Options` (a `JsonSerializerOptions` for reading stored property values), and `StoredValueJson.Deserialize<T>(string json)`.

- [ ] **Step 1: Write the failing test**

Create `tests/OpenOrClosed.Tests/Serialization/StoredValueJsonTests.cs`:

```csharp
using OpenOrClosed.Core.Serialization;
using OpenOrClosed.Core.ViewModels;

namespace OpenOrClosed.Tests.Serialization;

public class StoredValueJsonTests
{
    [Fact]
    public void Deserialize_ReadsTheLowercaseKeyTheEditorActuallyWrites()
    {
        // The editor has written "dayoftheweek" since the AngularJS version. Newtonsoft matched it
        // case-insensitively; STJ has to be told to.
        const string stored = """[{"dayoftheweek":"Monday","day":1,"isOpen":true,"hoursOfBusiness":[]}]""";

        var days = StoredValueJson.Deserialize<List<DaysViewModel>>(stored)!;

        days.Should().ContainSingle();
        days[0].DayOfTheWeek.Should().Be("Monday");
        days[0].Day.Should().Be(DayOfWeek.Monday);
        days[0].IsOpen.Should().BeTrue();
    }

    [Theory]
    [InlineData("09:00:00", 9, 0)]
    [InlineData("09:00", 9, 0)]
    [InlineData("17:30:00", 17, 30)]
    public void Deserialize_ReadsABareTimeAsATimeOfDay(string stored, int hour, int minute)
    {
        // STJ rejects a bare time outright, and Newtonsoft used to attach today's date to it -
        // which is what made the old staleness bug so easy to write. Anchor to no date at all.
        var json = $$"""[{"opensAt":"{{stored}}","closesAt":null}]""";

        var hours = StoredValueJson.Deserialize<List<HoursViewModel>>(json)!;

        hours[0].OpensAt!.Value.TimeOfDay.Should().Be(new TimeSpan(hour, minute, 0));
        hours[0].OpensAt!.Value.Date.Should().Be(default(DateTime));
        hours[0].ClosesAt.Should().BeNull();
    }

    [Fact]
    public void Deserialize_StillReadsARealDate()
    {
        const string stored = """[{"date":"2026-12-25","isOpen":false,"hoursOfBusiness":[]}]""";

        var days = StoredValueJson.Deserialize<List<SpecialDaysViewModel>>(stored)!;

        days[0].Date.Should().Be(new DateTime(2026, 12, 25));
    }

    [Fact]
    public void Deserialize_ReturnsNullForRubbishRatherThanThrowing()
    {
        StoredValueJson.Deserialize<List<DaysViewModel>>("not json").Should().BeNull();
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `dotnet test tests/OpenOrClosed.Tests --filter StoredValueJsonTests`
Expected: FAIL — `StoredValueJson` does not exist.

- [ ] **Step 3: Add the bare-time converter**

Create `OpenOrClosed/Serialization/BareTimeDateTimeJsonConverter.cs`:

```csharp
using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace OpenOrClosed.Core.Serialization;

/// <summary>
/// Reads the date and time formats the property editors have written over the years: a full date,
/// and a bare time of day such as "09:00:00" or "09:00".
/// </summary>
/// <remarks>
/// A bare time carries no date, so it is anchored to <see cref="DateTime.MinValue"/> rather than to
/// today. The converters re-anchor hours onto the day they belong to and read only the time of day,
/// and using today here is what let the original staleness bug hide for so long.
/// </remarks>
internal sealed class BareTimeDateTimeJsonConverter : JsonConverter<DateTime>
{
    private static readonly string[] TimeFormats = ["HH\\:mm\\:ss", "HH\\:mm"];

    public override DateTime Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType != JsonTokenType.String)
        {
            throw new JsonException($"Expected a string for {typeToConvert.Name}, found {reader.TokenType}.");
        }

        var value = reader.GetString();
        if (string.IsNullOrWhiteSpace(value))
        {
            return default;
        }

        if (DateTime.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.None, out var dateTime))
        {
            return dateTime;
        }

        if (TimeSpan.TryParseExact(value, TimeFormats, CultureInfo.InvariantCulture, out var timeOfDay))
        {
            return default(DateTime).Add(timeOfDay);
        }

        throw new JsonException($"'{value}' is not a date or a time of day.");
    }

    public override void Write(Utf8JsonWriter writer, DateTime value, JsonSerializerOptions options)
        => writer.WriteStringValue(value);
}
```

- [ ] **Step 4: Add the shared read options**

Create `OpenOrClosed/Serialization/StoredValueJson.cs`:

```csharp
using System.Text.Json;

namespace OpenOrClosed.Core.Serialization;

/// <summary>
/// Reads the JSON a property editor persisted. Deliberately lenient: stored values predate the
/// current models and were written by several generations of editor.
/// </summary>
internal static class StoredValueJson
{
    internal static JsonSerializerOptions Options { get; } = Build();

    private static JsonSerializerOptions Build()
    {
        var options = new JsonSerializerOptions
        {
            // The editor writes "dayoftheweek"; the model declares "dayOfTheWeek".
            PropertyNameCaseInsensitive = true,
            ReadCommentHandling = JsonCommentHandling.Skip,
            AllowTrailingCommas = true,
        };

        options.Converters.Add(new BareTimeDateTimeJsonConverter());
        options.Converters.Add(new NullableBareTimeConverterFactory());

        return options;
    }

    /// <summary>Deserializes a stored value, returning null rather than throwing on malformed JSON.</summary>
    internal static T? Deserialize<T>(string json)
    {
        try
        {
            return JsonSerializer.Deserialize<T>(json, Options);
        }
        catch (JsonException)
        {
            return default;
        }
    }
}
```

- [ ] **Step 5: Handle nullable DateTime**

`JsonConverter<DateTime>` is not applied to `DateTime?` automatically. Create
`OpenOrClosed/Serialization/NullableBareTimeConverterFactory.cs`:

```csharp
using System.Text.Json;
using System.Text.Json.Serialization;

namespace OpenOrClosed.Core.Serialization;

/// <summary>Applies <see cref="BareTimeDateTimeJsonConverter"/> to <c>DateTime?</c> as well.</summary>
internal sealed class NullableBareTimeConverterFactory : JsonConverterFactory
{
    public override bool CanConvert(Type typeToConvert) => typeToConvert == typeof(DateTime?);

    public override JsonConverter CreateConverter(Type typeToConvert, JsonSerializerOptions options)
        => new NullableBareTimeConverter();

    private sealed class NullableBareTimeConverter : JsonConverter<DateTime?>
    {
        private readonly BareTimeDateTimeJsonConverter _inner = new();

        public override DateTime? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
            => reader.TokenType == JsonTokenType.Null ? null : _inner.Read(ref reader, typeof(DateTime), options);

        public override void Write(Utf8JsonWriter writer, DateTime? value, JsonSerializerOptions options)
        {
            if (value is null)
            {
                writer.WriteNullValue();
                return;
            }

            _inner.Write(writer, value.Value, options);
        }
    }
}
```

- [ ] **Step 6: Swap the view model attributes**

In each of `DaysViewModel.cs`, `HoursViewModel.cs` and `SpecialDaysViewModel.cs`: remove `using System.Runtime.Serialization;` and the `[DataContract]` attribute, and replace every `[DataMember(Name = "x")]` with `[JsonPropertyName("x")]`, adding `using System.Text.Json.Serialization;`. **Keep the names exactly as they are** — they are the Delivery API's public contract, which the existing tests assert.

```csharp
using System.Text.Json.Serialization;

namespace OpenOrClosed.Core.ViewModels;

public class DaysViewModel
{
    [JsonPropertyName("dayOfTheWeek")]
    public required string DayOfTheWeek { get; set; }

    [JsonPropertyName("day")]
    public DayOfWeek? Day { get; set; }

    [JsonPropertyName("isOpen")]
    public bool IsOpen { get; set; }

    [JsonPropertyName("openComment")]
    public string? OpenComment { get; set; }

    [JsonPropertyName("closedComment")]
    public string? ClosedComment { get; set; }

    [JsonPropertyName("hasHours")]
    public bool HasHours { get; set; }

    [JsonPropertyName("hoursOfBusiness")]
    public List<HoursViewModel> HoursOfBusiness { get; set; } = [];
}
```

Apply the same treatment to `HoursViewModel` (`opensAt`, `closesAt`, `comment`, `byAppointmentOnly`) and `SpecialDaysViewModel` (`date`, `isOpen`, `openComment`, `closedComment`, `hasHours`, `hoursOfBusiness`).

- [ ] **Step 7: Run the test to verify it passes**

Run: `dotnet test tests/OpenOrClosed.Tests --filter StoredValueJsonTests`
Expected: PASS, 6 tests.

- [ ] **Step 8: Switch both converters off Newtonsoft**

In `StandardHoursConverter.cs`, replace `using Newtonsoft.Json;` with `using OpenOrClosed.Core.Serialization;` and change the body of `ConvertSourceToIntermediate`:

```csharp
return StoredValueJson.Deserialize<List<DaysViewModel>>(sourceString);
```

Make the identical change in `SpecialHoursConverter.cs` with `List<SpecialDaysViewModel>`.

- [ ] **Step 9: Verify nothing else references Newtonsoft**

Run: `grep -rn "Newtonsoft" OpenOrClosed/ --include=*.cs --include=*.csproj`
Expected: no output.

- [ ] **Step 10: Run the whole suite**

Run: `dotnet test tests/OpenOrClosed.Tests`
Expected: PASS. The 46 pre-existing tests are the regression net here — they assert the Delivery API output shape, so if the attribute swap changed a property name they will fail.

- [ ] **Step 11: Commit**

```bash
git add OpenOrClosed/Serialization OpenOrClosed/ViewModels OpenOrClosed/PropertyValueConverters tests/OpenOrClosed.Tests/Serialization
git commit -m "Read stored values with System.Text.Json instead of Newtonsoft"
```

---

### Task 2: vitest, and parsing and formatting times

**Files:**
- Modify: `OpenOrClosed/Client/package.json`
- Modify: `OpenOrClosed/Client/vite.config.ts`
- Create: `OpenOrClosed/Client/src/timeline/time-range.ts`
- Test: `OpenOrClosed/Client/src/timeline/time-range.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `DAY_MINUTES`, `MIN_RANGE_MINUTES`, `DEFAULT_SNAP_MINUTES`, `interface HoursRange`, `parseTime(value: string): number`, `isValidTime(value: string): boolean`, `formatTime(minutes: number): string`, `formatDisplay(minutes: number, use24Hour: boolean): string`, `formatRange(range: HoursRange, use24Hour: boolean): string`.

- [ ] **Step 1: Add vitest**

Run: `cd OpenOrClosed/Client && npm install --save-dev vitest@^3.2.0`

Then add scripts to `package.json` alongside the existing ones:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 2: Point vitest at the source tree**

Add to `vite.config.ts`, and add the triple-slash reference on line 1:

```ts
/// <reference types="vitest/config" />
import { defineConfig } from "vite";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  build: {
```

The rest of the file is unchanged. `environment: "node"` is deliberate — this module never touches the DOM.

- [ ] **Step 3: Write the failing test**

Create `OpenOrClosed/Client/src/timeline/time-range.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DAY_MINUTES, formatDisplay, formatTime, isValidTime, parseTime } from './time-range.js';

describe('parseTime', () => {
    it.each([
        ['00:00', 0],
        ['09:00', 540],
        ['09:15', 555],
        ['23:45', 1425],
        ['24:00', DAY_MINUTES],
    ])('reads %s as %i minutes', (value, expected) => {
        expect(parseTime(value)).toBe(expected);
    });

    it('accepts a stored value carrying seconds', () => {
        // The existing editors persist "09:00:00"; a shared data type could hand us one.
        expect(parseTime('09:00:00')).toBe(540);
    });

    it.each(['', 'nine', '9', '25:00', '09:60', '-01:00'])('rejects %s', (value) => {
        expect(isValidTime(value)).toBe(false);
        expect(() => parseTime(value)).toThrow();
    });
});

describe('formatTime', () => {
    it.each([
        [0, '00:00'],
        [540, '09:00'],
        [1425, '23:45'],
        [DAY_MINUTES, '24:00'],
    ])('writes %i as %s', (minutes, expected) => {
        expect(formatTime(minutes)).toBe(expected);
    });

    it('round-trips every snap point in the day', () => {
        for (let m = 0; m <= DAY_MINUTES; m += 15) {
            expect(parseTime(formatTime(m))).toBe(m);
        }
    });
});

describe('formatDisplay', () => {
    it.each([
        [0, '12:00 AM'],
        [540, '9:00 AM'],
        [720, '12:00 PM'],
        [1020, '5:00 PM'],
        [DAY_MINUTES, '12:00 AM'],
    ])('renders %i as %s on a 12-hour clock', (minutes, expected) => {
        expect(formatDisplay(minutes, false)).toBe(expected);
    });

    it('renders midnight at the end of the day as 24:00 on a 24-hour clock', () => {
        expect(formatDisplay(DAY_MINUTES, true)).toBe('24:00');
    });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `cd OpenOrClosed/Client && npm test`
Expected: FAIL — cannot resolve `./time-range.js`.

- [ ] **Step 5: Write the implementation**

Create `OpenOrClosed/Client/src/timeline/time-range.ts`:

```ts
/** Minutes in a day. Also the only legal end value above 23:59 — "24:00". */
export const DAY_MINUTES = 1440;

/** No range may be shorter than this. */
export const MIN_RANGE_MINUTES = 15;

export const DEFAULT_SNAP_MINUTES = 15;

/** One set of hours, exactly as it is persisted. */
export interface HoursRange {
    start: string;
    end: string;
    label: string | null;
    byAppointmentOnly: boolean;
}

const TIME_PATTERN = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;

function toMinutes(value: string): number | null {
    const match = TIME_PATTERN.exec(value);
    if (!match) return null;

    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (minutes > 59) return null;

    const total = hours * 60 + minutes;
    return total > DAY_MINUTES ? null : total;
}

export function isValidTime(value: string): boolean {
    return typeof value === 'string' && toMinutes(value) !== null;
}

/** Minutes since midnight. Throws on anything malformed — call isValidTime first for untrusted input. */
export function parseTime(value: string): number {
    const minutes = toMinutes(value);
    if (minutes === null) throw new RangeError(`'${value}' is not a time of day.`);
    return minutes;
}

/** The 24-hour wire format. 1440 becomes "24:00", which is legal as an end. */
export function formatTime(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${remainder.toString().padStart(2, '0')}`;
}

/** How a time is shown to a person, honouring the 12/24 hour setting. */
export function formatDisplay(minutes: number, use24Hour: boolean): string {
    if (use24Hour) return formatTime(minutes);

    const hours24 = Math.floor(minutes / 60) % 24;
    const remainder = minutes % 60;
    const hours12 = hours24 % 12 || 12;
    const meridiem = hours24 < 12 ? 'AM' : 'PM';

    return `${hours12}:${remainder.toString().padStart(2, '0')} ${meridiem}`;
}

export function formatRange(range: HoursRange, use24Hour: boolean): string {
    return `${formatDisplay(parseTime(range.start), use24Hour)} – ${formatDisplay(parseTime(range.end), use24Hour)}`;
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd OpenOrClosed/Client && npm test`
Expected: PASS.

- [ ] **Step 7: Verify the production build still type-checks**

Run: `cd OpenOrClosed/Client && npm run build`
Expected: succeeds. `tsc` runs over `src` with `strict` and `noUnusedLocals`, so this also proves the test file compiles.

- [ ] **Step 8: Commit**

```bash
git add OpenOrClosed/Client/package.json OpenOrClosed/Client/package-lock.json OpenOrClosed/Client/vite.config.ts OpenOrClosed/Client/src/timeline
git commit -m "Add vitest and the time parsing and formatting helpers"
```

---

### Task 3: Snapping, bounds, resizing and moving

**Files:**
- Modify: `OpenOrClosed/Client/src/timeline/time-range.ts`
- Test: `OpenOrClosed/Client/src/timeline/time-range.test.ts`

**Interfaces:**
- Consumes: `HoursRange`, `parseTime`, `formatTime`, `DAY_MINUTES`, `MIN_RANGE_MINUTES` from Task 2.
- Produces: `snap(minutes: number, step: number): number`, `sortRanges(ranges: HoursRange[]): HoursRange[]`, `boundsFor(ranges: HoursRange[], index: number): { min: number; max: number }`, `resizeRange(ranges: HoursRange[], index: number, edge: 'start' | 'end', minutes: number, step: number): HoursRange[]`, `moveRange(ranges: HoursRange[], index: number, startMinutes: number, step: number): HoursRange[]`.

All of these take a **sorted** range array and return a **new** sorted array; none mutate their input.

- [ ] **Step 1: Write the failing test**

Append to `time-range.test.ts`:

```ts
import { boundsFor, moveRange, resizeRange, snap, sortRanges } from './time-range.js';

const range = (start: string, end: string): HoursRange =>
    ({ start, end, label: null, byAppointmentOnly: false });

describe('snap', () => {
    it.each([
        [0, 0], [7, 0], [8, 15], [22, 15], [23, 30], [540, 540], [1439, DAY_MINUTES],
    ])('snaps %i to %i', (input, expected) => {
        expect(snap(input, 15)).toBe(expected);
    });

    it('never leaves the day', () => {
        expect(snap(-30, 15)).toBe(0);
        expect(snap(9999, 15)).toBe(DAY_MINUTES);
    });
});

describe('boundsFor', () => {
    const ranges = [range('09:00', '12:00'), range('13:00', '17:00')];

    it('bounds the first range by midnight and its neighbour', () => {
        expect(boundsFor(ranges, 0)).toEqual({ min: 0, max: 780 });
    });

    it('bounds the last range by its neighbour and the end of the day', () => {
        expect(boundsFor(ranges, 1)).toEqual({ min: 720, max: DAY_MINUTES });
    });
});

describe('resizeRange', () => {
    const ranges = [range('09:00', '12:00'), range('13:00', '17:00')];

    it('snaps the dragged edge', () => {
        expect(resizeRange(ranges, 0, 'end', 12 * 60 + 8, 15)[0].end).toBe('12:15');
    });

    it('clamps at the neighbour rather than overlapping it', () => {
        // Dragged well past 13:00, where the next range starts.
        expect(resizeRange(ranges, 0, 'end', 15 * 60, 15)[0].end).toBe('13:00');
    });

    it('clamps at the start of the day', () => {
        expect(resizeRange(ranges, 0, 'start', -120, 15)[0].start).toBe('00:00');
    });

    it('allows an end of 24:00', () => {
        expect(resizeRange([range('18:00', '23:00')], 0, 'end', DAY_MINUTES, 15)[0].end).toBe('24:00');
    });

    it('will not let an edge cross its opposite', () => {
        const resized = resizeRange(ranges, 0, 'end', 9 * 60, 15)[0];
        expect(resized.end).toBe('09:15');
        expect(parseTime(resized.end) - parseTime(resized.start)).toBe(MIN_RANGE_MINUTES);
    });

    it('leaves the other ranges untouched and does not mutate the input', () => {
        const resized = resizeRange(ranges, 0, 'end', 11 * 60, 15);
        expect(resized[1]).toEqual(ranges[1]);
        expect(ranges[0].end).toBe('12:00');
    });
});

describe('moveRange', () => {
    const ranges = [range('09:00', '12:00'), range('13:00', '17:00')];

    it('keeps the duration', () => {
        const moved = moveRange(ranges, 0, 8 * 60, 15)[0];
        expect(moved.start).toBe('08:00');
        expect(moved.end).toBe('11:00');
    });

    it('stops when the trailing edge reaches the neighbour', () => {
        const moved = moveRange(ranges, 0, 20 * 60, 15)[0];
        expect(moved.start).toBe('10:00');
        expect(moved.end).toBe('13:00');
    });

    it('stops at the start of the day', () => {
        const moved = moveRange(ranges, 0, -300, 15)[0];
        expect(moved.start).toBe('00:00');
        expect(moved.end).toBe('03:00');
    });
});

describe('sortRanges', () => {
    it('orders by start time', () => {
        const sorted = sortRanges([range('13:00', '17:00'), range('09:00', '12:00')]);
        expect(sorted.map((r) => r.start)).toEqual(['09:00', '13:00']);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd OpenOrClosed/Client && npm test`
Expected: FAIL — `snap` is not exported.

- [ ] **Step 3: Write the implementation**

Append to `time-range.ts`:

```ts
/** Rounds to the nearest step and holds the result inside the day. */
export function snap(minutes: number, step: number): number {
    const rounded = Math.round(minutes / step) * step;
    return Math.min(DAY_MINUTES, Math.max(0, rounded));
}

export function sortRanges(ranges: HoursRange[]): HoursRange[] {
    return [...ranges].sort((a, b) => parseTime(a.start) - parseTime(b.start));
}

/** How far a range may extend before it would touch a neighbour or leave the day. */
export function boundsFor(ranges: HoursRange[], index: number): { min: number; max: number } {
    const previous = ranges[index - 1];
    const next = ranges[index + 1];

    return {
        min: previous ? parseTime(previous.end) : 0,
        max: next ? parseTime(next.start) : DAY_MINUTES,
    };
}

function replaceAt(ranges: HoursRange[], index: number, start: number, end: number): HoursRange[] {
    const updated = [...ranges];
    updated[index] = { ...ranges[index], start: formatTime(start), end: formatTime(end) };
    return updated;
}

export function resizeRange(
    ranges: HoursRange[],
    index: number,
    edge: 'start' | 'end',
    minutes: number,
    step: number,
): HoursRange[] {
    const { min, max } = boundsFor(ranges, index);
    const start = parseTime(ranges[index].start);
    const end = parseTime(ranges[index].end);
    const snapped = snap(minutes, step);

    if (edge === 'start') {
        const clamped = Math.min(Math.max(snapped, min), end - MIN_RANGE_MINUTES);
        return replaceAt(ranges, index, clamped, end);
    }

    const clamped = Math.max(Math.min(snapped, max), start + MIN_RANGE_MINUTES);
    return replaceAt(ranges, index, start, clamped);
}

export function moveRange(
    ranges: HoursRange[],
    index: number,
    startMinutes: number,
    step: number,
): HoursRange[] {
    const { min, max } = boundsFor(ranges, index);
    const duration = parseTime(ranges[index].end) - parseTime(ranges[index].start);
    const snapped = snap(startMinutes, step);
    const clamped = Math.min(Math.max(snapped, min), max - duration);

    return replaceAt(ranges, index, clamped, clamped + duration);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd OpenOrClosed/Client && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add OpenOrClosed/Client/src/timeline
git commit -m "Add snapping, clamping and moving to the range helpers"
```

---

### Task 4: Gaps, creating a range, validating and sanitising

**Files:**
- Modify: `OpenOrClosed/Client/src/timeline/time-range.ts`
- Test: `OpenOrClosed/Client/src/timeline/time-range.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 2 and 3.
- Produces: `gapAt(ranges: HoursRange[], minutes: number): { start: number; end: number } | null`, `largestGap(ranges: HoursRange[]): { start: number; end: number } | null`, `createRange(ranges: HoursRange[], atMinutes: number, durationMinutes: number, step: number): HoursRange[] | null`, `validateRange(ranges: HoursRange[], index: number, startMinutes: number, endMinutes: number): string | null`, `sanitizeRanges(raw: unknown): HoursRange[]`.

`createRange` returns `null` when there is no room. `validateRange` returns an error message, or `null` when the range is acceptable.

- [ ] **Step 1: Write the failing test**

Append to `time-range.test.ts`:

```ts
import { createRange, gapAt, largestGap, sanitizeRanges, validateRange } from './time-range.js';

describe('gapAt', () => {
    const ranges = [range('09:00', '12:00'), range('13:00', '17:00')];

    it('finds the gap between two ranges', () => {
        expect(gapAt(ranges, 12 * 60 + 30)).toEqual({ start: 720, end: 780 });
    });

    it('finds the gap before the first range', () => {
        expect(gapAt(ranges, 60)).toEqual({ start: 0, end: 540 });
    });

    it('finds the gap after the last range', () => {
        expect(gapAt(ranges, 20 * 60)).toEqual({ start: 1020, end: DAY_MINUTES });
    });

    it('returns null inside an existing range', () => {
        expect(gapAt(ranges, 10 * 60)).toBeNull();
    });

    it('treats an empty day as one whole gap', () => {
        expect(gapAt([], 10 * 60)).toEqual({ start: 0, end: DAY_MINUTES });
    });
});

describe('largestGap', () => {
    it('picks the widest free stretch', () => {
        expect(largestGap([range('09:00', '10:00'), range('11:00', '17:00')]))
            .toEqual({ start: 1020, end: DAY_MINUTES });
    });

    it('returns null on a full day', () => {
        expect(largestGap([range('00:00', '24:00')])).toBeNull();
    });
});

describe('createRange', () => {
    it('starts at the click point and runs for the default duration', () => {
        const created = createRange([], 9 * 60, 8 * 60, 15)!;
        expect(created).toHaveLength(1);
        expect(created[0]).toEqual({ start: '09:00', end: '17:00', label: null, byAppointmentOnly: false });
    });

    it('truncates to fit the gap it was dropped into', () => {
        const ranges = [range('09:00', '12:00'), range('13:00', '17:00')];
        const created = createRange(ranges, 12 * 60, 8 * 60, 15)!;
        expect(created[1]).toMatchObject({ start: '12:00', end: '13:00' });
    });

    it('inserts in sorted order', () => {
        const created = createRange([range('13:00', '17:00')], 9 * 60, 60, 15)!;
        expect(created.map((r) => r.start)).toEqual(['09:00', '13:00']);
    });

    it('refuses when the gap is smaller than the minimum', () => {
        const ranges = [range('09:00', '12:00'), range('12:10', '17:00')];
        expect(createRange(ranges, 12 * 60 + 5, 60, 5)).toBeNull();
    });

    it('refuses inside an existing range', () => {
        expect(createRange([range('09:00', '17:00')], 10 * 60, 60, 15)).toBeNull();
    });
});

describe('validateRange', () => {
    const ranges = [range('09:00', '12:00'), range('13:00', '17:00')];

    it('accepts a range that fits', () => {
        expect(validateRange(ranges, 0, 9 * 60, 11 * 60)).toBeNull();
    });

    it('rejects an end at or before the start', () => {
        expect(validateRange(ranges, 0, 10 * 60, 10 * 60)).toMatch(/after/i);
    });

    it('rejects a range shorter than the minimum', () => {
        expect(validateRange(ranges, 0, 9 * 60, 9 * 60 + 5)).toMatch(/15 minutes/i);
    });

    it('rejects an overlap with another range', () => {
        expect(validateRange(ranges, 0, 9 * 60, 14 * 60)).toMatch(/overlap/i);
    });

    it('ignores the range being edited when checking overlaps', () => {
        expect(validateRange(ranges, 1, 12 * 60, 18 * 60)).toBeNull();
    });

    it('rejects a range leaving the day', () => {
        expect(validateRange(ranges, 0, 9 * 60, DAY_MINUTES + 60)).toMatch(/day/i);
    });
});

describe('sanitizeRanges', () => {
    it('drops entries that are not usable and sorts the rest', () => {
        const raw = [
            { start: '13:00', end: '17:00' },
            { start: 'nope', end: '10:00' },
            null,
            { start: '09:00', end: '12:00', label: 'Morning', byAppointmentOnly: true },
            { start: '18:00', end: '17:00' },
        ];

        expect(sanitizeRanges(raw)).toEqual([
            { start: '09:00', end: '12:00', label: 'Morning', byAppointmentOnly: true },
            { start: '13:00', end: '17:00', label: null, byAppointmentOnly: false },
        ]);
    });

    it('returns an empty array for anything that is not an array', () => {
        expect(sanitizeRanges(undefined)).toEqual([]);
        expect(sanitizeRanges('nope')).toEqual([]);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd OpenOrClosed/Client && npm test`
Expected: FAIL — `gapAt` is not exported.

- [ ] **Step 3: Write the implementation**

Append to `time-range.ts`:

```ts
interface Gap {
    start: number;
    end: number;
}

function gaps(ranges: HoursRange[]): Gap[] {
    const found: Gap[] = [];
    let cursor = 0;

    for (const range of ranges) {
        const start = parseTime(range.start);
        if (start > cursor) found.push({ start: cursor, end: start });
        cursor = parseTime(range.end);
    }

    if (cursor < DAY_MINUTES) found.push({ start: cursor, end: DAY_MINUTES });

    return found;
}

/** The free stretch containing this point, or null if it falls inside a range. */
export function gapAt(ranges: HoursRange[], minutes: number): Gap | null {
    return gaps(ranges).find((gap) => minutes >= gap.start && minutes < gap.end) ?? null;
}

export function largestGap(ranges: HoursRange[]): Gap | null {
    return gaps(ranges).reduce<Gap | null>(
        (widest, gap) =>
            gap.end - gap.start >= MIN_RANGE_MINUTES &&
            (widest === null || gap.end - gap.start > widest.end - widest.start)
                ? gap
                : widest,
        null,
    );
}

/**
 * Adds a range beginning at the given point, running for the default duration but never past the
 * end of the gap it lands in. Returns null when there is no room.
 */
export function createRange(
    ranges: HoursRange[],
    atMinutes: number,
    durationMinutes: number,
    step: number,
): HoursRange[] | null {
    const gap = gapAt(ranges, atMinutes);
    if (gap === null || gap.end - gap.start < MIN_RANGE_MINUTES) return null;

    const start = Math.min(Math.max(snap(atMinutes, step), gap.start), gap.end - MIN_RANGE_MINUTES);
    const end = Math.min(start + durationMinutes, gap.end);
    if (end - start < MIN_RANGE_MINUTES) return null;

    return sortRanges([
        ...ranges,
        { start: formatTime(start), end: formatTime(end), label: null, byAppointmentOnly: false },
    ]);
}

/** Checks a typed range. Dragging cannot produce these, but the dialog can. */
export function validateRange(
    ranges: HoursRange[],
    index: number,
    startMinutes: number,
    endMinutes: number,
): string | null {
    if (startMinutes < 0 || endMinutes > DAY_MINUTES) {
        return 'Hours must fall within the day.';
    }

    if (endMinutes <= startMinutes) {
        return 'The end time must be after the start time.';
    }

    if (endMinutes - startMinutes < MIN_RANGE_MINUTES) {
        return `Hours must be at least ${MIN_RANGE_MINUTES} minutes long.`;
    }

    const overlaps = ranges.some(
        (other, i) =>
            i !== index && startMinutes < parseTime(other.end) && endMinutes > parseTime(other.start),
    );

    return overlaps ? 'These hours overlap another set on the same day.' : null;
}

/** Turns a persisted value of unknown shape into ranges we can rely on. */
export function sanitizeRanges(raw: unknown): HoursRange[] {
    if (!Array.isArray(raw)) return [];

    const usable = raw.filter((entry): entry is HoursRange => {
        if (entry === null || typeof entry !== 'object') return false;

        const { start, end } = entry as Partial<HoursRange>;
        if (typeof start !== 'string' || typeof end !== 'string') return false;
        if (!isValidTime(start) || !isValidTime(end)) return false;

        return parseTime(end) > parseTime(start);
    });

    return sortRanges(usable).map((entry) => ({
        start: entry.start,
        end: entry.end,
        label: typeof entry.label === 'string' && entry.label.length > 0 ? entry.label : null,
        byAppointmentOnly: entry.byAppointmentOnly === true,
    }));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd OpenOrClosed/Client && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add OpenOrClosed/Client/src/timeline
git commit -m "Add gap finding, range creation, validation and sanitising"
```

---

### Task 5: The `HoursRange` model and its `"HH:mm"` JSON converter

**Files:**
- Create: `OpenOrClosed/Serialization/HoursTimeSpanJsonConverter.cs`
- Create: `OpenOrClosed/Models/HoursRange.cs`
- Test: `tests/OpenOrClosed.Tests/Models/HoursRangeTests.cs`

**Interfaces:**
- Consumes: nothing.
- Produces: `OpenOrClosed.Core.Models.HoursRange` with `TimeSpan Start`, `TimeSpan End`, `TimeSpan Duration`, `string? Label`, `bool ByAppointmentOnly`; and `OpenOrClosed.Core.Serialization.HoursTimeSpanJsonConverter`.

- [ ] **Step 1: Write the failing test**

Create `tests/OpenOrClosed.Tests/Models/HoursRangeTests.cs`:

```csharp
using System.Text.Json;
using OpenOrClosed.Core.Models;
using OpenOrClosed.Core.Serialization;

namespace OpenOrClosed.Tests.Models;

public class HoursRangeTests
{
    [Fact]
    public void Deserializes_FromTheStoredShape()
    {
        const string json = """{"start":"09:00","end":"17:00","label":"Kitchen closes 4:30","byAppointmentOnly":true}""";

        var range = StoredValueJson.Deserialize<HoursRange>(json)!;

        range.Start.Should().Be(new TimeSpan(9, 0, 0));
        range.End.Should().Be(new TimeSpan(17, 0, 0));
        range.Duration.Should().Be(TimeSpan.FromHours(8));
        range.Label.Should().Be("Kitchen closes 4:30");
        range.ByAppointmentOnly.Should().BeTrue();
    }

    [Fact]
    public void Deserializes_AnEndOfMidnight()
    {
        // TimeOnly cannot hold this, which is why the model uses TimeSpan.
        var range = StoredValueJson.Deserialize<HoursRange>("""{"start":"18:00","end":"24:00"}""")!;

        range.End.Should().Be(TimeSpan.FromHours(24));
        range.Duration.Should().Be(TimeSpan.FromHours(6));
    }

    [Fact]
    public void Serializes_BackToHoursAndMinutes()
    {
        var range = new HoursRange { Start = new TimeSpan(9, 0, 0), End = TimeSpan.FromHours(24) };

        var json = JsonSerializer.Serialize(range);

        json.Should().Contain("\"start\":\"09:00\"").And.Contain("\"end\":\"24:00\"");
    }

    [Fact]
    public void Serializes_WithoutLeakingDuration()
    {
        // Duration is a convenience for Razor, not part of the API payload.
        JsonSerializer.Serialize(new HoursRange()).Should().NotContain("duration");
    }

    [Theory]
    [InlineData("\"9:00\"")]
    [InlineData("\"25:00\"")]
    [InlineData("\"nope\"")]
    public void Deserialize_RejectsAMalformedTime(string stored)
    {
        var act = () => JsonSerializer.Deserialize<HoursRange>($$"""{"start":{{stored}},"end":"17:00"}""");

        act.Should().Throw<JsonException>();
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `dotnet test tests/OpenOrClosed.Tests --filter HoursRangeTests`
Expected: FAIL — `OpenOrClosed.Core.Models` does not exist.

- [ ] **Step 3: Write the converter**

Create `OpenOrClosed/Serialization/HoursTimeSpanJsonConverter.cs`:

```csharp
using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace OpenOrClosed.Core.Serialization;

/// <summary>
/// Reads and writes a time of day as "HH:mm", where "24:00" means the end of the day.
/// </summary>
/// <remarks>
/// TimeSpan is used rather than TimeOnly precisely because TimeOnly cannot represent 24:00, and
/// .NET's own TimeSpan format would render it as "1.00:00:00" - neither is much use in an API.
/// </remarks>
public sealed class HoursTimeSpanJsonConverter : JsonConverter<TimeSpan>
{
    public override TimeSpan Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        var value = reader.GetString();

        if (value?.Length == 5 &&
            value[2] == ':' &&
            int.TryParse(value[..2], NumberStyles.None, CultureInfo.InvariantCulture, out var hours) &&
            int.TryParse(value[3..], NumberStyles.None, CultureInfo.InvariantCulture, out var minutes) &&
            hours <= 24 && minutes <= 59 &&
            (hours < 24 || minutes == 0))
        {
            return new TimeSpan(hours, minutes, 0);
        }

        throw new JsonException($"'{value}' is not a time of day in HH:mm format.");
    }

    public override void Write(Utf8JsonWriter writer, TimeSpan value, JsonSerializerOptions options)
        => writer.WriteStringValue(
            $"{(int)value.TotalHours:D2}:{value.Minutes:D2}");
}
```

- [ ] **Step 4: Write the model**

Create `OpenOrClosed/Models/HoursRange.cs`:

```csharp
using System.Text.Json.Serialization;
using OpenOrClosed.Core.Serialization;

namespace OpenOrClosed.Core.Models;

/// <summary>One set of opening hours within a single day.</summary>
public sealed class HoursRange
{
    [JsonPropertyName("start")]
    [JsonConverter(typeof(HoursTimeSpanJsonConverter))]
    public TimeSpan Start { get; init; }

    /// <summary>May be 24:00, meaning the end of the day.</summary>
    [JsonPropertyName("end")]
    [JsonConverter(typeof(HoursTimeSpanJsonConverter))]
    public TimeSpan End { get; init; }

    [JsonIgnore]
    public TimeSpan Duration => End - Start;

    [JsonPropertyName("label")]
    public string? Label { get; init; }

    [JsonPropertyName("byAppointmentOnly")]
    public bool ByAppointmentOnly { get; init; }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `dotnet test tests/OpenOrClosed.Tests --filter HoursRangeTests`
Expected: PASS, 7 tests.

- [ ] **Step 6: Commit**

```bash
git add OpenOrClosed/Models OpenOrClosed/Serialization tests/OpenOrClosed.Tests/Models
git commit -m "Add the HoursRange model and its HH:mm JSON converter"
```

---

### Task 6: The weekly hours property editor and value converter

**Files:**
- Create: `OpenOrClosed/Models/WeeklyHoursDay.cs`
- Create: `OpenOrClosed/PropertyEditors/WeeklyHoursPropertyEditor.cs`
- Create: `OpenOrClosed/PropertyValueConverters/WeeklyHoursConverter.cs`
- Test: `tests/OpenOrClosed.Tests/DeliveryApi/WeeklyHoursDeliveryApiTests.cs`

**Interfaces:**
- Consumes: `HoursRange` and `StoredValueJson` from Tasks 1 and 5; `PropertyTypeStub.For(string, Dictionary<string, object>?)` from the existing test project.
- Produces: `OpenOrClosed.Core.Models.WeeklyHoursDay` (`DayOfWeek Day`, `string DayName`, `IReadOnlyList<HoursRange> Ranges`, `bool IsOpen`); `WeeklyHoursPropertyEditor.EditorAlias` = `"OpenOrClosed.WeeklyHours"` and `.UiEditorAlias` = `"OpenOrClosed.PropertyEditorUi.WeeklyHours"`; `WeeklyHoursConverter.ExpandWeek(IEnumerable<WeeklyHoursDayDto>?)`.

- [ ] **Step 1: Write the failing test**

Create `tests/OpenOrClosed.Tests/DeliveryApi/WeeklyHoursDeliveryApiTests.cs`:

```csharp
using System.Text.Json;
using OpenOrClosed.Core.Models;
using OpenOrClosed.Core.PropertyEditors;
using OpenOrClosed.Core.PropertyValueConverters;
using OpenOrClosed.Tests.TestDoubles;
using Umbraco.Cms.Core.Models.PublishedContent;
using Umbraco.Cms.Core.PropertyEditors;

namespace OpenOrClosed.Tests.DeliveryApi;

public class WeeklyHoursDeliveryApiTests
{
    private const string StoredValue = """
        [
          { "day": 1, "ranges": [
              { "start": "09:00", "end": "12:30", "label": null, "byAppointmentOnly": false },
              { "start": "13:30", "end": "17:00", "label": "Kitchen closes 4:30", "byAppointmentOnly": false } ] },
          { "day": 6, "ranges": [
              { "start": "18:00", "end": "24:00", "label": null, "byAppointmentOnly": true } ] }
        ]
        """;

    private static readonly WeeklyHoursConverter Converter = new();

    private static IPublishedPropertyType PropertyType =>
        PropertyTypeStub.For(WeeklyHoursPropertyEditor.EditorAlias);

    private static object? Intermediate(string? source) =>
        Converter.ConvertSourceToIntermediate(null!, PropertyType, source, false);

    private static List<WeeklyHoursDay> DeliveryApiValue(string? source) =>
        ((IEnumerable<WeeklyHoursDay>)Converter.ConvertIntermediateToDeliveryApiObject(
            null!, PropertyType, PropertyCacheLevel.Element, Intermediate(source), false, false)!).ToList();

    [Fact]
    public void IsConverter_MatchesOnlyItsOwnEditorAlias()
    {
        Converter.IsConverter(PropertyTypeStub.For(WeeklyHoursPropertyEditor.EditorAlias)).Should().BeTrue();
        Converter.IsConverter(PropertyTypeStub.For(StandardHoursPropertyEditor.EditorAlias)).Should().BeFalse();
    }

    [Fact]
    public void GetDeliveryApiPropertyValueType_MatchesTheRazorValueType()
    {
        Converter.GetDeliveryApiPropertyValueType(PropertyType)
            .Should().Be(typeof(IEnumerable<WeeklyHoursDay>))
            .And.Be(Converter.GetPropertyValueType(PropertyType));
    }

    [Fact]
    public void GetDeliveryApiPropertyCacheLevel_IsElement()
    {
        // Nothing in this conversion depends on today, unlike the older editors.
        Converter.GetDeliveryApiPropertyCacheLevel(PropertyType).Should().Be(PropertyCacheLevel.Element);
        Converter.GetPropertyCacheLevel(PropertyType).Should().Be(PropertyCacheLevel.Element);
    }

    [Fact]
    public void Convert_AlwaysReturnsSevenDaysMondayFirst()
    {
        var days = DeliveryApiValue(StoredValue);

        days.Select(d => d.Day).Should().Equal(
            DayOfWeek.Monday, DayOfWeek.Tuesday, DayOfWeek.Wednesday, DayOfWeek.Thursday,
            DayOfWeek.Friday, DayOfWeek.Saturday, DayOfWeek.Sunday);
    }

    [Fact]
    public void Convert_MarksDaysWithoutRangesClosed()
    {
        var days = DeliveryApiValue(StoredValue);

        days.Single(d => d.Day == DayOfWeek.Monday).IsOpen.Should().BeTrue();
        days.Single(d => d.Day == DayOfWeek.Tuesday).IsOpen.Should().BeFalse();
        days.Single(d => d.Day == DayOfWeek.Tuesday).Ranges.Should().BeEmpty();
    }

    [Fact]
    public void Convert_KeepsTheDetailOfEachRangeAndSortsThem()
    {
        var monday = DeliveryApiValue(StoredValue).Single(d => d.Day == DayOfWeek.Monday);

        monday.Ranges.Select(r => r.Start).Should().Equal(new TimeSpan(9, 0, 0), new TimeSpan(13, 30, 0));
        monday.Ranges[1].Label.Should().Be("Kitchen closes 4:30");
    }

    [Fact]
    public void Convert_HandlesAnEndOfMidnight()
    {
        var saturday = DeliveryApiValue(StoredValue).Single(d => d.Day == DayOfWeek.Saturday);

        saturday.Ranges.Should().ContainSingle();
        saturday.Ranges[0].End.Should().Be(TimeSpan.FromHours(24));
        saturday.Ranges[0].ByAppointmentOnly.Should().BeTrue();
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Convert_StillReturnsSevenClosedDaysForNoValue(string? source)
    {
        var days = DeliveryApiValue(source);

        days.Should().HaveCount(7);
        days.Should().OnlyContain(d => d.IsOpen == false);
    }

    [Fact]
    public void Convert_DoesNotMutateTheIntermediate()
    {
        var intermediate = Intermediate(StoredValue);

        var first = ((IEnumerable<WeeklyHoursDay>)Converter.ConvertIntermediateToObject(
            null!, PropertyType, PropertyCacheLevel.Element, intermediate, false)!).ToList();
        var second = ((IEnumerable<WeeklyHoursDay>)Converter.ConvertIntermediateToObject(
            null!, PropertyType, PropertyCacheLevel.Element, intermediate, false)!).ToList();

        first.Single(d => d.Day == DayOfWeek.Monday).Ranges.Should()
            .HaveCount(second.Single(d => d.Day == DayOfWeek.Monday).Ranges.Count);
    }

    [Fact]
    public void Convert_SerializesToCamelCaseJson()
    {
        var monday = DeliveryApiValue(StoredValue).Single(d => d.Day == DayOfWeek.Monday);
        var json = JsonSerializer.Serialize(monday,
            new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase });

        using var document = JsonDocument.Parse(json);
        var root = document.RootElement;

        root.GetProperty("day").GetInt32().Should().Be((int)DayOfWeek.Monday);
        root.GetProperty("isOpen").GetBoolean().Should().BeTrue();
        root.GetProperty("ranges")[0].GetProperty("start").GetString().Should().Be("09:00");
        root.GetProperty("ranges")[0].GetProperty("end").GetString().Should().Be("12:30");
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `dotnet test tests/OpenOrClosed.Tests --filter WeeklyHoursDeliveryApiTests`
Expected: FAIL — `WeeklyHoursConverter` does not exist.

- [ ] **Step 3: Write the model**

Create `OpenOrClosed/Models/WeeklyHoursDay.cs`:

```csharp
using System.Globalization;
using System.Text.Json.Serialization;

namespace OpenOrClosed.Core.Models;

/// <summary>One day of the recurring weekly schedule.</summary>
public sealed class WeeklyHoursDay
{
    [JsonPropertyName("day")]
    public DayOfWeek Day { get; init; }

    /// <summary>The day's name in the current culture.</summary>
    [JsonPropertyName("dayName")]
    public string DayName { get; init; } = string.Empty;

    [JsonPropertyName("ranges")]
    public IReadOnlyList<HoursRange> Ranges { get; init; } = [];

    [JsonPropertyName("isOpen")]
    public bool IsOpen => Ranges.Count > 0;

    internal static string NameOf(DayOfWeek day)
        => CultureInfo.CurrentCulture.DateTimeFormat.GetDayName(day);
}

/// <summary>The stored shape, which holds only the days that have hours.</summary>
internal sealed class WeeklyHoursDayDto
{
    [JsonPropertyName("day")]
    public int Day { get; init; }

    [JsonPropertyName("ranges")]
    public List<HoursRange> Ranges { get; init; } = [];
}
```

- [ ] **Step 4: Write the property editor**

Create `OpenOrClosed/PropertyEditors/WeeklyHoursPropertyEditor.cs`:

```csharp
using Umbraco.Cms.Core.PropertyEditors;

namespace OpenOrClosed.Core.PropertyEditors;

[DataEditor(
    EditorAlias,
    ValueType = ValueTypes.Json,
    ValueEditorIsReusable = true)]
public class WeeklyHoursPropertyEditor(IDataValueEditorFactory dataValueEditorFactory)
    : DataEditor(dataValueEditorFactory)
{
    internal const string EditorAlias = "OpenOrClosed.WeeklyHours";
    internal const string UiEditorAlias = "OpenOrClosed.PropertyEditorUi.WeeklyHours";
}
```

- [ ] **Step 5: Write the value converter**

Create `OpenOrClosed/PropertyValueConverters/WeeklyHoursConverter.cs`:

```csharp
using OpenOrClosed.Core.Models;
using OpenOrClosed.Core.PropertyEditors;
using OpenOrClosed.Core.Serialization;
using Umbraco.Cms.Core.Models.PublishedContent;
using Umbraco.Cms.Core.PropertyEditors;
using Umbraco.Cms.Core.PropertyEditors.DeliveryApi;

namespace OpenOrClosed.Core.PropertyValueConverters;

public class WeeklyHoursConverter : PropertyValueConverterBase, IDeliveryApiPropertyValueConverter
{
    /// <summary>Monday first, matching how the editor presents the week.</summary>
    private static readonly DayOfWeek[] Week =
    [
        DayOfWeek.Monday, DayOfWeek.Tuesday, DayOfWeek.Wednesday, DayOfWeek.Thursday,
        DayOfWeek.Friday, DayOfWeek.Saturday, DayOfWeek.Sunday,
    ];

    public override bool IsConverter(IPublishedPropertyType propertyType)
        => WeeklyHoursPropertyEditor.EditorAlias == propertyType.EditorAlias;

    public override Type GetPropertyValueType(IPublishedPropertyType propertyType)
        => typeof(IEnumerable<WeeklyHoursDay>);

    // Nothing here depends on today, so the converted value is safe to cache.
    public override PropertyCacheLevel GetPropertyCacheLevel(IPublishedPropertyType propertyType)
        => PropertyCacheLevel.Element;

    public override object? ConvertSourceToIntermediate(
        IPublishedElement owner, IPublishedPropertyType propertyType, object? source, bool preview)
    {
        var sourceString = source?.ToString();

        return string.IsNullOrWhiteSpace(sourceString)
            ? null
            : StoredValueJson.Deserialize<List<WeeklyHoursDayDto>>(sourceString);
    }

    public override object? ConvertIntermediateToObject(
        IPublishedElement owner, IPublishedPropertyType propertyType,
        PropertyCacheLevel referenceCacheLevel, object? inter, bool preview)
        => ExpandWeek(inter as IEnumerable<WeeklyHoursDayDto>);

    public PropertyCacheLevel GetDeliveryApiPropertyCacheLevel(IPublishedPropertyType propertyType)
        => GetPropertyCacheLevel(propertyType);

    public Type GetDeliveryApiPropertyValueType(IPublishedPropertyType propertyType)
        => GetPropertyValueType(propertyType);

    public object? ConvertIntermediateToDeliveryApiObject(
        IPublishedElement owner, IPublishedPropertyType propertyType,
        PropertyCacheLevel referenceCacheLevel, object? inter, bool preview, bool expanding)
        => ExpandWeek(inter as IEnumerable<WeeklyHoursDayDto>);

    /// <summary>
    /// Produces all seven days, Monday first, whether or not the stored value holds an entry for
    /// each, so that a view can loop over a full week and <c>IsOpen</c> means something.
    /// </summary>
    /// <remarks>Always returns fresh instances - the intermediate is shared and cached.</remarks>
    internal static IEnumerable<WeeklyHoursDay> ExpandWeek(IEnumerable<WeeklyHoursDayDto>? stored)
    {
        var byDay = stored?.ToLookup(day => (DayOfWeek)day.Day);

        return
        [
            .. Week.Select(day => new WeeklyHoursDay
            {
                Day = day,
                DayName = WeeklyHoursDay.NameOf(day),
                Ranges =
                [
                    .. (byDay?[day].SelectMany(entry => entry.Ranges) ?? [])
                        .OrderBy(range => range.Start)
                ],
            }),
        ];
    }
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `dotnet test tests/OpenOrClosed.Tests --filter WeeklyHoursDeliveryApiTests`
Expected: PASS, 11 tests.

- [ ] **Step 7: Run the whole suite**

Run: `dotnet test tests/OpenOrClosed.Tests`
Expected: PASS — the existing tests must be untouched by this.

- [ ] **Step 8: Commit**

```bash
git add OpenOrClosed/Models OpenOrClosed/PropertyEditors OpenOrClosed/PropertyValueConverters tests/OpenOrClosed.Tests/DeliveryApi
git commit -m "Add the weekly hours property editor and value converter"
```

---

### Task 7: `<ooc-timeline>` — rendering

There are no automated tests for the Lit elements; the spec scopes component and browser testing out. Verification for Tasks 7 to 10 is `npm run build` (which runs `tsc` in strict mode) plus the explicit manual checks in each task.

**Files:**
- Create: `OpenOrClosed/Client/src/timeline/ooc-timeline.element.ts`

**Interfaces:**
- Consumes: everything exported from `time-range.ts`.
- Produces: the custom element `ooc-timeline` with properties `ranges: HoursRange[]`, `snapMinutes: number`, `use24Hour: boolean`, `showAppointmentOnly: boolean`, `trackLabel: string`; and events `change` (`detail: { ranges: HoursRange[] }`) and `edit-range` (`detail: { index: number }`).

- [ ] **Step 1: Write the element**

Create `OpenOrClosed/Client/src/timeline/ooc-timeline.element.ts`:

```ts
import { css, customElement, html, LitElement, property } from '@umbraco-cms/backoffice/external/lit';
import {
    DAY_MINUTES,
    DEFAULT_SNAP_MINUTES,
    formatRange,
    parseTime,
    type HoursRange,
} from './time-range.js';

/**
 * One 00:00-24:00 track carrying any number of non-overlapping ranges.
 *
 * Knows nothing about days, holidays or Umbraco, so the weekly editor, the holidays default track
 * and the per-holiday track can all use it unchanged.
 */
@customElement('ooc-timeline')
export class OocTimelineElement extends LitElement {
    @property({ type: Array })
    ranges: HoursRange[] = [];

    @property({ type: Number })
    snapMinutes = DEFAULT_SNAP_MINUTES;

    @property({ type: Boolean })
    use24Hour = true;

    @property({ type: Boolean })
    showAppointmentOnly = false;

    /** Prefixed onto every block's accessible name, e.g. "Monday". */
    @property({ type: String })
    trackLabel = '';

    protected _percent(minutes: number): number {
        return (minutes / DAY_MINUTES) * 100;
    }

    protected _accessibleName(range: HoursRange): string {
        const parts = [this.trackLabel, formatRange(range, this.use24Hour)];
        if (range.label) parts.push(range.label);
        if (range.byAppointmentOnly) parts.push('by appointment only');
        return parts.filter(Boolean).join(', ');
    }

    static styles = css`
        :host {
            display: block;
        }

        .track {
            position: relative;
            height: 40px;
            border: 1px solid var(--uui-color-border);
            border-radius: var(--uui-border-radius);
            background: var(--uui-color-surface);
        }

        .divider {
            position: absolute;
            top: 0;
            bottom: 0;
            width: 1px;
            background: var(--uui-color-border);
        }

        .block {
            position: absolute;
            top: 3px;
            bottom: 3px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 4px;
            padding: 0 4px;
            border: 1px solid var(--uui-color-selected);
            border-radius: var(--uui-border-radius);
            background: var(--uui-color-selected-emphasis, #eceffb);
            color: var(--uui-color-selected);
            font-size: var(--uui-type-small-size);
            white-space: nowrap;
            overflow: hidden;
            cursor: pointer;
        }

        .block:focus-visible {
            outline: 2px solid var(--uui-color-focus);
            outline-offset: 1px;
        }

        .block .times {
            overflow: hidden;
            text-overflow: ellipsis;
        }
    `;

    protected _renderBlock(range: HoursRange, index: number) {
        const start = parseTime(range.start);
        const end = parseTime(range.end);

        return html`
            <button
                type="button"
                class="block"
                part="block"
                data-index=${index}
                style="left:${this._percent(start)}%;width:${this._percent(end - start)}%"
                title=${this._accessibleName(range)}
                aria-label=${this._accessibleName(range)}>
                ${range.label ? html`<uui-icon name="icon-notepad"></uui-icon>` : ''}
                ${this.showAppointmentOnly && range.byAppointmentOnly
                    ? html`<uui-icon name="icon-user"></uui-icon>`
                    : ''}
                <span class="times">${formatRange(range, this.use24Hour)}</span>
            </button>
        `;
    }

    render() {
        return html`
            <div class="track" part="track">
                ${[6, 12, 18].map(
                    (hour) => html`<i class="divider" style="left:${this._percent(hour * 60)}%"></i>`,
                )}
                ${this.ranges.map((range, index) => this._renderBlock(range, index))}
            </div>
        `;
    }
}

export default OocTimelineElement;

declare global {
    interface HTMLElementTagNameMap {
        'ooc-timeline': OocTimelineElement;
    }
}
```

The label and time text overflow-hide, so a narrow block naturally falls back to its indicators; `title` and `aria-label` carry the full detail, which satisfies the tooltip requirement without extra machinery.

- [ ] **Step 2: Verify it compiles**

Run: `cd OpenOrClosed/Client && npm run build`
Expected: succeeds with no `tsc` errors.

- [ ] **Step 3: Commit**

```bash
git add OpenOrClosed/Client/src/timeline/ooc-timeline.element.ts
git commit -m "Add the ooc-timeline element rendering"
```

---

### Task 8: `<ooc-timeline>` — pointer and keyboard interaction

**Files:**
- Modify: `OpenOrClosed/Client/src/timeline/ooc-timeline.element.ts`

**Interfaces:**
- Consumes: `createRange`, `moveRange`, `resizeRange`, `largestGap`, `snap`, `parseTime`, `formatTime` from `time-range.ts`.
- Produces: the `change` and `edit-range` events described in Task 7, now actually dispatched.

- [ ] **Step 1: Add the drag grips to the block template**

Inside the `<button class="block">` in `_renderBlock`, before the icons, add:

```ts
                <i class="grip start" @pointerdown=${(e: PointerEvent) => this._startDrag(e, index, 'start')}></i>
                <i class="grip end" @pointerdown=${(e: PointerEvent) => this._startDrag(e, index, 'end')}></i>
```

and add to the button's attributes:

```ts
                @pointerdown=${(e: PointerEvent) => this._startDrag(e, index, 'move')}
                @click=${() => this._emitEdit(index)}
                @keydown=${(e: KeyboardEvent) => this._onBlockKeydown(e, index)}
```

Add to `static styles`:

```css
        .grip {
            position: absolute;
            top: 0;
            bottom: 0;
            width: 7px;
            cursor: ew-resize;
        }

        .grip.start { left: 0; }
        .grip.end { right: 0; }

        .sr-only {
            position: absolute;
            width: 1px;
            height: 1px;
            overflow: hidden;
            clip: rect(0 0 0 0);
            white-space: nowrap;
        }
```

- [ ] **Step 2: Make the empty track interactive**

Change the `.track` div in `render()` to:

```ts
            <div
                class="track"
                part="track"
                tabindex="0"
                role="group"
                aria-label=${this.trackLabel}
                @pointerdown=${this._onTrackPointerDown}
                @keydown=${this._onTrackKeydown}>
```

and add a live region after the track, inside `render()`'s template:

```ts
            <span class="sr-only" aria-live="polite">${this._announcement}</span>
```

- [ ] **Step 3: Add the interaction logic**

Add these imports and members to the class:

```ts
import { state } from '@umbraco-cms/backoffice/external/lit';
import { createRange, largestGap, moveRange, resizeRange } from './time-range.js';

    /** Minutes added to a new range when one is created by clicking. */
    @property({ type: Number })
    defaultDurationMinutes = 8 * 60;

    @state()
    private _announcement = '';

    #drag: { index: number; mode: 'start' | 'end' | 'move'; grabOffset: number } | null = null;

    /** A drag ends with a click. Without this, letting go would also open the dialog. */
    #dragged = false;

    /** Turns a pointer position into minutes since midnight. */
    #minutesFromEvent(event: PointerEvent): number {
        const track = this.renderRoot.querySelector('.track') as HTMLElement;
        const bounds = track.getBoundingClientRect();
        const ratio = (event.clientX - bounds.left) / bounds.width;
        return Math.min(DAY_MINUTES, Math.max(0, Math.round(ratio * DAY_MINUTES)));
    }

    private _startDrag(event: PointerEvent, index: number, mode: 'start' | 'end' | 'move') {
        event.preventDefault();
        event.stopPropagation();

        const minutes = this.#minutesFromEvent(event);
        this.#dragged = false;
        this.#drag = {
            index,
            mode,
            grabOffset: mode === 'move' ? minutes - parseTime(this.ranges[index].start) : 0,
        };

        (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
        this.addEventListener('pointermove', this._onDragMove);
        this.addEventListener('pointerup', this._endDrag);
        this.addEventListener('pointercancel', this._endDrag);
    }

    private _onDragMove = (event: PointerEvent) => {
        if (!this.#drag) return;

        const { index, mode, grabOffset } = this.#drag;
        const minutes = this.#minutesFromEvent(event);
        this.#dragged = true;

        // Every one of these clamps against the neighbours, so an overlap cannot be dragged into being.
        const updated =
            mode === 'move'
                ? moveRange(this.ranges, index, minutes - grabOffset, this.snapMinutes)
                : resizeRange(this.ranges, index, mode, minutes, this.snapMinutes);

        this._commit(updated, index);
    };

    private _endDrag = () => {
        this.#drag = null;
        this.removeEventListener('pointermove', this._onDragMove);
        this.removeEventListener('pointerup', this._endDrag);
        this.removeEventListener('pointercancel', this._endDrag);
    };

    private _onTrackPointerDown = (event: PointerEvent) => {
        if (event.target !== event.currentTarget) return;

        const created = createRange(
            this.ranges,
            this.#minutesFromEvent(event),
            this.defaultDurationMinutes,
            this.snapMinutes,
        );

        if (created) this._commit(created);
    };

    private _onTrackKeydown = (event: KeyboardEvent) => {
        if (event.target !== event.currentTarget || event.key !== 'Enter') return;

        const gap = largestGap(this.ranges);
        if (!gap) return;

        event.preventDefault();
        const created = createRange(this.ranges, gap.start, this.defaultDurationMinutes, this.snapMinutes);
        if (created) this._commit(created);
    };

    private _onBlockKeydown(event: KeyboardEvent, index: number) {
        const step = this.snapMinutes;
        const range = this.ranges[index];

        switch (event.key) {
            case 'Enter':
            case ' ':
                event.preventDefault();
                this._emitEdit(index);
                return;

            case 'Delete':
            case 'Backspace':
                event.preventDefault();
                this._commit(this.ranges.filter((_, i) => i !== index));
                return;

            case 'ArrowLeft':
            case 'ArrowRight': {
                event.preventDefault();
                const direction = event.key === 'ArrowLeft' ? -step : step;

                const updated = event.shiftKey
                    ? resizeRange(this.ranges, index, 'end', parseTime(range.end) + direction, this.snapMinutes)
                    : moveRange(this.ranges, index, parseTime(range.start) + direction, this.snapMinutes);

                this._commit(updated, index);
                return;
            }

            default:
                return;
        }
    }

    private _emitEdit(index: number) {
        if (this.#dragged) {
            this.#dragged = false;
            return;
        }

        this.dispatchEvent(new CustomEvent('edit-range', { detail: { index }, bubbles: true, composed: true }));
    }

    /** Publishes a new set of ranges and announces the change for screen readers. */
    private _commit(ranges: HoursRange[], announceIndex?: number) {
        this.ranges = ranges;

        if (announceIndex !== undefined && ranges[announceIndex]) {
            this._announcement = formatRange(ranges[announceIndex], this.use24Hour);
        }

        this.dispatchEvent(new CustomEvent('change', { detail: { ranges }, bubbles: true, composed: true }));
    }
```

Note `snap` and `formatTime` are imported for the module's own use inside `time-range.ts`; if `tsc` reports them as unused here, drop them from this file's import list — `noUnusedLocals` is on.

- [ ] **Step 4: Verify it compiles**

Run: `cd OpenOrClosed/Client && npm run build`
Expected: succeeds. Remove any unused imports `tsc` complains about.

- [ ] **Step 5: Commit**

```bash
git add OpenOrClosed/Client/src/timeline/ooc-timeline.element.ts
git commit -m "Add pointer and keyboard interaction to ooc-timeline"
```

---

### Task 9: `<ooc-range-dialog>`

**Files:**
- Create: `OpenOrClosed/Client/src/timeline/ooc-range-dialog.element.ts`

**Interfaces:**
- Consumes: `HoursRange`, `parseTime`, `formatTime`, `validateRange`, `DAY_MINUTES` from `time-range.ts`.
- Produces: the custom element `ooc-range-dialog` with properties `ranges: HoursRange[]`, `index: number`, `use24Hour: boolean`, `showAppointmentOnly: boolean`; and events `save` (`detail: { ranges: HoursRange[] }`) and `remove` (`detail: { index: number }`) and `cancel`.

- [ ] **Step 1: Write the element**

Create `OpenOrClosed/Client/src/timeline/ooc-range-dialog.element.ts`:

```ts
import { css, customElement, html, LitElement, property, state } from '@umbraco-cms/backoffice/external/lit';
import { DAY_MINUTES, formatTime, parseTime, validateRange, type HoursRange } from './time-range.js';

/** Edits one range precisely. This is the keyboard route into exact times. */
@customElement('ooc-range-dialog')
export class OocRangeDialogElement extends LitElement {
    @property({ type: Array })
    ranges: HoursRange[] = [];

    @property({ type: Number })
    index = -1;

    @property({ type: Boolean })
    use24Hour = true;

    @property({ type: Boolean })
    showAppointmentOnly = false;

    @state() private _start = '09:00';
    @state() private _end = '17:00';
    @state() private _label = '';
    @state() private _byAppointmentOnly = false;
    @state() private _error: string | null = null;

    willUpdate(changed: Map<string, unknown>) {
        if (!changed.has('ranges') && !changed.has('index')) return;

        const range = this.ranges[this.index];
        if (!range) return;

        this._start = range.start;
        this._end = range.end;
        this._label = range.label ?? '';
        this._byAppointmentOnly = range.byAppointmentOnly;
        this._error = null;
    }

    /** All day is only offered when this is the day's only range - it would conflict with any other. */
    private get _canBeAllDay(): boolean {
        return this.ranges.length <= 1;
    }

    private get _isAllDay(): boolean {
        return this._start === '00:00' && this._end === '24:00';
    }

    private _toggleAllDay() {
        if (this._isAllDay) {
            this._start = '09:00';
            this._end = '17:00';
        } else {
            this._start = '00:00';
            this._end = '24:00';
        }
    }

    private _save() {
        const start = parseTime(this._start);
        const end = parseTime(this._end);

        this._error = validateRange(this.ranges, this.index, start, end);
        if (this._error) return;

        const updated = [...this.ranges];
        updated[this.index] = {
            start: formatTime(start),
            end: formatTime(end),
            label: this._label.trim() || null,
            byAppointmentOnly: this._byAppointmentOnly,
        };

        this.dispatchEvent(new CustomEvent('save', { detail: { ranges: updated }, bubbles: true, composed: true }));
    }

    static styles = css`
        :host { display: block; }
        .field { margin-bottom: var(--uui-size-space-3); }
        .label { font-size: var(--uui-type-small-size); margin-bottom: var(--uui-size-space-1); }
        .error { color: var(--uui-color-danger); font-size: var(--uui-type-small-size); }
        .actions { display: flex; justify-content: space-between; align-items: center; gap: var(--uui-size-space-3); }
    `;

    render() {
        return html`
            <div class="field">
                <div class="label">Starts at</div>
                <uui-input
                    type="time"
                    .value=${this._start}
                    label="Starts at"
                    @change=${(e: Event) => (this._start = (e.target as HTMLInputElement).value)}>
                </uui-input>
            </div>

            <div class="field">
                <div class="label">Ends at</div>
                <uui-input
                    type="time"
                    .value=${this._end === formatTime(DAY_MINUTES) ? '23:59' : this._end}
                    label="Ends at"
                    @change=${(e: Event) => (this._end = (e.target as HTMLInputElement).value)}>
                </uui-input>
            </div>

            ${this._canBeAllDay
                ? html`<div class="field">
                      <uui-toggle
                          .checked=${this._isAllDay}
                          label="All day"
                          @change=${this._toggleAllDay}>
                          All day
                      </uui-toggle>
                  </div>`
                : ''}

            <div class="field">
                <div class="label">Label <span>(optional)</span></div>
                <uui-input
                    .value=${this._label}
                    label="Label"
                    @input=${(e: Event) => (this._label = (e.target as HTMLInputElement).value)}>
                </uui-input>
            </div>

            ${this.showAppointmentOnly
                ? html`<div class="field">
                      <uui-toggle
                          .checked=${this._byAppointmentOnly}
                          label="By appointment only"
                          @change=${() => (this._byAppointmentOnly = !this._byAppointmentOnly)}>
                          By appointment only
                      </uui-toggle>
                  </div>`
                : ''}

            ${this._error ? html`<div class="error">${this._error}</div>` : ''}

            <div class="actions">
                <uui-button
                    look="secondary"
                    color="danger"
                    label="Remove"
                    @click=${() =>
                        this.dispatchEvent(
                            new CustomEvent('remove', {
                                detail: { index: this.index },
                                bubbles: true,
                                composed: true,
                            }),
                        )}>
                    Remove
                </uui-button>
                <span>
                    <uui-button
                        look="secondary"
                        label="Cancel"
                        @click=${() =>
                            this.dispatchEvent(new CustomEvent('cancel', { bubbles: true, composed: true }))}>
                        Cancel
                    </uui-button>
                    <uui-button look="primary" color="positive" label="Save" @click=${this._save}>
                        Save
                    </uui-button>
                </span>
            </div>
        `;
    }
}

export default OocRangeDialogElement;

declare global {
    interface HTMLElementTagNameMap {
        'ooc-range-dialog': OocRangeDialogElement;
    }
}
```

The end field shows `23:59` in place of `24:00`, because a native time input cannot hold `24:00`; the All day toggle is how an exact midnight end is set.

- [ ] **Step 2: Verify it compiles**

Run: `cd OpenOrClosed/Client && npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add OpenOrClosed/Client/src/timeline/ooc-range-dialog.element.ts
git commit -m "Add the range editing dialog"
```

---

### Task 10: The weekly hours property editor UI

**Files:**
- Create: `OpenOrClosed/Client/src/weekly-hours/ooc-weekly-hours.element.ts`
- Create: `OpenOrClosed/Client/src/weekly-hours/manifest.ts`
- Modify: `OpenOrClosed/Client/src/bundle.manifests.ts`

**Interfaces:**
- Consumes: `ooc-timeline` and `ooc-range-dialog` from Tasks 7–9; `sanitizeRanges`, `parseTime`, `type HoursRange` from `time-range.ts`.
- Produces: the registered property editor UI `OpenOrClosed.PropertyEditorUi.WeeklyHours`, bound to the schema alias `OpenOrClosed.WeeklyHours`.

- [ ] **Step 1: Write the manifest**

Create `OpenOrClosed/Client/src/weekly-hours/manifest.ts`:

```ts
export const manifests: Array<UmbExtensionManifest> = [
    {
        type: 'propertyEditorUi',
        alias: 'OpenOrClosed.PropertyEditorUi.WeeklyHours',
        name: 'Weekly Hours Property Editor UI',
        element: () => import('./ooc-weekly-hours.element.js'),
        meta: {
            label: 'Weekly Hours',
            icon: 'icon-time',
            group: 'richContent',
            propertyEditorSchemaAlias: 'OpenOrClosed.WeeklyHours',
            settings: {
                properties: [
                    {
                        alias: 'time_24hr',
                        label: 'Time Format',
                        description: '12/24 hour clock',
                        propertyEditorUiAlias: 'Umb.PropertyEditorUi.Toggle',
                    },
                    {
                        alias: 'defaultOpen',
                        label: 'Default Open Time',
                        description: 'Start time for a newly added set of hours - defaults to 09:00',
                        propertyEditorUiAlias: 'OpenOrClosed.PropertyEditorUi.TimeInput',
                    },
                    {
                        alias: 'defaultClose',
                        label: 'Default Close Time',
                        description: 'End time for a newly added set of hours - defaults to 17:00',
                        propertyEditorUiAlias: 'OpenOrClosed.PropertyEditorUi.TimeInput',
                    },
                    {
                        alias: 'showAppointmentOnly',
                        label: 'Enable Appointment Only?',
                        description: 'Show the appointment only option for a set of hours',
                        propertyEditorUiAlias: 'Umb.PropertyEditorUi.Toggle',
                    },
                ],
                defaultData: [
                    { alias: 'time_24hr', value: true },
                    { alias: 'defaultOpen', value: '09:00' },
                    { alias: 'defaultClose', value: '17:00' },
                    { alias: 'showAppointmentOnly', value: false },
                ],
            },
        },
    },
];
```

- [ ] **Step 2: Write the element**

Create `OpenOrClosed/Client/src/weekly-hours/ooc-weekly-hours.element.ts`:

```ts
import { css, customElement, html, LitElement, property, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbElementMixin } from '@umbraco-cms/backoffice/element-api';
import type { UmbPropertyEditorUiElement } from '@umbraco-cms/backoffice/property-editor';
import { parseTime, sanitizeRanges, type HoursRange } from '../timeline/time-range.js';
import '../timeline/ooc-timeline.element.js';
import '../timeline/ooc-range-dialog.element.js';

interface WeeklyHoursDay {
    day: number;
    ranges: HoursRange[];
}

/** Monday first. The stored `day` values follow System.DayOfWeek, where Sunday is 0. */
const WEEK = [
    { day: 1, name: 'Monday' },
    { day: 2, name: 'Tuesday' },
    { day: 3, name: 'Wednesday' },
    { day: 4, name: 'Thursday' },
    { day: 5, name: 'Friday' },
    { day: 6, name: 'Saturday' },
    { day: 0, name: 'Sunday' },
];

@customElement('ooc-weekly-hours')
export class OocWeeklyHoursElement extends UmbElementMixin(LitElement) implements UmbPropertyEditorUiElement {
    @property({ type: Array })
    value: WeeklyHoursDay[] = [];

    // Umbraco hands this over as an UmbPropertyEditorConfigCollection, which extends Array.
    @property({ attribute: false })
    config?: Array<{ alias: string; value: unknown }>;

    @state() private _editing: { day: number; index: number } | null = null;

    private _setting<T>(alias: string, fallback: T): T {
        const found = Array.isArray(this.config)
            ? this.config.find((entry) => entry.alias === alias)?.value
            : undefined;

        return (found ?? fallback) as T;
    }

    private get _use24Hour(): boolean {
        return this._setting('time_24hr', true) !== false;
    }

    private get _showAppointmentOnly(): boolean {
        return this._setting('showAppointmentOnly', false) === true;
    }

    private get _defaultDuration(): number {
        const open = this._setting('defaultOpen', '09:00');
        const close = this._setting('defaultClose', '17:00');

        try {
            const duration = parseTime(close) - parseTime(open);
            return duration > 0 ? duration : 8 * 60;
        } catch {
            return 8 * 60;
        }
    }

    private _rangesFor(day: number): HoursRange[] {
        return sanitizeRanges(this.value?.find((entry) => entry.day === day)?.ranges);
    }

    private _setRanges(day: number, ranges: HoursRange[]) {
        const others = (this.value ?? []).filter((entry) => entry.day !== day);
        this.value = ranges.length > 0 ? [...others, { day, ranges }] : others;

        this.dispatchEvent(new CustomEvent('property-value-change', { bubbles: true, composed: true }));
    }

    static styles = css`
        :host { display: block; }
        .row { display: grid; grid-template-columns: 90px 1fr; align-items: center; gap: var(--uui-size-space-3); margin-bottom: var(--uui-size-space-2); }
        .axis { position: relative; height: 18px; }
        .tick { position: absolute; font-size: var(--uui-type-small-size); color: var(--uui-color-text-alt); transform: translateX(-50%); }
        .tick.first { transform: none; }
        .tick.last { transform: translateX(-100%); }
        .day { font-size: var(--uui-type-small-size); }
    `;

    private _renderAxis() {
        const ticks = [
            { at: 0, text: '12 AM', cls: 'first' },
            { at: 25, text: '06 AM', cls: '' },
            { at: 50, text: '12 PM', cls: '' },
            { at: 75, text: '06 PM', cls: '' },
            { at: 100, text: '12 AM', cls: 'last' },
        ];

        return html`<div class="row">
            <div></div>
            <div class="axis">
                ${ticks.map((tick) => html`<span class="tick ${tick.cls}" style="left:${tick.at}%">${tick.text}</span>`)}
            </div>
        </div>`;
    }

    render() {
        const editingRanges = this._editing ? this._rangesFor(this._editing.day) : [];

        return html`
            ${this._renderAxis()}
            ${WEEK.map(
                (entry) => html`
                    <div class="row">
                        <div class="day">${entry.name}</div>
                        <ooc-timeline
                            .ranges=${this._rangesFor(entry.day)}
                            .use24Hour=${this._use24Hour}
                            .showAppointmentOnly=${this._showAppointmentOnly}
                            .defaultDurationMinutes=${this._defaultDuration}
                            .trackLabel=${entry.name}
                            @change=${(e: CustomEvent) => this._setRanges(entry.day, e.detail.ranges)}
                            @edit-range=${(e: CustomEvent) =>
                                (this._editing = { day: entry.day, index: e.detail.index })}>
                        </ooc-timeline>
                    </div>
                `,
            )}

            ${this._editing
                ? html`<uui-modal-dialog @close=${() => (this._editing = null)}>
                  <uui-dialog-layout headline="Edit hours">
                      <ooc-range-dialog
                          .ranges=${editingRanges}
                          .index=${this._editing.index}
                          .use24Hour=${this._use24Hour}
                          .showAppointmentOnly=${this._showAppointmentOnly}
                          @save=${(e: CustomEvent) => {
                              this._setRanges(this._editing!.day, e.detail.ranges);
                              this._editing = null;
                          }}
                          @remove=${(e: CustomEvent) => {
                              this._setRanges(
                                  this._editing!.day,
                                  editingRanges.filter((_, i) => i !== e.detail.index),
                              );
                              this._editing = null;
                          }}
                          @cancel=${() => (this._editing = null)}>
                      </ooc-range-dialog>
                  </uui-dialog-layout>
                  </uui-modal-dialog>`
                : ''}
        `;
    }
}

export default OocWeeklyHoursElement;

declare global {
    interface HTMLElementTagNameMap {
        'ooc-weekly-hours': OocWeeklyHoursElement;
    }
}
```

- [ ] **Step 3: Register it in the bundle**

Modify `OpenOrClosed/Client/src/bundle.manifests.ts`:

```ts
import { manifests as specialHours } from './special-hours/manifest'
import { manifests as standardHours } from './standard-hours/manifest'
import { manifests as timeInput } from './time-input/manifest'
import { manifests as weeklyHours } from './weekly-hours/manifest'

// Job of the bundle is to collate all the manifests from different parts of the extension and load other manifests
// We load this bundle from umbraco-package.json
export const manifests: Array<UmbExtensionManifest> = [
  ...standardHours,
  ...specialHours,
  ...weeklyHours,
  ...timeInput
];
```

- [ ] **Step 4: Build everything**

Run: `cd OpenOrClosed/Client && npm run build && npm test`
Then: `dotnet build OpenOrClosed.slnx && dotnet test tests/OpenOrClosed.Tests`
Expected: all succeed.

- [ ] **Step 5: Verify by hand in the backoffice**

Run the test site, then:

1. Create a data type using **Weekly Hours** and add it to the Test document type.
2. Click an empty area on Monday — a block appears from the click point running eight hours.
3. Drag its right edge — it snaps to quarter hours and stops dead at the next block rather than overlapping.
4. Drag its body — it moves and keeps its length, stopping at its neighbours.
5. Click the block — the dialog opens; set a label and save; the block shows an indicator.
6. Make a block about 30 minutes wide — the text disappears, the indicator remains, and hovering shows the full detail.
7. Tab to a block and press ← and → — it moves; Shift+→ resizes; Delete removes it.
8. Save the document, reload, and confirm the hours came back.
9. Set the data type's Time Format to 12-hour and confirm block labels read `9:00 AM`.
10. Enable the Delivery API and check `/umbraco/delivery/api/v2/content?fetch=children:/` shows `"start":"09:00"` and seven days.

- [ ] **Step 6: Commit**

```bash
git add OpenOrClosed/Client/src/weekly-hours OpenOrClosed/Client/src/bundle.manifests.ts
git commit -m "Add the weekly hours property editor UI"
```

---

## Phase 1 complete

At this point `OpenOrClosed.WeeklyHours` is usable end to end, the package no longer references Newtonsoft, and the client has a tested pure-logic layer to build the holidays editor on.

Phase 2 — the holidays editor, `HolidaySchedule`, its converter, and the `OpeningHoursOn` / `IsOpenAt` extension methods — gets its own plan, written once this lands.
