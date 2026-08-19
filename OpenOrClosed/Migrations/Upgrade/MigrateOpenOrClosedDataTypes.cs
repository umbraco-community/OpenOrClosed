using System.Text.Json.Serialization;
using Microsoft.Extensions.Logging;
using OpenOrClosed.Core.PropertyEditors;
using Umbraco.Cms.Core.Serialization;
using Umbraco.Cms.Core.Services;
using Umbraco.Cms.Infrastructure.Migrations;
using Umbraco.Cms.Infrastructure.Persistence.Dtos;
using Umbraco.Extensions;

namespace OpenOrClosed.Migrations.Upgrade;

internal sealed class MigrateOpenOrClosedDataTypes(IMigrationContext context, IKeyValueService keyValueService, IJsonSerializer jsonSerializer, ILogger<MigrateOpenOrClosedDataTypes> logger) : AsyncMigrationBase(context)
{
    public const string State = "{openorclosed-migrate-datatypes}";

    protected override Task MigrateAsync()
    {
        // Look up the pre-migration data for data editor splits
        var dataEditorSplitCollectionData = keyValueService.GetValue("migrateDataEditorSplitCollectionData");
        if (dataEditorSplitCollectionData.IsNullOrWhiteSpace())
        {
            return Task.CompletedTask;
        }
        DataTypeEditorAliasMigrationData[] migrationData = jsonSerializer.Deserialize<DataTypeEditorAliasMigrationData[]>(dataEditorSplitCollectionData) ?? [];

        // Work out the UI alias each of our Data Types should end up with. Depending on how the
        // Data Type was upgraded, our alias may have been recorded as the editor alias, the editor
        // UI alias, or both - so match on either.
        var uiAliasByDataTypeId = new Dictionary<int, string>();
        foreach (var data in migrationData)
        {
            var uiAlias = ToUiEditorAlias(data.EditorAlias) ?? ToUiEditorAlias(data.EditorUiAlias);
            if (uiAlias is not null)
            {
                uiAliasByDataTypeId[data.DataTypeId] = uiAlias;
            }
        }

        // Nothing of ours in this site - bail out before building a query with an empty IN () clause.
        if (uiAliasByDataTypeId.Count == 0)
        {
            return Task.CompletedTask;
        }

        List<int> mapsEditorIds = [.. uiAliasByDataTypeId.Keys];

        var sql = Sql()
            .Select<DataTypeDto>()
            .AndSelect<NodeDto>()
            .From<DataTypeDto>()
            .InnerJoin<NodeDto>()
            .On<DataTypeDto, NodeDto>(left => left.NodeId, right => right.NodeId)
            .Where<DataTypeDto>(x => mapsEditorIds.Contains(x.NodeId));

        var dataTypeDtos = Database.Fetch<DataTypeDto>(sql);

        foreach (var dataTypeDto in dataTypeDtos)
        {
            if (uiAliasByDataTypeId.TryGetValue(dataTypeDto.NodeId, out var uiEditorAlias) == false)
            {
                continue;
            }

            if (dataTypeDto.EditorUiAlias == uiEditorAlias)
            {
                continue;
            }

            if (logger.IsEnabled(LogLevel.Information))
            {
                logger.LogInformation("Updating EditorUiAlias for {alias} with DataTypeId {id} to {uiAlias}", dataTypeDto.EditorAlias, dataTypeDto.NodeId, uiEditorAlias);
            }

            dataTypeDto.EditorUiAlias = uiEditorAlias;
            _ = Database.Update(dataTypeDto);
        }

        return Task.CompletedTask;
    }

    private static string? ToUiEditorAlias(string? alias) => alias switch
    {
        SpecialHoursPropertyEditor.EditorAlias => SpecialHoursPropertyEditor.UiEditorAlias,
        StandardHoursPropertyEditor.EditorAlias => StandardHoursPropertyEditor.UiEditorAlias,
        _ => null,
    };

    private class DataTypeEditorAliasMigrationData
    {
        [JsonPropertyName("DataTypeId")]
        public int DataTypeId { get; set; }

        [JsonPropertyName("EditorUiAlias")]
        public string? EditorUiAlias { get; init; }

        [JsonPropertyName("EditorAlias")]
        public string? EditorAlias { get; init; }
    }
}
