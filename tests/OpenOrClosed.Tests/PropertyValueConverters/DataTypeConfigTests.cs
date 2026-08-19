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

    [Fact]
    public void EditorAliases_AreTheOnesTheClientManifestReferences()
    {
        HolidaysPropertyEditor.EditorAlias.Should().Be("OpenOrClosed.Holidays");
        HolidaysPropertyEditor.UiEditorAlias.Should().Be("OpenOrClosed.PropertyEditorUi.Holidays");
    }
}
