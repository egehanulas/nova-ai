#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "NovaWorldGameMode.generated.h"

UCLASS()
class NOVAWORLD_API ANovaWorldGameMode : public AGameModeBase
{
    GENERATED_BODY()

public:
    ANovaWorldGameMode();

protected:
    virtual void BeginPlay() override;

private:
    void BuildStarterWorld();
};
