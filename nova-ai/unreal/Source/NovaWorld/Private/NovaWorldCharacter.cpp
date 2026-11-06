#include "NovaWorldCharacter.h"

#include "Camera/CameraComponent.h"
#include "Components/CapsuleComponent.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "GameFramework/PlayerController.h"
#include "GameFramework/SpringArmComponent.h"
#include "Engine/StaticMeshActor.h"
#include "EngineUtils.h"
#include "Components/StaticMeshComponent.h"
#include "InputCoreTypes.h"

ANovaWorldCharacter::ANovaWorldCharacter()
{
    PrimaryActorTick.bCanEverTick = false;

    GetCapsuleComponent()->InitCapsuleSize(38.0f, 94.0f);

    FirstPersonCamera = CreateDefaultSubobject<UCameraComponent>(TEXT("FirstPersonCamera"));
    FirstPersonCamera->SetupAttachment(GetCapsuleComponent());
    FirstPersonCamera->SetRelativeLocation(FVector(0.0f, 0.0f, 68.0f));
    FirstPersonCamera->bUsePawnControlRotation = true;

    bUseControllerRotationPitch = false;
    bUseControllerRotationYaw = true;
    bUseControllerRotationRoll = false;

    if (UCharacterMovementComponent* Movement = GetCharacterMovement())
    {
        Movement->MaxWalkSpeed = WalkSpeed;
        Movement->bOrientRotationToMovement = false;
        Movement->NavAgentProps.bCanCrouch = true;
    }
}

void ANovaWorldCharacter::BeginPlay()
{
    Super::BeginPlay();
}

void ANovaWorldCharacter::SetupPlayerInputComponent(UInputComponent* PlayerInputComponent)
{
    Super::SetupPlayerInputComponent(PlayerInputComponent);

    check(PlayerInputComponent);

    PlayerInputComponent->BindAxis(TEXT("MoveForward"), this, &ANovaWorldCharacter::MoveForward);
    PlayerInputComponent->BindAxis(TEXT("MoveRight"), this, &ANovaWorldCharacter::MoveRight);
    PlayerInputComponent->BindAxis(TEXT("Turn"), this, &APawn::AddControllerYawInput);
    PlayerInputComponent->BindAxis(TEXT("LookUp"), this, &APawn::AddControllerPitchInput);
    PlayerInputComponent->BindAction(TEXT("Jump"), IE_Pressed, this, &ACharacter::Jump);
    PlayerInputComponent->BindAction(TEXT("Jump"), IE_Released, this, &ACharacter::StopJumping);
    PlayerInputComponent->BindAction(TEXT("Sprint"), IE_Pressed, this, &ANovaWorldCharacter::StartSprint);
    PlayerInputComponent->BindAction(TEXT("Sprint"), IE_Released, this, &ANovaWorldCharacter::StopSprint);
    PlayerInputComponent->BindAction(TEXT("Earthquake"), IE_Pressed, this, &ANovaWorldCharacter::TriggerEarthquake);
}

void ANovaWorldCharacter::MoveForward(float Value)
{
    if (Controller && !FMath::IsNearlyZero(Value))
    {
        AddMovementInput(FRotationMatrix(Controller->GetControlRotation()).GetUnitAxis(EAxis::X), Value);
    }
}

void ANovaWorldCharacter::MoveRight(float Value)
{
    if (Controller && !FMath::IsNearlyZero(Value))
    {
        AddMovementInput(FRotationMatrix(Controller->GetControlRotation()).GetUnitAxis(EAxis::Y), Value);
    }
}

void ANovaWorldCharacter::StartSprint()
{
    GetCharacterMovement()->MaxWalkSpeed = SprintSpeed;
}

void ANovaWorldCharacter::StopSprint()
{
    GetCharacterMovement()->MaxWalkSpeed = WalkSpeed;
}

void ANovaWorldCharacter::TriggerEarthquake()
{
    if (!GetWorld())
    {
        return;
    }

    constexpr float EffectRadius = 2500.0f;
    constexpr float ImpulseStrength = 180000.0f;
    const FVector Origin = GetActorLocation();

    for (TActorIterator<AStaticMeshActor> It(GetWorld()); It; ++It)
    {
        AStaticMeshActor* MeshActor = *It;
        if (!IsValid(MeshActor) || FVector::DistSquared(Origin, MeshActor->GetActorLocation()) > FMath::Square(EffectRadius))
        {
            continue;
        }

        UStaticMeshComponent* MeshComponent = MeshActor->GetStaticMeshComponent();
        if (!MeshComponent || !MeshComponent->IsSimulatingPhysics())
        {
            continue;
        }

        FVector Direction = MeshActor->GetActorLocation() - Origin;
        Direction.Z = FMath::Max(Direction.Z, 120.0f);
        Direction = Direction.GetSafeNormal();
        const FVector Jitter(FMath::FRandRange(-0.25f, 0.25f), FMath::FRandRange(-0.25f, 0.25f), 0.0f);
        MeshComponent->AddImpulse((Direction + Jitter).GetSafeNormal() * ImpulseStrength, NAME_None, true);
    }
}
