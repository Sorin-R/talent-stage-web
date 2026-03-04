# HOME.TSX DESKTOP LAYOUT RESTRUCTURING DRAFT

## Current Layout Structure (Mobile)
```
<>
  <div className="topbar">
    <div className="search-pill">...</div>
    <button className="hbg">...</button>  <!-- burger menu -->
  </div>

  <div className="vtrow">
    <div className="vtitle">...</div>  <!-- video title -->
    <div>... avatar ...</div>  <!-- creator avatar + name -->
  </div>

  <div className="feed-container">
    <!-- video player, strip animation -->
    <video />
    <ActionBar />  <!-- right side vertical buttons -->
  </div>

  <div className="cib">
    <!-- comment input bar -->
  </div>

  <!-- Comments panel (drawer) -->
  {cmtsOpen && <Comments ... />}
</>
```

## New Layout Structure (Desktop 1024px+)
```
<div id="home-wrapper">

  <!-- TOP ROW: Search with menu icon + Burger -->
  <div className="topbar">
    <!-- search pill: menu icon (≡) INSIDE search + centered -->
    <!-- burger menu: position top-right -->
  </div>

  <!-- LEFT SIDEBAR: BOTTOM NAVIGATION MENU -->
  <div className="left-sidebar">
    <!-- Bottom navigation menu (Home, Follow, Upload, Saved, Profile) -->
    <!-- Positioned at bottom left corner -->
  </div>

  <!-- CENTER: VIDEO PLAYER -->
  <div className="feed-container">
    <!-- video player, centered, aspect-ratio 9:16 -->
    <video />
    <!-- mute button: top center -->
    <!-- reaction overlay: centered -->
  </div>

  <!-- RIGHT SIDEBAR: NAVIGATION ARROWS + ACTION BUTTONS + USER AVATAR -->
  <div className="right-sidebar">
    <!-- Up arrow (top) -->
    <button className="nav-arrow-up">⬆️</button>

    <!-- User avatar with label -->
    <div className="user-avatar-section">
      <div className="avatar-circle">...</div>
      <div className="avatar-label">YOU</div>
    </div>

    <!-- Action buttons (follow, save, share) with labels -->
    <button className="action-btn">
      <span className="icon">❤️</span>
      <span className="label">Follow</span>
    </button>
    <button className="action-btn">
      <span className="icon">📌</span>
      <span className="label">Save</span>
    </button>
    <button className="action-btn">
      <span className="icon">🔗</span>
      <span className="label">Share</span>
    </button>

    <!-- Down arrow (bottom) -->
    <button className="nav-arrow-down">⬇️</button>
  </div>

  <!-- BOTTOM ROW: COMMENT INPUT BAR -->
  <div className="cib">
    <!-- comment input bar with menu icon -->
  </div>

</div>
```

## Key Changes Needed in Home.tsx

### 1. **Add Mobile/Desktop Detection Hook**
```typescript
const [isDesktop, setIsDesktop] = useState(false);

useEffect(() => {
  const checkDesktop = () => setIsDesktop(window.innerWidth >= 1024);
  checkDesktop();
  window.addEventListener('resize', checkDesktop);
  return () => window.removeEventListener('resize', checkDesktop);
}, []);
```

### 2. **Restructure JSX Return**
- Wrap everything in `<div id="home-wrapper">` for desktop
- On mobile: keep current layout
- On desktop: use grid layout with left/center/right sidebars

### 3. **Extract Components**
- **LeftSidebar**: Video info + Comments panel
- **RightSidebar**: Navigation arrows + Action buttons
- **CenterVideo**: Feed container with video player

### 4. **Conditional Rendering**
```typescript
return (
  <>
    {isDesktop ? (
      <div id="home-wrapper" className="desktop-layout">
        {/* Desktop grid layout */}
      </div>
    ) : (
      <>
        {/* Mobile vertical layout (current) */}
      </>
    )}
  </>
);
```

### 5. **CSS Classes Needed**
- `.left-sidebar` - Left panel (bottom navigation menu, 80-100px height at bottom)
- `.right-sidebar` - Right panel (100-120px width)
- `.nav-arrow-up` - Up arrow button (top of right sidebar)
- `.nav-arrow-down` - Down arrow button (bottom of right sidebar)
- `.user-avatar-section` - Avatar circle + "YOU" label container
- `.avatar-circle` - User avatar display (circular)
- `.avatar-label` - "YOU" text below avatar
- `.action-btn` - Action button with icon + label (Follow, Save, Share)
- `.action-btn .icon` - Icon element inside action button
- `.action-btn .label` - Text label inside action button
- `.desktop-layout` - Grid wrapper

### 6. **CSS Import**
Add to Home.tsx:
```typescript
import '../styles/desktop.css';  // Desktop layout styles
```

## Visual Mockup (Desktop - Actual Layout)

```
┌──────────────────────┬──────────────────────┬──────────────────┐
│ ≡  Search...         │                      │ ☰ Burger Menu    │
├──────────────────────┼──────────────────────┼──────────────────┤
│                      │                      │                  │
│                      │                      │      ⬆️           │
│                      │                      │                  │
│                      │   VIDEO PLAYER       │   👤 YOU         │
│                      │   (9:16 aspect)      │                  │
│                      │   (centered)         │   ❤️ Follow      │
│                      │                      │                  │
│                      │                      │   📌 Save        │
│                      │                      │                  │
│                      │                      │   🔗 Share       │
│                      │                      │                  │
│                      │                      │      ⬇️           │
├──────────────────────┼──────────────────────┼──────────────────┤
│ 🏠 ❤️ ☁️ 📌 👤      │  Comment here...  🔘 │                  │
└──────────────────────┴──────────────────────┴──────────────────┘

KEY:
- Left Sidebar (bottom): Bottom navigation menu (5 items)
- Center: Video player with centered content
- Right Sidebar (top to bottom):
  - Up arrow (⬆️)
  - User avatar with "YOU" label
  - Follow button with icon + label
  - Save button with icon + label
  - Share button with icon + label
  - Down arrow (⬇️)
- Top: Search bar (with menu icon ≡ inside) + Burger menu (top-right)
- Bottom: Comment input bar spanning center + right columns
```

## Mobile Layout (No Changes)
```
┌─────────────────────────────────┐
│ Menu  │  Search Bar (full)  │    │
├─────────────────────────────────┤
│  Video Title  │  Creator Avatar │
├─────────────────────────────────┤
│                                 │
│         VIDEO PLAYER            │
│                                 │
│     ⬆️ ⬇️ Action Buttons →      │
├─────────────────────────────────┤
│  Comment Input Bar              │
└─────────────────────────────────┘
```

## Testing Checklist

### Mobile Layout (<1024px) - No Changes
- [ ] Mobile layout remains unchanged
- [ ] Topbar with search + burger menu works
- [ ] Video title row visible
- [ ] Video player full width with action buttons on right
- [ ] Comment input at bottom
- [ ] All swipe/gesture functionality works

### Desktop Layout (≥1024px) - New Grid Layout
- [ ] Grid layout displays correctly (3 columns: left | center | right)
- [ ] Search bar centered in topbar with menu icon inside search pill
- [ ] Burger menu positioned top-right
- [ ] Left sidebar shows bottom navigation menu (5 items)
- [ ] Video player centered in middle column with 9:16 aspect ratio
- [ ] Right sidebar displays in correct order:
  - [ ] Up arrow (⬆️) at top
  - [ ] User avatar circle with "YOU" label
  - [ ] Follow button with icon + label
  - [ ] Save button with icon + label
  - [ ] Share button with icon + label
  - [ ] Down arrow (⬇️) at bottom
- [ ] Comment input bar spans center + right columns at bottom
- [ ] Navigation arrows (up/down) trigger like/dislike actions
- [ ] All action buttons are clickable and functional
- [ ] Responsive spacing at 1024px and 1440px breakpoints
- [ ] No overlapping elements
- [ ] Proper scrolling in sidebars when content overflows
