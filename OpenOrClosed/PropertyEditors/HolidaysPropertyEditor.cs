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
