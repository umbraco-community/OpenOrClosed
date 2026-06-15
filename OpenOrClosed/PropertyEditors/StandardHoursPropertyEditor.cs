using Umbraco.Cms.Core.PropertyEditors;

namespace OpenOrClosed.Core.PropertyEditors;

[DataEditor(
    EditorAlias,
    ValueType = ValueTypes.Json,
    ValueEditorIsReusable = true)]
public class StandardHoursPropertyEditor(IDataValueEditorFactory dataValueEditorFactory) : DataEditor(dataValueEditorFactory)
{
    internal const string EditorAlias = "OpenOrClosed.StandardHours";
}
