#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "NovaWorldCharacter.generated.h"

class UCameraComponent;

UCLASS()
class NOVAWORLD_API ANovaWorldCharacter : public ACharacter
{
    GENERATED_BODY()

public:
    ANovaWorldCharacter();

protected:
    virtual void BeginPlay() override;
    virtual void SetupPlayerInputComponent(UInputComponent* PlayerInputComponent) override;

private:
    void MoveForward(float Value);
    void MoveRight(float Value);
    void StartSprint();
    void StopSprint();
    void TriggerEarthquake();

    UPROPERTY(VisibleAnywhere, Category = "NOVA|Camera")
    TObjectPtr<UCameraComponent> FirstPersonCamera;

    UPROPERTY(EditDefaultsOnly, Category = "NOVA|Movement")
    float WalkSpeed = 420.0f;

    UPROPERTY(EditDefaultsOnly, Category = "NOVA|Movement")
    float SprintSpeed = 680.0f;

    UPROPERTY(EditDefaultsOnly, Category = "NOVA|Earthquake", meta = (ClampMin = "100.0"))
    float EarthquakeRadius = 2500.0f;

    UPROPERTY(EditDefaultsOnly, Category = "NOVA|Earthquake", meta = (ClampMin = "1000.0"))
    float EarthquakeImpulse = 180000.0f;
};
