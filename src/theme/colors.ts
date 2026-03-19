export const Colors = {

  // backgrounds
  bgBase:      '#080808',
  bgSurface:   '#0d0d0d',
  bgCard:      '#111111',
  bgElevated:  '#141414',
  bgOverlay:   '#1a1a1a',

  // borders
  borderSubtle: '#1e1e1e',
  border:       '#222222',
  borderStrong: '#2a2a2a',

  // text
  textPrimary:     '#f0f0f0',
  textHeading:     '#e5e5e5',
  textSecondary:   '#d0d0d0',
  textMuted:       '#888888',
  textDisabled:    '#444444',
  textPlaceholder: '#333333',

  // accent — green (primary action)
  green:    '#22c55e',
  greenDark:'#16a34a',
  greenBg:  '#052e16',

  // accent — red (fees, errors)
  red:    '#ef4444',
  redBg:  '#450a0a',

  // misc
  white: '#ffffff',
  black: '#000000',
} as const;

export type ColorKey = keyof typeof Colors;
