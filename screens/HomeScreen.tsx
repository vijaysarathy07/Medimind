import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors, Radius, Spacing, Typography } from '../constants/theme';
import { useTodaySchedule, isOverdue } from '../hooks/useTodaySchedule';
import { useStreak, type WeekDay } from '../hooks/useStreak';
import TimelineDose from '../components/TimelineDose';
import { SkeletonTimelineItem, SkeletonStreakCard } from '../components/Skeleton';
import { useToast } from '../contexts/ToastContext';
import type { RootStackParamList } from '../navigation/types';

// ─── helpers ─────────────────────────────────────────────────

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function todayLabel(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });
}

function streakMeta(n: number): { emoji: string; label: string; sub: string } {
  if (n === 0) return { emoji: '💊', label: 'No streak yet', sub: 'Take all doses today to start!' };
  if (n === 1) return { emoji: '🌱', label: '1 Day Streak', sub: 'Great start! Keep it up.' };
  if (n < 7)   return { emoji: '🔥', label: `${n} Day Streak`, sub: "You're building momentum!" };
  if (n < 30)  return { emoji: '🔥', label: `${n} Day Streak`, sub: "You're on fire! Don't break the chain." };
  return       { emoji: '🏆', label: `${n} Day Streak`, sub: 'Incredible discipline. Keep going!' };
}

// ─── sub-components ──────────────────────────────────────────

// (SkeletonPulse replaced by components/Skeleton.tsx — kept as stub for safety)
function SkeletonPulse({ style }: { style?: object }) {
  return <View style={[styles.skeleton, style]} />;
}

function SkeletonTimeline() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <SkeletonTimelineItem key={i} isLast={i === 2} />
      ))}
    </>
  );
}

function EmptyTimeline({ onAdd }: { onAdd: () => void }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyIcon}>💊</Text>
      <Text style={styles.emptyTitle}>No medicines scheduled today</Text>
      <Text style={styles.emptySub}>Add a medicine to start tracking your doses</Text>
      <TouchableOpacity style={styles.emptyAddBtn} onPress={onAdd}>
        <Text style={styles.emptyAddBtnText}>+ Add Medicine</Text>
      </TouchableOpacity>
    </View>
  );
}

function WeekDots({ days }: { days: WeekDay[] }) {
  return (
    <View style={styles.weekRow}>
      {days.map((day, i) => (
        <View key={i} style={styles.weekDayCol}>
          <View
            style={[
              styles.weekDot,
              day.full    && styles.weekDotFull,
              day.partial && styles.weekDotPartial,
              !day.hasData && styles.weekDotEmpty,
            ]}
          />
          <Text style={styles.weekDayLabel}>{day.label}</Text>
        </View>
      ))}
    </View>
  );
}

// ─── main screen ─────────────────────────────────────────────

export default function HomeScreen() {
  const navigation   = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { showToast } = useToast();

  const { reminders, loading, error, usingMock, refetch, takeDose, skipDose } = useTodaySchedule();
  const { streak, weekAdherence, weekDays, loading: streakLoading } = useStreak(reminders);

  const [refreshing, setRefreshing] = useState(false);

  // Show API errors as toast instead of inline error box
  useEffect(() => {
    if (error) showToast({ type: 'error', message: `Could not load schedule: ${error}` });
  }, [error]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  // ── Derived stats ──
  const total    = reminders.length;
  const taken    = reminders.filter(r => r.status === 'taken').length;
  const skipped  = reminders.filter(r => r.status === 'skipped').length;
  const missed   = reminders.filter(r => r.status === 'pending' && isOverdue(r.scheduled_time)).length;
  const upcoming = reminders.filter(r => r.status === 'pending' && !isOverdue(r.scheduled_time)).length;
  const progress = total > 0 ? taken / total : 0;

  const { emoji, label: streakLabel, sub: streakSub } = streakMeta(streak);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* ── App header ── */}
      <View style={styles.appHeader}>
        <View>
          <Text style={styles.greetingText}>{greeting()}</Text>
          <Text style={styles.userNameText}>Vijay 👋</Text>
        </View>
        <TouchableOpacity style={styles.bellBtn}>
          <Text style={styles.bellIcon}>🔔</Text>
          {missed > 0 && <View style={styles.bellBadge} />}
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.primary}
            colors={[Colors.primary]}
          />
        }
      >
        {/* ── Streak card ── */}
        {streakLoading ? (
          <SkeletonStreakCard />
        ) : (
        <View style={[styles.streakCard, streak === 0 && styles.streakCardEmpty]}>
          {false ? null : (
            <>
              <View style={styles.streakTop}>
                <View style={styles.streakMain}>
                  <Text style={[styles.streakEmoji, streak === 0 && styles.streakEmojiEmpty]}>
                    {emoji}
                  </Text>
                  <View>
                    <Text style={[styles.streakLabel, streak === 0 && styles.streakLabelEmpty]}>
                      {streakLabel}
                    </Text>
                    <Text style={[styles.streakSub, streak === 0 && styles.streakSubEmpty]}>
                      {streakSub}
                    </Text>
                  </View>
                </View>
                {streak > 0 && (
                  <View style={styles.adherenceBadge}>
                    <Text style={styles.adherenceValue}>{weekAdherence}%</Text>
                    <Text style={styles.adherenceLabel}>this week</Text>
                  </View>
                )}
              </View>
              {weekDays.length > 0 && <WeekDots days={weekDays} />}
            </>
          )}
        </View>
        )}

        {/* ── Today's progress ── */}
        {total > 0 && (
          <View style={styles.progressCard}>
            <View style={styles.progressStats}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{total}</Text>
                <Text style={styles.statLabel}>Today</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: Colors.primary }]}>{taken}</Text>
                <Text style={styles.statLabel}>Taken</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: Colors.warning }]}>{upcoming}</Text>
                <Text style={styles.statLabel}>Upcoming</Text>
              </View>
              {missed > 0 && (
                <>
                  <View style={styles.statDivider} />
                  <View style={styles.statItem}>
                    <Text style={[styles.statValue, { color: Colors.error }]}>{missed}</Text>
                    <Text style={styles.statLabel}>Missed</Text>
                  </View>
                </>
              )}
              {skipped > 0 && (
                <>
                  <View style={styles.statDivider} />
                  <View style={styles.statItem}>
                    <Text style={[styles.statValue, { color: Colors.textMuted }]}>{skipped}</Text>
                    <Text style={styles.statLabel}>Skipped</Text>
                  </View>
                </>
              )}
            </View>

            {/* Progress bar */}
            <View style={styles.progressBarTrack}>
              <View
                style={[
                  styles.progressBarFill,
                  { width: `${progress * 100}%` as any },
                  progress === 1 && styles.progressBarComplete,
                ]}
              />
            </View>
            <Text style={styles.progressBarLabel}>
              {taken} of {total} doses completed today
              {progress === 1 ? ' 🎉' : ''}
            </Text>
          </View>
        )}

        {/* ── Timeline ── */}
        {/* Demo mode banner — visible only when Supabase is unreachable */}
        {usingMock && (
          <View style={styles.demoBanner}>
            <Text style={styles.demoBannerText}>
              🔌 Demo mode — connect Supabase to see real data
            </Text>
          </View>
        )}

        <View style={styles.timelineSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Today's Schedule</Text>
            <Text style={styles.sectionDate}>{todayLabel()}</Text>
          </View>

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>⚠ {error}</Text>
              <TouchableOpacity onPress={refetch} style={styles.retryBtn}>
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : loading ? (
            <SkeletonTimeline />
          ) : reminders.length === 0 ? (
            <EmptyTimeline onAdd={() => navigation.navigate('AddMedicine')} />
          ) : (
            reminders.map((r, i) => (
              <TimelineDose
                key={r.id}
                reminder={r}
                isLast={i === reminders.length - 1}
                onTake={takeDose}
                onSkip={skipDose}
              />
            ))
          )}
        </View>

        {/* Quick add FAB-style link */}
        {reminders.length > 0 && (
          <TouchableOpacity
            style={styles.addMoreLink}
            onPress={() => navigation.navigate('AddMedicine')}
          >
            <Text style={styles.addMoreText}>+ Add another medicine</Text>
          </TouchableOpacity>
        )}

        <View style={{ height: Spacing.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── styles ──────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  // app header
  appHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  greetingText: {
    fontSize: Typography.fontSizeSM,
    color: Colors.textSecondary,
  },
  userNameText: {
    fontSize: Typography.fontSizeXXL,
    fontWeight: Typography.fontWeightBold,
    color: Colors.textPrimary,
  },
  bellBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellIcon: { fontSize: 20 },
  bellBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.error,
    borderWidth: 1.5,
    borderColor: Colors.background,
  },

  scroll: {
    padding: Spacing.md,
  },

  // ── streak card ──
  streakCard: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  streakCardEmpty: {
    backgroundColor: Colors.white,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  streakLoadingRow: {
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  streakTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.md,
  },
  streakMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  streakEmoji: {
    fontSize: 32,
  },
  streakEmojiEmpty: {},
  streakLabel: {
    fontSize: Typography.fontSizeXL,
    fontWeight: Typography.fontWeightBold,
    color: Colors.white,
  },
  streakLabelEmpty: {
    color: Colors.textPrimary,
  },
  streakSub: {
    fontSize: Typography.fontSizeXS,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 2,
  },
  streakSubEmpty: {
    color: Colors.textSecondary,
  },
  adherenceBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    marginLeft: Spacing.sm,
  },
  adherenceValue: {
    fontSize: Typography.fontSizeLG,
    fontWeight: Typography.fontWeightBold,
    color: Colors.white,
  },
  adherenceLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 1,
  },

  // week dots
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  weekDayCol: {
    alignItems: 'center',
    gap: 4,
  },
  weekDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  weekDotFull: {
    backgroundColor: Colors.white,
  },
  weekDotPartial: {
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  weekDotEmpty: {
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  weekDayLabel: {
    fontSize: 10,
    fontWeight: Typography.fontWeightSemibold,
    color: 'rgba(255,255,255,0.7)',
  },

  // ── progress card ──
  progressCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  progressStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: Typography.fontSizeXXL,
    fontWeight: Typography.fontWeightBold,
    color: Colors.textPrimary,
    lineHeight: 28,
  },
  statLabel: {
    fontSize: Typography.fontSizeXS,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: Colors.border,
  },
  progressBarTrack: {
    height: 8,
    backgroundColor: Colors.background,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: Spacing.xs,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 4,
  },
  progressBarComplete: {
    backgroundColor: Colors.primary,
  },
  progressBarLabel: {
    fontSize: Typography.fontSizeXS,
    color: Colors.textMuted,
    textAlign: 'center',
  },

  // ── timeline section ──
  demoBanner: {
    backgroundColor: '#FFF8E1',
    borderRadius:    Radius.sm,
    paddingVertical: Spacing.xs + 2,
    paddingHorizontal: Spacing.md,
    marginBottom:    Spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: Colors.warning,
  },
  demoBannerText: {
    fontSize:   Typography.fontSizeXS,
    color:      Colors.warning,
    fontWeight: Typography.fontWeightMedium,
  },
  timelineSection: {
    marginTop: Spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontSize: Typography.fontSizeLG,
    fontWeight: Typography.fontWeightSemibold,
    color: Colors.textPrimary,
  },
  sectionDate: {
    fontSize: Typography.fontSizeXS,
    color: Colors.textMuted,
  },

  // ── error box ──
  errorBox: {
    backgroundColor: '#FFF5F5',
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: '#FFCDD2',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  errorText: {
    fontSize: Typography.fontSizeSM,
    color: Colors.error,
    flex: 1,
  },
  retryBtn: {
    marginLeft: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.sm,
    backgroundColor: Colors.error,
  },
  retryText: {
    fontSize: Typography.fontSizeSM,
    color: Colors.white,
    fontWeight: Typography.fontWeightSemibold,
  },

  // ── empty state ──
  empty: {
    alignItems: 'center',
    paddingVertical: Spacing.xxl,
  },
  emptyIcon: {
    fontSize: 52,
    marginBottom: Spacing.md,
  },
  emptyTitle: {
    fontSize: Typography.fontSizeLG,
    fontWeight: Typography.fontWeightSemibold,
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  emptySub: {
    fontSize: Typography.fontSizeSM,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: Spacing.lg,
    lineHeight: 20,
  },
  emptyAddBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm + 2,
    borderRadius: Radius.full,
  },
  emptyAddBtnText: {
    color: Colors.white,
    fontSize: Typography.fontSizeMD,
    fontWeight: Typography.fontWeightSemibold,
  },

  // ── skeleton ──
  skeleton: {
    backgroundColor: Colors.border,
    borderRadius: Radius.sm,
  },
  skeletonRow: {
    flexDirection: 'row',
    marginBottom: Spacing.md,
  },
  skeletonLeft: {
    width: 68,
    alignItems: 'center',
    gap: Spacing.xs,
    paddingTop: 2,
  },
  skeletonTime: {
    width: 48,
    height: 12,
    marginBottom: 6,
  },
  skeletonDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  skeletonCard: {
    flex: 1,
    marginLeft: Spacing.sm,
  },

  // ── add more link ──
  addMoreLink: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  addMoreText: {
    fontSize: Typography.fontSizeSM,
    color: Colors.primary,
    fontWeight: Typography.fontWeightMedium,
  },
});
