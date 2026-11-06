#pragma once

#include "CoreMinimal.h"
#include "Engine/DataAsset.h"
#include "NovaWorldDefinition.generated.h"

class UWorld;

UCLASS(BlueprintType)
class NOVAWORLD_API UNovaWorldDefinition : public UPrimaryDataAsset
{
    GENERATED_BODY()

public:
    virtual FPrimaryAssetId GetPrimaryAssetId() const override;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "NOVA|World")
    FText DisplayName;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "NOVA|World")
    FName WorldGenre = TEXT("Sandbox");

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "NOVA|World")
    TSoftObjectPtr<UWorld> StartupMap;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "NOVA|World")
    TArray<FName> EnabledSystems;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "NOVA|World")
    TArray<TSoftObjectPtr<UObject>> RequiredAssets;
};
