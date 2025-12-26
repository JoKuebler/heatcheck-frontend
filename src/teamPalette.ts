import { colors as themeColors } from './theme';

export type TeamVisual = {
  primary: string;
  secondary: string;
  text?: string;
};

const TEAM_COLORS: Record<string, TeamVisual> = {
  ATL: { primary: '#E03A3E', secondary: '#C1D32F' },
  BOS: { primary: '#007A33', secondary: '#BA9653' },
  BKN: { primary: '#000000', secondary: '#FFFFFF' },
  BRK: { primary: '#000000', secondary: '#FFFFFF' },
  CHA: { primary: '#00788C', secondary: '#1D1160' },
  CHI: { primary: '#CE1141', secondary: '#000000' },
  CLE: { primary: '#6F263D', secondary: '#FFB81C' },
  DAL: { primary: '#00538C', secondary: '#B8C4CA' },
  DEN: { primary: '#0E2240', secondary: '#FEC524' },
  DET: { primary: '#C8102E', secondary: '#1D428A' },
  GSW: { primary: '#1D428A', secondary: '#FFC72C' },
  HOU: { primary: '#CE1141', secondary: '#C4CED4' },
  IND: { primary: '#002D62', secondary: '#FDBB30' },
  LAC: { primary: '#1D428A', secondary: '#C8102E' },
  LAL: { primary: '#552583', secondary: '#FDB927' },
  MEM: { primary: '#5D76A9', secondary: '#12173F' },
  MIA: { primary: '#98002E', secondary: '#000000' },
  MIL: { primary: '#00471B', secondary: '#EEE1C6' },
  MIN: { primary: '#0C2340', secondary: '#236192' },
  NOP: { primary: '#0C2340', secondary: '#B4975A' },
  NYK: { primary: '#006BB6', secondary: '#F58426' },
  OKC: { primary: '#007AC1', secondary: '#F05133' },
  ORL: { primary: '#0077C0', secondary: '#C4CED4' },
  PHI: { primary: '#006BB6', secondary: '#ED174C' },
  PHX: { primary: '#1D1160', secondary: '#E56020' },
  PHO: { primary: '#1D1160', secondary: '#E56020' },
  POR: { primary: '#000000', secondary: '#E03A3E' },
  SAC: { primary: '#5A2D81', secondary: '#63727A' },
  SAS: { primary: '#C4CED4', secondary: '#000000', text: '#0B0D11' },
  TOR: { primary: '#CE1141', secondary: '#000000' },
  UTA: { primary: '#002B5C', secondary: '#F9A01B' },
  UTH: { primary: '#002B5C', secondary: '#F9A01B' },
  WAS: { primary: '#002B5C', secondary: '#E31837' },
};

const FALLBACK: Required<TeamVisual> = {
  primary: themeColors.chipBg,
  secondary: themeColors.border,
  text: themeColors.textPrimary,
};

function isLight(hex: string): boolean {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return false;
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.6;
}

export function getTeamVisual(abbreviation?: string): Required<TeamVisual> {
  const key = (abbreviation || '').toUpperCase();
  const entry = TEAM_COLORS[key];
  const primary = entry?.primary || FALLBACK.primary;
  const secondary = entry?.secondary || FALLBACK.secondary;
  const text = entry?.text || (isLight(primary) ? '#0F1115' : '#F9FAFB');
  return { primary, secondary, text };
}
