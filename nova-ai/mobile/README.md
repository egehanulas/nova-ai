# EYRION AI Mobile

Expo SDK 58 / React Native mobile client. Mobile dependencies and configuration are isolated in this directory.

## Configuration for users and builds

The production EYRION API URL, Supabase project URL, and Supabase **publishable** key are built into the mobile client as public client configuration. A normal user installing the app does not create, download, or edit a `.env` file.

These values are public by design and are bundled into the client. Never add a Supabase secret key, legacy `service_role` key, database password, or other server credential to Expo public variables or the mobile app. Database access is protected by the signed-in user's token and existing Supabase RLS policies.

## Optional local/staging overrides

1. Copy `.env.example` to `.env` in this directory only when you need to override the built-in production settings.
2. Set:
   - `EXPO_PUBLIC_EYRION_API_URL`: reachable HTTPS origin of the EYRION API.
   - `EXPO_PUBLIC_SUPABASE_URL`: Supabase project URL.
   - `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: the project's `sb_publishable_...` key.
3. Restart Expo after changing `.env`.

Local env files are ignored by Git. Do not force-add them. `.env.example` is only an optional override template; it is not required for ordinary app use.

## Auth callback

Add `eyrionai://auth/callback` to the Supabase Auth redirect URL allowlist. The app uses PKCE and secure platform storage for the session.

## iPhone testing and distribution

This project uses Expo SDK 58. A successful JavaScript export is not an iOS native build and is not a physical-device test. Use an SDK 58-compatible Expo Go build where available, or create an iOS development/production build with EAS. TestFlight/App Store distribution requires the relevant Apple Developer account and signing setup. Start local testing with `npx expo start --tunnel` if the phone cannot reach the computer over the local network.

Before testing, verify that the API is reachable from the phone and Supabase Auth allows the callback above.

## Checks

```sh
npm ci
npm run check
npx expo export --platform all
```
