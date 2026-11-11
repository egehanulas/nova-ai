# EYRION AI Mobile

Expo SDK 58 / React Native mobile client. Mobile dependencies and configuration are isolated in this directory.

## Local configuration

1. Copy `.env.example` to `.env` in this directory.
2. Replace every sample value:
   - `EXPO_PUBLIC_EYRION_API_URL`: the reachable HTTPS origin of the existing EYRION API.
   - `EXPO_PUBLIC_SUPABASE_URL`: the project's Supabase URL.
   - `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: the project's `sb_publishable_...` key from Supabase **Connect** or **Settings → API Keys**.
3. Never put a Supabase secret or `service_role` key in this file. Public Expo variables are bundled into the app. Database access remains protected by the signed-in user's token and existing RLS.
4. Restart Expo after changing `.env` so the new values are bundled.

`.env.example` is a template only and is not loaded by Expo. The `.invalid` sample URLs and `REPLACE_ME` key are rejected at startup. `.env` and other local env files are ignored by Git; do not force-add them.

## Auth callback

Add `eyrionai://auth/callback` to the Supabase Auth redirect URL allowlist. The app uses PKCE and secure platform storage for the session.

## iPhone testing

This project uses Expo SDK 58. Expo Go's physical iPhone build may not be available from the public App Store yet. Expo's SDK 58 iPhone instructions use `eas go` and TestFlight, which requires an Apple Developer Program account; a development build is another option. Use an Expo Go build matching SDK 58. On a physical phone, Expo CLI and Expo Go need to be signed into the same Expo account. Start the project with `npx expo start --tunnel` if the phone cannot reach the computer over the local network.

Before testing, make sure the API HTTPS address is reachable from the phone and Supabase's redirect allowlist includes the callback above. The app does not contain server credentials and this repository does not include live project configuration.

## Checks

```sh
npm ci
npm run check
npx expo export --platform all
```
