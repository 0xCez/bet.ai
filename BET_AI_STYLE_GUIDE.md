# Bet.AI Mobile App - Artistic Direction & Style Guide

This document defines the complete UI style system for the Bet.AI mobile app, extracted from the Creator Platform web application. Use this as the authoritative reference for all styling decisions.

---

## 1. COLOR SYSTEM

### Core Colors (HSL Values)

The design uses HSL color format. Here are the exact values with HEX equivalents:

#### Primary Palette

| Token | HSL | HEX | Usage |
|-------|-----|-----|-------|
| **Primary (Cyan)** | `187 100% 42%` | `#00D7D7` | CTAs, accents, focus rings, links |
| **Primary Foreground** | `228 15% 6%` | `#0D0F14` | Text on primary buttons |
| **Background** | `228 15% 6%` | `#0D0F14` | App background (dark blue-black) |
| **Foreground** | `210 40% 98%` | `#F5F8FC` | Primary text color |

#### Surface Colors

| Token | HSL | HEX | Usage |
|-------|-----|-----|-------|
| **Card** | `225 15% 10%` | `#161A22` | Card backgrounds, elevated surfaces |
| **Secondary** | `225 15% 15%` | `#212733` | Secondary buttons, subtle backgrounds |
| **Muted** | `225 15% 18%` | `#272E3A` | Borders, input backgrounds, dividers |
| **Muted Foreground** | `215 20% 55%` | `#7A8BA3` | Secondary/placeholder text |

#### Semantic Colors

| Token | HSL | HEX | Usage |
|-------|-----|-----|-------|
| **Success** | `142 76% 36%` | `#22C55E` | Positive trends, success states |
| **Destructive** | `0 84% 60%` | `#EF4444` | Errors, warnings, negative trends |

### Color Application Rules

1. **Background**: Always use `#0D0F14` as the base app background
2. **Cards/Surfaces**: Use `#161A22` with 80% opacity + blur for glass effect
3. **Primary CTA**: Use `#00D7D7` with dark text `#0D0F14`
4. **Secondary CTA**: Use `#212733` with light text `#F5F8FC`
5. **Borders**: Use `#272E3A` at 100% or 50% opacity for subtle borders
6. **Glow Effects**: Use primary color at 25-30% opacity for button shadows

---

## 2. TYPOGRAPHY

### Font Family

**Primary Font:** `Aeonik`
**Fallback Stack:** `system-ui, -apple-system, sans-serif`

> Note: You'll need to license and install the Aeonik font family. Alternatively, use `SF Pro` (iOS) or `Roboto` (Android) as platform-native substitutes.

### Font Weights

| Weight | Name | Usage |
|--------|------|-------|
| 100 | Thin | Decorative only |
| 200 | Air | Light accents |
| 300 | Light | Large display text |
| 400 | Regular | Body text |
| 500 | Medium | Labels, navigation |
| 600 | Semibold | Card titles, buttons |
| 700 | Bold | Stats, emphasis |
| 900 | Black | Hero headlines |

### Type Scale

| Size | Pixels | Usage |
|------|--------|-------|
| xs | 12px | Captions, badges |
| sm | 14px | Secondary text, inputs |
| base | 16px | Body text |
| lg | 18px | Large body, card text |
| xl | 20px | Subheadings |
| 2xl | 24px | Card titles |
| 4xl | 36px | Stats, large numbers |
| 6xl | 60px | Hero headlines |

### Text Colors

- **Primary text**: `#F5F8FC` (foreground)
- **Secondary text**: `#7A8BA3` (muted-foreground)
- **Accent text**: `#00D7D7` (primary)

---

## 3. BUTTON STYLES

### Primary Button (CTA)

```
Background: #00D7D7
Text: #0D0F14
Font: 14px, Semibold (600)
Height: 40px (default), 44px (large)
Padding: 16px horizontal (default), 32px (large)
Border Radius: 12px (default), 9999px (pill style)
Shadow: 0 10px 15px -3px rgba(0, 215, 215, 0.25)

Hover/Press State:
- Background: #00D7D7 at 90% opacity
- Optional: scale to 98%

Disabled:
- Opacity: 50%
- No pointer events
```

### Secondary Button

```
Background: #212733
Text: #F5F8FC
Font: 14px, Medium (500)
Height: 40px
Padding: 16px horizontal
Border Radius: 12px

Hover/Press State:
- Background: #212733 at 80% opacity
```

### Outline Button

```
Background: transparent
Border: 1px solid #272E3A
Text: #F5F8FC
Font: 14px, Medium (500)
Height: 40px
Padding: 16px horizontal
Border Radius: 12px

Hover/Press State:
- Background: #212733
```

### Ghost Button

```
Background: transparent
Text: #7A8BA3
Font: 14px, Medium (500)

Hover/Press State:
- Background: #212733
- Text: #F5F8FC
```

### App Store Style (Pill Buttons)

```
Background: #00D7D7 (primary) or transparent (outline)
Border: 1px solid #272E3A (outline only)
Text: #0D0F14 (primary) or #F5F8FC (outline)
Font: 14px, Semibold (600)
Height: 40px
Padding: 24px horizontal
Border Radius: 9999px (full pill)
```

### Button Icon Sizing

- Icons inside buttons: 16x16px
- Gap between icon and text: 8px

---

## 4. COMPONENT STYLES

### Cards

```
Glass Card:
- Background: #161A22 at 80% opacity
- Backdrop blur: 24px (xl)
- Border: 1px solid #272E3A at 50% opacity
- Border Radius: 16px
- Padding: 24px

Standard Card:
- Background: #161A22
- Border: 1px solid #272E3A
- Border Radius: 12px
- Shadow: 0 1px 2px rgba(0, 0, 0, 0.05)
- Padding: 24px
```

### Inputs

```
Background: #0D0F14
Border: 1px solid #272E3A
Text: #F5F8FC
Placeholder: #7A8BA3
Height: 40px
Padding: 12px horizontal, 8px vertical
Border Radius: 10px
Font: 14px (desktop), 16px (mobile to prevent zoom)

Focus State:
- Outline: none
- Ring: 2px solid #00D7D7
- Ring Offset: 2px #0D0F14
```

### Badges

```
Background: #00D7D7 (primary) or #212733 (secondary)
Text: #0D0F14 (primary) or #F5F8FC (secondary)
Font: 12px, Semibold (600)
Padding: 2px vertical, 10px horizontal
Border Radius: 9999px (full pill)
```

### Trend Indicators (Positive/Negative)

```
Positive:
- Background: rgba(34, 197, 94, 0.2) (success at 20%)
- Text: #22C55E

Negative:
- Background: rgba(239, 68, 68, 0.2) (destructive at 20%)
- Text: #EF4444

Both:
- Border Radius: 9999px
- Padding: 4px vertical, 8px horizontal
- Font: 14px
```

### Dialogs/Modals

```
Overlay:
- Background: rgba(0, 0, 0, 0.8)

Content:
- Background: #0D0F14
- Border: 1px solid #272E3A
- Border Radius: 12px
- Shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25)
- Padding: 24px
- Max Width: 448px (lg)
```

### Switches/Toggles

```
Track Off:
- Background: #272E3A
- Width: 44px
- Height: 24px
- Border Radius: 9999px

Track On:
- Background: #00D7D7

Thumb:
- Background: #0D0F14
- Width: 20px
- Height: 20px
- Border Radius: 9999px
- Shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1)
```

---

## 5. EFFECTS & GRADIENTS

### Glass Effect

```css
background: rgba(22, 26, 34, 0.8);
backdrop-filter: blur(24px);
-webkit-backdrop-filter: blur(24px);
border: 1px solid rgba(39, 46, 58, 0.5);
```

### Homepage Glass (Alternative)

```css
background: rgba(255, 255, 255, 0.05);
backdrop-filter: blur(10px);
-webkit-backdrop-filter: blur(10px);
border: 1px solid rgba(255, 255, 255, 0.1);
box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
```

### Hero Gradient Background

```css
background: radial-gradient(
  circle at 50% 50%,
  rgba(0, 194, 224, 0.15) 0%,
  rgba(12, 12, 12, 0) 70%
);
```

### Page Background Gradient

```css
background: linear-gradient(
  to bottom right,
  #0D0F14,
  #0D0F14,
  rgba(0, 215, 215, 0.05)
);
```

### Gradient Text

```css
background: linear-gradient(75deg, #ffffff, #a9a9a9);
-webkit-background-clip: text;
background-clip: text;
color: transparent;
```

### Button Glow Shadow

```css
box-shadow: 0 10px 15px -3px rgba(0, 215, 215, 0.25);
```

### Stat Glow Effect

```css
box-shadow: 0 0 40px -10px rgba(0, 215, 215, 0.3);
```

### Hover Glow (Cards)

```css
box-shadow: 0 10px 40px rgba(0, 200, 255, 0.1);
```

---

## 6. SPACING SYSTEM

Use a 4px base unit. Common spacing values:

| Token | Value | Usage |
|-------|-------|-------|
| 1 | 4px | Minimal spacing |
| 2 | 8px | Icon gaps, tight spacing |
| 3 | 12px | Compact padding |
| 4 | 16px | Standard padding, gaps |
| 5 | 20px | Medium spacing |
| 6 | 24px | Card padding, sections |
| 8 | 32px | Large gaps |
| 10 | 40px | Section spacing |
| 12 | 48px | Major sections |

### Common Patterns

- **Button internal gap**: 8px
- **Card padding**: 24px
- **Input padding**: 12px horizontal
- **List item spacing**: 16px
- **Section spacing**: 32-48px

---

## 7. BORDER RADIUS

| Token | Value | Usage |
|-------|-------|-------|
| sm | 8px | Small buttons, close buttons |
| md | 10px | Inputs, small cards |
| lg | 12px | Buttons, cards |
| xl | 16px | Glass cards, modals |
| full | 9999px | Badges, pills, avatars |

---

## 8. ANIMATIONS

### Transition Duration

- **Fast**: 200ms (button hovers, small interactions)
- **Normal**: 300ms (fade in, color changes)
- **Slow**: 500ms (page transitions, large animations)

### Transition Easing

- **Standard**: `ease-out` (most interactions)
- **Smooth**: `ease-in-out` (looping animations)
- **Linear**: `linear` (continuous rotations)

### Common Animations

#### Fade In Up

```
0%: opacity: 0, translateY: 20px
100%: opacity: 1, translateY: 0
Duration: 500ms, ease-out
```

#### Fade In

```
0%: opacity: 0
100%: opacity: 1
Duration: 300ms, ease-out
```

#### Pulse Glow

```
0%, 100%: opacity: 0.4
50%: opacity: 0.8
Duration: 2s, ease-in-out, infinite
```

#### Shimmer (Loading)

```
0%: translateX: -100%
100%: translateX: 100%
Duration: 2s, infinite
```

### Interaction States

- **Hover scale**: `scale(1.02)` or `scale(1.05)`
- **Active press**: `scale(0.98)`
- **Disabled opacity**: `0.5`

---

## 9. SPECIFIC HOVER EFFECTS (Homepage & CTAs)

### Feature Cards (Homepage Grid)

The feature cards on the homepage have a distinctive hover effect:

```
Default State:
- Uses glass-card base (see Glass Effect)
- Padding: 28px (p-7)

Hover State:
- Transform: translateY(-8px) — cards lift up
- Border: changes to rgba(0, 215, 215, 0.3) (primary/30)
- Box Shadow: 0 10px 40px rgba(0, 200, 255, 0.1)
- Transition: all 300ms ease

Framer Motion Config:
whileHover={{
  y: -8,
  transition: { duration: 0.2, ease: "easeOut" }
}}
```

### Hero CTA Button (Main Download Button)

The primary hero CTA has the most elaborate hover effect:

```
Default State:
- Background: #00D7D7 (primary)
- Text: #0D0F14 (primary-foreground)
- Font: 16px, Semibold (600)
- Padding: 14px vertical, 32px horizontal
- Border Radius: 9999px (pill)
- Contains shimmer overlay (hidden by default)

Hover State:
- Transform: scale(1.05)
- Box Shadow: 0 0 40px rgba(0, 215, 255, 0.5) — intense cyan glow
- Shimmer animation activates (gradient sweep)
- Transition: all 300ms ease

Active/Press State:
- Transform: scale(0.98)

Shimmer Animation (on hover):
- Gradient: from primary → cyan-400 → primary
- Background size: 200% 100%
- Animation: translateX from -100% to 100%, 2s linear infinite
- Fades in with opacity transition

Inner Highlight:
- Radial gradient overlay: rgba(255,255,255,0.15) center fading to transparent
```

### Navbar CTA Buttons (iOS/Android Download)

```
iOS Button (Primary Style):
Default:
- Background: rgba(0, 215, 215, 0.2) (primary/20)
- Border: 1px solid rgba(0, 215, 215, 0.3) (primary/30)
- Text: #F5F8FC (foreground)
- Border Radius: 9999px
- Padding: 12px vertical, 28px horizontal
- Min Width: 126px

Hover:
- Transform: scale(1.05)
- Background: rgba(0, 215, 215, 0.3) (primary/30)
- Border: rgba(0, 215, 215, 0.5) (primary/50)
- Box Shadow: 0 0 20px rgba(0, 215, 255, 0.15)
- Transition: all 300ms ease

Android Button (Outline Style):
Default:
- Background: transparent
- Border: 1px solid rgba(255, 255, 255, 0.3)
- Text: #F5F8FC (foreground)
- Border Radius: 9999px

Hover:
- Transform: scale(1.05)
- Background: rgba(255, 255, 255, 0.05)
- Border: rgba(255, 255, 255, 0.5)
- Box Shadow: 0 0 20px rgba(255, 255, 255, 0.15)
- Transition: all 300ms ease
```

### Navigation Pills (Navbar Center)

```
Default State:
- Background: transparent
- Text: #7A8BA3 (muted-foreground)
- Padding: 8px vertical, 20px horizontal
- Border Radius: 9999px

Hover State:
- Text: #F5F8FC (foreground)
- Background: rgba(255, 255, 255, 0.1)
- Transition: all 300ms ease

Active State:
- Text: #F5F8FC (foreground)
- Background: rgba(255, 255, 255, 0.1)
```

### Glass Card Hover (General Pattern)

Used throughout the app for interactive cards:

```css
/* Base */
.glass-card {
  background: rgba(22, 26, 34, 0.8);
  backdrop-filter: blur(24px);
  border: 1px solid rgba(39, 46, 58, 0.5);
  border-radius: 16px;
  transition: all 300ms ease;
}

/* Hover */
.glass-card:hover {
  border-color: rgba(0, 215, 215, 0.3);
  box-shadow: 0 10px 40px rgba(0, 200, 255, 0.1);
}
```

### Summary: Key Hover Patterns

| Element | Scale | Glow Shadow | Border Change | Lift (Y) |
|---------|-------|-------------|---------------|----------|
| Hero CTA | 1.05 | `0 0 40px rgba(0,215,255,0.5)` | No | No |
| Navbar CTAs | 1.05 | `0 0 20px rgba(0,215,255,0.15)` | Yes → primary/50 | No |
| Feature Cards | No | `0 10px 40px rgba(0,200,255,0.1)` | Yes → primary/30 | -8px |
| Nav Pills | No | No | No | No |
| General Glass | No | `0 10px 40px rgba(0,200,255,0.1)` | Yes → primary/30 | No |

---

## 9. SCROLLBAR STYLING

```css
/* Thin scrollbar */
scrollbar-width: thin;
scrollbar-color: rgba(122, 139, 163, 0.3) transparent;

/* Webkit */
::-webkit-scrollbar {
  width: 4px;
  height: 4px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: rgba(122, 139, 163, 0.3);
  border-radius: 2px;
}

::-webkit-scrollbar-thumb:hover {
  background: rgba(122, 139, 163, 0.5);
}
```

---

## 10. FOCUS STATES

All interactive elements should have visible focus states for accessibility:

```
Focus Visible:
- Outline: none
- Ring: 2px solid #00D7D7
- Ring Offset: 2px
- Ring Offset Color: #0D0F14
```

---

## 11. ICONS

- **Default size**: 16x16px (in buttons)
- **Medium size**: 20x20px (standalone)
- **Large size**: 24x24px (navigation, headers)
- **Color**: Inherits from parent text color

---

## 12. QUICK REFERENCE - COPY/PASTE VALUES

### CSS Custom Properties

```css
:root {
  /* Colors */
  --color-primary: #00D7D7;
  --color-primary-foreground: #0D0F14;
  --color-background: #0D0F14;
  --color-foreground: #F5F8FC;
  --color-card: #161A22;
  --color-secondary: #212733;
  --color-muted: #272E3A;
  --color-muted-foreground: #7A8BA3;
  --color-success: #22C55E;
  --color-destructive: #EF4444;
  --color-border: #272E3A;

  /* Spacing */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;

  /* Border Radius */
  --radius-sm: 8px;
  --radius-md: 10px;
  --radius-lg: 12px;
  --radius-xl: 16px;
  --radius-full: 9999px;

  /* Shadows */
  --shadow-button: 0 10px 15px -3px rgba(0, 215, 215, 0.25);
  --shadow-glow: 0 0 40px -10px rgba(0, 215, 215, 0.3);
  --shadow-card: 0 1px 2px rgba(0, 0, 0, 0.05);
}
```

### React Native / Swift Style Object

```javascript
const colors = {
  primary: '#00D7D7',
  primaryForeground: '#0D0F14',
  background: '#0D0F14',
  foreground: '#F5F8FC',
  card: '#161A22',
  secondary: '#212733',
  muted: '#272E3A',
  mutedForeground: '#7A8BA3',
  success: '#22C55E',
  destructive: '#EF4444',
  border: '#272E3A',
};

const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

const borderRadius = {
  sm: 8,
  md: 10,
  lg: 12,
  xl: 16,
  full: 9999,
};

const typography = {
  fontFamily: 'Aeonik', // or 'SF Pro' / 'Roboto'
  sizes: {
    xs: 12,
    sm: 14,
    base: 16,
    lg: 18,
    xl: 20,
    '2xl': 24,
    '4xl': 36,
    '6xl': 60,
  },
  weights: {
    regular: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },
};
```

---

## 13. VISUAL IDENTITY SUMMARY

The Bet.AI visual identity is characterized by:

1. **Dark, sophisticated base** - Deep blue-black backgrounds (#0D0F14)
2. **Cyan accent color** - Vibrant teal/cyan (#00D7D7) for all CTAs and accents
3. **Glass morphism** - Frosted glass effects with backdrop blur
4. **Subtle gradients** - Primary color fading into backgrounds for depth
5. **Glow effects** - Subtle cyan glows on interactive elements
6. **Clean typography** - Aeonik font with clear hierarchy
7. **Rounded corners** - Generous border radius (12-16px) for modern feel
8. **Smooth animations** - Quick, responsive transitions (200-300ms)

The overall aesthetic is **modern, premium, and tech-forward** with a focus on readability and visual hierarchy in dark mode.

---

*Last updated: December 2024*
*Source: Creator Platform Web Application*
