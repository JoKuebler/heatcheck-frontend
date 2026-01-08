export const SUPPORT_URL = 'https://jokuebler.github.io/heatcheckr-support/';
import { colors } from './theme';

export const API_BASE = 'https://app-production-2fb0.up.railway.app/api/games';
export const CACHE_KEY = 'games_cache_latest';
export const HIGHLIGHT_WARNING_KEY = 'highlight_warning_seen_v1';
export const SETTINGS_KEY = 'label_group_settings_v1';

export const BEHIND_THE_SCENES_URL = 'https://jokuebler.github.io/heatcheckr-support/';

export const LEGEND = [
  { name: 'Matchup Stakes', color: colors.accentMatchup, key: 'matchup' },
  { name: 'Game Flow', color: colors.accentFlow, key: 'flow' },
  { name: 'Team Stats', color: colors.accentTeamStats, key: 'teamStats' },
  { name: 'Player Stats', color: colors.accentPlayer, key: 'player' },
  { name: 'Ugly Beautiful', color: colors.accentStat, key: 'defense' },
  { name: 'Statistically Rare', color: colors.accentRare, key: 'rare' },
  { name: 'Skip Signals', color: colors.accentMeta, key: 'meta' },
];

export type GroupKey = 'matchup' | 'flow' | 'teamStats' | 'player' | 'defense' | 'rare' | 'meta';
export type GroupSettings = Record<GroupKey, boolean>;

export const DEFAULT_SETTINGS: GroupSettings = {
  matchup: true,
  flow: true,
  teamStats: true,
  player: true,
  defense: true,
  rare: true,
  meta: true,
};

export const LABEL_COLORS: Record<string, string> = {
  flow: colors.accentFlow,
  teamStats: colors.accentTeamStats,
  defense: colors.accentStat,
  player: colors.accentPlayer,
  matchup: colors.accentMatchup,
  rare: colors.accentRare,
  meta: colors.accentMeta,
};

export const BUCKET_ORDER: Array<keyof typeof LABEL_COLORS> = ['matchup', 'flow', 'teamStats', 'player', 'defense', 'rare', 'meta'];

export const SCORE_BORDERS = [
  colors.scoreBorder1, colors.scoreBorder2, colors.scoreBorder3, colors.scoreBorder4, colors.scoreBorder5,
  colors.scoreBorder6, colors.scoreBorder7, colors.scoreBorder8, colors.scoreBorder9, colors.scoreBorder10,
];

export const SCORE_EMOJIS: [number, string][] = [
  [9.5, '💎'],  // Diamond - absolute gem
  [8.5, '🔥'],  // Fire - scorcher
  [7.5, '⚡️'],  // Lightning - electric
  [6.5, '✨'],  // Sparkles - pretty good
  [5.5, '👀'],  // Eyes - watchable
  [4.5, '😐'],  // Neutral face - mid
  [3.5, '😴'],  // Sleepy - snoozer
  [2.5, '🪫'],  // Low battery - draining
  [1.5, '🤮'],  // Vomit - skip it
  [0, '💀'],    // Skull - unwatchable
];

export const LABEL_PATTERNS: [RegExp, keyof typeof LABEL_COLORS][] = [
  [/instant classic|matchup|bout|tank bowl/i, 'matchup'],
  [/back & forth|down to the wire|nail biter|q4 comeback|comeback|hot start|game winner|clutch stop/i, 'flow'],
  [/shootout|high octane|glass cleaner|assist symphony/i, 'teamStats'],
  [/triple double|scoring explosion|sniper|pickpocket|block party/i, 'player'],
  [/defensive|chaos|brick|free throw parade/i, 'defense'],
  [/double ot|triple ot|heartbreaker|marathon|epic|free flowing/i, 'rare'],
  [/easy win|blowout|garbage time/i, 'meta'],
];

export const LABEL_DISPLAY: Record<string, string> = {
  'no special indicators': '🗑️ Garbage Time',
  'garbage time': '🗑️ Garbage Time',
};
