# Bet.AI - Artistic Direction & Graphic Identity

A comprehensive design system guide for recreating the Bet.AI visual identity.

---

## Overview

Bet.AI follows a **modern dark theme** with **cyan neon accents**, combining glass morphism, subtle animations, and a clean typographic hierarchy. The aesthetic is **tech-forward, premium, and sporty** — designed for serious sports analytics.

---

## 1. Color Palette

### Core Colors

| Name | Hex | RGB | Usage |
|------|-----|-----|-------|
| **Primary (Cyan)** | `#00D7D7` | rgb(0, 215, 215) | CTAs, accents, interactive elements, glows |
| **Background** | `#0D0F14` | rgb(13, 15, 20) | Main app background |
| **Foreground** | `#F5F8FC` | rgb(245, 248, 252) | Primary text |
| **Card** | `#161A22` | rgb(22, 26, 34) | Elevated surfaces, cards |
| **Secondary** | `#212733` | rgb(33, 39, 51) | Secondary buttons, subtle backgrounds |
| **Muted** | `#272E3A` | rgb(39, 46, 58) | Borders, dividers, input backgrounds |
| **Secondary Text** | `#7A8BA3` | rgb(122, 139, 163) | Placeholder text, secondary labels |

### Semantic Colors

| Name | Hex | Usage |
|------|-----|-------|
| **Success** | `#22C55E` | Positive values, wins, "TARGET" verdicts |
| **Destructive** | `#EF4444` | Errors, losses, "AVOID" verdicts |

### Opacity Variants

```
Primary 10%:  rgba(0, 215, 215, 0.10)  — Subtle highlights
Primary 20%:  rgba(0, 215, 215, 0.20)  — Borders, focus rings
Primary 50%:  rgba(0, 215, 215, 0.50)  — Strong accents
Glass BG:     rgba(22, 26, 34, 0.80)   — Card backgrounds
Glass Border: rgba(39, 46, 58, 0.50)   — Card borders
White 10%:    rgba(255, 255, 255, 0.10) — Light overlays
```

---

## 2. Typography

### Font Family

**Aeonik** — A geometric sans-serif with excellent readability.

- `Aeonik-Light` — Subtle text, captions
- `Aeonik-Regular` — Body text (default)
- `Aeonik-Medium` — Buttons, emphasis
- `Aeonik-Bold` — Headings, key numbers

### Type Scale

| Name | Size | Weight | Line Height | Usage |
|------|------|--------|-------------|-------|
| **Display** | 36px | Bold | 44px | Hero numbers |
| **H1** | 32px | Bold | 40px | Page titles |
| **H2** | 24px | Bold | 32px | Section headers |
| **H3** | 20px | Medium | 28px | Card titles |
| **Large** | 18px | Regular | 26px | Important body |
| **Body** | 16px | Regular | 24px | Default text |
| **Small** | 14px | Regular | 20px | Secondary text |
| **XS** | 12px | Regular | 16px | Labels, captions |

---

## 3. Spacing System

Based on a **4px unit** for consistent rhythm.

```
4px   (xs)    — Tight gaps
8px   (sm)    — Compact spacing
12px  (md)    — Standard gaps
16px  (base)  — Primary padding/margins
20px  (lg)    — Comfortable spacing
24px  (xl)    — Section gaps
32px  (2xl)   — Major separations
48px  (3xl)   — Screen sections
```

### Common Patterns

- **Screen horizontal padding**: 16px
- **Card internal padding**: 12-16px
- **Gap between cards**: 12px
- **Gap between sections**: 24px

---

## 4. Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `sm` | 8px | Inputs, small badges |
| `md` | 10px | Stat pills, chips |
| `lg` | 12px | Buttons, standard cards |
| `xl` | 16px | Glass cards, large components |
| `full` | 9999px | Pills, circular buttons |

---

## 5. Shadows & Glows

### Button Glow (Primary)
```css
box-shadow: 0 10px 15px -3px rgba(0, 215, 215, 0.25);
```

### Button Glow Intense (Hover)
```css
box-shadow: 0 0 40px rgba(0, 215, 255, 0.5);
```

### Card Glow
```css
box-shadow: 0 10px 40px rgba(0, 200, 255, 0.1);
```

### Subtle Elevation
```css
box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
```

---

## 6. Glass Morphism

The signature look of Bet.AI cards.

### Standard Glass Card
```css
background: rgba(22, 26, 34, 0.80);
border: 1px solid rgba(0, 215, 215, 0.10);
border-radius: 16px;
backdrop-filter: blur(24px);
```

### Alternative Light Glass
```css
background: rgba(255, 255, 255, 0.05);
border: 1px solid rgba(255, 255, 255, 0.10);
backdrop-filter: blur(10px);
```

---

## 7. Button Styles

### Primary Button
```css
background: #00D7D7;
color: #0D0F14;
height: 55px;
border-radius: 12px;
font-family: Aeonik-Medium;
font-size: 16px;
box-shadow: 0 10px 15px -3px rgba(0, 215, 215, 0.25);
```

### Primary Pill Button
```css
background: #00D7D7;
color: #0D0F14;
height: 40px;
border-radius: 9999px;
font-family: Aeonik-Medium;
font-size: 14px;
```

### Secondary Button
```css
background: #212733;
border: 1px solid rgba(39, 46, 58, 0.5);
color: #F5F8FC;
height: 55px;
border-radius: 12px;
```

### Ghost Button
```css
background: transparent;
color: #7A8BA3;
height: 40px;
```

### Icon Button (Circular)
```css
width: 48px;
height: 48px;
border-radius: 50%;
background: rgba(22, 26, 34, 0.6);
border: 1px solid rgba(0, 215, 215, 0.2);
/* Icon color: #00D7D7 */
```

---

## 8. Visual Effects

### Concentric Circles Background

Animated dashed circles radiating from center.

```
- Circle count: 14
- Stroke: 1px dashed, pattern [10, 12]
- Inner opacity: 80% (cyan)
- Outer opacity: 8% (cyan)
- Optional: Slow rotation (60s per revolution)
- Position: 60% from top of screen
```

### Gradient Orb

Pulsing background element for depth.

```
- Size: ~330px diameter
- Animation: Scale 1.0 → 1.2 (2.2s), opacity pulse
- Gradient: Transparent → Cyan (30% to 60% opacity)
- Inner core: Bright cyan at 90% opacity
- Slow rotation: 25s per revolution
```

### Floating Particles

Subtle ambient animation.

```
- Count: ~12 particles
- Size: 3-8px diameter
- Color: Cyan at 30-70% opacity
- Animation: Float upward (-60px over 3-5s)
- Horizontal drift: ±15px
- Staggered delays: 200ms between particles
```

---

## 9. Animations & Transitions

### Duration Tokens
- **Fast**: 200ms — Micro-interactions
- **Normal**: 300ms — Standard transitions
- **Slow**: 500ms — Emphasis animations

### Interaction Feedback
- **Hover scale**: 1.05
- **Press scale**: 0.95-0.98
- **Press opacity**: 0.8-0.9

### Entrance Animations
- Fade in: 250-400ms
- Slide up: 300-400ms with ease-out
- Staggered reveals: 50-150ms delay between items

### Glow Pulse
```
- Duration: 1800ms per direction
- Shadow opacity: 0.4 → 0.9
- Shadow radius: 5px → 18px
```

---

## 10. Component Patterns

### Card Layout
```
- Width: Full or 48% (2-column grid)
- Padding: 12-16px
- Gap between cards: 12px
- Border radius: 16px (glass) or 12px (solid)
```

### Stat Pill
```css
background: #212733;
padding: 8px 8px;
border-radius: 10px;
/* Value: 18px bold, Label: 12px regular */
```

### Stat Pill (Highlighted)
```css
background: rgba(0, 215, 215, 0.15);
border: 1px solid #00D7D7;
```

### Progress Bar
```css
height: 5px;
background: linear-gradient(90deg, #00D7D7, #22C55E);
border-radius: 4px;
/* Animated fill with indicator dot */
```

---

## 11. Branding

### Logo
- Available in 3 sizes: 80×32, 90×36, 150×56
- Always maintain aspect ratio
- Use on dark backgrounds only

### App Icon
- Primary: Solid icon on white background
- Android adaptive: Foreground icon on white (#FFFFFF)

### Splash Screen
- Background: #0D0F14
- Centered logo
- Resize mode: contain

---

## 12. Design Philosophy Summary

1. **Dark Foundation**: Deep blue-black (#0D0F14) base creates focus
2. **Cyan as Hero**: #00D7D7 is THE accent — used sparingly but consistently
3. **Glass Depth**: Blurred cards with subtle cyan borders add dimension
4. **Semantic Colors**: Green = good, Red = bad (betting context)
5. **Clean Typography**: Aeonik font with clear hierarchy
6. **Subtle Motion**: Floating particles, pulsing orbs, rotating circles
7. **Premium Feel**: Glows, gradients, and animations feel high-tech
8. **Consistency**: 4px spacing grid, consistent border radii, unified shadows

---

## Quick Reference

```
Background:     #0D0F14
Card:           #161A22
Secondary:      #212733
Muted/Border:   #272E3A
Text Primary:   #F5F8FC
Text Secondary: #7A8BA3
Accent (Cyan):  #00D7D7
Success:        #22C55E
Error:          #EF4444
Font:           Aeonik (Light/Regular/Medium/Bold)
Border Radius:  8/10/12/16/9999px
Spacing:        4px increments
```

---

*This design system represents the Bet.AI visual identity as of v1.7*
