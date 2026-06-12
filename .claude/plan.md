# Plan: Rewrite talent-stage-native Frontend to Match talent-stage-web

## Scope Assessment

**talent-stage-web** (source of truth): 15 pages, 8 components, 2 hooks, 1 service, 1 store, 1 CSS file — sophisticated mobile-first web app with physics-based swiping, dual-slot video preloading, avatar cropping, creator analytics, share sheet, comments with replies, and more.

**talent-stage-native** (target): Expo/React Native app with similar features but simpler UI — basic FlatList paging, no momentum physics, no share sheet, no avatar crop, no reaction overlays, simpler comments (no replies), fewer analytics.

## Gap Analysis — What Native Is Missing or Different

### Major Gaps (Features/UI that need full implementation):
1. **Momentum scroll / swipe physics** — Native uses FlatList paging; web uses custom RAF momentum with velocity tracking
2. **Dual video slot (A/B) preloading** — Native uses single FlatList; web uses two `<video>` elements alternating
3. **Share sheet** — Native has no share modal; web has 7 social platforms + copy link + native share
4. **Reaction overlay** — Native has basic animation; web has full-screen hand icon overlays
5. **Avatar upload & crop** — Native has no avatar editing; web has zoom/pan canvas crop
6. **Comments with replies** — Native has flat comments; web has threaded replies (3 levels)
7. **Comment liking, deletion, reporting** — Missing in native
8. **Report video/creator modals** — Missing in native
9. **Side drawer navigation** — Native uses tab nav only; web has side drawer
10. **Toast notification system** — Missing in native
11. **Account strikes display** — Missing in native
12. **Creator sorting/filtering** — Native shows basic list; web has sort by views/likes/newest/oldest
13. **Swipe lock timer** — Missing in native
14. **Seen video tracking** — Missing in native (web uses localStorage)
15. **Wake lock API** — Not applicable to native (handled by OS)
16. **Frame capture thumbnails** — Native doesn't do canvas-based frame capture

### Styling Gaps:
- Native uses React Native StyleSheet; needs to match web's dark theme exactly
- Color tokens differ slightly
- Web uses CSS variables (--blk, --acc, --acc2); native needs equivalent constants
- Web max-width 500px mobile container; native is full-width
- Web uses Poppins font; native uses system font

## Implementation Strategy

**Approach**: Rewrite native screens one-by-one to match web's UI and functionality exactly. Since React Native can't use HTML5 video or CSS transforms, we adapt the patterns:
- Video: Use `expo-av` Video component (already in native)
- Swiping: Port `useSwipe` + `useMomentumScroll` to use `Animated` API or `react-native-reanimated`
- Styling: Convert web CSS to React Native StyleSheet matching exact colors/spacing
- Navigation: Keep React Navigation but add drawer equivalent

## Step-by-Step Implementation

### Phase 1: Foundation (Theme, Types, API, Store)
1. **Update `src/theme/colors.ts`** — Match web's color tokens exactly (--blk=#0d0d0d, --acc=#7b3fe4, --acc2=#c84fd8)
2. **Update `src/types/index.ts`** — Add missing types (Comment replies, report types, strike types, analytics types)
3. **Update `src/services/api.ts`** — Port web's full API client (bandwidth hints, all endpoints including report, comment reply, comment like, comment delete)
4. **Update `src/store/useAppStore.ts`** — Add missing state (drawerOpen, shareOpen, uploadProgress, feedSearchText debounce, seen tracking)

### Phase 2: Shared Components
5. **Create `src/components/Toast.tsx`** — Port web's toast notification system
6. **Create `src/components/ShareSheet.tsx`** — Port 7 social platform sharing (use `Linking.openURL` for native)
7. **Create `src/components/ReactionOverlay.tsx`** — Port like/dislike hand icon overlays (use `Animated` API)
8. **Create `src/components/ActionBar.tsx`** — Port web's action bar (like/dislike/follow/save/share/report icons)
9. **Create `src/components/Comments.tsx`** — Port threaded comments with replies, liking, deletion, reporting
10. **Update `src/components/Logo.tsx`** — If exists, match web's logo component

### Phase 3: Hooks
11. **Create `src/hooks/useSwipe.ts`** — Port touch gesture handling with velocity sampling (adapt from PanResponder or GestureHandler)
12. **Create `src/hooks/useMomentumScroll.ts`** — Port RAF momentum physics (use `requestAnimationFrame` + `Animated.Value`)

### Phase 4: Core Screens
13. **Rewrite `HomeScreen.tsx`** — This is the biggest task:
    - Dual video slot system (A/B alternating)
    - Category filter bar
    - Search with autocomplete dropdown
    - Swipe gestures wired to momentum physics
    - Reaction overlays
    - Comments drawer
    - Share sheet integration
    - Action bar
    - Mute toggle
    - Autoplay management
    - Preload window (±3 videos)
    - Seen video tracking

14. **Rewrite `LoginScreen.tsx`** — Match web Login.tsx styling and flow
15. **Rewrite `SignupScreen.tsx`** — Match web Signup.tsx styling and flow
16. **Rewrite `ForgotPasswordScreen.tsx`** — Match web ForgotPassword.tsx styling
17. **Rewrite `AccountScreen.tsx`** — Add avatar crop, account strikes, match web layout
18. **Rewrite `UploadScreen.tsx`** — Match web Upload.tsx with progress indicator
19. **Rewrite `SavedScreen.tsx`** — Match web SavedVideos.tsx grid layout
20. **Rewrite `SharedVideosScreen.tsx`** — Match web SharedVideos.tsx
21. **Rewrite `FollowingScreen.tsx`** — Match web Following.tsx
22. **Rewrite `FollowersScreen.tsx`** — Match web Followers.tsx
23. **Rewrite `CreatorProfileScreen.tsx`** — Add sorting/filtering, match web Creator.tsx
24. **Rewrite `TalentCategoryScreen.tsx`** — Match web Talent.tsx
25. **Rewrite `VideoAnalyticsScreen.tsx`** — Match web VideoAnalytics.tsx with full metrics

### Phase 5: Navigation & Polish
26. **Update `RootNavigator.tsx`** — Add any missing routes, match web's routing structure
27. **Create drawer/side menu equivalent** — Match web's SideDrawer.tsx
28. **Update `App.tsx`** — Match web's initialization flow
29. **Final styling pass** — Ensure all screens match web's dark theme exactly

## Estimated Scope
- ~25 files to create or heavily modify
- HomeScreen is the largest single task (~50% of effort)
- This is a multi-session project

## Recommended Model
**Opus 4.6** — This task requires deep architectural understanding, careful porting of complex physics/animation logic, and maintaining exact feature parity across two different rendering paradigms (DOM vs React Native).
