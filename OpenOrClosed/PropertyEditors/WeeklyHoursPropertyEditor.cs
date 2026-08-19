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
