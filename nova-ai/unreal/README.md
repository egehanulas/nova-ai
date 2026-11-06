# NOVA World Runtime — Unreal Engine 5.8.4

This folder contains the first native Unreal Engine project foundation for NOVA's modular 3D worlds. It is intentionally separate from the existing web-based Sim and from the Electron desktop shell.

## Project

- Project: `NovaWorld.uproject`
- Target engine: Unreal Engine 5.8.4 (project association: 5.8)
- Code: C++ runtime module `NovaWorld`
- Initial controller: first-person WASD + mouse, Space to jump, Left Shift to sprint
- World definitions: `UNovaWorldDefinition` Primary Data Asset

## Architecture direction

NOVA should not generate and compile a brand-new Unreal project for every prompt. It should use one packaged runtime with a controlled library of reusable systems and assets.

1. The AI converts a user's request into a structured world specification.
2. A validator checks the specification against supported world types, asset IDs, system IDs, performance budgets, and safety limits.
3. The runtime loads a matching `UNovaWorldDefinition`, map, assets, and allow-listed gameplay systems.
4. World-specific mechanics live in separate modules or plugins. The earthquake experience is one world package, not the whole engine.
5. Additional genres can be added as independent world packages without rewriting the runtime.

The AI must never turn arbitrary user text into native code or execute arbitrary scripts. Generated content is data interpreted by allow-listed runtime systems.

## Open locally

1. Clone or download the repository.
2. Open `NovaWorld.uproject` with Unreal Engine 5.8.4.
3. When prompted, allow Unreal to build the `NovaWorld` C++ modules. Visual Studio 2022 with the Desktop development with C++ workload and a compatible Windows SDK may be required.
4. Create/open a level in the editor and place a Player Start and basic test geometry.
5. Press Play to test first-person movement.

## Current limitations

- This is a source project scaffold, not a packaged game.
- No apartment art, destruction assets, sound, lighting pass, or earthquake mechanics have been added yet.
- This repository's standard GitHub runners do not include Unreal Engine. A real Unreal compile and packaged Windows build must be verified on a machine with the matching engine installed.
- The existing NOVA Desktop does not yet download, install, or launch this game package.

## Planned layers

- Runtime foundation: player, input, world definitions, asset loading, settings.
- Shared interaction/physics systems: doors, pickups, rigid bodies, breakables, environment events.
- World packages: earthquake apartment, then independently selected second game genre.
- Delivery: signed/versioned Windows game package downloaded on demand by NOVA Desktop.
