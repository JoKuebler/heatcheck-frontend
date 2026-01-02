import React, { useEffect, useRef } from 'react';
import { View, Text, Pressable, Animated, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors, spacing, radius, fonts } from '../theme';

// Threshold for "exciting" games that get animated pop
const EXCITING_THRESHOLD = 6.5;

interface ExcitementData {
  value: number;
  emoji: string;
  border: string;
}

// Animated score pill with pop effect when becoming visible
export const AnimatedScorePill = ({ 
  excitement, 
  isPending,
  isVisible = false,
}: { 
  excitement: ExcitementData; 
  isPending: boolean;
  isVisible?: boolean;
}) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const hasAnimated = useRef(false);
  
  useEffect(() => {
    // Only animate exciting games when they become visible for the first time
    if (isVisible && !isPending && excitement.value >= EXCITING_THRESHOLD && !hasAnimated.current) {
      hasAnimated.current = true;
      
      // Small delay before pop for better effect
      setTimeout(() => {
        // Pop animation: scale up then back down with a bounce
        Animated.sequence([
          Animated.timing(scaleAnim, {
            toValue: 1.25,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.spring(scaleAnim, {
            toValue: 1,
            friction: 4,
            tension: 100,
            useNativeDriver: true,
          }),
        ]).start();
      }, 150);
    }
  }, [isVisible, excitement.value, isPending]);
  
  if (isPending) {
    return (
      <View style={[styles.excitementPill, styles.pendingPill]}>
        <Text style={styles.pendingText}>⏳</Text>
        <Text style={styles.pendingText}>Pending</Text>
      </View>
    );
  }
  
  const isExciting = excitement.value >= EXCITING_THRESHOLD;
  
  return (
    <Animated.View 
      style={[
        styles.excitementPill, 
        { 
          borderColor: excitement.border,
          borderWidth: isExciting ? 2 : 1.5,
          transform: [{ scale: scaleAnim }],
        }
      ]}
    >
      <Text style={[styles.excitementText, { color: excitement.border }]}>{excitement.emoji}</Text>
      <Text style={styles.excitementText}>{excitement.value.toFixed(1)}</Text>
    </Animated.View>
  );
};

// Hook for press animation with haptic feedback
export const usePressAnimation = (disabled: boolean = false) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    if (!disabled) {
      Animated.spring(scaleAnim, {
        toValue: 0.97,
        useNativeDriver: true,
        speed: 50,
        bounciness: 4,
      }).start();
    }
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  };

  const triggerHaptic = () => {
    if (!disabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  };

  return {
    scaleAnim,
    handlePressIn,
    handlePressOut,
    triggerHaptic,
  };
};

// Animated pressable card wrapper
export const AnimatedPressable = ({ 
  children, 
  onPress, 
  disabled = false,
  style,
}: { 
  children: React.ReactNode; 
  onPress: () => void;
  disabled?: boolean;
  style?: any;
}) => {
  const { scaleAnim, handlePressIn, handlePressOut, triggerHaptic } = usePressAnimation(disabled);

  const handlePress = () => {
    triggerHaptic();
    onPress();
  };

  return (
    <Pressable 
      onPressIn={handlePressIn} 
      onPressOut={handlePressOut} 
      onPress={handlePress}
    >
      <Animated.View style={[style, { transform: [{ scale: scaleAnim }] }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
};

// Hook for scroll-based header animation (shrinking effect)
export const useAnimatedHeader = () => {
  const scrollY = useRef(new Animated.Value(0)).current;
  
  // Shadow appears as you scroll
  const headerShadowOpacity = scrollY.interpolate({
    inputRange: [0, 50],
    outputRange: [0, 0.4],
    extrapolate: 'clamp',
  });

  // Header padding shrinks as you scroll
  const headerPaddingVertical = scrollY.interpolate({
    inputRange: [0, 80],
    outputRange: [20, 10],
    extrapolate: 'clamp',
  });

  // Title size shrinks as you scroll
  const titleFontSize = scrollY.interpolate({
    inputRange: [0, 80],
    outputRange: [26, 18],
    extrapolate: 'clamp',
  });

  // Kicker opacity fades as you scroll
  const kickerOpacity = scrollY.interpolate({
    inputRange: [0, 40],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  // Kicker height collapses as you scroll
  const kickerHeight = scrollY.interpolate({
    inputRange: [0, 40],
    outputRange: [20, 0],
    extrapolate: 'clamp',
  });

  const onScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    { useNativeDriver: false }
  );

  return {
    scrollY,
    headerShadowOpacity,
    headerPaddingVertical,
    titleFontSize,
    kickerOpacity,
    kickerHeight,
    onScroll,
  };
};

const styles = StyleSheet.create({
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
  pendingPill: {
    borderColor: colors.textSecondary,
    borderStyle: 'dashed',
  },
  pendingText: {
    color: colors.textSecondary,
    fontWeight: '600',
    fontSize: fonts.body,
    textAlign: 'center',
  },
});
