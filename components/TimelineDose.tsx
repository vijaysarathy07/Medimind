import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Colors, Radius, Spacing, Typography } from '../constants/theme';
import { isOverdue, type ReminderItem } from '../hooks/useTodaySchedule';

// ─── types ───────────────────────────────────────────────────

type DisplayStatus = 'upcoming' | 'taken' | 'skipped' | 'missed';

const MEAL_LABELS: Record<string, string> = {
  before_meal: 'Before food',
  with_meal:   'With food',
  after_meal:  'After food',
  independent: 'Any time',
};

// ─── helpers ─────────────────────────────────────────────────

function resolveStatus(r: ReminderItem): DisplayStatus {
  if (r.status === 'taken')   return 'taken';
  if (r.status === 'skipped') return 'skipped';
  return isOverdue(r.scheduled_time) ? 'missed' : 'upcoming';
}

function fmt12(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours(), m = d.getMinutes();
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

// ─── colour maps ─────────────────────────────────────────────

const DOT_COLOR: Record<DisplayStatus, string> = {
  upcoming: Colors.textMuted,
  taken:    Colors.primary,
  skipped:  Colors.border,
  missed:   Colors.error,
};

const LINE_COLOR: Record<DisplayStatus, string> = {
  upcoming: Colors.border,
  taken:    '#B2DECE', // muted teal
  skipped:  Colors.border,
  missed:   '#FFCDD2',
};

// ─── component ───────────────────────────────────────────────

type Props = {
  reminder: ReminderItem;
  isLast:   boolean;
  onTake:   (id: string) => void;
  onSkip:   (id: string) => void;
};

export default function TimelineDose({ reminder, isLast, onTake, onSkip }: Props) {
  const status   = resolveStatus(reminder);
  const canAct   = status === 'upcoming' || status === 'missed';

  // Checkmark springs in whenever status becomes 'taken'
  const checkScale   = useRef(new Animated.Value(status === 'taken' ? 1 : 0)).current;
  const actionFade   = useRef(new Animated.Value(status === 'taken' ? 0 : 1)).current;

  useEffect(() => {
    if (status === 'taken') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Animated.parallel([
        Animated.timing(actionFade, { toValue: 0, duration: 140, useNativeDriver: true }),
        Animated.spring(checkScale, { toValue: 1, tension: 130, friction: 6, useNativeDriver: true }),
      ]).start();
    } else {
      checkScale.setValue(0);
      actionFade.setValue(1);
    }
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={styles.row}>
      {/* ── Left: time label + dot + connector line ── */}
      <View style={styles.left}>
        <Text style={[styles.timeLabel, status === 'missed' && styles.timeLabelMissed]}>
          {fmt12(reminder.scheduled_time)}
        </Text>
        {/* dotWrapper fills the remaining height of the row so the line can flex: 1 */}
        <View style={styles.dotWrapper}>
          <View style={[styles.dot, { backgroundColor: DOT_COLOR[status] }]} />
          {!isLast && (
            <View style={[styles.connector, { backgroundColor: LINE_COLOR[status] }]} />
          )}
        </View>
      </View>

      {/* ── Right: card ── */}
      <View
        style={[
          styles.card,
          status === 'taken'   && styles.cardTaken,
          status === 'missed'  && styles.cardMissed,
          status === 'skipped' && styles.cardSkipped,
        ]}
      >
        {/* Card header: name + dosage + meal tag */}
        <View style={styles.cardHeader}>
          <View style={styles.nameBlock}>
            <Text style={[styles.name, status === 'skipped' && styles.nameSkipped]}>
              {reminder.medicine.name}
            </Text>
            <Text style={styles.dosage}>{reminder.medicine.dosage}</Text>
          </View>
          <View style={[styles.mealTag, styles[`mealTag_${status}` as keyof typeof styles]]}>
            <Text style={[styles.mealTagText, styles[`mealTagText_${status}` as keyof typeof styles]]}>
              {MEAL_LABELS[reminder.medicine.meal_relation]}
            </Text>
          </View>
        </View>

        {/* ── Action row (upcoming / missed) ── */}
        {canAct && (
          <Animated.View style={[styles.actionRow, { opacity: actionFade }]}>
            {status === 'missed' && (
              <View style={styles.missedPill}>
                <Text style={styles.missedPillText}>⚠ Missed</Text>
              </View>
            )}
            <TouchableOpacity
              style={[styles.takeBtn, status === 'missed' && styles.takeBtnMissed]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                onTake(reminder.id);
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.takeBtnText}>Take</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.skipBtn}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onSkip(reminder.id);
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.skipBtnText}>Skip</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* ── Taken state ── */}
        {status === 'taken' && (
          <View style={styles.takenRow}>
            <Animated.View style={[styles.checkCircle, { transform: [{ scale: checkScale }] }]}>
              <Text style={styles.checkMark}>✓</Text>
            </Animated.View>
            <Text style={styles.takenText}>
              Taken at {reminder.taken_at ? fmt12(reminder.taken_at) : '—'}
            </Text>
          </View>
        )}

        {/* ── Skipped state ── */}
        {status === 'skipped' && (
          <View style={styles.skippedRow}>
            <View style={styles.skippedPill}>
              <Text style={styles.skippedPillText}>Skipped</Text>
            </View>
            {reminder.skipped_at && (
              <Text style={styles.skippedTime}>at {fmt12(reminder.skipped_at)}</Text>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

// ─── styles ──────────────────────────────────────────────────

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
  },

  // ── Left column ──
  left: {
    width: 68,
    alignItems: 'center',
    paddingTop: 2,
  },
  timeLabel: {
    fontSize: Typography.fontSizeXS,
    fontWeight: Typography.fontWeightSemibold,
    color: Colors.textSecondary,
    marginBottom: 6,
    textAlign: 'center',
  },
  timeLabelMissed: {
    color: Colors.error,
  },
  // Flex container so the connector line fills remaining left-column height
  dotWrapper: {
    flex: 1,
    alignItems: 'center',
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  connector: {
    flex: 1,
    width: 2,
    marginTop: 4,
    borderRadius: 1,
    // Extend slightly past the card bottom to reach the next dot
    marginBottom: -Spacing.md,
  },

  // ── Card ──
  card: {
    flex: 1,
    backgroundColor: Colors.white,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginLeft: Spacing.sm,
    marginBottom: Spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  cardTaken: {
    backgroundColor: '#F0FAF5',
    borderColor: '#C3E8D8',
  },
  cardMissed: {
    backgroundColor: '#FFF5F5',
    borderColor: '#FFCDD2',
  },
  cardSkipped: {
    backgroundColor: Colors.background,
    borderColor: Colors.border,
  },

  // ── Card header ──
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.sm,
  },
  nameBlock: {
    flex: 1,
    marginRight: Spacing.sm,
  },
  name: {
    fontSize: Typography.fontSizeMD,
    fontWeight: Typography.fontWeightSemibold,
    color: Colors.textPrimary,
  },
  nameSkipped: {
    color: Colors.textMuted,
    textDecorationLine: 'line-through',
  },
  dosage: {
    fontSize: Typography.fontSizeXS,
    color: Colors.textSecondary,
    marginTop: 1,
  },

  // Meal tags — base + per-status overrides accessed dynamically
  mealTag: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.full,
    backgroundColor: Colors.background,
    alignSelf: 'flex-start',
  },
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore — accessed via template literal key
  mealTag_upcoming: {},
  // @ts-ignore
  mealTag_taken:   { backgroundColor: Colors.primaryLight },
  // @ts-ignore
  mealTag_missed:  { backgroundColor: '#FFEBEE' },
  // @ts-ignore
  mealTag_skipped: { backgroundColor: Colors.border },

  mealTagText: {
    fontSize: 10,
    color: Colors.textSecondary,
    fontWeight: Typography.fontWeightMedium,
  },
  // @ts-ignore
  mealTagText_taken:   { color: Colors.primaryDark },
  // @ts-ignore
  mealTagText_missed:  { color: Colors.error },
  // @ts-ignore
  mealTagText_upcoming: {},
  // @ts-ignore
  mealTagText_skipped:  { color: Colors.textMuted },

  // ── Action row ──
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flexWrap: 'wrap',
  },
  missedPill: {
    backgroundColor: '#FFEBEE',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  missedPillText: {
    fontSize: Typography.fontSizeXS,
    color: Colors.error,
    fontWeight: Typography.fontWeightSemibold,
  },
  takeBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: Radius.full,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  takeBtnMissed: {
    backgroundColor: Colors.error,
    shadowColor: Colors.error,
  },
  takeBtnText: {
    fontSize: Typography.fontSizeSM,
    fontWeight: Typography.fontWeightSemibold,
    color: Colors.white,
  },
  skipBtn: {
    borderWidth: 1.5,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: Radius.full,
  },
  skipBtnText: {
    fontSize: Typography.fontSizeSM,
    fontWeight: Typography.fontWeightMedium,
    color: Colors.textSecondary,
  },

  // ── Taken state ──
  takenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  checkCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  checkMark: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: Typography.fontWeightBold,
    lineHeight: 18,
  },
  takenText: {
    fontSize: Typography.fontSizeSM,
    color: Colors.primaryDark,
    fontWeight: Typography.fontWeightMedium,
  },

  // ── Skipped state ──
  skippedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  skippedPill: {
    backgroundColor: Colors.border,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  skippedPillText: {
    fontSize: Typography.fontSizeXS,
    color: Colors.textSecondary,
    fontWeight: Typography.fontWeightMedium,
  },
  skippedTime: {
    fontSize: Typography.fontSizeXS,
    color: Colors.textMuted,
  },
});
