import { shop } from '../shop';

/** Default design tokens (sampled from the supplied UI mock-ups). Each shop overrides them in shops/<id>/shop.json → theme. */
const base = {
  primary: '#0B5FDB',
  primaryDark: '#0A3E96',
  primaryLight: '#7AB8F5',
  navy: '#0F2147',
  text: '#101C36',
  secondary: '#4F5D78',
  muted: '#8A96AB',
  border: '#D6E4F5',
  card: '#EAF4FE',
  cardDeep: '#DCEBFB',
  cardBorder: '#CFE3F8',
  tint: '#F3F8FE',
  onPrimaryMuted: '#DCE9FF',
  toggleOff: '#C3D3E8',
  green: '#1B9A47',
  greenBg: '#DDF6E3',
  red: '#D92D20',
  redBg: '#FDECEA',
  amber: '#B54708',
  amberBg: '#FEF0C7',
  white: '#FFFFFF',
  background: '#FFFFFF',
};

const brand = Object.fromEntries(Object.entries(base).map(([key, value]) => [key, shop.theme[key] ?? value])) as Record<keyof typeof base, string>;
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(',');

export const colors = { ...brand, backdrop: `rgba(${rgb(brand.navy)},0.45)` };

export const fonts = {
  regular: 'NotoSansDevanagari_400Regular',
  medium: 'NotoSansDevanagari_500Medium',
  semibold: 'NotoSansDevanagari_600SemiBold',
  bold: 'NotoSansDevanagari_700Bold',
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 } as const;

export const type = {
  h1: { fontFamily: fonts.bold, fontSize: 24, lineHeight: 36 },
  h2: { fontFamily: fonts.bold, fontSize: 20, lineHeight: 30 },
  h3: { fontFamily: fonts.semibold, fontSize: 17, lineHeight: 26 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 23 },
  bodyMedium: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 23 },
  small: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 20 },
  smallMedium: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 20 },
  button: { fontFamily: fonts.semibold, fontSize: 17, lineHeight: 24 },
} as const;
