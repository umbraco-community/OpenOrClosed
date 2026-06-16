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

        // Look for the old Data Type id
        List<int> mapsEditorIds = [.. migrationData.Where(d => d.EditorUiAlias == SpecialHoursPropertyEditor.EditorAlias ||
                                                                d.EditorUiAlias == StandardHoursPropertyEditor.EditorAlias)
                                .Select(d => d.DataTypeId)];

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
            if (logger.IsEnabled(LogLevel.Information))
            {
                logger.LogInformation("Updating EditorUiAlias for {alias} with DataTypeId {id}", dataTypeDto.EditorAlias, dataTypeDto.NodeId);
            }
            if (dataTypeDto.EditorAlias == SpecialHoursPropertyEditor.EditorAlias)
            {
                dataTypeDto.EditorUiAlias = SpecialHoursPropertyEditor.UiEditorAlias;
            } 
            else if (dataTypeDto.EditorAlias == StandardHoursPropertyEditor.EditorAlias)
            {
                dataTypeDto.EditorUiAlias = StandardHoursPropertyEditor.UiEditorAlias;   
            }
            else
            {
                logger.LogWarning("Could not determine Property Editor for {alias} with DataTypeId {id}", dataTypeDto.EditorAlias, dataTypeDto.NodeId);
                continue;
            }
            _ = Database.Update(dataTypeDto);
        }
        
        return Task.CompletedTask;
    }
    
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