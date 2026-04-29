import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  KeyboardAvoidingView,
  LayoutChangeEvent,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { Colors, Radius, Spacing, Typography } from '../constants/theme';
import { supabase } from '../services/supabase';
import { updatePillCount } from '../services/inventoryService';
import type { RootStackParamList } from '../navigation/types';

// ─── types ───────────────────────────────────────────────────

type Medicine = {
  id:              string;
  name:            string;
  dosage:          string;
  frequency:       string;
  times_per_day:   number;
  meal_relation:   string;
  pill_count:      number;
  refill_alert_at: number;
  created_at:      string;
};

type ReminderHistory = {
  id:             string;
  scheduled_time: string;
  taken_at:       string | null;
  skipped_at:     string | null;
  status:         string;
};

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'MedicineDetail'>;
  route:      RouteProp<RootStackParamList, 'MedicineDetail'>;
};

// ─── constants ───────────────────────────────────────────────

const MEAL_LABELS: Record<string, string> = {
  before_meal: 'Before food',
  with_meal:   'With food',
  after_meal:  'After food',
  independent: 'Any time',
};

const QUICK_ADD = [10, 20, 30, 60, 90];

// ─── helpers ─────────────────────────────────────────────────

function fmt12(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours(), m = d.getMinutes();
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  const today     = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today.toDateString())     return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Estimated full supply = 30-day dose count */
function fullSupply(timesPerDay: number): number {
  return Math.max(timesPerDay * 30, 30);
}

function stockColor(count: number, refillAt: number): string {
  if (count === 0)           return Colors.error;
  if (count <= refillAt)     return Colors.error;
  if (count <= refillAt * 2) return Colors.warning;
  return Colors.primary;
}

function stockLabel(count: number, refillAt: number): { text: string; icon: string } {
  if (count === 0)           return { text: 'Out of stock',    icon: '🚫' };
  if (count <= refillAt)     return { text: 'Low — refill now', icon: '⚠️' };
  if (count <= refillAt * 2) return { text: 'Running low',     icon: '⚡' };
  return                            { text: 'Good stock',      icon: '✅' };
}

// ─── RefillModal ─────────────────────────────────────────────

function RefillModal({
  visible,
  currentCount,
  medicineName,
  onSave,
  onClose,
}: {
  visible:      boolean;
  currentCount: number;
  medicineName: string;
  onSave:       (newTotal: number) => Promise<void>;
  onClose:      () => void;
}) {
  const [addAmount, setAddAmount] = useState('');
  const [saving,    setSaving]    = useState(false);

  const preview   = currentCount + (parseInt(addAmount, 10) || 0);
  const hasAmount = (parseInt(addAmount, 10) || 0) > 0;

  function reset() { setAddAmount(''); setSaving(false); }

  function handleClose() { reset(); onClose(); }

  async function handleSave() {
    const toAdd = parseInt(addAmount, 10);
    if (!toAdd || toAdd <= 0) {
      Alert.alert('Invalid amount', 'Please enter how many pills you received.');
      return;
    }
    setSaving(true);
    try {
      await onSave(currentCount + toAdd);
      reset();
      onClose();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not update count.');
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={handleClose} />
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />

          <Text style={styles.modalTitle}>Update After Refill</Text>
          <Text style={styles.modalSubtitle}>{medicineName}</Text>

          {/* Current count */}
          <View style={styles.modalCountRow}>
            <View style={styles.modalCountBox}>
              <Text style={styles.modalCountValue}>{currentCount}</Text>
              <Text style={styles.modalCountLabel}>currently</Text>
            </View>
            <Text style={styles.modalPlus}>+</Text>
            <View style={[styles.modalCountBox, styles.modalCountBoxAdd]}>
              <Text style={[styles.modalCountValue, { color: Colors.primary }]}>
                {parseInt(addAmount, 10) || 0}
              </Text>
              <Text style={styles.modalCountLabel}>received</Text>
            </View>
            <Text style={styles.modalPlus}>=</Text>
            <View style={[styles.modalCountBox, styles.modalCountBoxTotal]}>
              <Text style={[styles.modalCountValue, { color: Colors.primaryDark }]}>{preview}</Text>
              <Text style={styles.modalCountLabel}>new total</Text>
            </View>
          </View>

          {/* Quick add buttons */}
          <Text style={styles.fieldLabel}>Quick Add</Text>
          <View style={styles.quickAddRow}>
            {QUICK_ADD.map((n) => (
              <TouchableOpacity
                key={n}
                style={[styles.quickAddBtn, addAmount === String(n) && styles.quickAddBtnActive]}
                onPress={() => setAddAmount(String(n))}
              >
                <Text
                  style={[
                    styles.quickAddText,
                    addAmount === String(n) && styles.quickAddTextActive,
                  ]}
                >
                  +{n}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Custom input */}
          <Text style={styles.fieldLabel}>Custom Amount</Text>
          <TextInput
            style={styles.modalInput}
            value={addAmount}
            onChangeText={setAddAmount}
            keyboardType="number-pad"
            placeholder="Enter number of pills received"
            placeholderTextColor={Colors.textMuted}
          />

          {/* Actions */}
          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={handleClose}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, (!hasAmount || saving) && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={!hasAmount || saving}
            >
              {saving
                ? <ActivityIndicator color={Colors.white} size="small" />
                : <Text style={styles.saveBtnText}>Save Refill</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── PillBar ─────────────────────────────────────────────────

function PillBar({ medicine }: { medicine: Medicine }) {
  const [trackWidth, setTrackWidth] = useState(0);
  const barAnim  = useRef(new Animated.Value(0)).current;

  const progress    = Math.min(medicine.pill_count / fullSupply(medicine.times_per_day), 1);
  const color       = stockColor(medicine.pill_count, medicine.refill_alert_at);
  const { text: label, icon } = stockLabel(medicine.pill_count, medicine.refill_alert_at);

  // Re-animate whenever pill_count or track width changes
  useEffect(() => {
    if (trackWidth === 0) return;
    barAnim.setValue(0);
    Animated.timing(barAnim, {
      toValue:         trackWidth * progress,
      duration:        900,
      useNativeDriver: false, // animating width — can't use native driver
    }).start();
  }, [trackWidth, medicine.pill_count]); // eslint-disable-line react-hooks/exhaustive-deps

  const onLayout = (e: LayoutChangeEvent) =>
    setTrackWidth(e.nativeEvent.layout.width);

  return (
    <View>
      {/* Count row */}
      <View style={styles.pillCountRow}>
        <View>
          <Text style={[styles.pillCountValue, { color }]}>{medicine.pill_count}</Text>
          <Text style={styles.pillCountUnit}>pills remaining</Text>
        </View>
        <View style={[styles.stockBadge, { borderColor: color }]}>
          <Text style={styles.stockBadgeIcon}>{icon}</Text>
          <Text style={[styles.stockBadgeText, { color }]}>{label}</Text>
        </View>
      </View>

      {/* Bar track */}
      <View style={styles.barTrack} onLayout={onLayout}>
        <Animated.View
          style={[
            styles.barFill,
            { width: barAnim, backgroundColor: color },
          ]}
        />
      </View>

      {/* Legend */}
      <View style={styles.barLegend}>
        <Text style={styles.barLegendText}>0</Text>
        <Text style={styles.barLegendText}>
          Refill at {medicine.refill_alert_at}
        </Text>
        <Text style={styles.barLegendText}>
          {fullSupply(medicine.times_per_day)} (est.)
        </Text>
      </View>

      {/* Threshold tick */}
      {trackWidth > 0 && (
        <View
          style={[
            styles.thresholdTick,
            {
              left: (medicine.refill_alert_at / fullSupply(medicine.times_per_day))
                    * trackWidth - 1,
            },
          ]}
        />
      )}
    </View>
  );
}

// ─── main screen ─────────────────────────────────────────────

export default function MedicineDetailScreen({ navigation, route }: Props) {
  const { medicineId } = route.params;

  const [medicine,  setMedicine]  = useState<Medicine | null>(null);
  const [history,   setHistory]   = useState<ReminderHistory[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [showRefill, setShowRefill] = useState(false);

  const fetchMedicine = useCallback(async () => {
    const [medRes, histRes] = await Promise.all([
      supabase
        .from('medicines')
        .select('id, name, dosage, frequency, times_per_day, meal_relation, pill_count, refill_alert_at, created_at')
        .eq('id', medicineId)
        .single(),

      supabase
        .from('reminders')
        .select('id, scheduled_time, taken_at, skipped_at, status')
        .eq('medicine_id', medicineId)
        .gte('scheduled_time', (() => {
          const d = new Date();
          d.setDate(d.getDate() - 14);
          return d.toISOString();
        })())
        .order('scheduled_time', { ascending: false })
        .limit(28),
    ]);

    if (medRes.data)  setMedicine(medRes.data  as Medicine);
    if (histRes.data) setHistory(histRes.data  as ReminderHistory[]);
    setLoading(false);
  }, [medicineId]);

  // Refresh whenever the screen comes back into focus (e.g. after taking a dose)
  useFocusEffect(
    useCallback(() => { fetchMedicine(); }, [fetchMedicine])
  );

  // Real-time pill_count updates
  useEffect(() => {
    const channel = supabase
      .channel(`medicine-detail-${medicineId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'medicines', filter: `id=eq.${medicineId}` },
        (payload) => {
          setMedicine((prev) =>
            prev ? { ...prev, ...(payload.new as Partial<Medicine>) } : prev
          );
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [medicineId]);

  // ── refill save ─────────────────────────────────────────────
  async function handleRefillSave(newTotal: number) {
    await updatePillCount(medicineId, newTotal);
    setMedicine((prev) => prev ? { ...prev, pill_count: newTotal } : prev);
  }

  // ── PharmEasy deep link ─────────────────────────────────────
  function openPharmEasy() {
    if (!medicine) return;
    const url = `https://pharmeasy.in/search/all?name=${encodeURIComponent(medicine.name)}`;
    Linking.openURL(url).catch(() =>
      Alert.alert(
        'Cannot open link',
        'Install a browser or check your internet connection.',
        [{ text: 'OK' }]
      )
    );
  }

  // ── render ──────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={[styles.container, styles.center]} edges={['top']}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </SafeAreaView>
    );
  }

  if (!medicine) {
    return (
      <SafeAreaView style={[styles.container, styles.center]} edges={['top']}>
        <Text style={styles.notFoundText}>Medicine not found.</Text>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.goBackLink}>← Go back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerName} numberOfLines={1}>{medicine.name}</Text>
          <Text style={styles.headerDosage}>{medicine.dosage}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Pill Inventory Card ── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Pill Inventory</Text>
          <PillBar medicine={medicine} />
        </View>

        {/* ── Schedule Card ── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Schedule</Text>
          <View style={styles.infoRow}>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Frequency</Text>
              <Text style={styles.infoValue}>{medicine.frequency}</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>When to take</Text>
              <Text style={styles.infoValue}>
                {MEAL_LABELS[medicine.meal_relation] ?? medicine.meal_relation}
              </Text>
            </View>
          </View>
          <View style={styles.daysSupplyRow}>
            <Text style={styles.daysSupplyText}>
              📅 Estimated{' '}
              <Text style={styles.daysSupplyNum}>
                {medicine.pill_count > 0
                  ? Math.floor(medicine.pill_count / medicine.times_per_day)
                  : 0}
              </Text>
              {' '}days of supply remaining
            </Text>
          </View>
        </View>

        {/* ── Refill Actions Card ── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Refill</Text>

          <TouchableOpacity
            style={styles.actionRow}
            onPress={() => setShowRefill(true)}
            activeOpacity={0.75}
          >
            <View style={[styles.actionIcon, { backgroundColor: Colors.primaryLight }]}>
              <Text style={styles.actionIconText}>📦</Text>
            </View>
            <View style={styles.actionBody}>
              <Text style={styles.actionTitle}>Update Count After Refill</Text>
              <Text style={styles.actionSub}>Add pills you just received</Text>
            </View>
            <Text style={styles.actionChevron}>›</Text>
          </TouchableOpacity>

          <View style={styles.actionDivider} />

          <TouchableOpacity
            style={styles.actionRow}
            onPress={openPharmEasy}
            activeOpacity={0.75}
          >
            <View style={[styles.actionIcon, { backgroundColor: '#E8F5FF' }]}>
              <Text style={styles.actionIconText}>🛒</Text>
            </View>
            <View style={styles.actionBody}>
              <Text style={styles.actionTitle}>Order Refill on PharmEasy</Text>
              <Text style={styles.actionSub}>Search for {medicine.name} online</Text>
            </View>
            <Text style={[styles.actionChevron, { color: '#2196F3' }]}>↗</Text>
          </TouchableOpacity>
        </View>

        {/* ── Activity Log ── */}
        {history.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Recent Activity</Text>
            {history.map((r) => {
              const isTaken   = r.status === 'taken';
              const isSkipped = r.status === 'skipped';
              const isMissed  = r.status === 'pending' &&
                Date.now() - new Date(r.scheduled_time).getTime() > 2 * 60 * 60 * 1000;

              return (
                <View key={r.id} style={styles.historyRow}>
                  <View
                    style={[
                      styles.historyDot,
                      isTaken   && styles.historyDotTaken,
                      isSkipped && styles.historyDotSkipped,
                      isMissed  && styles.historyDotMissed,
                    ]}
                  />
                  <View style={styles.historyBody}>
                    <Text style={styles.historyDate}>{fmtDate(r.scheduled_time)}</Text>
                    <Text style={styles.historyTime}>
                      {fmt12(r.scheduled_time)}
                      {isTaken   && r.taken_at   ? ` · taken at ${fmt12(r.taken_at)}`   : ''}
                      {isSkipped && r.skipped_at ? ` · skipped at ${fmt12(r.skipped_at)}` : ''}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.historyStatus,
                      isTaken   && { color: Colors.primary },
                      isSkipped && { color: Colors.textMuted },
                      isMissed  && { color: Colors.error },
                    ]}
                  >
                    {isTaken ? '✓ Taken' : isSkipped ? '— Skipped' : isMissed ? '✗ Missed' : '● Upcoming'}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        <View style={{ height: Spacing.xxl }} />
      </ScrollView>

      <RefillModal
        visible={showRefill}
        currentCount={medicine.pill_count}
        medicineName={medicine.name}
        onSave={handleRefillSave}
        onClose={() => setShowRefill(false)}
      />
    </SafeAreaView>
  );
}

// ─── styles ──────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center:    { alignItems: 'center', justifyContent: 'center' },

  notFoundText: { fontSize: Typography.fontSizeLG, color: Colors.textSecondary, marginBottom: Spacing.sm },
  goBackLink:   { fontSize: Typography.fontSizeMD, color: Colors.primary },

  // header
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: Spacing.md,
    paddingVertical:   Spacing.sm,
    backgroundColor:   Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: {
    width: 40, height: 40,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: Radius.sm,
    backgroundColor: Colors.background,
  },
  backArrow:    { fontSize: 20, color: Colors.textPrimary },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerName: {
    fontSize:   Typography.fontSizeLG,
    fontWeight: Typography.fontWeightBold,
    color:      Colors.textPrimary,
  },
  headerDosage: { fontSize: Typography.fontSizeXS, color: Colors.textSecondary, marginTop: 1 },

  scroll: { padding: Spacing.md, gap: Spacing.sm },

  // shared card
  card: {
    backgroundColor: Colors.white,
    borderRadius:    Radius.md,
    padding:         Spacing.md,
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 1 },
    shadowOpacity:   0.05,
    shadowRadius:    4,
    elevation:       1,
  },
  cardTitle: {
    fontSize:     Typography.fontSizeSM,
    fontWeight:   Typography.fontWeightSemibold,
    color:        Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom:  Spacing.md,
  },

  // pill bar
  pillCountRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'flex-end',
    marginBottom:   Spacing.md,
  },
  pillCountValue: {
    fontSize:   40,
    fontWeight: Typography.fontWeightBold,
    lineHeight: 44,
  },
  pillCountUnit: { fontSize: Typography.fontSizeXS, color: Colors.textSecondary },
  stockBadge: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             4,
    borderWidth:     1.5,
    borderRadius:    Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical:   4,
  },
  stockBadgeIcon: { fontSize: 13 },
  stockBadgeText: { fontSize: Typography.fontSizeXS, fontWeight: Typography.fontWeightSemibold },

  barTrack: {
    height:          12,
    backgroundColor: Colors.background,
    borderRadius:    6,
    overflow:        'hidden',
    borderWidth:     1,
    borderColor:     Colors.border,
  },
  barFill: {
    height:       '100%',
    borderRadius: 6,
  },
  barLegend: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    marginTop:      Spacing.xs,
  },
  barLegendText: { fontSize: 10, color: Colors.textMuted },
  thresholdTick: {
    position:        'absolute',
    top:             0,
    bottom:          0,
    width:           2,
    backgroundColor: Colors.warning,
    marginTop:       Spacing.md + 12, // align with bar
  },

  // schedule card
  infoRow: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.sm },
  infoItem: { flex: 1 },
  infoLabel: { fontSize: Typography.fontSizeXS, color: Colors.textMuted, marginBottom: 2 },
  infoValue: { fontSize: Typography.fontSizeMD, fontWeight: Typography.fontWeightSemibold, color: Colors.textPrimary },
  daysSupplyRow: {
    backgroundColor: Colors.background,
    borderRadius:    Radius.sm,
    padding:         Spacing.sm,
    marginTop:       Spacing.xs,
  },
  daysSupplyText: { fontSize: Typography.fontSizeSM, color: Colors.textSecondary },
  daysSupplyNum:  { fontWeight: Typography.fontWeightBold, color: Colors.textPrimary },

  // action rows
  actionRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  actionIcon: {
    width: 44, height: 44,
    borderRadius:   Radius.sm,
    alignItems:     'center',
    justifyContent: 'center',
  },
  actionIconText:  { fontSize: 22 },
  actionBody:      { flex: 1 },
  actionTitle: {
    fontSize:   Typography.fontSizeMD,
    fontWeight: Typography.fontWeightSemibold,
    color:      Colors.textPrimary,
  },
  actionSub:     { fontSize: Typography.fontSizeXS, color: Colors.textSecondary, marginTop: 1 },
  actionChevron: { fontSize: 22, color: Colors.textMuted },
  actionDivider: { height: 1, backgroundColor: Colors.border, marginVertical: Spacing.xs },

  // history
  historyRow: {
    flexDirection:  'row',
    alignItems:     'center',
    paddingVertical: Spacing.xs + 2,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap:            Spacing.sm,
  },
  historyDot: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: Colors.textMuted,
    flexShrink: 0,
  },
  historyDotTaken:   { backgroundColor: Colors.primary },
  historyDotSkipped: { backgroundColor: Colors.border },
  historyDotMissed:  { backgroundColor: Colors.error },
  historyBody:       { flex: 1 },
  historyDate: { fontSize: Typography.fontSizeXS, fontWeight: Typography.fontWeightSemibold, color: Colors.textSecondary },
  historyTime: { fontSize: Typography.fontSizeXS, color: Colors.textMuted, marginTop: 1 },
  historyStatus: { fontSize: Typography.fontSizeXS, fontWeight: Typography.fontWeightSemibold, color: Colors.textMuted },

  // modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  modalSheet: {
    backgroundColor:      Colors.white,
    borderTopLeftRadius:  Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding:              Spacing.md,
    paddingBottom:        Spacing.xl + 8,
  },
  modalHandle: {
    width: 40, height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf:      'center',
    marginBottom:   Spacing.md,
  },
  modalTitle: {
    fontSize:   Typography.fontSizeXXL,
    fontWeight: Typography.fontWeightBold,
    color:      Colors.textPrimary,
    marginBottom: 2,
  },
  modalSubtitle: { fontSize: Typography.fontSizeSM, color: Colors.textSecondary, marginBottom: Spacing.md },
  modalCountRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            Spacing.sm,
    marginBottom:   Spacing.md,
    backgroundColor: Colors.background,
    borderRadius:   Radius.md,
    padding:        Spacing.md,
  },
  modalCountBox: { alignItems: 'center', minWidth: 52 },
  modalCountBoxAdd:   { /* no extra style */ },
  modalCountBoxTotal: { /* no extra style */ },
  modalCountValue: { fontSize: 28, fontWeight: Typography.fontWeightBold, color: Colors.textPrimary },
  modalCountLabel: { fontSize: 10, color: Colors.textMuted, marginTop: 2 },
  modalPlus: { fontSize: 22, color: Colors.textMuted, fontWeight: Typography.fontWeightBold },

  fieldLabel: {
    fontSize:     Typography.fontSizeXS,
    fontWeight:   Typography.fontWeightSemibold,
    color:        Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom:  Spacing.xs,
    marginTop:     Spacing.sm,
  },
  quickAddRow: { flexDirection: 'row', gap: Spacing.xs, flexWrap: 'wrap' },
  quickAddBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical:   Spacing.xs + 2,
    borderRadius:      Radius.full,
    backgroundColor:   Colors.background,
    borderWidth:       1.5,
    borderColor:       Colors.border,
  },
  quickAddBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  quickAddText:      { fontSize: Typography.fontSizeSM, color: Colors.textSecondary, fontWeight: Typography.fontWeightMedium },
  quickAddTextActive: { color: Colors.white, fontWeight: Typography.fontWeightSemibold },
  modalInput: {
    backgroundColor:   Colors.background,
    borderRadius:      Radius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical:   Spacing.sm + 2,
    fontSize:          Typography.fontSizeMD,
    color:             Colors.textPrimary,
    borderWidth:       1.5,
    borderColor:       Colors.border,
  },
  modalActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.lg },
  cancelBtn: {
    flex:            1,
    borderWidth:     1.5,
    borderColor:     Colors.border,
    borderRadius:    Radius.md,
    paddingVertical: Spacing.sm + 4,
    alignItems:      'center',
  },
  cancelBtnText: { fontSize: Typography.fontSizeMD, color: Colors.textSecondary, fontWeight: Typography.fontWeightMedium },
  saveBtn: {
    flex:            2,
    backgroundColor: Colors.primary,
    borderRadius:    Radius.md,
    paddingVertical: Spacing.sm + 4,
    alignItems:      'center',
    shadowColor:     Colors.primary,
    shadowOffset:    { width: 0, height: 3 },
    shadowOpacity:   0.25,
    shadowRadius:    6,
    elevation:       3,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { fontSize: Typography.fontSizeMD, fontWeight: Typography.fontWeightSemibold, color: Colors.white },
});
