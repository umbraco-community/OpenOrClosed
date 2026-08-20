# Timeline Hours Editor — Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the `OpenOrClosed.Holidays` property editor, its value converter, and the extension methods that combine a weekly schedule with holidays to answer "are we open at this instant".

**Architecture:** Mirrors phase 1. Pure, testable modules at the bottom (`holiday.ts` client-side, `internal static` methods server-side), Lit elements that own only value plumbing, and a `PropertyValueConverterBase` + `IDeliveryApiPropertyValueConverter` pair. Holiday expiry is relative to today, so the converter's cache level is `None` and every date-dependent decision happens in `ConvertIntermediateToObject` — never in `ConvertSourceToIntermediate`, whose result is cached for the element's lifetime.

**Tech Stack:** .NET 10, Umbraco 17, System.Text.Json, xUnit + FluentAssertions, Lit 3, TypeScript 5.8, Vite 7, vitest 3.

**Spec:** `docs/superpowers/specs/2026-08-19-hours-timeline-editor-design.md` — this plan implements "Delivery order" item 2.

## Global Constraints

- **System.Text.Json only.** Newtonsoft is not a dependency. Stored-value reads go through `StoredValueJson.Deserialize<T>` which swallows `JsonException` and returns `default`.
- **Do not add a global `JsonStringEnumConverter` to `StoredValueJson.Options`.** `WeeklyHoursDay.Day` is a `DayOfWeek` and the Delivery API currently emits it as a number. A global converter would silently change that contract. Enum handling goes on the property via `[JsonConverter]`.
- **`TimeSpan`, never `TimeOnly`,** for times of day. `TimeOnly` cannot represent `24:00`, which is a valid range end.
- **`DateOnly` for holiday dates.** System.Text.Json handles it as ISO `yyyy-MM-dd` natively on .NET 10; no custom converter needed.
- **Namespace root is `OpenOrClosed.Core`,** not `OpenOrClosed`.
- **Nothing time-dependent in `ConvertSourceToIntermediate`.** This is the bug already fixed once in `SpecialHoursConverter`; re-introducing it is the single most likely way to break this feature.
- **Converters never return null.** Holidays convert to a `HolidaySchedule` with empty `DefaultHours` and `Holidays`.
- **Out of scope:** migrating `OpenOrClosed.StandardHours` / `OpenOrClosed.SpecialHours`, and any change to the existing two editors or their converters.
- **Test commands:** `dotnet test OpenOrClosed.slnx` (from repo root) and `npm test` (from `OpenOrClosed/Client`). Build the client with `npm run build`, which runs `tsc` then Vite and writes to `OpenOrClosed/wwwroot/App_Plugins/OpenOrClosed/`.

---

## File Structure

**Server — create:**

| File | Responsibility |
|---|---|
| `OpenOrClosed/Models/HolidayHoursMode.cs` | The three-value enum |
| `OpenOrClosed/Models/Holiday.cs` | One named date range and its hours |
| `OpenOrClosed/Models/HolidaySchedule.cs` | Default hours plus the holiday list; the converted value type |
| `OpenOrClosed/Models/OpeningHoursForDate.cs` | The result of resolving one date |
| `OpenOrClosed/Serialization/HolidayHoursModeJsonConverter.cs` | Lenient `"default"`/`"closed"`/`"custom"` ↔ enum |
| `OpenOrClosed/PropertyEditors/HolidaysPropertyEditor.cs` | `[DataEditor]` registration and the two aliases |
| `OpenOrClosed/PropertyValueConverters/DataTypeConfig.cs` | Shared lenient toggle reader |
| `OpenOrClosed/PropertyValueConverters/HolidaysConverter.cs` | Razor + Delivery API conversion, expiry filtering |
| `OpenOrClosed/Extensions/OpeningHoursExtensions.cs` | `OpeningHoursOn` and `IsOpenAt` |

**Server — modify:** `OpenOrClosed/Constants/PropertyEditors.cs` (add the `removeExpiredHolidays` prevalue key).

**Client — create:**

| File | Responsibility |
|---|---|
| `Client/src/holidays/holiday.ts` | Pure logic: sanitise, expiry, yearly occurrence, validation, sort |
| `Client/src/holidays/holiday.test.ts` | vitest coverage of the above |
| `Client/src/holidays/holiday-modal.token.ts` | `UmbModalToken` + data/value interfaces |
| `Client/src/holidays/ooc-holiday-modal.element.ts` | The per-holiday sidebar editor |
| `Client/src/holidays/ooc-holidays.element.ts` | Default hours track + holiday table |
| `Client/src/holidays/manifest.ts` | `propertyEditorUi` + `modal` manifests |

**Client — modify:** `Client/src/bundle.manifests.ts` (register the holidays manifests).

**Docs — modify:** `README.md` (which of the four editors to choose; how to combine the two new ones).

---

## Task 1: Holiday models and the hours-mode JSON converter

**Files:**
- Create: `OpenOrClosed/Models/HolidayHoursMode.cs`
- Create: `OpenOrClosed/Models/Holiday.cs`
- Create: `OpenOrClosed/Models/HolidaySchedule.cs`
- Create: `OpenOrClosed/Serialization/HolidayHoursModeJsonConverter.cs`
- Test: `tests/OpenOrClosed.Tests/Serialization/HolidayScheduleJsonTests.cs`

**Interfaces:**
- Consumes: `HoursRange` (`OpenOrClosed.Core.Models`), `StoredValueJson.Deserialize<T>` and `StoredValueJson.Options` (`OpenOrClosed.Core.Serialization`, both `internal`).
- Produces: `HolidayHoursMode { Default, Closed, Custom }`; `Holiday` with `Name`/`Start`/`End`/`RepeatYearly`/`HoursMode`/`Hours`; `HolidaySchedule` with `DefaultHours`/`Holidays`; `HolidayHoursModeJsonConverter`.

- [ ] **Step 1: Write the failing test**

Create `tests/OpenOrClosed.Tests/Serialization/HolidayScheduleJsonTests.cs`:

```csharp
using System.Text.Json;
using OpenOrClosed.Core.Models;
using OpenOrClosed.Core.Serialization;

namespace OpenOrClosed.Tests.Serialization;

public class HolidayScheduleJsonTests
{
    private const string StoredValue = """
        {
          "defaultHours": [
            { "start": "10:00", "end": "14:00", "label": null, "byAppointmentOnly": false }
          ],
          "holidays": [
            { "name": "Christmas Shutdown", "start": "2026-12-27", "end": "2027-01-02",
              "repeatYearly": true, "hoursMode": "default", "hours": [] },
            { "name": "Stocktake", "start": "2027-02-03", "end": "2027-02-05",
              "repeatYearly": false, "hoursMode": "custom",
              "hours": [ { "start": "09:00", "end": "12:00", "label": null, "byAppointmentOnly": false } ] }
          ]
        }
        """;

    private static HolidaySchedule Read(string json) =>
        StoredValueJson.Deserialize<HolidaySchedule>(json)!;

    [Fact]
    public void Deserialize_ReadsDefaultHoursAndHolidays()
    {
        var schedule = Read(StoredValue);

        schedule.DefaultHours.Should().HaveCount(1);
        schedule.DefaultHours[0].Start.Should().Be(TimeSpan.FromHours(10));
        schedule.DefaultHours[0].End.Should().Be(TimeSpan.FromHours(14));

        schedule.Holidays.Should().HaveCount(2);
        schedule.Holidays[0].Name.Should().Be("Christmas Shutdown");
        schedule.Holidays[0].Start.Should().Be(new DateOnly(2026, 12, 27));
        schedule.Holidays[0].End.Should().Be(new DateOnly(2027, 1, 2));
        schedule.Holidays[0].RepeatYearly.Should().BeTrue();
        schedule.Holidays[0].HoursMode.Should().Be(HolidayHoursMode.Default);
        schedule.Holidays[0].Hours.Should().BeEmpty();
    }

    [Fact]
    public void Deserialize_ReadsCustomHoursIncludingEndOfDay()
    {
        var holiday = Read(StoredValue).Holidays[1];

        holiday.HoursMode.Should().Be(HolidayHoursMode.Custom);
        holiday.Hours.Should().HaveCount(1);
        holiday.Hours[0].End.Should().Be(TimeSpan.FromHours(12));
    }

    [Theory]
    [InlineData("\"default\"", HolidayHoursMode.Default)]
    [InlineData("\"closed\"", HolidayHoursMode.Closed)]
    [InlineData("\"custom\"", HolidayHoursMode.Custom)]
    [InlineData("\"Custom\"", HolidayHoursMode.Custom)]
    [InlineData("\"CLOSED\"", HolidayHoursMode.Closed)]
    public void HoursMode_IsReadCaseInsensitively(string json, HolidayHoursMode expected)
    {
        JsonSerializer.Deserialize<HolidayHoursMode>(json, StoredValueJson.Options)
            .Should().Be(expected);
    }

    [Theory]
    [InlineData("\"\"")]
    [InlineData("\"nonsense\"")]
    [InlineData("null")]
    [InlineData("3")]
    public void HoursMode_FallsBackToDefaultRatherThanThrowing(string json)
    {
        // Stored values were written by several generations of editor; a bad mode must not
        // take the whole property down.
        JsonSerializer.Deserialize<HolidayHoursMode>(json, StoredValueJson.Options)
            .Should().Be(HolidayHoursMode.Default);
    }

    [Fact]
    public void HoursMode_IsWrittenAsLowercase()
    {
        // The Delivery API emits this, so the wire format must match what the editor stores.
        JsonSerializer.Serialize(HolidayHoursMode.Custom, StoredValueJson.Options)
            .Should().Be("\"custom\"");
    }

    [Fact]
    public void Deserialize_MalformedJsonReturnsNullRatherThanThrowing()
    {
        StoredValueJson.Deserialize<HolidaySchedule>("{ not json").Should().BeNull();
    }

    [Fact]
    public void Deserialize_MissingCollectionsBecomeEmptyNotNull()
    {
        var schedule = Read("{}");

        schedule.DefaultHours.Should().NotBeNull().And.BeEmpty();
        schedule.Holidays.Should().NotBeNull().And.BeEmpty();
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test OpenOrClosed.slnx --filter HolidayScheduleJsonTests`
Expected: FAIL — build error, `HolidaySchedule` / `HolidayHoursMode` do not exist.

- [ ] **Step 3: Write minimal implementation**

`OpenOrClosed/Models/HolidayHoursMode.cs`:

```csharp
namespace OpenOrClosed.Core.Models;

/// <summary>How a holiday's own hours are decided.</summary>
public enum HolidayHoursMode
{
    /// <summary>Use the schedule's shared default hours.</summary>
    Default,

    /// <summary>Closed for the whole holiday.</summary>
    Closed,

    /// <summary>Use the holiday's own <see cref="Holiday.Hours"/>.</summary>
    Custom,
}
```

`OpenOrClosed/Serialization/HolidayHoursModeJsonConverter.cs`:

```csharp
using System.Text.Json;
using System.Text.Json.Serialization;
using OpenOrClosed.Core.Models;

namespace OpenOrClosed.Core.Serialization;

/// <summary>
/// Reads and writes <see cref="HolidayHoursMode"/> as the lowercase strings the editor stores.
/// </summary>
/// <remarks>
/// Deliberately lenient on read, matching <see cref="StoredValueJson"/>: anything unrecognised
/// becomes <see cref="HolidayHoursMode.Default"/> rather than throwing, so one bad stored mode
/// cannot take a whole property down.
/// </remarks>
internal sealed class HolidayHoursModeJsonConverter : JsonConverter<HolidayHoursMode>
{
    public override HolidayHoursMode Read(
        ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
        => reader.TokenType switch
        {
            JsonTokenType.String => Parse(reader.GetString()),
            _ => HolidayHoursMode.Default,
        };

    public override void Write(
        Utf8JsonWriter writer, HolidayHoursMode value, JsonSerializerOptions options)
        => writer.WriteStringValue(value switch
        {
            HolidayHoursMode.Closed => "closed",
            HolidayHoursMode.Custom => "custom",
            _ => "default",
        });

    private static HolidayHoursMode Parse(string? value)
        => value?.ToLowerInvariant() switch
        {
            "closed" => HolidayHoursMode.Closed,
            "custom" => HolidayHoursMode.Custom,
            _ => HolidayHoursMode.Default,
        };
}
```

`OpenOrClosed/Models/Holiday.cs`:

```csharp
using System.Text.Json.Serialization;
using OpenOrClosed.Core.Serialization;

namespace OpenOrClosed.Core.Models;

/// <summary>A named date range that overrides the weekly schedule.</summary>
public sealed class Holiday
{
    [JsonPropertyName("name")]
    public string Name { get; init; } = string.Empty;

    [JsonPropertyName("start")]
    public DateOnly Start { get; init; }

    /// <summary>Inclusive - a one-day holiday has <see cref="End"/> equal to <see cref="Start"/>.</summary>
    [JsonPropertyName("end")]
    public DateOnly End { get; init; }

    /// <summary>When true the range recurs every year and never expires.</summary>
    [JsonPropertyName("repeatYearly")]
    public bool RepeatYearly { get; init; }

    /// <summary>
    /// Explicit rather than inferred from whether <see cref="Hours"/> is empty, because that
    /// distinction does not survive a round-trip reliably.
    /// </summary>
    [JsonPropertyName("hoursMode")]
    [JsonConverter(typeof(HolidayHoursModeJsonConverter))]
    public HolidayHoursMode HoursMode { get; init; }

    /// <summary>Ignored unless <see cref="HoursMode"/> is <see cref="HolidayHoursMode.Custom"/>.</summary>
    [JsonPropertyName("hours")]
    public IReadOnlyList<HoursRange> Hours { get; init; } = [];
}
```

`OpenOrClosed/Models/HolidaySchedule.cs`:

```csharp
using System.Text.Json.Serialization;

namespace OpenOrClosed.Core.Models;

/// <summary>The value of an <c>OpenOrClosed.Holidays</c> property.</summary>
public sealed class HolidaySchedule
{
    /// <summary>
    /// The hours a holiday uses when its mode is <see cref="HolidayHoursMode.Default"/>. Empty
    /// means such a holiday is closed, which is the intended reading of an empty default track.
    /// </summary>
    [JsonPropertyName("defaultHours")]
    public IReadOnlyList<HoursRange> DefaultHours { get; init; } = [];

    [JsonPropertyName("holidays")]
    public IReadOnlyList<Holiday> Holidays { get; init; } = [];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `dotnet test OpenOrClosed.slnx --filter HolidayScheduleJsonTests`
Expected: PASS — 11 tests.

- [ ] **Step 5: Commit**

```bash
git add OpenOrClosed/Models/HolidayHoursMode.cs OpenOrClosed/Models/Holiday.cs \
        OpenOrClosed/Models/HolidaySchedule.cs \
        OpenOrClosed/Serialization/HolidayHoursModeJsonConverter.cs \
        tests/OpenOrClosed.Tests/Serialization/HolidayScheduleJsonTests.cs
git commit -m "feat: add holiday schedule models and hours-mode JSON converter"
```

---

## Task 2: Property editor registration and the shared toggle reader

**Files:**
- Create: `OpenOrClosed/PropertyEditors/HolidaysPropertyEditor.cs`
- Create: `OpenOrClosed/PropertyValueConverters/DataTypeConfig.cs`
- Modify: `OpenOrClosed/Constants/PropertyEditors.cs`
- Test: `tests/OpenOrClosed.Tests/PropertyValueConverters/DataTypeConfigTests.cs`

**Interfaces:**
- Consumes: `PropertyTypeStub.For(string alias)` (`OpenOrClosed.Tests.TestDoubles`).
- Produces: `HolidaysPropertyEditor.EditorAlias` = `"OpenOrClosed.Holidays"`, `HolidaysPropertyEditor.UiEditorAlias` = `"OpenOrClosed.PropertyEditorUi.Holidays"`; `PropertyEditors.PreValues.RemoveExpiredHolidays` = `"removeExpiredHolidays"`; `internal static bool DataTypeConfig.Toggle(IPublishedPropertyType propertyType, string alias, bool fallback)`.

**Note on `PropertyTypeStub`:** read `tests/OpenOrClosed.Tests/TestDoubles/PropertyTypeStub.cs` first. If it does not already support supplying a configuration dictionary, extend it with an optional parameter — `For(string alias, Dictionary<string, object>? configuration = null)` — keeping the existing single-argument call sites working unchanged.

- [ ] **Step 1: Write the failing test**

Create `tests/OpenOrClosed.Tests/PropertyValueConverters/DataTypeConfigTests.cs`:

```csharp
using OpenOrClosed.Core.PropertyEditors;
using OpenOrClosed.Core.PropertyValueConverters;
using OpenOrClosed.Tests.TestDoubles;

namespace OpenOrClosed.Tests.PropertyValueConverters;

public class DataTypeConfigTests
{
    private const string Alias = "removeExpiredHolidays";

    private static bool Read(object? stored, bool fallback = true)
    {
        var configuration = stored is null
            ? new Dictionary<string, object>()
            : new Dictionary<string, object> { [Alias] = stored };

        return DataTypeConfig.Toggle(
            PropertyTypeStub.For(HolidaysPropertyEditor.EditorAlias, configuration), Alias, fallback);
    }

    [Theory]
    [InlineData(true)]
    [InlineData("1")]
    [InlineData("true")]
    [InlineData("True")]
    public void Toggle_RecognisesEveryShapeATrueToggleHasBeenStoredAs(object stored)
    {
        // Toggles have been persisted as booleans, as 1/0 and as "1"/"0" over the years.
        Read(stored, fallback: false).Should().BeTrue();
    }

    [Theory]
    [InlineData(false)]
    [InlineData("0")]
    [InlineData("false")]
    [InlineData("")]
    public void Toggle_RecognisesEveryShapeAFalseToggleHasBeenStoredAs(object stored)
    {
        Read(stored, fallback: true).Should().BeFalse();
    }

    [Fact]
    public void Toggle_UsesTheFallbackWhenTheKeyIsAbsent()
    {
        // removeExpiredHolidays defaults to true, unlike the older removeOldDates.
        Read(null, fallback: true).Should().BeTrue();
        Read(null, fallback: false).Should().BeFalse();
    }

    [Fact]
    public void Toggle_UsesTheFallbackWhenThereIsNoConfigurationAtAll()
    {
        DataTypeConfig.Toggle(PropertyTypeStub.For(HolidaysPropertyEditor.EditorAlias), Alias, true)
            .Should().BeTrue();
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test OpenOrClosed.slnx --filter DataTypeConfigTests`
Expected: FAIL — build error, `DataTypeConfig` and `HolidaysPropertyEditor` do not exist.

- [ ] **Step 3: Write minimal implementation**

`OpenOrClosed/PropertyEditors/HolidaysPropertyEditor.cs`:

```csharp
using Umbraco.Cms.Core.PropertyEditors;

namespace OpenOrClosed.Core.PropertyEditors;

[DataEditor(
    EditorAlias,
    ValueType = ValueTypes.Json,
    ValueEditorIsReusable = true)]
public class HolidaysPropertyEditor(IDataValueEditorFactory dataValueEditorFactory)
    : DataEditor(dataValueEditorFactory)
{
    internal const string EditorAlias = "OpenOrClosed.Holidays";
    internal const string UiEditorAlias = "OpenOrClosed.PropertyEditorUi.Holidays";
}
```

Add to `PropertyEditors.PreValues` in `OpenOrClosed/Constants/PropertyEditors.cs`:

```csharp
        public const string RemoveExpiredHolidays = "removeExpiredHolidays";
```

`OpenOrClosed/PropertyValueConverters/DataTypeConfig.cs`:

```csharp
using Umbraco.Cms.Core.Models.PublishedContent;

namespace OpenOrClosed.Core.PropertyValueConverters;

/// <summary>Reads data type settings without trusting how they were stored.</summary>
internal static class DataTypeConfig
{
    /// <summary>
    /// Reads a boolean setting, returning <paramref name="fallback"/> when it is absent.
    /// </summary>
    /// <remarks>
    /// Toggles have been stored as booleans, as 1/0 and as "1"/"0" over the years, and an
    /// unconverted System.Text.Json value can arrive here too - so never hard cast.
    /// </remarks>
    internal static bool Toggle(IPublishedPropertyType propertyType, string alias, bool fallback)
    {
        var config = propertyType.DataType.ConfigurationAs<Dictionary<string, object>>();

        if (config?.TryGetValue(alias, out var value) != true)
        {
            return fallback;
        }

        return value switch
        {
            bool b => b,
            string s => s is "1" or "true" or "True",
            _ => value is not null && Convert.ToString(value) is "1" or "true" or "True",
        };
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `dotnet test OpenOrClosed.slnx --filter DataTypeConfigTests`
Expected: PASS — 10 tests.

- [ ] **Step 5: Commit**

```bash
git add OpenOrClosed/PropertyEditors/HolidaysPropertyEditor.cs \
        OpenOrClosed/PropertyValueConverters/DataTypeConfig.cs \
        OpenOrClosed/Constants/PropertyEditors.cs \
        tests/OpenOrClosed.Tests/TestDoubles/PropertyTypeStub.cs \
        tests/OpenOrClosed.Tests/PropertyValueConverters/DataTypeConfigTests.cs
git commit -m "feat: register the holidays property editor and share the toggle reader"
```

---

## Task 3: Holidays value converter with expiry filtering

**Files:**
- Create: `OpenOrClosed/PropertyValueConverters/HolidaysConverter.cs`
- Test: `tests/OpenOrClosed.Tests/DeliveryApi/HolidaysDeliveryApiTests.cs`

**Interfaces:**
- Consumes: `HolidaySchedule`, `Holiday`, `HolidayHoursMode`, `StoredValueJson.Deserialize<T>`, `DataTypeConfig.Toggle`, `PropertyEditors.PreValues.RemoveExpiredHolidays`, `HolidaysPropertyEditor.EditorAlias`.
- Produces: `HolidaysConverter` with value type `HolidaySchedule` on both paths, cache level `PropertyCacheLevel.None`, and `internal static HolidaySchedule HolidaysConverter.Project(HolidaySchedule? stored, bool removeExpired, DateOnly today)`.

**Why `Project` is `internal static` with an injected `today`:** it is the only date-dependent code in the converter, and the tests must run against fixed dates rather than `DateTime.Now`. This mirrors `SpecialHoursConverter.AnchorToDates`.

- [ ] **Step 1: Write the failing test**

Create `tests/OpenOrClosed.Tests/DeliveryApi/HolidaysDeliveryApiTests.cs`:

```csharp
using OpenOrClosed.Core.Models;
using OpenOrClosed.Core.PropertyEditors;
using OpenOrClosed.Core.PropertyValueConverters;
using OpenOrClosed.Core.Serialization;
using OpenOrClosed.Tests.TestDoubles;
using Umbraco.Cms.Core.Models.PublishedContent;
using Umbraco.Cms.Core.PropertyEditors;

namespace OpenOrClosed.Tests.DeliveryApi;

public class HolidaysDeliveryApiTests
{
    private const string StoredValue = """
        {
          "defaultHours": [
            { "start": "10:00", "end": "14:00", "label": null, "byAppointmentOnly": false }
          ],
          "holidays": [
            { "name": "Stocktake 2020", "start": "2020-02-03", "end": "2020-02-05",
              "repeatYearly": false, "hoursMode": "closed", "hours": [] },
            { "name": "Christmas Shutdown", "start": "2020-12-27", "end": "2021-01-02",
              "repeatYearly": true, "hoursMode": "default", "hours": [] },
            { "name": "Stocktake", "start": "2027-02-03", "end": "2027-02-05",
              "repeatYearly": false, "hoursMode": "custom",
              "hours": [ { "start": "09:00", "end": "12:00", "label": null, "byAppointmentOnly": false } ] }
          ]
        }
        """;

    private static readonly HolidaysConverter Converter = new();
    private static readonly DateOnly Today = new(2026, 8, 20);

    private static IPublishedPropertyType PropertyType =>
        PropertyTypeStub.For(HolidaysPropertyEditor.EditorAlias);

    private static object? Intermediate(string? source) =>
        Converter.ConvertSourceToIntermediate(null!, PropertyType, source, false);

    private static HolidaySchedule Project(string? source, bool removeExpired) =>
        HolidaysConverter.Project(
            StoredValueJson.Deserialize<HolidaySchedule>(source ?? string.Empty), removeExpired, Today);

    [Fact]
    public void IsConverter_MatchesOnlyItsOwnEditorAlias()
    {
        Converter.IsConverter(PropertyTypeStub.For(HolidaysPropertyEditor.EditorAlias)).Should().BeTrue();
        Converter.IsConverter(PropertyTypeStub.For(WeeklyHoursPropertyEditor.EditorAlias)).Should().BeFalse();
    }

    [Fact]
    public void ValueTypes_MatchAcrossRazorAndDeliveryApi()
    {
        Converter.GetDeliveryApiPropertyValueType(PropertyType)
            .Should().Be(typeof(HolidaySchedule))
            .And.Be(Converter.GetPropertyValueType(PropertyType));
    }

    [Fact]
    public void CacheLevel_IsNoneBecauseExpiryIsRelativeToToday()
    {
        Converter.GetPropertyCacheLevel(PropertyType).Should().Be(PropertyCacheLevel.None);
        Converter.GetDeliveryApiPropertyCacheLevel(PropertyType).Should().Be(PropertyCacheLevel.None);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void ConvertSourceToIntermediate_EmptySourceIsNull(string? source)
    {
        Intermediate(source).Should().BeNull();
    }

    [Fact]
    public void Convert_NeverReturnsNull()
    {
        var value = (HolidaySchedule)Converter.ConvertIntermediateToObject(
            null!, PropertyType, PropertyCacheLevel.None, null, false)!;

        value.Should().NotBeNull();
        value.DefaultHours.Should().BeEmpty();
        value.Holidays.Should().BeEmpty();
    }

    [Fact]
    public void Project_DropsAPastOneOffHoliday()
    {
        Project(StoredValue, removeExpired: true).Holidays
            .Select(holiday => holiday.Name)
            .Should().NotContain("Stocktake 2020");
    }

    [Fact]
    public void Project_KeepsAPastHolidayThatRepeatsYearly()
    {
        // A repeating holiday never expires - it recurs.
        Project(StoredValue, removeExpired: true).Holidays
            .Select(holiday => holiday.Name)
            .Should().Contain("Christmas Shutdown");
    }

    [Fact]
    public void Project_KeepsAFutureHoliday()
    {
        Project(StoredValue, removeExpired: true).Holidays
            .Select(holiday => holiday.Name)
            .Should().Contain("Stocktake");
    }

    [Fact]
    public void Project_KeepsAHolidayEndingToday()
    {
        const string endsToday = """
            { "defaultHours": [], "holidays": [
                { "name": "Ends today", "start": "2026-08-18", "end": "2026-08-20",
                  "repeatYearly": false, "hoursMode": "closed", "hours": [] } ] }
            """;

        Project(endsToday, removeExpired: true).Holidays.Should().HaveCount(1);
    }

    [Fact]
    public void Project_DropsAHolidayThatEndedYesterday()
    {
        const string endedYesterday = """
            { "defaultHours": [], "holidays": [
                { "name": "Ended yesterday", "start": "2026-08-17", "end": "2026-08-19",
                  "repeatYearly": false, "hoursMode": "closed", "hours": [] } ] }
            """;

        Project(endedYesterday, removeExpired: true).Holidays.Should().BeEmpty();
    }

    [Fact]
    public void Project_KeepsEverythingWhenTheSettingIsOff()
    {
        Project(StoredValue, removeExpired: false).Holidays.Should().HaveCount(3);
    }

    [Fact]
    public void Project_KeepsDefaultHoursRegardlessOfExpiry()
    {
        Project(StoredValue, removeExpired: true).DefaultHours.Should().HaveCount(1);
    }

    [Fact]
    public void Project_SortsRangesByStart()
    {
        const string unsorted = """
            { "defaultHours": [
                { "start": "13:00", "end": "17:00" }, { "start": "09:00", "end": "12:00" } ],
              "holidays": [] }
            """;

        Project(unsorted, removeExpired: true).DefaultHours
            .Select(range => range.Start)
            .Should().BeInAscendingOrder();
    }

    [Fact]
    public void Project_DoesNotMutateTheSharedIntermediate()
    {
        // The intermediate is cached for the element's lifetime, so projecting twice from the
        // same instance must give the same answer.
        var stored = StoredValueJson.Deserialize<HolidaySchedule>(StoredValue);

        var first = HolidaysConverter.Project(stored, removeExpired: true, Today).Holidays.Count;
        var second = HolidaysConverter.Project(stored, removeExpired: true, Today).Holidays.Count;

        second.Should().Be(first);
        stored!.Holidays.Should().HaveCount(3, "the stored value itself must be untouched");
    }

    [Fact]
    public void Project_ReturnsFreshInstancesNotTheStoredOnes()
    {
        var stored = StoredValueJson.Deserialize<HolidaySchedule>(StoredValue);

        var projected = HolidaysConverter.Project(stored, removeExpired: false, Today);

        projected.Should().NotBeSameAs(stored);
        projected.Holidays[0].Should().NotBeSameAs(stored!.Holidays[0]);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test OpenOrClosed.slnx --filter HolidaysDeliveryApiTests`
Expected: FAIL — build error, `HolidaysConverter` does not exist.

- [ ] **Step 3: Write minimal implementation**

`OpenOrClosed/PropertyValueConverters/HolidaysConverter.cs`:

```csharp
using OpenOrClosed.Core.Models;
using OpenOrClosed.Core.PropertyEditors;
using OpenOrClosed.Core.Serialization;
using Umbraco.Cms.Core.Models.PublishedContent;
using Umbraco.Cms.Core.PropertyEditors;
using Umbraco.Cms.Core.PropertyEditors.DeliveryApi;

namespace OpenOrClosed.Core.PropertyValueConverters;

public class HolidaysConverter : PropertyValueConverterBase, IDeliveryApiPropertyValueConverter
{
    public override bool IsConverter(IPublishedPropertyType propertyType)
        => HolidaysPropertyEditor.EditorAlias == propertyType.EditorAlias;

    public override Type GetPropertyValueType(IPublishedPropertyType propertyType)
        => typeof(HolidaySchedule);

    // Expiry is relative to today, so the converted value must not be cached - a cached value
    // goes stale as soon as a request crosses a day boundary.
    public override PropertyCacheLevel GetPropertyCacheLevel(IPublishedPropertyType propertyType)
        => PropertyCacheLevel.None;

    /// <summary>
    /// Deserializes the stored value. This is cached for the lifetime of the element, so it must
    /// stay free of anything time-dependent - see <see cref="Project"/>.
    /// </summary>
    public override object? ConvertSourceToIntermediate(
        IPublishedElement owner, IPublishedPropertyType propertyType, object? source, bool preview)
    {
        var sourceString = source?.ToString();

        return string.IsNullOrWhiteSpace(sourceString)
            ? null
            : StoredValueJson.Deserialize<HolidaySchedule>(sourceString);
    }

    public override object? ConvertIntermediateToObject(
        IPublishedElement owner, IPublishedPropertyType propertyType,
        PropertyCacheLevel referenceCacheLevel, object? inter, bool preview)
        => Project(inter as HolidaySchedule, RemoveExpired(propertyType), Today);

    public PropertyCacheLevel GetDeliveryApiPropertyCacheLevel(IPublishedPropertyType propertyType)
        => GetPropertyCacheLevel(propertyType);

    public Type GetDeliveryApiPropertyValueType(IPublishedPropertyType propertyType)
        => GetPropertyValueType(propertyType);

    public object? ConvertIntermediateToDeliveryApiObject(
        IPublishedElement owner, IPublishedPropertyType propertyType,
        PropertyCacheLevel referenceCacheLevel, object? inter, bool preview, bool expanding)
        => Project(inter as HolidaySchedule, RemoveExpired(propertyType), Today);

    private static DateOnly Today => DateOnly.FromDateTime(DateTime.Now);

    private static bool RemoveExpired(IPublishedPropertyType propertyType)
        => DataTypeConfig.Toggle(
            propertyType, Constants.PropertyEditors.PreValues.RemoveExpiredHolidays, fallback: true);

    /// <summary>
    /// Projects the stored schedule into the converted value, optionally dropping holidays that
    /// have already finished.
    /// </summary>
    /// <remarks>
    /// Always returns fresh instances - the intermediate value is shared and cached, so it must
    /// never be mutated here. <paramref name="today"/> is a parameter so this is testable against
    /// fixed dates.
    /// </remarks>
    internal static HolidaySchedule Project(HolidaySchedule? stored, bool removeExpired, DateOnly today)
    {
        if (stored is null)
        {
            return new HolidaySchedule();
        }

        var holidays = stored.Holidays ?? [];

        if (removeExpired)
        {
            holidays = [.. holidays.Where(holiday => !IsExpired(holiday, today))];
        }

        return new HolidaySchedule
        {
            DefaultHours = Copy(stored.DefaultHours),
            Holidays =
            [
                .. holidays.Select(holiday => new Holiday
                {
                    Name = holiday.Name,
                    Start = holiday.Start,
                    End = holiday.End,
                    RepeatYearly = holiday.RepeatYearly,
                    HoursMode = holiday.HoursMode,
                    Hours = Copy(holiday.Hours),
                }),
            ],
        };
    }

    /// <summary>A repeating holiday never expires, because it recurs.</summary>
    private static bool IsExpired(Holiday holiday, DateOnly today)
        => !holiday.RepeatYearly && holiday.End < today;

    private static IReadOnlyList<HoursRange> Copy(IReadOnlyList<HoursRange>? ranges)
        =>
        [
            .. (ranges ?? []).OrderBy(range => range.Start).Select(range => new HoursRange
            {
                Start = range.Start,
                End = range.End,
                Label = range.Label,
                ByAppointmentOnly = range.ByAppointmentOnly,
            }),
        ];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `dotnet test OpenOrClosed.slnx --filter HolidaysDeliveryApiTests`
Expected: PASS — 17 tests.

- [ ] **Step 5: Commit**

```bash
git add OpenOrClosed/PropertyValueConverters/HolidaysConverter.cs \
        tests/OpenOrClosed.Tests/DeliveryApi/HolidaysDeliveryApiTests.cs
git commit -m "feat: add the holidays value converter with expiry filtering"
```

---

## Task 4: Combining extension methods

**Files:**
- Create: `OpenOrClosed/Models/OpeningHoursForDate.cs`
- Create: `OpenOrClosed/Extensions/OpeningHoursExtensions.cs`
- Test: `tests/OpenOrClosed.Tests/Extensions/OpeningHoursExtensionsTests.cs`

**Interfaces:**
- Consumes: `WeeklyHoursDay`, `HoursRange`, `HolidaySchedule`, `Holiday`, `HolidayHoursMode`.
- Produces:
  - `OpeningHoursForDate` with `Date`, `IsOpen`, `Ranges`, `Holiday?`
  - `OpeningHoursForDate OpeningHoursOn(this IEnumerable<WeeklyHoursDay> weekly, DateOnly date, HolidaySchedule? holidays = null)`
  - `bool IsOpenAt(this IEnumerable<WeeklyHoursDay> weekly, DateTime instant, HolidaySchedule? holidays = null)`

**Rules from the spec, restated because they are easy to get wrong:**
- A matching holiday **replaces** the day's weekly hours entirely.
- `Default` → `HolidaySchedule.DefaultHours`; `Closed` → no ranges; `Custom` → the holiday's own `Hours`.
- A `Default` holiday on a schedule with empty `DefaultHours` is therefore **closed**.
- Yearly matching: for date `D` and holiday `H`, test containment against `H.Start.AddYears(n)`–`H.End.AddYears(n)` for `n = D.Year - H.Start.Year` **and** `n - 1`. The `n - 1` case is what lets a range starting in December match in January.
- `.NET` clamps 29 February to the 28th in non-leap years. That is the desired behaviour — do not work around it.
- When several holidays match, the one with the **earliest occurrence start** wins; ties break on list order.
- `IsOpenAt` treats a range as `Start <= t < End`, so a shop closing at 17:00 is shut at exactly 17:00. An end of `24:00` includes every instant up to midnight.

- [ ] **Step 1: Write the failing test**

Create `tests/OpenOrClosed.Tests/Extensions/OpeningHoursExtensionsTests.cs`:

```csharp
using OpenOrClosed.Core.Extensions;
using OpenOrClosed.Core.Models;

namespace OpenOrClosed.Tests.Extensions;

public class OpeningHoursExtensionsTests
{
    private static HoursRange Range(string start, string end) =>
        new() { Start = TimeSpan.Parse(start), End = TimeSpan.Parse(end) };

    /// <summary>Nine to five every day, so a holiday's effect is always visible.</summary>
    private static readonly WeeklyHoursDay[] NineToFive =
    [
        .. new[]
        {
            DayOfWeek.Monday, DayOfWeek.Tuesday, DayOfWeek.Wednesday, DayOfWeek.Thursday,
            DayOfWeek.Friday, DayOfWeek.Saturday, DayOfWeek.Sunday,
        }.Select(day => new WeeklyHoursDay { Day = day, Ranges = [Range("09:00", "17:00")] }),
    ];

    private static WeeklyHoursDay[] ClosedAllWeek =>
        [.. NineToFive.Select(day => new WeeklyHoursDay { Day = day.Day, Ranges = [] })];

    private static HolidaySchedule Schedule(params Holiday[] holidays) =>
        new() { DefaultHours = [Range("10:00", "14:00")], Holidays = holidays };

    private static Holiday Holiday(
        string name, string start, string end,
        HolidayHoursMode mode = HolidayHoursMode.Closed,
        bool repeat = false,
        params HoursRange[] hours) =>
        new()
        {
            Name = name,
            Start = DateOnly.Parse(start),
            End = DateOnly.Parse(end),
            RepeatYearly = repeat,
            HoursMode = mode,
            Hours = hours,
        };

    [Fact]
    public void OpeningHoursOn_WithNoHolidaysUsesTheWeeklySchedule()
    {
        var result = NineToFive.OpeningHoursOn(new DateOnly(2026, 8, 20));

        result.IsOpen.Should().BeTrue();
        result.Ranges.Should().HaveCount(1);
        result.Holiday.Should().BeNull();
        result.Date.Should().Be(new DateOnly(2026, 8, 20));
    }

    [Fact]
    public void OpeningHoursOn_AClosedHolidayBeatsTheWeeklySchedule()
    {
        var result = NineToFive.OpeningHoursOn(
            new DateOnly(2026, 12, 25),
            Schedule(Holiday("Christmas", "2026-12-25", "2026-12-25")));

        result.IsOpen.Should().BeFalse();
        result.Ranges.Should().BeEmpty();
        result.Holiday!.Name.Should().Be("Christmas");
    }

    [Fact]
    public void OpeningHoursOn_ADefaultHolidayUsesTheScheduleDefaultHours()
    {
        var result = NineToFive.OpeningHoursOn(
            new DateOnly(2026, 12, 28),
            Schedule(Holiday("Boxing week", "2026-12-27", "2026-12-31", HolidayHoursMode.Default)));

        result.IsOpen.Should().BeTrue();
        result.Ranges.Should().HaveCount(1);
        result.Ranges[0].Start.Should().Be(TimeSpan.FromHours(10));
        result.Ranges[0].End.Should().Be(TimeSpan.FromHours(14));
    }

    [Fact]
    public void OpeningHoursOn_ADefaultHolidayOnAnEmptyDefaultTrackIsClosed()
    {
        // An empty default track means "closed on holidays" - that is the intended reading.
        var schedule = new HolidaySchedule
        {
            DefaultHours = [],
            Holidays = [Holiday("Shutdown", "2026-12-27", "2026-12-31", HolidayHoursMode.Default)],
        };

        var result = NineToFive.OpeningHoursOn(new DateOnly(2026, 12, 28), schedule);

        result.IsOpen.Should().BeFalse();
        result.Ranges.Should().BeEmpty();
        result.Holiday.Should().NotBeNull();
    }

    [Fact]
    public void OpeningHoursOn_ACustomHolidayUsesItsOwnHours()
    {
        var result = NineToFive.OpeningHoursOn(
            new DateOnly(2027, 2, 4),
            Schedule(Holiday("Stocktake", "2027-02-03", "2027-02-05",
                HolidayHoursMode.Custom, false, Range("09:00", "12:00"))));

        result.Ranges.Should().HaveCount(1);
        result.Ranges[0].End.Should().Be(TimeSpan.FromHours(12));
    }

    [Fact]
    public void OpeningHoursOn_HolidayRangesAreInclusiveOfBothEnds()
    {
        var schedule = Schedule(Holiday("Shutdown", "2026-12-27", "2026-12-29"));

        NineToFive.OpeningHoursOn(new DateOnly(2026, 12, 26), schedule).Holiday.Should().BeNull();
        NineToFive.OpeningHoursOn(new DateOnly(2026, 12, 27), schedule).Holiday.Should().NotBeNull();
        NineToFive.OpeningHoursOn(new DateOnly(2026, 12, 29), schedule).Holiday.Should().NotBeNull();
        NineToFive.OpeningHoursOn(new DateOnly(2026, 12, 30), schedule).Holiday.Should().BeNull();
    }

    [Fact]
    public void OpeningHoursOn_AYearlyHolidayMatchesInALaterYear()
    {
        var schedule = Schedule(Holiday("Christmas", "2020-12-25", "2020-12-25", repeat: true));

        NineToFive.OpeningHoursOn(new DateOnly(2026, 12, 25), schedule).Holiday.Should().NotBeNull();
    }

    [Fact]
    public void OpeningHoursOn_AYearlyHolidayStartingInDecemberStillMatchesInJanuary()
    {
        // This is why the previous year's occurrence has to be tested too.
        var schedule = Schedule(Holiday("Shutdown", "2020-12-27", "2021-01-02", repeat: true));

        NineToFive.OpeningHoursOn(new DateOnly(2027, 1, 1), schedule).Holiday.Should().NotBeNull();
        NineToFive.OpeningHoursOn(new DateOnly(2026, 12, 28), schedule).Holiday.Should().NotBeNull();
        NineToFive.OpeningHoursOn(new DateOnly(2027, 1, 3), schedule).Holiday.Should().BeNull();
    }

    [Fact]
    public void OpeningHoursOn_AYearlyLeapDayHolidayClampsToThe28thInANonLeapYear()
    {
        // .NET's AddYears clamps 29 Feb to the 28th, which is the behaviour we want.
        var schedule = Schedule(Holiday("Leap day", "2024-02-29", "2024-02-29", repeat: true));

        NineToFive.OpeningHoursOn(new DateOnly(2026, 2, 28), schedule).Holiday.Should().NotBeNull();
        NineToFive.OpeningHoursOn(new DateOnly(2026, 3, 1), schedule).Holiday.Should().BeNull();
    }

    [Fact]
    public void OpeningHoursOn_ANonRepeatingHolidayDoesNotMatchAnotherYear()
    {
        var schedule = Schedule(Holiday("One off", "2020-12-25", "2020-12-25"));

        NineToFive.OpeningHoursOn(new DateOnly(2026, 12, 25), schedule).Holiday.Should().BeNull();
    }

    [Fact]
    public void OpeningHoursOn_TheEarliestStartingHolidayWinsWhenSeveralMatch()
    {
        var schedule = Schedule(
            Holiday("Later", "2026-12-24", "2026-12-26"),
            Holiday("Earlier", "2026-12-20", "2026-12-31", HolidayHoursMode.Default));

        NineToFive.OpeningHoursOn(new DateOnly(2026, 12, 25), schedule)
            .Holiday!.Name.Should().Be("Earlier");
    }

    [Fact]
    public void OpeningHoursOn_TiesBreakOnListOrder()
    {
        var schedule = Schedule(
            Holiday("First listed", "2026-12-25", "2026-12-25"),
            Holiday("Second listed", "2026-12-25", "2026-12-25", HolidayHoursMode.Default));

        NineToFive.OpeningHoursOn(new DateOnly(2026, 12, 25), schedule)
            .Holiday!.Name.Should().Be("First listed");
    }

    [Fact]
    public void OpeningHoursOn_ADayWithNoWeeklyRangesIsClosed()
    {
        var result = ClosedAllWeek.OpeningHoursOn(new DateOnly(2026, 8, 20));

        result.IsOpen.Should().BeFalse();
        result.Ranges.Should().BeEmpty();
    }

    [Fact]
    public void OpeningHoursOn_AnEmptyWeeklyScheduleIsClosedRatherThanThrowing()
    {
        Array.Empty<WeeklyHoursDay>().OpeningHoursOn(new DateOnly(2026, 8, 20))
            .IsOpen.Should().BeFalse();
    }

    [Theory]
    [InlineData("08:59", false)]
    [InlineData("09:00", true)]
    [InlineData("12:00", true)]
    [InlineData("16:59", true)]
    [InlineData("17:00", false)]  // closing at 17:00 means shut at exactly 17:00
    [InlineData("23:59", false)]
    public void IsOpenAt_TreatsARangeAsStartInclusiveEndExclusive(string time, bool expected)
    {
        var instant = new DateTime(2026, 8, 20).Add(TimeSpan.Parse(time));

        NineToFive.IsOpenAt(instant).Should().Be(expected);
    }

    [Theory]
    [InlineData("18:00", true)]
    [InlineData("23:59", true)]
    public void IsOpenAt_ARangeEndingAtMidnightCoversEveryInstantToTheEndOfTheDay(
        string time, bool expected)
    {
        var openTillMidnight = new[]
        {
            new WeeklyHoursDay { Day = DayOfWeek.Thursday, Ranges = [Range("18:00", "24:00")] },
        };

        openTillMidnight.IsOpenAt(new DateTime(2026, 8, 20).Add(TimeSpan.Parse(time)))
            .Should().BeTrue(because: $"{time} is before midnight");
    }

    [Fact]
    public void IsOpenAt_AClosedHolidayShutsADayThatWouldOtherwiseBeOpen()
    {
        var instant = new DateTime(2026, 12, 25, 12, 0, 0);

        NineToFive.IsOpenAt(instant).Should().BeTrue("25 December 2026 is a Friday");
        NineToFive.IsOpenAt(instant, Schedule(Holiday("Christmas", "2026-12-25", "2026-12-25")))
            .Should().BeFalse();
    }

    [Fact]
    public void IsOpenAt_UsesTheHolidayHoursNotTheWeeklyOnes()
    {
        var schedule = Schedule(Holiday("Boxing week", "2026-12-27", "2026-12-31",
            HolidayHoursMode.Default));

        // Default hours are 10:00-14:00, weekly are 09:00-17:00.
        NineToFive.IsOpenAt(new DateTime(2026, 12, 28, 9, 30, 0), schedule).Should().BeFalse();
        NineToFive.IsOpenAt(new DateTime(2026, 12, 28, 11, 0, 0), schedule).Should().BeTrue();
        NineToFive.IsOpenAt(new DateTime(2026, 12, 28, 16, 0, 0), schedule).Should().BeFalse();
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test OpenOrClosed.slnx --filter OpeningHoursExtensionsTests`
Expected: FAIL — build error, `OpeningHoursExtensions` and `OpeningHoursForDate` do not exist.

- [ ] **Step 3: Write minimal implementation**

`OpenOrClosed/Models/OpeningHoursForDate.cs`:

```csharp
namespace OpenOrClosed.Core.Models;

/// <summary>The opening hours that apply on one date, after holidays have been taken into account.</summary>
public sealed class OpeningHoursForDate
{
    public DateOnly Date { get; init; }

    public bool IsOpen { get; init; }

    public IReadOnlyList<HoursRange> Ranges { get; init; } = [];

    /// <summary>Set when a holiday applied on this date, otherwise null.</summary>
    public Holiday? Holiday { get; init; }
}
```

`OpenOrClosed/Extensions/OpeningHoursExtensions.cs`:

```csharp
using OpenOrClosed.Core.Models;

namespace OpenOrClosed.Core.Extensions;

/// <summary>
/// Combines a weekly schedule with a holiday schedule. The two live in separate properties, so
/// something has to decide that a holiday beats the weekly hours - this is that, shipped as pure
/// extension methods rather than a service so consumers need no DI.
/// </summary>
public static class OpeningHoursExtensions
{
    /// <summary>Resolves the hours that apply on <paramref name="date"/>.</summary>
    /// <remarks>A matching holiday replaces that day's weekly hours entirely.</remarks>
    public static OpeningHoursForDate OpeningHoursOn(
        this IEnumerable<WeeklyHoursDay> weekly, DateOnly date, HolidaySchedule? holidays = null)
    {
        var holiday = MatchingHoliday(holidays, date);

        var ranges = holiday is null
            ? WeeklyRanges(weekly, date.DayOfWeek)
            : HolidayRanges(holiday, holidays);

        return new OpeningHoursForDate
        {
            Date = date,
            IsOpen = ranges.Count > 0,
            Ranges = ranges,
            Holiday = holiday,
        };
    }

    /// <summary>Whether the business is open at <paramref name="instant"/>.</summary>
    /// <remarks>
    /// A range is treated as <c>Start &lt;= t &lt; End</c>, so closing at 17:00 means shut at
    /// exactly 17:00. A range ending at 24:00 covers every instant up to midnight.
    /// </remarks>
    public static bool IsOpenAt(
        this IEnumerable<WeeklyHoursDay> weekly, DateTime instant, HolidaySchedule? holidays = null)
    {
        var today = weekly.OpeningHoursOn(DateOnly.FromDateTime(instant), holidays);
        var time = instant.TimeOfDay;

        return today.Ranges.Any(range => range.Start <= time && time < range.End);
    }

    private static IReadOnlyList<HoursRange> WeeklyRanges(
        IEnumerable<WeeklyHoursDay> weekly, DayOfWeek day)
        => weekly.FirstOrDefault(entry => entry.Day == day)?.Ranges ?? [];

    private static IReadOnlyList<HoursRange> HolidayRanges(
        Holiday holiday, HolidaySchedule? holidays)
        => holiday.HoursMode switch
        {
            // An empty default track means a Default holiday is closed - the intended reading.
            HolidayHoursMode.Default => holidays?.DefaultHours ?? [],
            HolidayHoursMode.Custom => holiday.Hours,
            _ => [],
        };

    /// <summary>
    /// The holiday covering <paramref name="date"/> whose occurrence starts earliest, ties
    /// breaking on list order.
    /// </summary>
    private static Holiday? MatchingHoliday(HolidaySchedule? holidays, DateOnly date)
    {
        Holiday? best = null;
        DateOnly bestStart = default;

        foreach (var holiday in holidays?.Holidays ?? [])
        {
            if (!Covers(holiday, date, out var occurrenceStart))
            {
                continue;
            }

            // Strictly earlier, so an equal start leaves the earlier list entry in place.
            if (best is null || occurrenceStart < bestStart)
            {
                best = holiday;
                bestStart = occurrenceStart;
            }
        }

        return best;
    }

    /// <summary>
    /// Whether <paramref name="holiday"/> covers <paramref name="date"/>, reporting which
    /// occurrence matched so callers can compare starts.
    /// </summary>
    private static bool Covers(Holiday holiday, DateOnly date, out DateOnly occurrenceStart)
    {
        occurrenceStart = holiday.Start;

        if (!holiday.RepeatYearly)
        {
            return date >= holiday.Start && date <= holiday.End;
        }

        // Test this year's occurrence and the previous one: a range beginning in December has to
        // still match in January. AddYears clamps 29 February to the 28th, which is desired.
        var offset = date.Year - holiday.Start.Year;

        foreach (var years in (int[])[offset, offset - 1])
        {
            var start = holiday.Start.AddYears(years);
            var end = holiday.End.AddYears(years);

            if (date >= start && date <= end)
            {
                occurrenceStart = start;
                return true;
            }
        }

        return false;
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `dotnet test OpenOrClosed.slnx --filter OpeningHoursExtensionsTests`
Expected: PASS — 26 tests.

- [ ] **Step 5: Run the whole server suite and commit**

Run: `dotnet test OpenOrClosed.slnx`
Expected: PASS — all prior tests still green.

```bash
git add OpenOrClosed/Models/OpeningHoursForDate.cs \
        OpenOrClosed/Extensions/OpeningHoursExtensions.cs \
        tests/OpenOrClosed.Tests/Extensions/OpeningHoursExtensionsTests.cs
git commit -m "feat: add OpeningHoursOn and IsOpenAt combining extension methods"
```

---

## Task 5: Client-side holiday logic

**Files:**
- Create: `OpenOrClosed/Client/src/holidays/holiday.ts`
- Test: `OpenOrClosed/Client/src/holidays/holiday.test.ts`

**Interfaces:**
- Consumes: `HoursRange`, `sanitizeRanges` from `../timeline/time-range.js`.
- Produces: types `HolidayHoursMode`, `Holiday`, `HolidaySchedule`; functions `todayIso()`, `isValidDate()`, `compareDates()`, `isExpired()`, `validateHoliday()`, `emptyHoliday()`, `sanitizeSchedule()`, `sortHolidays()`, `formatDateRange()`.

**Why this is a separate pure module:** the same reason `time-range.ts` is. vitest here runs without a DOM, so every non-trivial rule must live outside the Lit elements to be testable at all.

- [ ] **Step 1: Write the failing test**

Create `OpenOrClosed/Client/src/holidays/holiday.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
    compareDates,
    emptyHoliday,
    formatDateRange,
    isExpired,
    isValidDate,
    sanitizeSchedule,
    sortHolidays,
    validateHoliday,
    type Holiday,
} from './holiday.js';

const holiday = (overrides: Partial<Holiday> = {}): Holiday => ({
    ...emptyHoliday('2026-08-20'),
    name: 'Stocktake',
    start: '2026-08-20',
    end: '2026-08-22',
    ...overrides,
});

describe('isValidDate', () => {
    it.each(['2026-08-20', '2024-02-29', '2026-12-31'])('accepts %s', (value) => {
        expect(isValidDate(value)).toBe(true);
    });

    it.each(['', '20-08-2026', '2026-13-01', '2026-02-30', '2026-8-2', 'nonsense', '2026-02-29'])(
        'rejects %s',
        (value) => {
            expect(isValidDate(value)).toBe(false);
        },
    );
});

describe('compareDates', () => {
    it('orders ISO dates lexicographically, which is chronological', () => {
        expect(compareDates('2026-01-02', '2026-01-10')).toBeLessThan(0);
        expect(compareDates('2027-01-01', '2026-12-31')).toBeGreaterThan(0);
        expect(compareDates('2026-08-20', '2026-08-20')).toBe(0);
    });
});

describe('isExpired', () => {
    const today = '2026-08-20';

    it('is false for a holiday ending today', () => {
        expect(isExpired(holiday({ start: '2026-08-18', end: today }), today)).toBe(false);
    });

    it('is true for a holiday that ended yesterday', () => {
        expect(isExpired(holiday({ start: '2026-08-17', end: '2026-08-19' }), today)).toBe(true);
    });

    it('is false for a future holiday', () => {
        expect(isExpired(holiday({ start: '2027-01-01', end: '2027-01-02' }), today)).toBe(false);
    });

    it('is never true for a repeating holiday, however old', () => {
        expect(
            isExpired(holiday({ start: '2001-12-25', end: '2001-12-25', repeatYearly: true }), today),
        ).toBe(false);
    });
});

describe('validateHoliday', () => {
    it('accepts a well-formed holiday', () => {
        expect(validateHoliday(holiday())).toBeNull();
    });

    it('requires a name', () => {
        expect(validateHoliday(holiday({ name: '   ' }))).toBe('A name is required');
    });

    it('requires valid dates', () => {
        expect(validateHoliday(holiday({ start: '' }))).toBe('A valid start date is required');
        expect(validateHoliday(holiday({ end: 'nope' }))).toBe('A valid end date is required');
    });

    it('requires the end on or after the start', () => {
        expect(validateHoliday(holiday({ start: '2026-08-22', end: '2026-08-20' }))).toBe(
            'The end date must be on or after the start date',
        );
    });

    it('accepts a single-day holiday', () => {
        expect(validateHoliday(holiday({ start: '2026-08-20', end: '2026-08-20' }))).toBeNull();
    });

    it('requires at least one range when the mode is custom', () => {
        expect(validateHoliday(holiday({ hoursMode: 'custom', hours: [] }))).toBe(
            'Custom hours need at least one set of hours',
        );
    });

    it('ignores empty hours when the mode is not custom', () => {
        expect(validateHoliday(holiday({ hoursMode: 'closed', hours: [] }))).toBeNull();
        expect(validateHoliday(holiday({ hoursMode: 'default', hours: [] }))).toBeNull();
    });
});

describe('sanitizeSchedule', () => {
    it('turns null into an empty schedule', () => {
        expect(sanitizeSchedule(null)).toEqual({ defaultHours: [], holidays: [] });
    });

    it('turns junk into an empty schedule rather than throwing', () => {
        expect(sanitizeSchedule('nonsense')).toEqual({ defaultHours: [], holidays: [] });
        expect(sanitizeSchedule(42)).toEqual({ defaultHours: [], holidays: [] });
        expect(sanitizeSchedule({ defaultHours: 'no', holidays: 'no' })).toEqual({
            defaultHours: [],
            holidays: [],
        });
    });

    it('keeps well-formed entries', () => {
        const result = sanitizeSchedule({
            defaultHours: [{ start: '10:00', end: '14:00' }],
            holidays: [
                {
                    name: 'Christmas',
                    start: '2026-12-25',
                    end: '2026-12-25',
                    repeatYearly: true,
                    hoursMode: 'closed',
                    hours: [],
                },
            ],
        });

        expect(result.defaultHours).toHaveLength(1);
        expect(result.holidays).toHaveLength(1);
        expect(result.holidays[0].repeatYearly).toBe(true);
        expect(result.holidays[0].hoursMode).toBe('closed');
    });

    it('drops holidays with unusable dates', () => {
        const result = sanitizeSchedule({
            holidays: [
                { name: 'Bad', start: 'nope', end: 'nope', hoursMode: 'closed' },
                { name: 'Good', start: '2026-12-25', end: '2026-12-25', hoursMode: 'closed' },
            ],
        });

        expect(result.holidays.map((h) => h.name)).toEqual(['Good']);
    });

    it('falls back to default for an unrecognised mode', () => {
        const result = sanitizeSchedule({
            holidays: [{ name: 'Odd', start: '2026-12-25', end: '2026-12-25', hoursMode: 'sideways' }],
        });

        expect(result.holidays[0].hoursMode).toBe('default');
    });

    it('swaps a reversed date pair rather than dropping the holiday', () => {
        const result = sanitizeSchedule({
            holidays: [
                { name: 'Reversed', start: '2026-12-31', end: '2026-12-01', hoursMode: 'closed' },
            ],
        });

        expect(result.holidays[0].start).toBe('2026-12-01');
        expect(result.holidays[0].end).toBe('2026-12-31');
    });
});

describe('sortHolidays', () => {
    it('orders by start date, then by name', () => {
        const sorted = sortHolidays([
            holiday({ name: 'Later', start: '2027-01-01', end: '2027-01-01' }),
            holiday({ name: 'Beta', start: '2026-08-20', end: '2026-08-20' }),
            holiday({ name: 'Alpha', start: '2026-08-20', end: '2026-08-20' }),
        ]);

        expect(sorted.map((h) => h.name)).toEqual(['Alpha', 'Beta', 'Later']);
    });

    it('does not mutate its argument', () => {
        const input = [
            holiday({ name: 'B', start: '2027-01-01' }),
            holiday({ name: 'A', start: '2026-01-01' }),
        ];

        sortHolidays(input);

        expect(input.map((h) => h.name)).toEqual(['B', 'A']);
    });
});

describe('formatDateRange', () => {
    it('shows a single date once', () => {
        expect(formatDateRange(holiday({ start: '2026-12-25', end: '2026-12-25' }))).toBe('2026-12-25');
    });

    it('shows both ends of a real range', () => {
        expect(formatDateRange(holiday({ start: '2026-12-27', end: '2027-01-02' }))).toBe(
            '2026-12-27 – 2027-01-02',
        );
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd OpenOrClosed/Client && npx vitest run src/holidays/holiday.test.ts`
Expected: FAIL — cannot resolve `./holiday.js`.

- [ ] **Step 3: Write minimal implementation**

Create `OpenOrClosed/Client/src/holidays/holiday.ts`:

```ts
import { sanitizeRanges, type HoursRange } from '../timeline/time-range.js';

export type HolidayHoursMode = 'default' | 'closed' | 'custom';

const MODES: HolidayHoursMode[] = ['default', 'closed', 'custom'];

export interface Holiday {
    name: string;
    /** ISO `YYYY-MM-DD`. */
    start: string;
    /** ISO `YYYY-MM-DD`, inclusive. */
    end: string;
    repeatYearly: boolean;
    hoursMode: HolidayHoursMode;
    /** Ignored unless `hoursMode` is `custom`. */
    hours: HoursRange[];
}

export interface HolidaySchedule {
    defaultHours: HoursRange[];
    holidays: Holiday[];
}

/** Today as ISO `YYYY-MM-DD` in the browser's own timezone, not UTC. */
export function todayIso(): string {
    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * Whether `value` is a real calendar date in ISO form. Rejects 2026-02-29, which `Date` would
 * silently roll forward to 1 March.
 */
export function isValidDate(value: unknown): value is string {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

    const [year, month, day] = value.split('-').map(Number);
    if (month < 1 || month > 12 || day < 1) return false;

    // Day 0 of the next month is the last day of this one.
    return day <= new Date(year, month, 0).getDate();
}

/** ISO dates sort lexicographically, so no parsing is needed to compare them. */
export function compareDates(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}

/** A repeating holiday never expires, because it recurs. Mirrors the server rule exactly. */
export function isExpired(holiday: Holiday, today: string): boolean {
    return !holiday.repeatYearly && compareDates(holiday.end, today) < 0;
}

export function emptyHoliday(today: string): Holiday {
    return { name: '', start: today, end: today, repeatYearly: false, hoursMode: 'default', hours: [] };
}

/** Returns the first problem with `holiday`, or null when it is fit to save. */
export function validateHoliday(holiday: Holiday): string | null {
    if (holiday.name.trim().length === 0) return 'A name is required';
    if (!isValidDate(holiday.start)) return 'A valid start date is required';
    if (!isValidDate(holiday.end)) return 'A valid end date is required';
    if (compareDates(holiday.end, holiday.start) < 0) {
        return 'The end date must be on or after the start date';
    }
    if (holiday.hoursMode === 'custom' && holiday.hours.length === 0) {
        return 'Custom hours need at least one set of hours';
    }

    return null;
}

function sanitizeMode(raw: unknown): HolidayHoursMode {
    const value = typeof raw === 'string' ? (raw.toLowerCase() as HolidayHoursMode) : 'default';
    return MODES.includes(value) ? value : 'default';
}

function sanitizeHoliday(raw: unknown): Holiday | null {
    if (raw === null || typeof raw !== 'object') return null;

    const source = raw as Record<string, unknown>;
    if (!isValidDate(source.start) || !isValidDate(source.end)) return null;

    // A reversed pair is a fixable mistake, so swap rather than discard the holiday.
    const [start, end] =
        compareDates(source.start, source.end) <= 0
            ? [source.start, source.end]
            : [source.end, source.start];

    return {
        name: typeof source.name === 'string' ? source.name : '',
        start,
        end,
        repeatYearly: source.repeatYearly === true,
        hoursMode: sanitizeMode(source.hoursMode),
        hours: sanitizeRanges(source.hours),
    };
}

/** Coerces a stored value of unknown provenance into a usable schedule. */
export function sanitizeSchedule(raw: unknown): HolidaySchedule {
    if (raw === null || typeof raw !== 'object') return { defaultHours: [], holidays: [] };

    const source = raw as Record<string, unknown>;
    const holidays = Array.isArray(source.holidays) ? source.holidays : [];

    return {
        defaultHours: sanitizeRanges(source.defaultHours),
        holidays: holidays.map(sanitizeHoliday).filter((holiday): holiday is Holiday => holiday !== null),
    };
}

/** Start date first, then name, so the table has a stable order. */
export function sortHolidays(holidays: Holiday[]): Holiday[] {
    return [...holidays].sort(
        (left, right) =>
            compareDates(left.start, right.start) || left.name.localeCompare(right.name),
    );
}

export function formatDateRange(holiday: Holiday): string {
    return holiday.start === holiday.end ? holiday.start : `${holiday.start} – ${holiday.end}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd OpenOrClosed/Client && npm test`
Expected: PASS — the 64 existing `time-range` tests plus the new `holiday` tests.

- [ ] **Step 5: Commit**

```bash
git add OpenOrClosed/Client/src/holidays/holiday.ts OpenOrClosed/Client/src/holidays/holiday.test.ts
git commit -m "feat: add pure client-side holiday logic with tests"
```

---

## Task 6: Holiday editing modal

**Files:**
- Create: `OpenOrClosed/Client/src/holidays/holiday-modal.token.ts`
- Create: `OpenOrClosed/Client/src/holidays/ooc-holiday-modal.element.ts`

**Interfaces:**
- Consumes: `Holiday`, `HolidayHoursMode`, `validateHoliday`, `emptyHoliday`, `todayIso` from `./holiday.js`; `HoursRange`, `sanitizeRanges` from `../timeline/time-range.js`; `<ooc-timeline>` from `../timeline/ooc-timeline.element.js`; `OOC_RANGE_MODAL` from `../timeline/range-modal.token.js`.
- Produces: `OocHolidayModalData { holiday, defaultHours, use24Hour, showAppointmentOnly }`, `OocHolidayModalValue { holiday: Holiday | null }` (null means remove), `OOC_HOLIDAY_MODAL`, element `ooc-holiday-modal`.

**Two conventions this must follow, both learned the hard way:**
1. **Seed form state from `data` behind a `#seeded` guard in `willUpdate`.** `UmbModalBaseElement` sets `data` asynchronously, so reading it in `connectedCallback` gets undefined. Copy the pattern in `ooc-range-modal.element.ts`.
2. **A removal comes back as `holiday: null`,** the same way the range modal returns a shorter array. Do not invent a separate `removed` flag.

- [ ] **Step 1: Write the token**

Create `OpenOrClosed/Client/src/holidays/holiday-modal.token.ts`:

```ts
import { UmbModalToken } from '@umbraco-cms/backoffice/modal';
import type { HoursRange } from '../timeline/time-range.js';
import type { Holiday } from './holiday.js';

export interface OocHolidayModalData {
    /** The holiday being edited. A new one arrives already defaulted. */
    holiday: Holiday;
    /** Shown read-only when the mode is Default, so the editor can see what it resolves to. */
    defaultHours: HoursRange[];
    use24Hour: boolean;
    showAppointmentOnly: boolean;
}

export interface OocHolidayModalValue {
    /** Null means the editor asked to remove this holiday. */
    holiday: Holiday | null;
}

export const OOC_HOLIDAY_MODAL = new UmbModalToken<OocHolidayModalData, OocHolidayModalValue>(
    'OpenOrClosed.Modal.Holiday',
    {
        modal: {
            type: 'sidebar',
            size: 'small',
        },
    },
);
```

- [ ] **Step 2: Read the existing modal to copy its conventions**

Run: `sed -n '1,80p' OpenOrClosed/Client/src/timeline/ooc-range-modal.element.ts`
Expected: shows the `UmbModalBaseElement` base class, the `#seeded` guard in `willUpdate`, and how `_submitModal` / `_rejectModal` are called. Match them.

- [ ] **Step 3: Write the modal element**

Create `OpenOrClosed/Client/src/holidays/ooc-holiday-modal.element.ts`:

```ts
import { css, customElement, html, state } from '@umbraco-cms/backoffice/external/lit';
import { umbOpenModal } from '@umbraco-cms/backoffice/modal';
import { UmbModalBaseElement } from '@umbraco-cms/backoffice/modal';
import { sanitizeRanges, type HoursRange } from '../timeline/time-range.js';
import { OOC_RANGE_MODAL } from '../timeline/range-modal.token.js';
import '../timeline/ooc-timeline.element.js';
import { emptyHoliday, todayIso, validateHoliday, type HolidayHoursMode } from './holiday.js';
import type { OocHolidayModalData, OocHolidayModalValue } from './holiday-modal.token.js';

const MODES: Array<{ value: HolidayHoursMode; label: string }> = [
    { value: 'default', label: 'Default' },
    { value: 'closed', label: 'Closed' },
    { value: 'custom', label: 'Custom' },
];

@customElement('ooc-holiday-modal')
export class OocHolidayModalElement extends UmbModalBaseElement<
    OocHolidayModalData,
    OocHolidayModalValue
> {
    @state() private _name = '';
    @state() private _start = '';
    @state() private _end = '';
    @state() private _repeatYearly = false;
    @state() private _hoursMode: HolidayHoursMode = 'default';
    @state() private _hours: HoursRange[] = [];
    @state() private _error: string | null = null;

    /** `data` arrives asynchronously, so seed once on first sight rather than in connectedCallback. */
    #seeded = false;

    protected override willUpdate(changed: Map<string, unknown>) {
        super.willUpdate(changed);
        if (this.#seeded || !this.data) return;

        const holiday = this.data.holiday ?? emptyHoliday(todayIso());
        this._name = holiday.name;
        this._start = holiday.start;
        this._end = holiday.end;
        this._repeatYearly = holiday.repeatYearly;
        this._hoursMode = holiday.hoursMode;
        this._hours = sanitizeRanges(holiday.hours);
        this.#seeded = true;
    }

    private get _current() {
        return {
            name: this._name,
            start: this._start,
            end: this._end,
            repeatYearly: this._repeatYearly,
            hoursMode: this._hoursMode,
            hours: this._hours,
        };
    }

    private async _editRange(index: number) {
        try {
            const result = await umbOpenModal(this, OOC_RANGE_MODAL, {
                data: {
                    ranges: this._hours,
                    index,
                    use24Hour: this.data?.use24Hour ?? true,
                    showAppointmentOnly: this.data?.showAppointmentOnly ?? false,
                },
            });
            this._hours = result.ranges;
        } catch {
            // Dismissed - leave the hours alone.
        }
    }

    private _save() {
        this._error = validateHoliday(this._current);
        if (this._error) return;

        this.value = { holiday: this._current };
        this._submitModal();
    }

    private _remove() {
        this.value = { holiday: null };
        this._submitModal();
    }

    static override styles = css`
        :host {
            display: block;
        }
        .field {
            display: flex;
            flex-direction: column;
            gap: var(--uui-size-space-1);
            margin-bottom: var(--uui-size-space-4);
        }
        .dates {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: var(--uui-size-space-3);
        }
        .error {
            color: var(--uui-color-danger);
            font-size: var(--uui-type-small-size);
            margin-bottom: var(--uui-size-space-3);
        }
        .hint {
            color: var(--uui-color-text-alt);
            font-size: var(--uui-type-small-size);
        }
    `;

    override render() {
        return html`
            <umb-body-layout headline=${this._name || 'Holiday'}>
                <div class="field">
                    <uui-label for="name">Name</uui-label>
                    <uui-input
                        id="name"
                        .value=${this._name}
                        @input=${(e: InputEvent) =>
                            (this._name = (e.target as HTMLInputElement).value)}></uui-input>
                </div>

                <div class="field dates">
                    <div>
                        <uui-label for="start">Start</uui-label>
                        <uui-input
                            id="start"
                            type="date"
                            .value=${this._start}
                            @change=${(e: Event) =>
                                (this._start = (e.target as HTMLInputElement).value)}></uui-input>
                    </div>
                    <div>
                        <uui-label for="end">End</uui-label>
                        <uui-input
                            id="end"
                            type="date"
                            .value=${this._end}
                            @change=${(e: Event) =>
                                (this._end = (e.target as HTMLInputElement).value)}></uui-input>
                    </div>
                </div>

                <div class="field">
                    <uui-toggle
                        label="Repeat yearly"
                        ?checked=${this._repeatYearly}
                        @change=${() => (this._repeatYearly = !this._repeatYearly)}></uui-toggle>
                    <span class="hint">A repeating holiday never expires.</span>
                </div>

                <div class="field">
                    <uui-label>Hours</uui-label>
                    <uui-button-group>
                        ${MODES.map(
                            (mode) => html`
                                <uui-button
                                    look=${this._hoursMode === mode.value ? 'primary' : 'outline'}
                                    label=${mode.label}
                                    @click=${() => (this._hoursMode = mode.value)}></uui-button>
                            `,
                        )}
                    </uui-button-group>
                </div>

                ${this._hoursMode === 'custom'
                    ? html`
                          <div class="field">
                              <ooc-timeline
                                  .ranges=${this._hours}
                                  .use24Hour=${this.data?.use24Hour ?? true}
                                  .showAppointmentOnly=${this.data?.showAppointmentOnly ?? false}
                                  trackLabel=${this._name || 'Holiday'}
                                  @change=${(e: CustomEvent) => (this._hours = e.detail.ranges)}
                                  @edit-range=${(e: CustomEvent) =>
                                      this._editRange(e.detail.index)}></ooc-timeline>
                          </div>
                      `
                    : ''}
                ${this._hoursMode === 'default'
                    ? html`<span class="hint"
                          >Uses the default holiday hours. With no default hours set, this holiday is
                          closed.</span
                      >`
                    : ''}
                ${this._error ? html`<div class="error">${this._error}</div>` : ''}

                <div slot="actions">
                    <uui-button label="Remove" look="secondary" color="danger" @click=${this._remove}></uui-button>
                    <uui-button label="Cancel" @click=${() => this._rejectModal()}></uui-button>
                    <uui-button label="Save" look="primary" color="positive" @click=${this._save}></uui-button>
                </div>
            </umb-body-layout>
        `;
    }
}

export default OocHolidayModalElement;

declare global {
    interface HTMLElementTagNameMap {
        'ooc-holiday-modal': OocHolidayModalElement;
    }
}
```

- [ ] **Step 4: Verify it compiles**

Run: `cd OpenOrClosed/Client && npm run build`
Expected: PASS — `tsc` clean, Vite emits a new chunk. Fix any import-path or UUI element-name mismatches the compiler reports; the modal is not registered yet, so there is nothing to see in the backoffice at this step.

- [ ] **Step 5: Commit**

```bash
git add OpenOrClosed/Client/src/holidays/holiday-modal.token.ts \
        OpenOrClosed/Client/src/holidays/ooc-holiday-modal.element.ts
git commit -m "feat: add the holiday editing modal"
```

---

## Task 7: Holidays property editor element and manifests

**Files:**
- Create: `OpenOrClosed/Client/src/holidays/ooc-holidays.element.ts`
- Create: `OpenOrClosed/Client/src/holidays/manifest.ts`
- Modify: `OpenOrClosed/Client/src/bundle.manifests.ts`

**Interfaces:**
- Consumes: everything from `./holiday.js`, `OOC_HOLIDAY_MODAL`, `<ooc-timeline>`, `OOC_RANGE_MODAL`.
- Produces: element `ooc-holidays` registered as `OpenOrClosed.PropertyEditorUi.Holidays` against schema alias `OpenOrClosed.Holidays`, plus the `OpenOrClosed.Modal.Holiday` modal manifest.

**Two things the spec is emphatic about:**
1. **The editor still shows expired holidays,** dimmed and marked *Expired*, with an explicit **Remove expired** action. Hiding stored entries from the person maintaining them makes a mistyped date impossible to find. Nothing is deleted without asking.
2. **The stored value must round-trip.** Write `{ defaultHours, holidays }` exactly as the server reads it, and dispatch `property-value-change` — not a `composed` `change` event. See `umbraco-no-composed-change-events`.

- [ ] **Step 1: Write the element**

Create `OpenOrClosed/Client/src/holidays/ooc-holidays.element.ts`:

```ts
import { css, customElement, html, property } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { umbOpenModal } from '@umbraco-cms/backoffice/modal';
import type {
    UmbPropertyEditorConfigCollection,
    UmbPropertyEditorUiElement,
} from '@umbraco-cms/backoffice/property-editor';
import { parseTime, sanitizeRanges, type HoursRange } from '../timeline/time-range.js';
import { OOC_RANGE_MODAL } from '../timeline/range-modal.token.js';
import '../timeline/ooc-timeline.element.js';
import { OOC_HOLIDAY_MODAL } from './holiday-modal.token.js';
import {
    emptyHoliday,
    formatDateRange,
    isExpired,
    sanitizeSchedule,
    sortHolidays,
    todayIso,
    type Holiday,
    type HolidaySchedule,
} from './holiday.js';

@customElement('ooc-holidays')
export class OocHolidaysElement extends UmbLitElement implements UmbPropertyEditorUiElement {
    @property({ type: Object })
    value: HolidaySchedule = { defaultHours: [], holidays: [] };

    @property({ attribute: false })
    config?: UmbPropertyEditorConfigCollection;

    private _setting(alias: string): unknown {
        return this.config?.getValueByAlias(alias);
    }

    private get _use24Hour(): boolean {
        // Only an explicit false turns it off; an unset value keeps the 24-hour default.
        return this._setting('time_24hr') !== false;
    }

    private get _showAppointmentOnly(): boolean {
        return this._setting('showAppointmentOnly') === true;
    }

    private get _schedule(): HolidaySchedule {
        return sanitizeSchedule(this.value);
    }

    private _commit(schedule: HolidaySchedule) {
        this.value = schedule;
        this.dispatchEvent(new CustomEvent('property-value-change', { bubbles: true, composed: true }));
    }

    private _setDefaultHours(defaultHours: HoursRange[]) {
        this._commit({ ...this._schedule, defaultHours });
    }

    private _setHolidays(holidays: Holiday[]) {
        this._commit({ ...this._schedule, holidays });
    }

    private async _editDefaultRange(index: number) {
        const { defaultHours } = this._schedule;

        try {
            const result = await umbOpenModal(this, OOC_RANGE_MODAL, {
                data: {
                    ranges: defaultHours,
                    index,
                    use24Hour: this._use24Hour,
                    showAppointmentOnly: this._showAppointmentOnly,
                },
            });
            this._setDefaultHours(result.ranges);
        } catch {
            // Dismissed.
        }
    }

    /** `index` of -1 adds a new holiday. */
    private async _editHoliday(index: number) {
        const schedule = this._schedule;
        const holidays = sortHolidays(schedule.holidays);
        const holiday = index < 0 ? emptyHoliday(todayIso()) : holidays[index];

        try {
            const result = await umbOpenModal(this, OOC_HOLIDAY_MODAL, {
                data: {
                    holiday,
                    defaultHours: schedule.defaultHours,
                    use24Hour: this._use24Hour,
                    showAppointmentOnly: this._showAppointmentOnly,
                },
            });

            if (result.holiday === null) {
                this._setHolidays(holidays.filter((_, i) => i !== index));
                return;
            }

            this._setHolidays(
                index < 0
                    ? [...holidays, result.holiday]
                    : holidays.map((entry, i) => (i === index ? result.holiday! : entry)),
            );
        } catch {
            // Dismissed.
        }
    }

    private _removeExpired() {
        const today = todayIso();
        this._setHolidays(this._schedule.holidays.filter((holiday) => !isExpired(holiday, today)));
    }

    /** The pill in the Hours column: what this holiday actually resolves to. */
    private _hoursSummary(holiday: Holiday): string {
        if (holiday.hoursMode === 'closed') return 'Closed';
        if (holiday.hoursMode === 'default') return 'Default';

        const ranges = sanitizeRanges(holiday.hours);
        if (ranges.length === 0) return 'Closed';

        const first = ranges[0];
        const suffix = ranges.length > 1 ? ` +${ranges.length - 1}` : '';
        return `${first.start} – ${first.end}${suffix}`;
    }

    static styles = css`
        :host {
            display: block;
        }
        .section {
            margin-bottom: var(--uui-size-space-5);
        }
        .section-head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: var(--uui-size-space-2);
        }
        h4 {
            margin: 0;
            font-size: var(--uui-type-small-size);
        }
        table {
            width: 100%;
            border-collapse: collapse;
        }
        th {
            text-align: left;
            font-size: var(--uui-type-small-size);
            color: var(--uui-color-text-alt);
            font-weight: normal;
            padding: var(--uui-size-space-2);
            border-bottom: 1px solid var(--uui-color-border);
        }
        td {
            padding: var(--uui-size-space-2);
            border-bottom: 1px solid var(--uui-color-border);
            font-size: var(--uui-type-small-size);
        }
        tr.row {
            cursor: pointer;
        }
        tr.row:hover td {
            background: var(--uui-color-surface-alt);
        }
        tr.expired td {
            opacity: 0.6;
        }
        .pill {
            display: inline-block;
            padding: 0 var(--uui-size-space-2);
            border: 1px solid var(--uui-color-border);
            border-radius: 1em;
        }
        .empty {
            padding: var(--uui-size-space-4);
            color: var(--uui-color-text-alt);
            font-size: var(--uui-type-small-size);
        }
    `;

    private _renderRow(holiday: Holiday, index: number, today: string) {
        const expired = isExpired(holiday, today);

        return html`
            <tr class="row ${expired ? 'expired' : ''}" @click=${() => this._editHoliday(index)}>
                <td>${holiday.name}${expired ? html` <em>(Expired)</em>` : ''}</td>
                <td>${formatDateRange(holiday)}</td>
                <td>${holiday.repeatYearly ? 'Yes' : 'No'}</td>
                <td><span class="pill">${this._hoursSummary(holiday)}</span></td>
            </tr>
        `;
    }

    render() {
        const schedule = this._schedule;
        const holidays = sortHolidays(schedule.holidays);
        const today = todayIso();
        const hasExpired = holidays.some((holiday) => isExpired(holiday, today));

        return html`
            <div class="section">
                <div class="section-head"><h4>Default holiday hours</h4></div>
                <ooc-timeline
                    .ranges=${schedule.defaultHours}
                    .use24Hour=${this._use24Hour}
                    .showAppointmentOnly=${this._showAppointmentOnly}
                    trackLabel="Default holiday hours"
                    @change=${(e: CustomEvent) => this._setDefaultHours(e.detail.ranges)}
                    @edit-range=${(e: CustomEvent) => this._editDefaultRange(e.detail.index)}>
                </ooc-timeline>
            </div>

            <div class="section">
                <div class="section-head">
                    <h4>Holidays</h4>
                    ${hasExpired
                        ? html`<uui-button
                              look="secondary"
                              label="Remove expired"
                              @click=${this._removeExpired}></uui-button>`
                        : ''}
                </div>

                ${holidays.length === 0
                    ? html`<div class="empty">No holidays yet.</div>`
                    : html`
                          <table>
                              <thead>
                                  <tr>
                                      <th>Name</th>
                                      <th>Dates</th>
                                      <th>Yearly</th>
                                      <th>Hours</th>
                                  </tr>
                              </thead>
                              <tbody>
                                  ${holidays.map((holiday, index) =>
                                      this._renderRow(holiday, index, today),
                                  )}
                              </tbody>
                          </table>
                      `}

                <uui-button
                    look="placeholder"
                    label="+ Add holiday"
                    @click=${() => this._editHoliday(-1)}></uui-button>
            </div>
        `;
    }
}

export default OocHolidaysElement;

declare global {
    interface HTMLElementTagNameMap {
        'ooc-holidays': OocHolidaysElement;
    }
}
```

- [ ] **Step 2: Write the manifests**

Create `OpenOrClosed/Client/src/holidays/manifest.ts`:

```ts
export const manifests: Array<UmbExtensionManifest> = [
    {
        type: 'propertyEditorUi',
        alias: 'OpenOrClosed.PropertyEditorUi.Holidays',
        name: 'Holidays Property Editor UI',
        element: () => import('./ooc-holidays.element.js'),
        meta: {
            label: 'Holidays',
            icon: 'icon-calendar',
            group: 'richContent',
            propertyEditorSchemaAlias: 'OpenOrClosed.Holidays',
            settings: {
                properties: [
                    {
                        alias: 'removeExpiredHolidays',
                        label: 'Remove Expired Holidays?',
                        description:
                            'Hide holidays that have already finished from the converted value and the Delivery API. They stay visible in this editor so a mistyped date can still be corrected.',
                        propertyEditorUiAlias: 'Umb.PropertyEditorUi.Toggle',
                    },
                    {
                        alias: 'time_24hr',
                        label: 'Time Format',
                        description: '12/24 hour clock',
                        propertyEditorUiAlias: 'Umb.PropertyEditorUi.Toggle',
                    },
                    {
                        alias: 'showAppointmentOnly',
                        label: 'Enable Appointment Only?',
                        description: 'Show the appointment only option for a set of hours',
                        propertyEditorUiAlias: 'Umb.PropertyEditorUi.Toggle',
                    },
                ],
                defaultData: [
                    { alias: 'removeExpiredHolidays', value: true },
                    { alias: 'time_24hr', value: true },
                    { alias: 'showAppointmentOnly', value: false },
                ],
            },
        },
    },
    {
        type: 'modal',
        alias: 'OpenOrClosed.Modal.Holiday',
        name: 'Open Or Closed Holiday Modal',
        element: () => import('./ooc-holiday-modal.element.js'),
    },
];
```

- [ ] **Step 3: Register in the bundle**

Modify `OpenOrClosed/Client/src/bundle.manifests.ts` — add the import alphabetically and spread it into the array:

```ts
import { manifests as holidays } from './holidays/manifest'
```

```ts
export const manifests: Array<UmbExtensionManifest> = [
  ...standardHours,
  ...specialHours,
  ...weeklyHours,
  ...holidays,
  ...rangeModal,
  ...timeInput
];
```

- [ ] **Step 4: Build and verify**

Run: `cd OpenOrClosed/Client && npm run build && npm test`
Expected: `tsc` clean, Vite emits an `ooc-holidays.element` chunk, all vitest tests pass.

- [ ] **Step 5: Commit**

```bash
git add OpenOrClosed/Client/src/holidays/ooc-holidays.element.ts \
        OpenOrClosed/Client/src/holidays/manifest.ts \
        OpenOrClosed/Client/src/bundle.manifests.ts \
        OpenOrClosed/wwwroot/App_Plugins/OpenOrClosed/
git commit -m "feat: add the holidays property editor UI"
```

---

## Task 8: Manual verification and documentation

**Files:**
- Modify: `README.md`
- Create: `docs/superpowers/plans/2026-08-20-timeline-hours-editor-phase-2-checklist.md`

**Why this is a task and not a footnote:** the spec's Risks section names two documentation failures as the feature's main hazards — four hours-related editors with no guidance on which to pick, and consumers who read the weekly property alone and open on Christmas Day. Neither is fixed by code.

- [ ] **Step 1: Run both suites**

Run: `dotnet test OpenOrClosed.slnx` and `cd OpenOrClosed/Client && npm test`
Expected: PASS, both.

- [ ] **Step 2: Manual backoffice checklist**

Write the checklist to `docs/superpowers/plans/2026-08-20-timeline-hours-editor-phase-2-checklist.md`, then work through it against the test site. Tasks 6 and 7 have no automated coverage by design, so this pass is their only verification:

```markdown
# Phase 2 manual checklist

## Data type
- [ ] A new data type using **Holidays** saves its four settings and reopens with them intact.

## Default hours track
- [ ] Clicking empty track creates a range; dragging its edges resizes; dragging its middle moves it.
- [ ] Clicking a block opens the range sidebar; saving and removing both work.

## Holiday table
- [ ] `+ Add holiday` opens the sidebar with today's date prefilled and an empty name.
- [ ] Saving without a name shows "A name is required" and does not close the sidebar.
- [ ] An end date before the start date is rejected with the end-date message.
- [ ] Custom mode with no hours is rejected.
- [ ] Saving adds a row; the table is ordered by start date, then name.
- [ ] The Hours pill reads `Default`, `Closed`, or the first range's times with a `+N` suffix.
- [ ] Clicking a row reopens it with every field populated, including custom hours.
- [ ] Remove deletes that row and no other.

## Expiry
- [ ] A holiday whose end date is in the past renders dimmed and marked *(Expired)*.
- [ ] A past holiday with Repeat yearly on is **not** marked expired.
- [ ] **Remove expired** appears only when something is expired, and removes exactly those.

## Round trip
- [ ] Save the document, reload the page: every holiday, its mode and its custom hours survive.
- [ ] Navigating away straight after a save does **not** prompt "discard unsaved changes"
      (a dirty prompt here means the stored shape does not match what the editor writes).
- [ ] The browser console is clean during every drag — in particular no "Property Editor received
      a Change Event who's target is not the Property Editor Element".

## Server
- [ ] A Razor template calling `weekly.OpeningHoursOn(DateOnly.FromDateTime(DateTime.Now), holidays)`
      returns the holiday's hours on a holiday date and the weekly hours otherwise.
- [ ] `weekly.IsOpenAt(DateTime.Now, holidays)` agrees with the editor.
- [ ] With **Remove Expired Holidays** on, the Delivery API response omits expired holidays but
      still lists repeating ones.
- [ ] With it off, the Delivery API lists everything.
```

- [ ] **Step 3: Document the editors in the README**

Add a section covering, with a real code sample:
- The four hours editors and which to choose. `WeeklyHours` + `Holidays` for new sites; `StandardHours` + `SpecialHours` when comments, `reversed` mode or a Bank Holidays row are needed.
- That `WeeklyHours` and `Holidays` are **two separate properties**, and that reading the weekly one alone means opening on Christmas Day.
- `OpeningHoursOn` and `IsOpenAt`, including the `using OpenOrClosed.Core.Extensions;` import and a Razor sample passing both properties.
- That the weekly converter always returns seven days, so `@foreach` renders a full week.
- That `removeExpiredHolidays` affects the read path only — the editor still shows expired holidays.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/superpowers/plans/2026-08-20-timeline-hours-editor-phase-2-checklist.md
git commit -m "docs: document the timeline hours editors and how to combine them"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| Stored value `OpenOrClosed.Holidays` | 1 |
| Models: `HolidayHoursMode`, `Holiday`, `HolidaySchedule` | 1 |
| `"HH:mm"` JSON including `24:00` | 1 (reuses phase 1's `HoursTimeSpanJsonConverter`) |
| `hoursMode` explicit, not inferred | 1 |
| Holidays converter, both paths, never null | 3 |
| Cache level `None`; expiry not in the intermediate | 3 |
| Expired filtered on read; `removeExpiredHolidays` | 2, 3 |
| Injectable `today` | 3 |
| `OpeningHoursForDate`, `OpeningHoursOn`, `IsOpenAt` | 4 |
| Precedence, three modes, yearly matching, 29 Feb, boundaries | 4 |
| Data type settings | 2, 7 |
| Holidays editor UI: default track, table, pill, add | 7 |
| Holiday dialog + validation | 6 |
| Expired shown dimmed, **Remove expired** | 7 |
| Client architecture split | 5, 6, 7 |
| Testing (TS + C#) | 1–5 |
| Risks: README guidance | 8 |

**Deviations from the spec, deliberate:**
- The spec names the client files `ooc-range-dialog.element.ts` / `ooc-holiday-dialog.element.ts`. Phase 1 shipped `ooc-range-modal.element.ts` with a `UmbModalToken`, so this plan follows the code and uses `ooc-holiday-modal.element.ts`.
- `DataTypeConfig.Toggle` is new shared code rather than a refactor of `SpecialHoursConverter.RemoveOldDates`, because changing the existing converters is out of scope. The duplication is intentional and temporary.
- `sanitizeSchedule` swaps a reversed date pair rather than dropping the holiday, so a mistyped range stays visible and correctable — consistent with the spec's stance on expired holidays.

**Type consistency:** `HoursRange`, `Holiday`, `HolidaySchedule`, `HolidayHoursMode` are named identically across C# and TypeScript. `Project`, `Toggle`, `OpeningHoursOn`, `IsOpenAt`, `sanitizeSchedule`, `sortHolidays`, `isExpired`, `validateHoliday`, `emptyHoliday`, `todayIso`, `formatDateRange` are each defined in exactly one task and referenced by the same name thereafter.
