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

    // Sahnenin ölçeğini hissettiren birkaç basit test yapısı.
    SpawnMesh(CubeMesh, FVector(650.0f, 0.0f, 100.0f), FVector(2.0f, 2.0f, 2.0f), true);
    SpawnMesh(CubeMesh, FVector(950.0f, 250.0f, 150.0f), FVector(1.5f, 1.5f, 3.0f), true);
    SpawnMesh(CubeMesh, FVector(950.0f, -250.0f, 150.0f), FVector(1.5f, 1.5f, 3.0f));
    SpawnMesh(CubeMesh, FVector(1250.0f, 0.0f, 100.0f), FVector(2.0f, 2.0f, 2.0f));

    ADirectionalLight* Sun = World->SpawnActor<ADirectionalLight>(
        ADirectionalLight::StaticClass(),
        FVector(0.0f, 0.0f, 900.0f),
        FRotator(-45.0f, -35.0f, 0.0f));
    if (Sun && Sun->GetLightComponent())
    {
        Sun->GetLightComponent()->SetIntensity(5.0f);
    }
}
