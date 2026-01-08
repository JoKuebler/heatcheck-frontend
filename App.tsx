import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, StatusBar, ActivityIndicator, RefreshControl, Pressable, Linking, Alert, Modal, Switch, Animated, Dimensions, PanResponder, FlatList } from 'react-native';
import Svg, { Path, Defs, Text as SvgText, TextPath } from 'react-native-svg';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, spacing, radius, fonts } from './src/theme';
import type { Game } from './src/types';
import { getTeamVisual } from './src/teamPalette';
import {
  LEGEND,
  GroupKey,
  GroupSettings,
  DEFAULT_SETTINGS,
  LABEL_COLORS,
  BUCKET_ORDER,
  SCORE_BORDERS,
  SCORE_EMOJIS,
  LABEL_PATTERNS,
  LABEL_DISPLAY,
  API_BASE,
  CACHE_KEY,
  HIGHLIGHT_WARNING_KEY,
  SETTINGS_KEY,
  BEHIND_THE_SCENES_URL,
  SUPPORT_URL
} from './src/constants';
import {
  enablePushNotifications,
  disablePushNotifications,
  isNotificationsEnabled,
  isPushNotificationsSupported,
} from './src/notifications';
import { 
  AnimatedScorePill, 
  useAnimatedHeader 
} from './src/components/AnimatedComponents';

export function excitementDisplay(score?: number, emojiFromApi?: string) {
  const value = score ?? 0;
  const bucket = Math.min(10, Math.max(1, Math.floor(value)));
  const emoji = emojiFromApi || SCORE_EMOJIS.find(([threshold]) => bucket >= threshold)?.[1] || '✨';
  return { value, emoji, border: SCORE_BORDERS[bucket - 1] };
}

export function categoryForLabel(label: string): GroupKey {
  return (LABEL_PATTERNS.find(([pattern]) => pattern.test(label))?.[1] as GroupKey) || 'flow';
}

const formatDate = (iso: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

// Helper to get date string offset from yesterday (Eastern Time)
const getDateForOffset = (offset: number): string => {
  // Get current time in Eastern timezone
  const now = new Date();
  const etFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const [etYear, etMonth, etDay] = etFormatter.format(now).split('-').map(Number);
  
  // Create date object for yesterday ET
  const yesterdayET = new Date(etYear, etMonth - 1, etDay);
  yesterdayET.setDate(yesterdayET.getDate() - 1);
  
  // Apply offset
  const targetDate = new Date(yesterdayET);
  targetDate.setDate(targetDate.getDate() + offset);
  
  // Format as YYYY-MM-DD
  const year = targetDate.getFullYear();
  const month = String(targetDate.getMonth() + 1).padStart(2, '0');
  const day = String(targetDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Helper to determine the kicker text (label above date)
const getKickerText = (offset: number): string => {
  if (offset < 0) return 'Past games';
  if (offset === 0) return 'Previous night';
  if (offset === 1) return "Tonight's games";
  return 'Upcoming games';
};

// Convert ET time string (e.g., "7:00 pm ET") to user's local time
const convertETtoLocalTime = (etTimeStr: string, gamesDate: string): string => {
  if (!etTimeStr || !gamesDate) return etTimeStr || '';
  
  // Parse time like "7:00 pm ET" or "10:30 am ET"
  const match = etTimeStr.match(/(\d{1,2}):(\d{2})\s*([ap]m)/i);
  if (!match) return etTimeStr;
  
  let hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  const ampm = match[3].toLowerCase();
  
  // Convert to 24-hour format
  if (ampm === 'pm' && hour !== 12) hour += 12;
  if (ampm === 'am' && hour === 12) hour = 0;
  
  // Parse the game date (YYYY-MM-DD)
  const [year, month, day] = gamesDate.split('-').map(Number);
  if (!year || !month || !day) return etTimeStr;
  
  // Create a date string that we can parse as ET
  // Format: "2026-01-08T19:00:00" then interpret in America/New_York
  const etDateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
  
  // Use Intl.DateTimeFormat to find ET offset and convert
  const etFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  
  // Get current ET offset by checking a known date
  const testDate = new Date(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T12:00:00Z`);
  const etParts = etFormatter.formatToParts(testDate);
  const etHour = parseInt(etParts.find(p => p.type === 'hour')?.value || '12', 10);
  const utcHour = 12;
  const etOffsetHours = etHour - utcHour; // Negative for behind UTC (ET is -5 or -4)
  
  // Create UTC date from ET time
  const utcDate = new Date(Date.UTC(year, month - 1, day, hour - etOffsetHours, minute));
  
  // Format in user's local timezone
  return utcDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

const LabelChip = ({ label }: { label: string }) => {
  const text = LABEL_DISPLAY[label.toLowerCase()] || label;
  const category = categoryForLabel(label);
  const bg = LABEL_COLORS[category] || colors.chipBg;
  return (
    <View style={[styles.chip, { backgroundColor: bg }]}>
      <Text style={styles.chipText}>{text}</Text>
    </View>
  );
};

const TeamBadge = ({ abbreviation, name, confRank }: { abbreviation: string; name?: string; confRank?: number }) => {
  const { primary, secondary, text } = getTeamVisual(abbreviation);
  // SVG path from jersey.svg - modified with rounded bottom corners
  // Main jersey body (large area) with rounded bottom
  // All paths centered in 511x511 viewBox (original coords shifted: x+0, y+0 since jersey spans ~56-455 x, ~23-487 y)
  // Center offset: add 56 to x coords to center the 399-wide jersey in 511 (margin = 56 on each side)
  const mainPath = "M 123.5,23.5 C 147.169,23.3334 170.836,23.5 194.5,24C 234.907,65.9545 275.24,65.9545 315.5,24C 339.5,23.3333 363.5,23.3333 387.5,24C 388.667,25.1667 389.833,26.3333 391,27.5C 391.333,73.5 391.667,119.5 392,165.5C 398.61,197.768 418.443,214.601 451.5,216C 452.667,217.167 453.833,218.333 455,219.5C 455.667,307.5 455.667,395.5 455,453.5C 455,470 445,487 420,487C 320.833,487.667 190.167,487.667 91,487C 66,487 56,470 56,453.5C 55.3333,395.5 55.3333,307.5 56,219.5C 57.1667,218.333 58.3333,217.167 59.5,216C 92.5396,214.621 112.373,197.788 119,165.5C 119.333,119.5 119.667,73.5 120,27.5C 121.376,26.2949 122.542,24.9616 123.5,23.5 Z";
  // Left arm stitch
  const leftStitch = "M 120.5,23.5 C 125.833,23.5 131.167,23.5 136.5,23.5C 136.667,65.8346 136.5,108.168 136,150.5C 131.198,186.632 112.032,211.799 78.5,226C 71.4063,228.719 64.073,230.219 56.5,230.5C 56.1725,225.456 56.5059,220.456 57.5,215.5C 92.46,209.04 113.293,188.374 120,153.5C 120.5,110.168 120.667,66.8346 120.5,23.5 Z";
  // Right arm stitch
  const rightStitch = "M 374.5,23.5 C 379.833,23.5 385.167,23.5 390.5,23.5C 390.333,66.8346 390.5,110.168 391,153.5C 397.707,188.374 418.54,209.04 453.5,215.5C 454.494,220.456 454.827,225.456 454.5,230.5C 418.713,225.853 393.88,206.853 380,173.5C 377.311,166.057 375.645,158.391 375,150.5C 374.5,108.168 374.333,65.8346 374.5,23.5 Z";
  // Arc path for city name curved across the jersey chest
  const arcPath = "M 130 260 Q 255 180 380 260";
  // Generate unique ID for this badge instance
  const pathId = `arcPath-${abbreviation}`;
  // Use full city name
  const displayName = name || '';
  // Dynamic font size based on name length - scale to fit full name (scaled up)
  const getFontSize = (nameLength: number) => {
    if (nameLength > 14) return 24;
    if (nameLength > 12) return 27;
    if (nameLength > 10) return 30;
    if (nameLength > 8) return 34;
    if (nameLength > 6) return 38;
    return 44;
  };
  const fontSize = getFontSize(displayName.length);
  // Jersey number is the conference rank (1-15)
  const jerseyNumber = confRank ? String(confRank) : '';
  // SVG viewBox is 399x464, aspect ratio = 0.86. For height 70, width should be 60
  return (
    <View style={styles.jerseyContainer}>
      <Svg width={60} height={70} viewBox="56 23 399 464">
        {/* Main jersey body */}
        <Path d={mainPath} fill={primary} />
        {/* Left arm stitch */}
        <Path d={leftStitch} fill={secondary} />
        {/* Right arm stitch */}
        <Path d={rightStitch} fill={secondary} />
        {/* City name curved across jersey chest */}
        {displayName && (
          <Defs>
            <Path id={pathId} d={arcPath} />
          </Defs>
        )}
        {displayName && (
          <SvgText
            fontSize={fontSize}
            fontWeight="900"
            fill={text}
            textAnchor="middle"
            fontFamily="System"
            letterSpacing={1}
          >
            <TextPath href={`#${pathId}`} startOffset="50%">
              {displayName.toUpperCase()}
            </TextPath>
          </SvgText>
        )}
        {/* Jersey number (conference rank) below the name */}
        {jerseyNumber && (
          <SvgText
            x="255"
            y="380"
            fontSize={140}
            fontWeight="900"
            fill={text}
            textAnchor="middle"
            fontFamily="System"
            letterSpacing={3}
          >
            {jerseyNumber}
          </SvgText>
        )}
      </Svg>
      {/* Team-colored accent line below jersey */}
      <View style={[styles.jerseyAccentLine, { backgroundColor: secondary }]} />
    </View>
  );
};


const SettingsModal = ({ 
  visible, 
  onClose, 
  settings, 
  onToggle,
  notificationsEnabled,
  notificationsSupported,
  onToggleNotifications,
}: { 
  visible: boolean; 
  onClose: () => void; 
  settings: GroupSettings;
  onToggle: (key: GroupKey) => void;
  notificationsEnabled: boolean;
  notificationsSupported: boolean;
  onToggleNotifications: () => void;
}) => {

  const openSupport = () => {
    Linking.openURL(SUPPORT_URL).catch(() => {});
  };

  const openPrivacy = () => {
    Linking.openURL(SUPPORT_URL + '#privacy').catch(() => {});
  };

  const openTerms = () => {
    Linking.openURL(SUPPORT_URL + '#terms').catch(() => {});
  };

  const openBehindTheScenes = () => {
    Linking.openURL(BEHIND_THE_SCENES_URL).catch(() => {});
  };

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

          {/* Notification Section */}
          <Text style={[styles.sectionTitle, { marginTop: spacing.lg }]}>Notifications</Text>
          <Text style={styles.sectionSubtitle}>Get alerted when exciting games happen</Text>
          
          <View style={styles.settingRow}>
            <View style={styles.settingLabelRow}>
              <Text style={styles.notificationIcon}>🔔</Text>
              <View>
                <Text style={styles.settingLabel}>Morning Alert</Text>
                <Text style={styles.notificationSubtext}>
                  {notificationsSupported 
                    ? 'One daily notification'
                    : 'Requires a physical device'}
                </Text>
              </View>
            </View>
            <Switch
              value={notificationsEnabled}
              onValueChange={onToggleNotifications}
              disabled={!notificationsSupported}
              trackColor={{ false: colors.border, true: colors.accentFlow }}
              thumbColor={colors.textPrimary}
            />
          </View>
          
          {/* Behind the Scenes Button */}
          <View style={styles.tipSection}>
            <Pressable style={styles.tipButton} onPress={openBehindTheScenes}>
              <Text style={styles.tipEmoji}>🎬</Text>
              <View style={styles.tipTextWrap}>
                <Text style={styles.tipTitle}>Behind the Scenes</Text>
              </View>
            </Pressable>
          </View>

          {/* Legal Links */}
          <View style={styles.legalSection}>
            <Pressable onPress={openSupport}>
              <Text style={styles.legalLink}>Support</Text>
            </Pressable>
            <Text style={styles.legalDivider}>•</Text>
            <Pressable onPress={openPrivacy}>
              <Text style={styles.legalLink}>Privacy Policy</Text>
            </Pressable>
            <Text style={styles.legalDivider}>•</Text>
            <Pressable onPress={openTerms}>
              <Text style={styles.legalLink}>Terms of Service</Text>
            </Pressable>
          </View>
          
          <View style={styles.modalFooter}>
            <Text style={styles.footerText}>Made with ❤️ for next-morning 🏀</Text>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const GameCard = ({ game, gamesDate, onOpenHighlights, groupSettings, isVisible }: { game: Game; gamesDate: string; onOpenHighlights: (game: Game) => void; groupSettings: GroupSettings; isVisible: boolean }) => {
  const home = game.home_team;
  const away = game.away_team;
  const isPending = game.status === 'pending';
  const isScheduled = game.status === 'scheduled';
  const excitement = excitementDisplay(game.excitement_score, game.excitement_emoji);
  const canWatchHighlights = !isPending && !isScheduled;

  // Filter labels based on group settings
  const visibleLabels = game.labels.filter((label) => {
    const category = categoryForLabel(label);
    return groupSettings[category];
  });

  return (
    <View style={[styles.card, (isPending || isScheduled) && styles.cardPending]}>
      {/* Arena name at top center */}
      {game.arena && (
        <View style={styles.arenaRow}>
          <Text style={styles.arenaText}>{game.arena}</Text>
        </View>
      )}
      <View style={styles.teamsRow}>
        <TeamBadge abbreviation={away.abbreviation} name={away.name} confRank={away.conf_rank} />
        <Text style={styles.vsText}>@</Text>
        <TeamBadge abbreviation={home.abbreviation} name={home.name} confRank={home.conf_rank} />
      </View>
      {/* Highlights link - subtle, above score */}
      {canWatchHighlights && (
        <Pressable 
          style={styles.highlightsLink}
          onPress={() => onOpenHighlights(game)}
          hitSlop={12}
        >
          <Text style={styles.highlightsLinkText}>▶︎ Watch Highlights</Text>
        </Pressable>
      )}
      <View style={styles.metaRow}>
        {isScheduled && game.game_time ? (
          <View style={styles.gameTimePill}>
            <Text style={styles.gameTimeText}>🕐 {convertETtoLocalTime(game.game_time, gamesDate)}</Text>
          </View>
        ) : (
          <AnimatedScorePill excitement={excitement} isPending={isPending} isVisible={isVisible} />
        )}
      </View>
      {!isPending && !isScheduled && visibleLabels.length > 0 && (
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
    </View>
  );
};

export default function App() {
  // Pre-cached data for all 3 days: -1 (day before), 0 (yesterday), +1 (today/future)
  const [gamesCache, setGamesCache] = useState<Record<number, { games: Game[]; date: string }>>({
    [-1]: { games: [], date: '' },
    [0]: { games: [], date: '' },
    [1]: { games: [], date: '' },
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [hasSeenHighlightWarning, setHasSeenHighlightWarning] = useState<boolean>(false);
  const [settingsVisible, setSettingsVisible] = useState<boolean>(false);
  const [groupSettings, setGroupSettings] = useState<GroupSettings>(DEFAULT_SETTINGS);
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(false);
  const [notificationsSupported, setNotificationsSupported] = useState<boolean>(false);
  
  // Current page index: 0 = yesterday, 1 = today (default), 2 = tomorrow
  // Maps to offsets: pageIndex 0 = offset -1, pageIndex 1 = offset 0, pageIndex 2 = offset +1
  const [currentPage, setCurrentPage] = useState<number>(1); // Start at middle (today)
  const currentPageRef = useRef(currentPage); // Ref to track current page for pan responder
  const screenWidth = Dimensions.get('window').width;
  
  // Animated value for the horizontal scroll position
  // Value represents the X offset: 0 = page 0, -screenWidth = page 1, -2*screenWidth = page 2
  const scrollX = useRef(new Animated.Value(-screenWidth)).current; // Start at page 1 (middle)
  const isAnimating = useRef(false);
  
  // Keep ref in sync with state
  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);
  
  // Constants
  const TOTAL_PAGES = 3;

  const loadNotificationStatus = async () => {
    try {
      const supported = await isPushNotificationsSupported();
      setNotificationsSupported(supported);
      
      if (supported) {
        const enabled = await isNotificationsEnabled();
        setNotificationsEnabled(enabled);
      }
    } catch (e) {
      // ignore errors
    }
  };

  const handleToggleNotifications = async () => {
    if (notificationsEnabled) {
      // Disable notifications
      await disablePushNotifications();
      setNotificationsEnabled(false);
    } else {
      // Enable notifications
      const result = await enablePushNotifications();
      if (result.success) {
        setNotificationsEnabled(true);
      } else {
        Alert.alert(
          'Could not enable notifications',
          result.error || 'Please check your device settings.',
          [{ text: 'OK' }]
        );
      }
    }
  };

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
        // Load cached data into the middle slot (offset 0)
        setGamesCache(prev => ({
          ...prev,
          [0]: { games: parsed.games || [], date: parsed.games_date || '' },
        }));
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

  // Fetch a single day's data
  const fetchSingleDay = async (offset: number): Promise<{ games: Game[]; date: string }> => {
    const targetDate = getDateForOffset(offset);
    
    try {
      const url = `${API_BASE}?date=${targetDate}`;
      
      const res = await fetch(url);
      if (!res.ok) {
        if (res.status === 404) {
          return { games: [], date: targetDate };
        }
        throw new Error(`HTTP ${res.status}`);
      }
      
      const data = await res.json();
      return { games: data.games || [], date: data.games_date || targetDate };
    } catch (e) {
      console.warn(`Failed to fetch day ${offset}:`, e);
      return { games: [], date: targetDate };
    }
  };

  // Fetch all 3 days at once (called on app load and pull-to-refresh)
  const fetchAllDays = useCallback(async () => {
    setError(null);
    setLoading(true);
    
    try {
      // Fetch all 3 days in parallel
      const [dayMinus1, day0, dayPlus1] = await Promise.all([
        fetchSingleDay(-1),
        fetchSingleDay(0),
        fetchSingleDay(1),
      ]);
      
      const newCache = {
        [-1]: dayMinus1,
        [0]: day0,
        [1]: dayPlus1,
      };
      
      setGamesCache(newCache);
      
      // Cache yesterday's data (offset 0) for offline use
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({
        games: day0.games,
        games_date: day0.date,
      }));
    } catch (e: any) {
      setError(e?.message || 'Failed to load games');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await loadFromCache();
      await loadHighlightWarning();
      await loadSettings();
      await loadNotificationStatus();
      await fetchAllDays();
    })();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAllDays();
  };

  // Convert page index to date offset: page 0 = -1, page 1 = 0, page 2 = +1
  const pageToOffset = (page: number) => page - 1;
  const offsetToPage = (offset: number) => offset + 1;

  // Navigate to a specific page with smooth animation
  const animateToPage = useCallback((targetPage: number) => {
    if (targetPage < 0 || targetPage >= TOTAL_PAGES || isAnimating.current) return;
    if (targetPage === currentPage) return;
    
    isAnimating.current = true;
    const targetX = -targetPage * screenWidth;
    
    Animated.spring(scrollX, {
      toValue: targetX,
      useNativeDriver: true,
      friction: 20,
      tension: 100,
    }).start(() => {
      isAnimating.current = false;
      setCurrentPage(targetPage);
    });
  }, [currentPage, screenWidth, scrollX]);

  const goToPreviousDay = useCallback(() => {
    animateToPage(currentPage - 1);
  }, [currentPage, animateToPage]);

  const goToNextDay = useCallback(() => {
    animateToPage(currentPage + 1);
  }, [currentPage, animateToPage]);

  // Pan responder for swipe gestures - directly controls scrollX
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        if (isAnimating.current) return false;
        const isHorizontal = Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
        const hasMinDistance = Math.abs(gestureState.dx) > 10;
        return isHorizontal && hasMinDistance;
      },
      onPanResponderGrant: () => {
        // Stop any running animation and capture current position
        scrollX.stopAnimation();
      },
      onPanResponderMove: (_, gestureState) => {
        // Calculate new position based on gesture (use ref for current value)
        const page = currentPageRef.current;
        const baseX = -page * screenWidth;
        let newX = baseX + gestureState.dx;
        
        // Add resistance at edges
        if (newX > 0) {
          newX = newX * 0.3; // Resistance at left edge
        } else if (newX < -(TOTAL_PAGES - 1) * screenWidth) {
          const overscroll = newX + (TOTAL_PAGES - 1) * screenWidth;
          newX = -(TOTAL_PAGES - 1) * screenWidth + overscroll * 0.3; // Resistance at right edge
        }
        
        scrollX.setValue(newX);
      },
      onPanResponderRelease: (_, gestureState) => {
        const page = currentPageRef.current;
        const velocity = gestureState.vx;
        const swipeThreshold = screenWidth * 0.15;
        
        let targetPage = page;
        
        // Determine target page based on gesture distance and velocity
        if (gestureState.dx > swipeThreshold || velocity > 0.5) {
          targetPage = Math.max(0, page - 1);
        } else if (gestureState.dx < -swipeThreshold || velocity < -0.5) {
          targetPage = Math.min(TOTAL_PAGES - 1, page + 1);
        }
        
        // Animate to target page
        const targetX = -targetPage * screenWidth;
        isAnimating.current = true;
        
        Animated.spring(scrollX, {
          toValue: targetX,
          useNativeDriver: true,
          friction: 20,
          tension: 100,
          velocity: velocity,
        }).start(() => {
          isAnimating.current = false;
          setCurrentPage(targetPage);
        });
      },
    })
  ).current;

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

  // Get current dateOffset from page (page 0 = -1, page 1 = 0, page 2 = +1)
  const dateOffset = pageToOffset(currentPage);

  // Get data for all 3 pages
  const page0Data = gamesCache[-1] || { games: [], date: '' };
  const page1Data = gamesCache[0] || { games: [], date: '' };
  const page2Data = gamesCache[1] || { games: [], date: '' };
  
  // Current page data for header
  const currentData = gamesCache[dateOffset] || { games: [], date: '' };
  const gamesDate = currentData.date;
  
  // Filter visible legend items based on settings
  const visibleLegend = LEGEND.filter((item) => groupSettings[item.key as GroupKey]);

  // Scroll-based header animation (shrinking effect)
  const { 
    headerShadowOpacity, 
    headerPaddingVertical, 
    titleFontSize, 
    kickerOpacity, 
    kickerHeight,
    onScroll 
  } = useAnimatedHeader();
  
  // Header component rendered outside FlatList for sticky behavior
  const renderHeader = () => {
    const displayDate = gamesDate || getDateForOffset(dateOffset);
    const canGoBack = currentPage > 0;
    const canGoForward = currentPage < TOTAL_PAGES - 1;
    return (
      <Animated.View style={[
        styles.stickyHeader,
        {
          shadowOpacity: headerShadowOpacity,
          paddingVertical: headerPaddingVertical,
        }
      ]}>
        <View style={styles.headerTitleRow}>
          {/* Left arrow - previous day */}
          <Pressable 
            onPress={goToPreviousDay} 
            style={styles.navArrow} 
            hitSlop={8}
            disabled={!canGoBack}
          >
            <Text style={[
              styles.navArrowText, 
              !canGoBack && styles.navArrowDisabled
            ]}>‹</Text>
          </Pressable>
          
          <View style={styles.headerTitleCenter}>
            <Animated.Text style={[
              styles.headerKicker, 
              { 
                opacity: kickerOpacity,
                height: kickerHeight,
              }
            ]}>
              {getKickerText(dateOffset)}
            </Animated.Text>
            <Animated.Text style={[
              styles.headerText, 
              { fontSize: titleFontSize }
            ]}>
              {formatDate(displayDate)}
            </Animated.Text>
          </View>
          
          {/* Right arrow - next day */}
          <Pressable 
            onPress={goToNextDay} 
            style={styles.navArrow} 
            hitSlop={8}
            disabled={!canGoForward}
          >
            <Text style={[
              styles.navArrowText,
              !canGoForward && styles.navArrowDisabled
            ]}>›</Text>
          </Pressable>
          
          <Pressable onPress={() => setSettingsVisible(true)} style={styles.settingsButton}>
            <View style={styles.settingsIcon}>
              <View style={styles.settingsBar} />
              <View style={styles.settingsBar} />
              <View style={styles.settingsBar} />
            </View>
          </Pressable>
        </View>
      </Animated.View>
    );
  };
  
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle="light-content" />
        <SettingsModal
          visible={settingsVisible}
          onClose={() => setSettingsVisible(false)}
          settings={groupSettings}
          onToggle={toggleGroup}
          notificationsEnabled={notificationsEnabled}
          notificationsSupported={notificationsSupported}
          onToggleNotifications={handleToggleNotifications}
        />
        {/* Sticky Header */}
        {renderHeader()}
        {loading && Object.keys(gamesCache).length === 0 ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.textPrimary} />
            <Text style={styles.loadingText}>Loading games...</Text>
          </View>
        ) : (
          <View style={{ flex: 1, overflow: 'hidden' }} {...panResponder.panHandlers}>
            <Animated.View 
              style={{ 
                flex: 1, 
                flexDirection: 'row', 
                width: screenWidth * TOTAL_PAGES,
                transform: [{ translateX: scrollX }] 
              }}
            >
              {/* Page 0: Yesterday (offset -1) */}
              <View style={{ width: screenWidth }}>
                <FlatList<Game>
                  data={page0Data.games}
                  keyExtractor={(item) => item.game_id}
                  contentContainerStyle={styles.list}
                  ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
                  renderItem={({ item }) => (
                    <GameCard 
                      game={item} 
                      gamesDate={page0Data.date}
                      onOpenHighlights={openHighlights} 
                      groupSettings={groupSettings} 
                      isVisible={true}
                    />
                  )}
                  refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textPrimary} />}
                  onScroll={currentPage === 0 ? onScroll : undefined}
                  scrollEventThrottle={16}
                  ListEmptyComponent={
                    <View style={styles.center}>
                      <Text style={styles.loadingText}>No games found</Text>
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
              </View>
              
              {/* Page 1: Today (offset 0) */}
              <View style={{ width: screenWidth }}>
                <FlatList<Game>
                  data={page1Data.games}
                  keyExtractor={(item) => item.game_id}
                  contentContainerStyle={styles.list}
                  ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
                  renderItem={({ item }) => (
                    <GameCard 
                      game={item} 
                      gamesDate={page1Data.date}
                      onOpenHighlights={openHighlights} 
                      groupSettings={groupSettings} 
                      isVisible={true}
                    />
                  )}
                  refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textPrimary} />}
                  onScroll={currentPage === 1 ? onScroll : undefined}
                  scrollEventThrottle={16}
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
              </View>
              
              {/* Page 2: Tomorrow (offset +1) */}
              <View style={{ width: screenWidth }}>
                <FlatList<Game>
                  data={page2Data.games}
                  keyExtractor={(item) => item.game_id}
                  contentContainerStyle={styles.list}
                  ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
                  renderItem={({ item }) => (
                    <GameCard 
                      game={item} 
                      gamesDate={page2Data.date}
                      onOpenHighlights={openHighlights} 
                      groupSettings={groupSettings} 
                      isVisible={true}
                    />
                  )}
                  refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textPrimary} />}
                  onScroll={currentPage === 2 ? onScroll : undefined}
                  scrollEventThrottle={16}
                  ListEmptyComponent={
                    <View style={styles.center}>
                      <View style={{ alignItems: 'center' }}>
                        <Text style={styles.emptyHeader}>No games tonight</Text>
                        <Text style={styles.emptySubtext}>Time to work on your jump shot! ⛹️‍♂️</Text>
                      </View>
                    </View>
                  }
                />
              </View>
            </Animated.View>
          </View>
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
    backgroundColor: '#000',
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
  cardPending: {
    opacity: 0.7,
    borderStyle: 'dashed',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  teamsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
  },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  arenaRow: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  arenaText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.3,
    opacity: 0.8,
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
  // Jersey-style badge using SVG
  jerseyContainer: {
    width: 60,
    height: 78,
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  jerseyAccentLine: {
    width: 40,
    height: 3,
    borderRadius: 2,
    marginTop: 4,
  },
  // No longer needed: jerseyImage
  jerseyText: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 0.5,
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
    fontSize: 26,
    fontWeight: '700',
  },
  headerRow: {
    marginBottom: spacing.md,
  },
  stickyHeader: {
    backgroundColor: '#000',
    paddingHorizontal: spacing.lg,
    paddingVertical: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 4,
    zIndex: 10,
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
    paddingBottom: 0,
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
    marginTop: spacing.lg,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitleLeft: {
    flex: 1,
  },
  settingsButton: {
    padding: spacing.sm,
  },
  settingsIcon: {
    width: 22,
    height: 18,
    justifyContent: 'space-between',
  },
  settingsBar: {
    height: 2,
    backgroundColor: colors.textSecondary,
    borderRadius: 1,
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
  notificationIcon: {
    fontSize: 20,
    marginRight: spacing.xs,
  },
  notificationSubtext: {
    color: colors.textSecondary,
    fontSize: fonts.label,
    marginTop: 2,
  },
  tipSection: {
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  tipButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  tipEmoji: {
    fontSize: 28,
  },
  tipTextWrap: {
    flex: 1,
  },
  tipTitle: {
    color: colors.textPrimary,
    fontSize: fonts.body,
    fontWeight: '600',
  },
  tipSubtitle: {
    color: colors.textSecondary,
    fontSize: fonts.label,
  },
  legalSection: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  legalLink: {
    color: colors.textSecondary,
    fontSize: fonts.label,
    textDecorationLine: 'underline',
  },
  legalDivider: {
    color: colors.textSecondary,
    fontSize: fonts.label,
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
  // Date navigation styles
  navArrow: {
    padding: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  navArrowText: {
    color: colors.textPrimary,
    fontSize: 32,
    fontWeight: '300',
    lineHeight: 36,
  },
  headerTitleCenter: {
    flex: 1,
    alignItems: 'center',
  },
  // Game time pill for scheduled games
  gameTimePill: {
    backgroundColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  gameTimeText: {
    color: colors.textPrimary,
    fontSize: fonts.body,
    fontWeight: '600',
  },
  futureGamesHint: {
    color: colors.textSecondary,
    fontSize: fonts.label,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  navArrowDisabled: {
    opacity: 0.2,
  },
  // Highlights link - subtle text style
  highlightsLink: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xs,
    marginTop: spacing.sm,
  },
  highlightsLinkText: {
    color: colors.textSecondary,
    fontSize: fonts.label,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  emptyHeader: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 6,
  },
  emptySubtext: {
    color: colors.textSecondary,
    fontSize: 15,
    fontWeight: '500',
    textAlign: 'center',
  },
});
