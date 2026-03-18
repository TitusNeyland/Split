export const colors = {
  primary: '#534AE7',
  primaryLight: '#EEE0FF',
  primaryMid: '#7777FD',
  success: '#19DF75',
  warning: '#FFCF21',
  danger: '#FF5252',
  textPrimary: '#F2F2FA',
  textSecondary: '#8B8B9A',
  textTertiary: '#72727F',
  borderDefault: 'rgba(44,44,62,0.4)',
  bgPrimary: '#050509',
  bgSecondary: '#111118',
} as const;

export const typography = {
  sizes: {
    xs: 14,
    sm: 16,
    base: 18,
    md: 20,
    lg: 24,
    xl: 30,
  },
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  full: 999,
} as const;
