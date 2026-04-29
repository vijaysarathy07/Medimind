import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { Colors, Radius, Spacing } from '../constants/theme';

// ─── base component ───────────────────────────────────────────

type SkeletonProps = {
  width?:        number | `${number}%`;
  height:        number;
  borderRadius?: number;
  style?:        object;
};

export function Skeleton({ width = '100%', height, borderRadius = Radius.sm, style }: SkeletonProps) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 780, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 780, useNativeDriver: true }),
      ])
    ).start();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.32, 0.72] });

  return (
    <Animated.View
      style={[
        { width: width as any, height, borderRadius, backgroundColor: Colors.border, opacity },
        style,
      ]}
    />
  );
}

// ─── timeline item (HomeScreen) ───────────────────────────────

export function SkeletonTimelineItem({ isLast = false }: { isLast?: boolean }) {
  return (
    <View style={skStyles.timelineRow}>
      <View style={skStyles.leftCol}>
        <Skeleton width={44} height={11} borderRadius={6} style={{ marginBottom: 6 }} />
        <View style={skStyles.dotWrapper}>
          <Skeleton width={12} height={12} borderRadius={6} />
          {!isLast && <View style={skStyles.connector} />}
        </View>
      </View>
      <View style={skStyles.card}>
        <View style={skStyles.cardRow}>
          <Skeleton width="52%" height={14} />
          <Skeleton width={56} height={20} borderRadius={10} />
        </View>
        <Skeleton width="32%" height={11} style={{ marginTop: 5, marginBottom: Spacing.sm }} />
        <View style={skStyles.btnRow}>
          <Skeleton width={64} height={30} borderRadius={15} />
          <Skeleton width={52} height={30} borderRadius={15} />
        </View>
      </View>
    </View>
  );
}

// ─── medicine card (MedicinesScreen) ─────────────────────────

export function SkeletonMedicineCard() {
  return (
    <View style={skStyles.medCard}>
      <Skeleton width={52} height={52} borderRadius={Radius.md} />
      <View style={skStyles.medBody}>
        <View style={skStyles.medRow}>
          <Skeleton width="44%" height={14} />
          <Skeleton width={36} height={11} borderRadius={4} />
        </View>
        <Skeleton width="28%" height={11} style={{ marginBottom: Spacing.sm }} />
        <Skeleton width="100%" height={4} borderRadius={2} style={{ marginBottom: 5 }} />
        <Skeleton width={80} height={18} borderRadius={9} />
      </View>
    </View>
  );
}

// ─── caregiver card (CaregiversScreen) ───────────────────────

export function SkeletonCaregiverCard() {
  return (
    <View style={skStyles.cgCard}>
      <Skeleton width={48} height={48} borderRadius={24} />
      <View style={skStyles.cgBody}>
        <Skeleton width="48%" height={14} style={{ marginBottom: 5 }} />
        <Skeleton width="32%" height={11} style={{ marginBottom: 6 }} />
        <Skeleton width={110} height={18} borderRadius={9} />
      </View>
    </View>
  );
}

// ─── streak card (HomeScreen header) ─────────────────────────

export function SkeletonStreakCard() {
  return (
    <View style={skStyles.streakCard}>
      <View style={skStyles.streakTop}>
        <View style={{ gap: 6 }}>
          <Skeleton width={160} height={22} style={{ marginBottom: 2 }} />
          <Skeleton width={120} height={12} borderRadius={6} />
        </View>
        <Skeleton width={52} height={40} borderRadius={Radius.sm} />
      </View>
      <View style={skStyles.dotsRow}>
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} width={28} height={28} borderRadius={14} />
        ))}
      </View>
    </View>
  );
}

// ─── report preview (ReportsScreen) ──────────────────────────

export function SkeletonReportCard() {
  return (
    <View style={skStyles.reportCard}>
      <Skeleton width="60%" height={18} style={{ marginBottom: 8 }} />
      <Skeleton width="100%" height={12} style={{ marginBottom: 4 }} />
      <Skeleton width="85%"  height={12} style={{ marginBottom: Spacing.lg }} />
      <View style={skStyles.reportStats}>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} width={60} height={52} borderRadius={Radius.md} />
        ))}
      </View>
    </View>
  );
}

// ─── styles ──────────────────────────────────────────────────

const CARD = {
  backgroundColor: Colors.white,
  borderRadius:    Radius.md,
  padding:         Spacing.md,
  shadowColor:     '#000',
  shadowOffset:    { width: 0, height: 1 } as const,
  shadowOpacity:   0.05,
  shadowRadius:    4,
  elevation:       1,
};

const skStyles = StyleSheet.create({
  // timeline
  timelineRow: { flexDirection: 'row' },
  leftCol:     { width: 68, alignItems: 'center' as const, paddingTop: 2 },
  dotWrapper:  { flex: 1, alignItems: 'center' as const },
  connector:   { flex: 1, width: 2, backgroundColor: Colors.border, marginTop: 4, borderRadius: 1, marginBottom: -Spacing.md },
  card: {
    ...CARD,
    flex: 1, marginLeft: Spacing.sm, marginBottom: Spacing.md,
  },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  btnRow:  { flexDirection: 'row', gap: Spacing.sm },

  // medicine
  medCard: { ...CARD, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  medBody: { flex: 1, gap: 0 },
  medRow:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 5 },

  // caregiver
  cgCard: { ...CARD, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  cgBody: { flex: 1 },

  // streak
  streakCard: {
    backgroundColor: Colors.primary,
    borderRadius:    Radius.lg,
    padding:         Spacing.md,
    opacity:         0.55,
  },
  streakTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.md },
  dotsRow:   { flexDirection: 'row', justifyContent: 'space-between' },

  // report
  reportCard:  { ...CARD },
  reportStats: { flexDirection: 'row', justifyContent: 'space-between' },
});
