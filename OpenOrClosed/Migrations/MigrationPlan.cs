using OpenOrClosed.Migrations.Install;
using Umbraco.Cms.Core.Packaging;

namespace OpenOrClosed.Migrations;

internal sealed class MigrationPlan() : PackageMigrationPlan("OpenOrClosed")
{
    public override string InitialState => "{openorclosed-init-state}";

    protected override void DefinePlan()
    {
        From(InitialState)
            .To<RegisterUmbracoPackageEntry>(RegisterUmbracoPackageEntry.State)
            ;
    }
}