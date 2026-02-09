/**
 * Bet.AI Design System Tokens
 *
 * This file defines the complete UI style system for the Bet.AI mobile app,
 * extracted from the Creator Platform web application.
 *
 * Use this as the authoritative reference for all styling decisions.
 */

// =============================================================================
// APP CONFIG
// =============================================================================

/**
 * TestFlight builds: Set to true to bypass paywall for testing
 * Production builds: Set to false
 */
export const BYPASS_PAYWALL = true;

// =============================================================================
// COLORS
// =============================================================================

export const colors = {
  // Primary Palette
  primary: '#00D7D7',           // Cyan - CTAs, accents, focus rings, links
  primaryForeground: '#0D0F14', // Text on primary buttons (dark)

  // Background & Surfaces
  background: '#0D0F14',        // App background (dark blue-black)
  foreground: '#F5F8FC',        // Primary text color (bright white)

  // Surface Colors
  card: '#161A22',              // Card backgrounds, elevated surfaces
  secondary: '#212733',         // Secondary buttons, subtle backgrounds
  muted: '#272E3A',             // Borders, input backgrounds, dividers
  mutedForeground: '#7A8BA3',   // Secondary/placeholder text

  // Semantic Colors
  success: '#22C55E',           // Positive trends, success states
  destructive: '#EF4444',       // Errors, warnings, negative trends

  // Border
  border: '#272E3A',            // Default border color

  // RGBA variants (for effects)
  rgba: {
    // Glass card background
    cardGlass: 'rgba(22, 26, 34, 0.8)',        // card at 80%
    borderGlass: 'rgba(39, 46, 58, 0.5)',      // muted at 50%

    // Alternative glass (light)
    glassLight: 'rgba(255, 255, 255, 0.05)',
    glassLightBorder: 'rgba(255, 255, 255, 0.1)',

    // Primary with opacity
    primary10: 'rgba(0, 215, 215, 0.1)',
    primary15: 'rgba(0, 215, 215, 0.15)',
    primary20: 'rgba(0, 215, 215, 0.2)',
    primary25: 'rgba(0, 215, 215, 0.25)',
    primary30: 'rgba(0, 215, 215, 0.3)',
    primary40: 'rgba(0, 215, 215, 0.4)',
    primary50: 'rgba(0, 215, 215, 0.5)',

    // Success/Destructive backgrounds
    successBg: 'rgba(34, 197, 94, 0.2)',
    destructiveBg: 'rgba(239, 68, 68, 0.2)',

    // Overlay
    overlay: 'rgba(0, 0, 0, 0.8)',

    // Muted foreground for scrollbar
    mutedForeground30: 'rgba(122, 139, 163, 0.3)',
    mutedForeground50: 'rgba(122, 139, 163, 0.5)',

    // White variants
    white10: 'rgba(255, 255, 255, 0.1)',
    white15: 'rgba(255, 255, 255, 0.15)',
    white30: 'rgba(255, 255, 255, 0.3)',
    white50: 'rgba(255, 255, 255, 0.5)',
  },

  // Legacy colors (for gradual migration)
  legacy: {
    background: '#0C0C0C',
    cardGradientStart: '#0D0D0D',
    cardGradientEnd: '#161616',
    buttonGradient: ['#00A7CC', '#009EDB', '#01A7CC'] as const,
  },
} as const;

// =============================================================================
// SPACING
// =============================================================================

export const spacing = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
} as const;

// =============================================================================
// BORDER RADIUS
// =============================================================================

export const borderRadius = {
  sm: 8,
  md: 10,
  lg: 12,
  xl: 16,
  full: 9999, // Pill shape
} as const;

// =============================================================================
// TYPOGRAPHY
// =============================================================================

export const typography = {
  fontFamily: {
    regular: 'Aeonik-Regular',
    medium: 'Aeonik-Medium',
    semibold: 'Aeonik-Medium', // Using Medium as semibold fallback
    bold: 'Aeonik-Bold',
    light: 'Aeonik-Light',
    black: 'Aeonik-Black',
  },
  sizes: {
    xs: 12,
    sm: 14,
    base: 16,
    lg: 18,
    xl: 20,
    '2xl': 24,
    '3xl': 30,
    '4xl': 36,
    '6xl': 60,
  },
} as const;

// =============================================================================
// SHADOWS (React Native format)
// =============================================================================

export const shadows = {
  // Primary button glow: 0 10px 15px -3px rgba(0, 215, 215, 0.25)
  buttonGlow: {
    shadowColor: 'rgba(0, 215, 215, 1)',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 15,
    elevation: 10,
  },
  // Intense button glow (hover): 0 0 40px rgba(0, 215, 255, 0.5)
  buttonGlowIntense: {
    shadowColor: 'rgba(0, 215, 255, 1)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 40,
    elevation: 15,
  },
  // Stat glow: 0 0 40px -10px rgba(0, 215, 215, 0.3)
  statGlow: {
    shadowColor: 'rgba(0, 215, 215, 1)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 40,
    elevation: 12,
  },
  // Card hover glow: 0 10px 40px rgba(0, 200, 255, 0.1)
  cardGlow: {
    shadowColor: 'rgba(0, 200, 255, 1)',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 40,
    elevation: 8,
  },
  // Subtle card shadow: 0 1px 2px rgba(0, 0, 0, 0.05)
  card: {
    shadowColor: 'rgba(0, 0, 0, 1)',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  // Dialog shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25)
  dialog: {
    shadowColor: 'rgba(0, 0, 0, 1)',
    shadowOffset: { width: 0, height: 25 },
    shadowOpacity: 0.25,
    shadowRadius: 50,
    elevation: 20,
  },
  // Navbar CTA glow: 0 0 20px rgba(0, 215, 255, 0.15)
  navCta: {
    shadowColor: 'rgba(0, 215, 255, 1)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 6,
  },
} as const;

// =============================================================================
// GLASS EFFECT (for use with expo-blur)
// =============================================================================

export const glass = {
  // Standard glass card
  card: {
    backgroundColor: 'rgba(22, 26, 34, 0.8)',
    borderColor: 'rgba(39, 46, 58, 0.5)',
    borderWidth: 1,
    blurIntensity: 24,
  },
  // Alternative homepage glass
  light: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    blurIntensity: 10,
  },
} as const;

// =============================================================================
// BUTTON STYLES
// =============================================================================

export const buttonStyles = {
  // Primary CTA
  primary: {
    backgroundColor: colors.primary,
    textColor: colors.primaryForeground,
    height: 55,
    borderRadius: borderRadius.lg,
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.semibold,
    // Shadow: shadows.buttonGlow
  },
  // Primary Pill (app store style)
  primaryPill: {
    backgroundColor: colors.primary,
    textColor: colors.primaryForeground,
    height: 40,
    borderRadius: borderRadius.full,
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.semibold,
  },
  // Secondary
  secondary: {
    backgroundColor: colors.secondary,
    textColor: colors.foreground,
    height: 55,
    borderRadius: borderRadius.lg,
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.medium,
  },
  // Outline
  outline: {
    backgroundColor: 'transparent',
    borderColor: colors.muted,
    borderWidth: 1,
    textColor: colors.foreground,
    height: 55,
    borderRadius: borderRadius.lg,
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.medium,
  },
  // Ghost
  ghost: {
    backgroundColor: 'transparent',
    textColor: colors.mutedForeground,
    height: 40,
    borderRadius: borderRadius.lg,
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.medium,
  },
} as const;

// =============================================================================
// ANIMATION
// =============================================================================

export const animation = {
  duration: {
    fast: 200,
    normal: 300,
    slow: 500,
  },
  scale: {
    hover: 1.05,
    press: 0.98,
  },
  disabledOpacity: 0.5,
} as const;

// =============================================================================
// SHIMMER
// =============================================================================

export const shimmerColors = ['#272E3A', '#3A4555', '#272E3A'] as const;

// =============================================================================
// COMPONENT SIZES
// =============================================================================

export const componentSizes = {
  // Icons
  icon: {
    sm: 16,
    md: 20,
    lg: 24,
  },
  // Buttons
  buttonHeight: {
    sm: 40,
    md: 44,
    lg: 55,
  },
  // Inputs
  inputHeight: 40,
} as const;

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get success/destructive color based on value
 */
export const getTrendColor = (isPositive: boolean): string => {
  return isPositive ? colors.success : colors.destructive;
};

/**
 * Get trend background (already defined in colors.rgba)
 */
export const getTrendBackground = (isPositive: boolean): string => {
  return isPositive ? colors.rgba.successBg : colors.rgba.destructiveBg;
};

// Default export for convenience
export default {
  colors,
  spacing,
  borderRadius,
  typography,
  shadows,
  glass,
  buttonStyles,
  animation,
  shimmerColors,
  componentSizes,
  getTrendColor,
  getTrendBackground,
};
