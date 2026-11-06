using UnrealBuildTool;
using System.Collections.Generic;

public class NovaWorldEditorTarget : TargetRules
{
    public NovaWorldEditorTarget(TargetInfo Target) : base(Target)
    {
        Type = TargetType.Editor;
        DefaultBuildSettings = BuildSettingsVersion.V7;
        IncludeOrderVersion = EngineIncludeOrderVersion.Unreal5_8;
        BuildEnvironment = TargetBuildEnvironment.Shared;
        bOverrideBuildEnvironment = true;
        ExtraModuleNames.Add("NovaWorld");
    }
}
