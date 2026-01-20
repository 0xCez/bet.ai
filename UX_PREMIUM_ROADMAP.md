# UX Premium Roadmap

> Systematic approach to premium-ifying the app's feel and smoothness.
> Each item follows: **Audit → Flow Confirmation → Strategic Planning → Slow Implementation**

---

## Current Status: 8/10 Overall Polish

**Strengths:**
- Haptics implemented across 27 files (Light, Medium, Heavy impacts)
- Reanimated 3 with complex choreographed sequences
- Glass morphism, shadows, gradients well-implemented
- Spring physics on interactive elements
- Design tokens system is solid

---

## Priority Queue

### 🔴 HIGH IMPACT (Do First)

| # | Item | Status | Notes |
|---|------|--------|-------|
| 1 | **Pull-to-Refresh** | ⬜ Not Started | Missing on all scrollable screens |
| 2 | **Skeleton Screens** | ⬜ Not Started | Replace ActivityIndicators with content-shaped placeholders |
| 3 | **Image Transitions** | ⬜ Not Started | TransitionImageOverlay exists but disabled |
| 4 | **Collapsing Headers** | ⬜ Not Started | Headers don't animate on scroll |

### 🟡 MEDIUM IMPACT

| # | Item | Status | Notes |
|---|------|--------|-------|
| 5 | **Custom Nav Transitions** | ⬜ Not Started | Default fade/slide → custom Reanimated |
| 6 | **Long-Press Context Menus** | ⬜ Not Started | No long-press actions on cards |
| 7 | **Shimmer Wave Animation** | ⬜ Not Started | Static shimmer → animated wave |
| 8 | **Expanded Backdrop Blur** | ⬜ Not Started | More blur on modals, sheets, headers |

### 🟢 POLISH (Nice-to-Have)

| # | Item | Status | Notes |
|---|------|--------|-------|
| 9 | **Parallax Scroll** | ⬜ Not Started | Expand to more screens |
| 10 | **Swipe-to-Dismiss** | ⬜ Not Started | Cards, notifications |
| 11 | **Animated Page Indicators** | ⬜ Not Started | During carousel scroll |
| 12 | **Pinch-to-Zoom** | ⬜ Not Started | Images, charts |

---

## Implementation Log

### Item 1: Pull-to-Refresh

**Status:** ⬜ Not Started

#### Phase 1: Audit
- [ ] Identify all scrollable screens
- [ ] Check current ScrollView/FlatList implementations
- [ ] Note any existing refresh logic
- [ ] List screens by priority

#### Phase 2: Flow Confirmation
- [ ] Confirm which screens need refresh
- [ ] Define refresh behavior per screen
- [ ] Confirm haptic feedback pattern
- [ ] Confirm visual indicator style

#### Phase 3: Strategic Planning
- [ ] Create reusable refresh hook/component
- [ ] Define animation timing
- [ ] Plan loading state during refresh
- [ ] Consider error states

#### Phase 4: Implementation
- [ ] Implement core refresh component
- [ ] Add to first screen (home)
- [ ] Test thoroughly
- [ ] Roll out to remaining screens

#### Files to Touch:
- `app/home.tsx`
- `components/ui/HeroGamesCarousel.tsx`
- (others TBD in audit)

#### Notes:
_To be filled during implementation_

---

### Item 2: Skeleton Screens

**Status:** ⬜ Not Started

#### Phase 1: Audit
- [ ] Find all ActivityIndicator usages
- [ ] Map loading states to their content layouts
- [ ] Identify reusable skeleton patterns
- [ ] Check existing ShimmerImage component

#### Phase 2: Flow Confirmation
- [ ] Confirm skeleton shapes match content
- [ ] Define shimmer animation style
- [ ] Confirm timing (when to show, hide)
- [ ] Decide on skeleton vs shimmer approach

#### Phase 3: Strategic Planning
- [ ] Design skeleton component library
- [ ] Plan variants (card, list item, header, etc.)
- [ ] Define animation parameters
- [ ] Consider dark mode compatibility

#### Phase 4: Implementation
- [ ] Create base skeleton components
- [ ] Replace ActivityIndicators one by one
- [ ] Test loading → content transitions
- [ ] Ensure smooth fade-in of real content

#### Files to Touch:
- `components/ui/` (new skeleton components)
- All screens with loading states
- (specific files TBD in audit)

#### Notes:
_To be filled during implementation_

---

### Item 3: Image Transitions

**Status:** ⬜ Not Started

#### Phase 1: Audit
- [ ] Find TransitionImageOverlay component
- [ ] Understand why it was disabled
- [ ] Check current image loading behavior
- [ ] Identify where it should be used

#### Phase 2: Flow Confirmation
- [ ] Confirm transition style (fade, morph, etc.)
- [ ] Define timing parameters
- [ ] Confirm which images get transitions
- [ ] Check performance implications

#### Phase 3: Strategic Planning
- [ ] Fix any issues with existing component
- [ ] Plan integration points
- [ ] Consider fallback for slow connections
- [ ] Define placeholder strategy

#### Phase 4: Implementation
- [ ] Enable/fix TransitionImageOverlay
- [ ] Integrate with key image components
- [ ] Test across different network conditions
- [ ] Optimize for performance

#### Files to Touch:
- `components/TransitionImageOverlay.tsx` (or similar)
- `app/_layout.tsx` (currently commented out)
- Image-heavy screens

#### Notes:
_To be filled during implementation_

---

### Item 4: Collapsing Headers

**Status:** ⬜ Not Started

#### Phase 1: Audit
- [ ] Review current TopBar implementation
- [ ] Check scroll contexts in main screens
- [ ] Identify which screens benefit most
- [ ] Review existing Reanimated scroll hooks

#### Phase 2: Flow Confirmation
- [ ] Define collapse behavior (fade, shrink, hide)
- [ ] Confirm minimum/maximum header heights
- [ ] Define scroll thresholds
- [ ] Confirm content behavior during collapse

#### Phase 3: Strategic Planning
- [ ] Design reusable collapsing header hook
- [ ] Plan animation curves
- [ ] Consider sticky elements
- [ ] Handle edge cases (bounce, fast scroll)

#### Phase 4: Implementation
- [ ] Create useCollapsibleHeader hook
- [ ] Implement on primary screen
- [ ] Test scroll physics
- [ ] Roll out to other screens

#### Files to Touch:
- `components/ui/TopBar.tsx`
- `hooks/` (new hook)
- Main scrollable screens

#### Notes:
_To be filled during implementation_

---

## Additional Issues Queue

> Space for functional/routing issues from your audit

| # | Issue | Screen/File | Status | Notes |
|---|-------|-------------|--------|-------|
| | _Add issues here_ | | | |

---

## Process Checklist (For Each Item)

```
Before Starting:
[ ] Read through all related code
[ ] Understand current behavior completely
[ ] Identify all affected files
[ ] Note any dependencies

During Implementation:
[ ] Make small, testable changes
[ ] Test after each change
[ ] Commit frequently with clear messages
[ ] Document any gotchas

After Completion:
[ ] Full app test
[ ] Check for regressions
[ ] Update status in this doc
[ ] Note any learnings
```

---

## Session Log

| Date | Item | Action | Result |
|------|------|--------|--------|
| _2024-XX-XX_ | _Item #_ | _What was done_ | _Outcome_ |

---

## Notes & Learnings

_Space for observations, gotchas, and insights discovered during implementation_

---

*Last Updated: 2025-01-17*
