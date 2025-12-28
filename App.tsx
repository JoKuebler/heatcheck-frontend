import React, { useEffect, useState } from 'react';
import { FlatList, View, Text, StyleSheet, StatusBar, ActivityIndicator, RefreshControl, Pressable, Linking, Alert, Modal, Switch } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, spacing, radius, fonts } from './src/theme';
import type { Game } from './src/types';
import { getTeamVisual } from './src/teamPalette';

const API_BASE = 'https://app-production-2fb0.up.railway.app/api/games';
const CACHE_KEY = 'games_cache_latest';
const HIGHLIGHT_WARNING_KEY = 'highlight_warning_seen_v1';
const SETTINGS_KEY = 'label_group_settings_v1';

const formatDate = (iso: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const LEGEND = [
  { name: 'Matchup Stakes', color: colors.accentMatchup, key: 'matchup' },
  { name: 'Game Flow', color: colors.accentFlow, key: 'flow' },
  { name: 'Team Stats', color: colors.accentTeamStats, key: 'teamStats' },
  { name: 'Player Stats', color: colors.accentPlayer, key: 'player' },
  { name: 'Ugly Beautiful', color: colors.accentStat, key: 'defense' },
  { name: 'Statistically Rare', color: colors.accentRare, key: 'rare' },
  { name: 'Skip Signals', color: colors.accentMeta, key: 'meta' },
];

type GroupKey = 'matchup' | 'flow' | 'teamStats' | 'player' | 'defense' | 'rare' | 'meta';
type GroupSettings = Record<GroupKey, boolean>;

const DEFAULT_SETTINGS: GroupSettings = {
  matchup: true,
  flow: true,
  teamStats: true,
  player: true,
  defense: true,
  rare: true,
  meta: true,
};

const LABEL_COLORS: Record<string, string> = {
  flow: colors.accentFlow,
  teamStats: colors.accentTeamStats,
  defense: colors.accentStat,
  player: colors.accentPlayer,
  matchup: colors.accentMatchup,
  rare: colors.accentRare,
  meta: colors.accentMeta,
};

const BUCKET_ORDER: Array<keyof typeof LABEL_COLORS> = ['matchup', 'flow', 'teamStats', 'player', 'defense', 'rare', 'meta'];

const SCORE_BORDERS = [
  colors.scoreBorder1, colors.scoreBorder2, colors.scoreBorder3, colors.scoreBorder4, colors.scoreBorder5,
  colors.scoreBorder6, colors.scoreBorder7, colors.scoreBorder8, colors.scoreBorder9, colors.scoreBorder10,
];

// Score emoji tiers: [minScore, emoji] - 10 levels from skull to diamond
const SCORE_EMOJIS: [number, string][] = [
  [9.5, '💎'],  // Diamond - absolute gem
  [8.5, '🔥'],  // Fire - scorcher
  [7.5, '⚡️'],  // Lightning - electric
  [6.5, '✨'],  // Sparkles - pretty good
  [5.5, '👀'],  // Eyes - watchable
  [4.5, '🫤'],  // Meh face - mid
  [3.5, '😴'],  // Sleepy - snoozer
  [2.5, '🪫'],  // Low battery - draining
  [1.5, '💤'],  // Zzz - skip it
  [0, '💀'],    // Skull - unwatchable
];

function excitementDisplay(score?: number, emojiFromApi?: string) {
  const value = score ?? 0;
  const bucket = Math.min(10, Math.max(1, Math.floor(value)));
  const emoji = emojiFromApi || SCORE_EMOJIS.find(([threshold]) => bucket >= threshold)?.[1] || '✨';
  return { value, emoji, border: SCORE_BORDERS[bucket - 1] };
}

const LABEL_PATTERNS: [RegExp, keyof typeof LABEL_COLORS][] = [
  [/instant classic|matchup|bout|tank bowl/i, 'matchup'],
  [/back & forth|down to the wire|nail biter|q4 comeback|comeback|hot start|game winner|clutch stop/i, 'flow'],
  [/shootout|high octane|glass cleaner|assist symphony/i, 'teamStats'],
  [/triple double|scoring explosion|sniper|pickpocket|block party/i, 'player'],
  [/defensive|chaos|brick|free throw parade/i, 'defense'],
  [/double ot|triple ot|heartbreaker|marathon|epic|free flowing/i, 'rare'],
  [/easy win|blowout|snoozer/i, 'meta'],
];

function categoryForLabel(label: string): keyof typeof LABEL_COLORS {
  return LABEL_PATTERNS.find(([pattern]) => pattern.test(label))?.[1] || 'flow';
}

const LABEL_DISPLAY: Record<string, string> = {
  'no special indicators': '💤 Snoozer',
};

const LabelChip = ({ label }: { label: string }) => {
  const text = LABEL_DISPLAY[label.toLowerCase()] || label;
  const category = categoryForLabel(text);
  const bg = LABEL_COLORS[category] || colors.chipBg;
  return (
    <View style={[styles.chip, { backgroundColor: bg }]}>
      <Text style={styles.chipText}>{text}</Text>
    </View>
  );
};

const TeamBadge = ({ abbreviation }: { abbreviation: string }) => {
  const { primary, secondary, text } = getTeamVisual(abbreviation);
  return (
    <View style={[styles.teamBadge, { backgroundColor: primary, borderColor: secondary }]}>
      <Text style={[styles.teamBadgeText, { color: text }]}>{abbreviation}</Text>
    </View>
  );
};

const SettingsModal = ({ 
  visible, 
  onClose, 
  settings, 
  onToggle 
}: { 
  visible: boolean; 
  onClose: () => void; 
  settings: GroupSettings;
  onToggle: (key: GroupKey) => void;
}) => {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Settings</Text>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </Pressable>
          </View>
          
          <Text style={styles.sectionTitle}>Label Groups</Text>
          <Text style={styles.sectionSubtitle}>Toggle which label categories to show</Text>
          
          {LEGEND.map((item) => (
            <View key={item.key} style={styles.settingRow}>
              <View style={styles.settingLabelRow}>
                <View style={[styles.settingSwatch, { backgroundColor: item.color }]} />
                <Text style={styles.settingLabel}>{item.name}</Text>
              </View>
              <Switch
                value={settings[item.key as GroupKey]}
                onValueChange={() => onToggle(item.key as GroupKey)}
                trackColor={{ false: colors.border, true: item.color }}
                thumbColor={colors.textPrimary}
              />
            </View>
          ))}
          
          <View style={styles.modalFooter}>
            <Text style={styles.footerText}>Hidden labels won't appear on game cards</Text>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const GameCard = ({ game, onOpenHighlights, groupSettings }: { game: Game; onOpenHighlights: (game: Game) => void; groupSettings: GroupSettings }) => {
  const home = game.home_team;
  const away = game.away_team;
  const excitement = excitementDisplay(game.excitement_score, game.excitement_emoji);

  // Filter labels based on group settings
  const visibleLabels = game.labels.filter((label) => {
    const category = categoryForLabel(label);
    return groupSettings[category];
  });

  return (
    <Pressable style={styles.card} onPress={() => onOpenHighlights(game)}>
      <View style={styles.row}>
        <View style={styles.teamRow}>
          <TeamBadge abbreviation={away.abbreviation} />
        </View>
        <Text style={styles.vsText}>@</Text>
        <View style={styles.teamRow}>
          <TeamBadge abbreviation={home.abbreviation} />
        </View>
      </View>
      <View style={styles.metaRow}>
        <View style={[styles.excitementPill, { borderColor: excitement.border }]}>
          <Text style={[styles.excitementText, { color: excitement.border }]}>{excitement.emoji}</Text>
          <Text style={styles.excitementText}>{excitement.value.toFixed(1)}</Text>
        </View>
      </View>
      {visibleLabels.length > 0 && (
        <View style={styles.labelsWrap}>
          {[...visibleLabels]
            .sort((a, b) => {
              const ca = categoryForLabel(a);
              const cb = categoryForLabel(b);
              return BUCKET_ORDER.indexOf(ca) - BUCKET_ORDER.indexOf(cb);
            })
            .map((l) => (
              <LabelChip key={l} label={l} />
            ))}
        </View>
      )}
    </Pressable>
  );
};

export default function App() {
  const [games, setGames] = useState<Game[]>([]);
  const [gamesDate, setGamesDate] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [hasSeenHighlightWarning, setHasSeenHighlightWarning] = useState<boolean>(false);
  const [settingsVisible, setSettingsVisible] = useState<boolean>(false);
  const [groupSettings, setGroupSettings] = useState<GroupSettings>(DEFAULT_SETTINGS);

  const loadSettings = async () => {
    try {
      const saved = await AsyncStorage.getItem(SETTINGS_KEY);
      if (saved) {
        setGroupSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(saved) });
      }
    } catch (e) {
      // ignore storage errors
    }
  };

  const saveSettings = async (newSettings: GroupSettings) => {
    try {
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(newSettings));
    } catch (e) {
      // ignore storage errors
    }
  };

  const toggleGroup = (key: GroupKey) => {
    const newSettings = { ...groupSettings, [key]: !groupSettings[key] };
    setGroupSettings(newSettings);
    saveSettings(newSettings);
  };

  const loadFromCache = async () => {
    try {
      const cached = await AsyncStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        setGames(parsed.games || []);
        setGamesDate(parsed.games_date || '');
      }
    } catch (e) {
      // ignore cache errors
    }
  };

  const loadHighlightWarning = async () => {
    try {
      const seen = await AsyncStorage.getItem(HIGHLIGHT_WARNING_KEY);
      if (seen) setHasSeenHighlightWarning(true);
    } catch (e) {
      // ignore storage errors
    }
  };

  const fetchGames = async () => {
    setError(null);
    try {
      const res = await fetch(API_BASE);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      setGames(data.games || []);
      setGamesDate(data.games_date || '');
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(data));
    } catch (e: any) {
      setError(e?.message || 'Failed to load games');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    (async () => {
      await loadFromCache();
      await loadHighlightWarning();
      await loadSettings();
      setLoading(true);
      await fetchGames();
    })();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchGames();
  };

  const openHighlights = (game: Game) => {
    const awaySlug = (game.away_team.abbreviation || '').toLowerCase();
    const homeSlug = (game.home_team.abbreviation || '').toLowerCase();
    const url = `https://www.nba.com/game/${awaySlug}-vs-${homeSlug}-${game.game_id}?watchRecap=true`;

    const launch = () => {
      Linking.openURL(url).catch(() => {
        // swallow; could surface a toast if needed
      });
    };

    if (hasSeenHighlightWarning) {
      launch();
      return;
    }

    Alert.alert(
      'Heads up',
      'Opening highlights will show the final score. In the NBA app, turn on Hide Scores before continuing.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Proceed',
          style: 'default',
          onPress: async () => {
            setHasSeenHighlightWarning(true);
            try {
              await AsyncStorage.setItem(HIGHLIGHT_WARNING_KEY, '1');
            } catch (e) {
              // ignore storage errors
            }
            launch();
          },
        },
      ],
    );
  };

  const data = games;
  
  // Filter visible legend items based on settings
  const visibleLegend = LEGEND.filter((item) => groupSettings[item.key as GroupKey]);
  
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" />
        <SettingsModal
          visible={settingsVisible}
          onClose={() => setSettingsVisible(false)}
          settings={groupSettings}
          onToggle={toggleGroup}
        />
        {loading && data.length === 0 ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.textPrimary} />
            <Text style={styles.loadingText}>Loading games...</Text>
          </View>
        ) : (
          <FlatList
            data={data}
            keyExtractor={(item) => item.game_id}
            contentContainerStyle={styles.list}
            ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
            renderItem={({ item }) => <GameCard game={item} onOpenHighlights={openHighlights} groupSettings={groupSettings} />}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textPrimary} />}
            ListHeaderComponent={
              gamesDate ? (
                <View style={styles.headerRow}>
                  <View style={styles.headerTitleRow}>
                    <View>
                      <Text style={styles.headerKicker}>Previous night</Text>
                      <Text style={styles.headerText}>{formatDate(gamesDate)}</Text>
                    </View>
                    <Pressable onPress={() => setSettingsVisible(true)} style={styles.settingsButton}>
                      <Text style={styles.settingsButtonText}>⚙️</Text>
                    </Pressable>
                  </View>
                </View>
              ) : null
            }
            ListEmptyComponent={
              <View style={styles.center}>
                <Text style={styles.loadingText}>{error || 'No games found'}</Text>
              </View>
            }
            ListFooterComponent={
              <View style={styles.legendWrap}>
                {visibleLegend.map((item) => (
                  <View key={item.name} style={styles.legendRow}>
                    <View style={[styles.legendSwatch, { backgroundColor: item.color }]} />
                    <Text style={styles.legendName}>{item.name}</Text>
                  </View>
                ))}
              </View>
            }
          />
        )}
        {error && !loading && (
          <View style={styles.errorBar}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  list: {
    padding: spacing.lg,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  teamBadge: {
    width: 60,
    height: 52,
    borderRadius: 15,
    borderWidth: 1.5,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 6,
    elevation: 3,
  },
  teamBadgeText: {
    fontSize: fonts.subtitle,
    fontWeight: '800',
    letterSpacing: 0.5,
    zIndex: 1,
  },
  vsText: {
    color: colors.textSecondary,
    fontSize: fonts.subtitle,
    fontWeight: '600',
  },
  labelsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  chip: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    minWidth: '47%',
    maxWidth: '47%',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
  },
  chipText: {
    color: colors.card,
    fontSize: 11.5,
    fontWeight: '700',
    lineHeight: 16,
    textAlign: 'center',
    textAlignVertical: 'center',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  headerText: {
    color: colors.textPrimary,
    marginBottom: spacing.sm,
    fontSize: fonts.title,
    fontWeight: '700',
  },
  headerRow: {
    marginBottom: spacing.md,
  },
  headerKicker: {
    color: colors.textSecondary,
    fontSize: fonts.label,
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
  },
  errorBar: {
    position: 'absolute',
    bottom: spacing.lg,
    left: spacing.lg,
    right: spacing.lg,
    backgroundColor: '#a83232',
    padding: spacing.md,
    borderRadius: radius.md,
  },
  errorText: {
    color: colors.card,
    textAlign: 'center',
    fontWeight: '700',
  },
  legendWrap: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  legendSwatch: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  legendName: {
    color: colors.textSecondary,
    fontWeight: '600',
    fontSize: fonts.label,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  excitementPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    minWidth: 110,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.card,
    flexDirection: 'row',
    gap: spacing.xs,
  },
  excitementText: {
    color: colors.textPrimary,
    fontWeight: '800',
    fontSize: fonts.subtitle,
    textAlign: 'center',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  settingsButton: {
    padding: spacing.xs,
  },
  settingsButtonText: {
    fontSize: 22,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalContent: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    width: '100%',
    maxWidth: 340,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  modalTitle: {
    color: colors.textPrimary,
    fontSize: fonts.title,
    fontWeight: '700',
  },
  closeButton: {
    padding: spacing.xs,
  },
  closeButtonText: {
    color: colors.textSecondary,
    fontSize: 24,
    fontWeight: '600',
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: fonts.subtitle,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  sectionSubtitle: {
    color: colors.textSecondary,
    fontSize: fonts.label,
    marginBottom: spacing.md,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  settingLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  settingSwatch: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  settingLabel: {
    color: colors.textPrimary,
    fontSize: fonts.body,
    fontWeight: '500',
  },
  modalFooter: {
    marginTop: spacing.md,
    paddingTop: spacing.sm,
  },
  footerText: {
    color: colors.textSecondary,
    fontSize: fonts.label,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
