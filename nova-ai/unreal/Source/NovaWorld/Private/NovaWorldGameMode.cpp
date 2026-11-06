#include "NovaWorldGameMode.h"

#include "NovaWorldCharacter.h"
#include "GameFramework/PlayerController.h"

ANovaWorldGameMode::ANovaWorldGameMode()
{
    DefaultPawnClass = ANovaWorldCharacter::StaticClass();
    PlayerControllerClass = APlayerController::StaticClass();
}
