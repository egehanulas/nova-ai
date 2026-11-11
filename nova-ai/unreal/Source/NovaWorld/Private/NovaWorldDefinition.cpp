#include "NovaWorldDefinition.h"

FPrimaryAssetId UNovaWorldDefinition::GetPrimaryAssetId() const
{
    return FPrimaryAssetId(FPrimaryAssetType(TEXT("NovaWorld")), GetFName());
}
