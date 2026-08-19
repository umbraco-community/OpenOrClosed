using NSubstitute;
using Umbraco.Cms.Core.Models.PublishedContent;

namespace OpenOrClosed.Tests.TestDoubles;

/// <summary>
/// Builds the minimum <see cref="IPublishedPropertyType"/> the converters actually touch: the
/// editor alias, and a data type carrying the configuration dictionary.
/// </summary>
internal static class PropertyTypeStub
{
    internal static IPublishedPropertyType For(string editorAlias, Dictionary<string, object>? configuration = null)
    {
        var dataType = new PublishedDataType(1, editorAlias, null, new Lazy<object?>(() => configuration ?? []));

        var propertyType = Substitute.For<IPublishedPropertyType>();
        propertyType.EditorAlias.Returns(editorAlias);
        propertyType.DataType.Returns(dataType);

        return propertyType;
    }
}
