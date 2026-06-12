# talent-stage-native

Fresh React Native / Expo frontend rebuild for Talents Stage.

## Goal
- Build mobile frontend to match web app flow and look.

## Implemented in this pass
- Full app shell with tab + stack navigation.
- Home feed with:
  - top search input
  - talent category chips
  - vertical paging video cards
  - action rail (like/dislike/follow/comment/save/share)
  - comments sheet
  - mute toggle
- Following list connected to API.
- Saved videos grid connected to API.
- Upload screen with file picker + upload form + my videos grid.
- Account screen with profile edit + followers/following/shared/analytics links.
- Followers / Following / Shared / Creator / Talent category / Analytics screens connected to API.
- Shared API layer with Cloudflare Stream URL normalization.
- Shared Zustand store aligned with web app concepts.

## Run
1. `cd talent-stage-native`
2. `npm install`
3. `npm start`

## Environment
- `EXPO_PUBLIC_API_BASE=https://api.web-demo.space/api`
