import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Platform,
  Modal,
  KeyboardAvoidingView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker, {
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors, Radius, Spacing, Typography } from '../constants/theme';
import { supabase } from '../services/supabase';
import { scheduleDailyReminder } from '../services/notifications';
import SuccessOverlay from '../components/SuccessOverlay';
import type { RootStackParamList } from '../navigation/types';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'AddMedicine'>;
};

// ─── constants ───────────────────────────────────────────────

const FREQUENCY_OPTIONS = [
  { label: 'Once',   value: 1 as const },
  { label: 'Twice',  value: 2 as const },
  { label: 'Thrice', value: 3 as const },
];

const MEAL_OPTIONS = [
  { label: 'Before food', value: 'before_meal' as const,  icon: '🕐' },
  { label: 'With food',   value: 'with_meal'   as const,  icon: '🍽️' },
  { label: 'After food',  value: 'after_meal'  as const,  icon: '✅' },
  { label: 'Any time',    value: 'independent' as const,  icon: '🔄' },
];

type MealRelation = (typeof MEAL_OPTIONS)[number]['value'];

const DOSE_LABELS = ['Daily reminder', 'Morning dose', 'Afternoon dose', 'Evening dose'];

// ─── helpers ─────────────────────────────────────────────────

function defaultTimes(count: number): Date[] {
  const base = new Date();
  const hours = [8, 14, 20];
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(base);
    d.setHours(hours[i], 0, 0, 0);
    return d;
  });
}

function fmt12(date: Date): string {
  const h = date.getHours();
  const m = date.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
}

// ─── sub-components ──────────────────────────────────────────

function SectionHeader({ children }: { children: string }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

// ─── screen ──────────────────────────────────────────────────

export default function AddMedicineScreen({ navigation }: Props) {
  const [name, setName]               = useState('');
  const [dosage, setDosage]           = useState('');
  const [frequency, setFrequency]     = useState<1 | 2 | 3>(1);
  const [mealRelation, setMealRelation] = useState<MealRelation>('independent');
  const [pillCount, setPillCount]     = useState(30);
  const [times, setTimes]             = useState<Date[]>(defaultTimes(1));

  // time-picker modal state
  const [pickerIndex, setPickerIndex] = useState<number | null>(null);
  const [tempTime, setTempTime]       = useState(new Date());

  const [saving, setSaving]           = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // ── frequency change ────────────────────────────────────────
  function changeFrequency(next: 1 | 2 | 3) {
    setFrequency(next);
    // Preserve existing times, append/remove as needed
    setTimes((prev) => {
      if (next > prev.length) {
        return [...prev, ...defaultTimes(next).slice(prev.length)];
      }
      return prev.slice(0, next);
    });
  }

  // ── time picker ─────────────────────────────────────────────
  function openPicker(index: number) {
    setTempTime(times[index]);
    setPickerIndex(index);
  }

  function onPickerChange(_: DateTimePickerEvent, date?: Date) {
    if (!date) return;
    if (Platform.OS === 'android') {
      setPickerIndex(null);
      if (pickerIndex !== null) commitTime(pickerIndex, date);
    } else {
      setTempTime(date);
    }
  }

  function commitTime(index: number, date: Date) {
    setTimes((prev) => {
      const next = [...prev];
      next[index] = date;
      return next;
    });
  }

  function confirmIOS() {
    if (pickerIndex !== null) commitTime(pickerIndex, tempTime);
    setPickerIndex(null);
  }

  // ── save ────────────────────────────────────────────────────
  async function handleSave() {
    if (!name.trim()) {
      Alert.alert('Required', 'Please enter the medicine name.');
      return;
    }
    if (!dosage.trim()) {
      Alert.alert('Required', 'Please enter the dosage (e.g. 500mg).');
      return;
    }

    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        throw new Error(
          'You must be signed in to add a medicine. (Auth not yet configured.)'
        );
      }

      const freqLabel = ['', 'Once daily', 'Twice daily', 'Thrice daily'][frequency];

      // 1. Insert medicine row
      const { data: med, error: medErr } = await supabase
        .from('medicines')
        .insert({
          user_id:          user.id,
          name:             name.trim(),
          dosage:           dosage.trim(),
          frequency:        freqLabel,
          times_per_day:    frequency,
          meal_relation:    mealRelation,
          pill_count:       pillCount,
          refill_alert_at:  Math.max(7, Math.floor(pillCount * 0.1)),
        })
        .select()
        .single();

      if (medErr) throw medErr;

      // 2. For each reminder time: schedule notification + insert reminder row
      await Promise.all(
        times.map(async (time) => {
          const notifId = `med_${med.id}_${time.getHours()}_${time.getMinutes()}`;
          await scheduleDailyReminder(notifId, name.trim(), dosage.trim(), time);
          await supabase.from('reminders').insert({
            medicine_id:    med.id,
            scheduled_time: time.toISOString(),
            status:         'pending',
          });
        })
      );

      setSaving(false);
      setShowSuccess(true);
    } catch (err: unknown) {
      setSaving(false);
      const msg = err instanceof Error ? err.message : 'Something went wrong.';
      Alert.alert('Could not save', msg);
    }
  }

  // ── render ──────────────────────────────────────────────────
  return (
    <>
      <SafeAreaView style={styles.container} edges={['top']}>
        {/* ── Header ── */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Add Medicine</Text>
          <View style={styles.headerSpacer} />
        </View>

        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* ── Medicine name ── */}
            <View style={styles.card}>
              <SectionHeader>Medicine Name</SectionHeader>
              <TextInput
                style={styles.textInput}
                value={name}
                onChangeText={setName}
                placeholder="e.g. Metformin"
                placeholderTextColor={Colors.textMuted}
                returnKeyType="next"
                autoCapitalize="words"
              />
            </View>

            {/* ── Dosage ── */}
            <View style={styles.card}>
              <SectionHeader>Dosage</SectionHeader>
              <TextInput
                style={styles.textInput}
                value={dosage}
                onChangeText={setDosage}
                placeholder="e.g. 500mg, 10ml, 2 tablets"
                placeholderTextColor={Colors.textMuted}
                returnKeyType="done"
              />
            </View>

            {/* ── Frequency ── */}
            <View style={styles.card}>
              <SectionHeader>Frequency</SectionHeader>
              <View style={styles.segmented}>
                {FREQUENCY_OPTIONS.map(({ label, value }) => (
                  <TouchableOpacity
                    key={value}
                    style={[
                      styles.segmentBtn,
                      frequency === value && styles.segmentBtnActive,
                    ]}
                    onPress={() => changeFrequency(value)}
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        frequency === value && styles.segmentTextActive,
                      ]}
                    >
                      {label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.frequencyHint}>
                {frequency === 1 ? '1 dose per day' :
                 frequency === 2 ? '2 doses per day — every ~12 hours' :
                                   '3 doses per day — every ~8 hours'}
              </Text>
            </View>

            {/* ── Meal relation ── */}
            <View style={styles.card}>
              <SectionHeader>When to take</SectionHeader>
              <View style={styles.mealGrid}>
                {MEAL_OPTIONS.map(({ label, value, icon }) => (
                  <TouchableOpacity
                    key={value}
                    style={[
                      styles.mealChip,
                      mealRelation === value && styles.mealChipActive,
                    ]}
                    onPress={() => setMealRelation(value)}
                  >
                    <Text style={styles.mealIcon}>{icon}</Text>
                    <Text
                      style={[
                        styles.mealLabel,
                        mealRelation === value && styles.mealLabelActive,
                      ]}
                    >
                      {label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* ── Pill count ── */}
            <View style={styles.card}>
              <SectionHeader>Pills in hand</SectionHeader>
              <View style={styles.counterRow}>
                <TouchableOpacity
                  style={styles.counterBtn}
                  onPress={() => setPillCount((c) => Math.max(0, c - 1))}
                >
                  <Text style={styles.counterBtnText}>−</Text>
                </TouchableOpacity>
                <View style={styles.counterDisplay}>
                  <Text style={styles.counterValue}>{pillCount}</Text>
                  <Text style={styles.counterUnit}>pills</Text>
                </View>
                <TouchableOpacity
                  style={styles.counterBtn}
                  onPress={() => setPillCount((c) => c + 1)}
                >
                  <Text style={styles.counterBtnText}>+</Text>
                </TouchableOpacity>
              </View>
              {pillCount > 0 && (
                <Text style={styles.stockHint}>
                  {'≈ '}
                  {Math.floor(pillCount / frequency)} days supply · refill alert at{' '}
                  {Math.max(7, Math.floor(pillCount * 0.1))} pills
                </Text>
              )}
            </View>

            {/* ── Reminder times ── */}
            <View style={styles.card}>
              <SectionHeader>Reminder Times</SectionHeader>
              <View style={styles.timesContainer}>
                {times.map((time, i) => (
                  <TouchableOpacity
                    key={i}
                    style={styles.timeRow}
                    onPress={() => openPicker(i)}
                  >
                    <View style={styles.timeRowLeft}>
                      <View style={styles.timeIconBg}>
                        <Text style={styles.timeIcon}>⏰</Text>
                      </View>
                      <Text style={styles.timeLabel}>
                        {frequency === 1 ? DOSE_LABELS[0] : DOSE_LABELS[i + 1]}
                      </Text>
                    </View>
                    <View style={styles.timeValueRow}>
                      <Text style={styles.timeValue}>{fmt12(time)}</Text>
                      <Text style={styles.timeChevron}>›</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.reminderNote}>
                🔔 You'll receive a daily push notification at each time
              </Text>
            </View>

            {/* ── Save button ── */}
            <TouchableOpacity
              style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving ? (
                <ActivityIndicator color={Colors.white} size="small" />
              ) : (
                <Text style={styles.saveBtnText}>Save Medicine</Text>
              )}
            </TouchableOpacity>

            <View style={styles.bottomPad} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* ── Android time picker (renders as dialog) ── */}
      {Platform.OS === 'android' && pickerIndex !== null && (
        <DateTimePicker
          value={times[pickerIndex]}
          mode="time"
          is24Hour={false}
          onChange={onPickerChange}
        />
      )}

      {/* ── iOS time picker (bottom sheet modal) ── */}
      {Platform.OS === 'ios' && (
        <Modal
          visible={pickerIndex !== null}
          transparent
          animationType="slide"
          onRequestClose={() => setPickerIndex(null)}
        >
          <View style={styles.iosOverlay}>
            <View style={styles.iosSheet}>
              <View style={styles.iosSheetHandle} />
              <View style={styles.iosSheetHeader}>
                <TouchableOpacity
                  onPress={() => setPickerIndex(null)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.iosCancelText}>Cancel</Text>
                </TouchableOpacity>
                <Text style={styles.iosSheetTitle}>Set Reminder Time</Text>
                <TouchableOpacity
                  onPress={confirmIOS}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.iosDoneText}>Done</Text>
                </TouchableOpacity>
              </View>
              {pickerIndex !== null && (
                <DateTimePicker
                  value={tempTime}
                  mode="time"
                  display="spinner"
                  onChange={onPickerChange}
                  style={styles.iosPicker}
                />
              )}
            </View>
          </View>
        </Modal>
      )}

      {/* ── Success overlay ── */}
      <SuccessOverlay
        visible={showSuccess}
        onDone={() => {
          setShowSuccess(false);
          navigation.goBack();
        }}
      />
    </>
  );
}

// ─── styles ──────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  // header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.sm,
    backgroundColor: Colors.background,
  },
  backArrow: {
    fontSize: 20,
    color: Colors.textPrimary,
    lineHeight: 24,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: Typography.fontSizeLG,
    fontWeight: Typography.fontWeightSemibold,
    color: Colors.textPrimary,
  },
  headerSpacer: { width: 36 },

  // scroll
  scroll: {
    padding: Spacing.md,
    gap: Spacing.sm,
  },

  // shared card
  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.md,
    padding: Spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  sectionLabel: {
    fontSize: Typography.fontSizeSM,
    fontWeight: Typography.fontWeightSemibold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: Spacing.sm,
  },

  // text input
  textInput: {
    backgroundColor: Colors.background,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    fontSize: Typography.fontSizeMD,
    color: Colors.textPrimary,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },

  // segmented control
  segmented: {
    flexDirection: 'row',
    backgroundColor: Colors.background,
    borderRadius: Radius.sm,
    padding: 3,
    gap: 3,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.sm - 2,
    alignItems: 'center',
  },
  segmentBtnActive: {
    backgroundColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  segmentText: {
    fontSize: Typography.fontSizeSM,
    fontWeight: Typography.fontWeightMedium,
    color: Colors.textSecondary,
  },
  segmentTextActive: {
    color: Colors.white,
    fontWeight: Typography.fontWeightSemibold,
  },
  frequencyHint: {
    fontSize: Typography.fontSizeXS,
    color: Colors.textMuted,
    marginTop: Spacing.sm,
    textAlign: 'center',
  },

  // meal chips
  mealGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  mealChip: {
    width: '47%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    borderRadius: Radius.sm,
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.sm,
    backgroundColor: Colors.background,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  mealChipActive: {
    backgroundColor: Colors.primaryLight,
    borderColor: Colors.primary,
  },
  mealIcon: {
    fontSize: 18,
  },
  mealLabel: {
    fontSize: Typography.fontSizeSM,
    color: Colors.textSecondary,
    fontWeight: Typography.fontWeightMedium,
    flexShrink: 1,
  },
  mealLabelActive: {
    color: Colors.primaryDark,
  },

  // pill counter
  counterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xl,
  },
  counterBtn: {
    width: 48,
    height: 48,
    borderRadius: Radius.full,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterBtnText: {
    fontSize: 24,
    color: Colors.primary,
    lineHeight: 28,
    fontWeight: Typography.fontWeightBold,
  },
  counterDisplay: {
    alignItems: 'center',
    minWidth: 80,
  },
  counterValue: {
    fontSize: 36,
    fontWeight: Typography.fontWeightBold,
    color: Colors.textPrimary,
    lineHeight: 40,
  },
  counterUnit: {
    fontSize: Typography.fontSizeXS,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  stockHint: {
    fontSize: Typography.fontSizeXS,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },

  // reminder time rows
  timesContainer: {
    gap: Spacing.sm,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.background,
    borderRadius: Radius.sm,
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.sm,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  timeRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  timeIconBg: {
    width: 34,
    height: 34,
    borderRadius: Radius.sm,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeIcon: {
    fontSize: 17,
  },
  timeLabel: {
    fontSize: Typography.fontSizeSM,
    fontWeight: Typography.fontWeightMedium,
    color: Colors.textPrimary,
  },
  timeValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  timeValue: {
    fontSize: Typography.fontSizeMD,
    fontWeight: Typography.fontWeightSemibold,
    color: Colors.primary,
  },
  timeChevron: {
    fontSize: 20,
    color: Colors.textMuted,
    lineHeight: 24,
  },
  reminderNote: {
    fontSize: Typography.fontSizeXS,
    color: Colors.textMuted,
    marginTop: Spacing.sm,
    textAlign: 'center',
    lineHeight: 18,
  },

  // save
  saveBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.sm,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
    minHeight: 52,
  },
  saveBtnDisabled: {
    opacity: 0.65,
  },
  saveBtnText: {
    fontSize: Typography.fontSizeMD,
    fontWeight: Typography.fontWeightSemibold,
    color: Colors.white,
    letterSpacing: 0.3,
  },
  bottomPad: { height: Spacing.xl },

  // iOS bottom sheet
  iosOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  iosSheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingBottom: Spacing.xl,
  },
  iosSheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  iosSheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  iosSheetTitle: {
    fontSize: Typography.fontSizeMD,
    fontWeight: Typography.fontWeightSemibold,
    color: Colors.textPrimary,
  },
  iosCancelText: {
    fontSize: Typography.fontSizeMD,
    color: Colors.textSecondary,
  },
  iosDoneText: {
    fontSize: Typography.fontSizeMD,
    fontWeight: Typography.fontWeightSemibold,
    color: Colors.primary,
  },
  iosPicker: {
    height: 200,
  },
});
