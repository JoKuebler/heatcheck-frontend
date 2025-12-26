import React, { useEffect, useState } from 'react';
import { FlatList, View, Text, StyleSheet, StatusBar, ActivityIndicator, RefreshControl, Pressable, Linking, Alert } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, spacing, radius, fonts } from './src/theme';
import type { Game } from './src/types';
import { getTeamVisual } from './src/teamPalette';

const API_BASE = 'https://app-production-2fb0.up.railway.app/api/games';
const CACHE_KEY = 'games_cache_latest';
const HIGHLIGHT_WARNING_KEY = 'highlight_warning_seen_v1';

const formatDate = (iso: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const LEGEND = [
  { name: 'Matchup Stakes', color: colors.accentMatchup },
  { name: 'Flow & Finish', color: colors.accentFlow },
  { name: 'Player Stats', color: colors.accentPlayer },
  { name: 'Ugly Beautiful', color: colors.accentStat },
  { name: 'Statistically Rare', color: colors.accentRare },
  { name: 'Skip Signals', color: colors.accentMeta },
];

const LABEL_COLORS: Record<string, string> = {
  flow: colors.accentFlow,
  defense: colors.accentStat,
  player: colors.accentPlayer,
  matchup: colors.accentMatchup,
  rare: colors.accentRare,
  meta: colors.accentMeta,
};

const BUCKET_ORDER: Array<keyof typeof LABEL_COLORS> = ['matchup', 'flow', 'player', 'defense', 'rare', 'meta'];

function excitementDisplay(score?: number, emojiFromApi?: string) {
  const value = typeof score === 'number' ? score : 0;
  const bucket = Math.min(10, Math.max(1, Math.floor(value)));
  const borderMap: Record<number, string> = {
    1: colors.scoreBorder1,
    2: colors.scoreBorder2,
    3: colors.scoreBorder3,
    4: colors.scoreBorder4,
    5: colors.scoreBorder5,
    6: colors.scoreBorder6,
    7: colors.scoreBorder7,
    8: colors.scoreBorder8,
    9: colors.scoreBorder9,
    10: colors.scoreBorder10,
  };

  let emoji = emojiFromApi || '✨';
  if (bucket >= 9) emoji = emojiFromApi || '💎';
  else if (bucket >= 7) emoji = emojiFromApi || '⚡️';
  else if (bucket >= 5) emoji = emojiFromApi || '✨';
  else if (bucket >= 3) emoji = emojiFromApi || '🪫';
  else emoji = emojiFromApi || '💀';

  return { value, emoji, border: borderMap[bucket] };
}

function categoryForLabel(label: string): keyof typeof LABEL_COLORS {
  const l = label.toLowerCase();
  if (
    l.includes('instant classic') ||
    l.includes('back & forth') ||
    l.includes('down to the wire') ||
    l.includes('nail biter') ||
    l.includes('4th quarter comeback') ||
    l.includes('high octane') ||
    l.includes('3-point shootout') ||
    l.includes('first quarter fireworks')
  ) {
    return 'flow';
  }
  if (
    l.includes('defensive slugfest') ||
    l.includes('chaos ball') ||
    l.includes('brick fest') ||
    l.includes('free throw parade') ||
    l.includes('free throw desert')
  ) {
    return 'defense';
  }
  if (
    l.includes('triple double') ||
    l.includes('scoring explosion') ||
    l.includes('sniper game') ||
    l.includes('pickpocket') ||
    l.includes('block party')
  ) {
    return 'player';
  }
  if (l.includes('matchup') || l.includes('bout') || l.includes('tank bowl')) {
    return 'matchup';
  }
  if (l.includes('double ot') || l.includes('triple ot') || l.includes('heartbreaker') || l.includes('marathon') || l.includes('epic')) {
    return 'rare';
  }
  if (l.includes('consider highlights') || l.includes('blowout alert')) return 'meta';
  return 'flow'; // Ensure the return statement is clear
}

const LabelChip = ({ label }: { label: string }) => {
  const category = categoryForLabel(label);
  const bg = label === 'No special indicators' ? colors.accentMeta : LABEL_COLORS[category] || colors.chipBg;
  const normalized = label.toLowerCase();
  const text =
    label === 'No special indicators'
      ? '💤 Snoozer'
      : normalized === 'first quarter fireworks'
      ? '🔥 Hot Start'
      : label;
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

const GameCard = ({ game, onOpenHighlights }: { game: Game; onOpenHighlights: (game: Game) => void }) => {
  const home = game.home_team;
  const away = game.away_team;
  const excitement = excitementDisplay(game.excitement_score, game.excitement_emoji);

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
      <View style={styles.labelsWrap}>
        {[...game.labels]
          .sort((a, b) => {
            const ca = categoryForLabel(a);
            const cb = categoryForLabel(b);
            return BUCKET_ORDER.indexOf(ca) - BUCKET_ORDER.indexOf(cb);
          })
          .map((l) => (
            <LabelChip key={l} label={l} />
          ))}
      </View>
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
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" />
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
            renderItem={({ item }) => <GameCard game={item} onOpenHighlights={openHighlights} />}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textPrimary} />}
            ListHeaderComponent={
              gamesDate ? (
                <View style={styles.headerRow}>
                  <Text style={styles.headerKicker}>Previous night</Text>
                  <Text style={styles.headerText}>{formatDate(gamesDate)}</Text>
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
                {LEGEND.map((item) => (
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
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    minWidth: '48%',
    maxWidth: '48%',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
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
});
