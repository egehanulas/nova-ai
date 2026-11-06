#include "NovaWorldGameMode.h"

#include "NovaWorldCharacter.h"
#include "Engine/StaticMesh.h"
#include "Engine/World.h"
#include "Engine/StaticMeshActor.h"
#include "Engine/DirectionalLight.h"
#include "Components/StaticMeshComponent.h"
#include "Components/DirectionalLightComponent.h"
#include "GameFramework/PlayerController.h"
#include "UObject/ConstructorHelpers.h"

ANovaWorldGameMode::ANovaWorldGameMode()
{
    DefaultPawnClass = ANovaWorldCharacter::StaticClass();
    PlayerControllerClass = APlayerController::StaticClass();
}

void ANovaWorldGameMode::BeginPlay()
{
    Super::BeginPlay();
    BuildStarterWorld();
}

void ANovaWorldGameMode::BuildStarterWorld()
{
    UWorld* World = GetWorld();
    if (!World)
    {
        return;
    }

    UStaticMesh* PlaneMesh = LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Plane.Plane"));
    UStaticMesh* CubeMesh = LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Cube.Cube"));

    const auto SpawnMesh = [World](UStaticMesh* Mesh, const FVector& Location, const FVector& Scale, bool bSimulatePhysics)
    {
        if (!Mesh)
        {
            return;
        }

        AStaticMeshActor* MeshActor = World->SpawnActor<AStaticMeshActor>(AStaticMeshActor::StaticClass(), Location, FRotator::ZeroRotator);
        if (MeshActor)
        {
            UStaticMeshComponent* MeshComponent = MeshActor->GetStaticMeshComponent();
            MeshComponent->SetStaticMesh(Mesh);
            MeshComponent->SetMobility(EComponentMobility::Movable);
            MeshActor->SetActorScale3D(Scale);
            MeshComponent->SetSimulatePhysics(bSimulatePhysics);
        }
    };

    // Oyuncunun altında otomatik bir başlangıç zemini oluştur.
    SpawnMesh(PlaneMesh, FVector(0.0f, 0.0f, -100.0f), FVector(30.0f, 30.0f, 1.0f), false);

    // Otomatik oluşturulan 3 katlı, fizik etkin blok bina test yapısı.
    // Her blok ayrı fizik gövdesidir; E tuşu deprem darbesini uygular.
    constexpr float BlockSpacing = 155.0f;
    constexpr float BlockScale = 1.5f;
    constexpr float BlockHalfHeight = 75.0f;
    for (int32 Floor = 0; Floor < 3; ++Floor)
    {
        for (int32 Row = 0; Row < 3; ++Row)
        {
            for (int32 Column = 0; Column < 3; ++Column)
            {
                const FVector BlockLocation(
                    850.0f + static_cast<float>(Column) * BlockSpacing,
                    -155.0f + static_cast<float>(Row) * BlockSpacing,
                    BlockHalfHeight + static_cast<float>(Floor) * BlockSpacing);
                SpawnMesh(CubeMesh, BlockLocation, FVector(BlockScale), true);
            }
        }
    }

    ADirectionalLight* Sun = World->SpawnActor<ADirectionalLight>(
        ADirectionalLight::StaticClass(),
        FVector(0.0f, 0.0f, 900.0f),
        FRotator(-45.0f, -35.0f, 0.0f));
    if (Sun && Sun->GetLightComponent())
    {
        Sun->GetLightComponent()->SetIntensity(5.0f);
    }
}
