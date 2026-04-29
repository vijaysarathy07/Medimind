import React, { useCallback, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors, Radius, Spacing, Typography } from '../constants/theme';
import { supabase } from '../services/supabase';
import { SkeletonMedicineCard } from '../components/Skeleton';
import type { RootStackParamList } from '../navigation/types';

// ─── types ───────────────────────────────────────────────────

type MedicineRow = {
  id:              string;
  name:            string;
  dosage:          string;
  frequency:       string;
  times_per_day:   number;
  pill_count:      number;
  refill_alert_at: number;
  created_at:      string;
};

// ─── helpers ─────────────────────────────────────────────────

const CARD_COLORS = ['#E8F5F0', '#E8F0FF', '#FFF3E8', '#FDE8F0', '#E8F5FF'];

function pillBarColor(count: number, refillAt: number): string {
  if (count <= refillAt)     return Colors.error;
  if (count <= refillAt * 2) return Colors.warning;
  return Colors.primary;
}

// ─── MedicineCard ─────────────────────────────────────────────

function MedicineCard({
  medicine,
  colorIndex,
  onPress,
}: {
  medicine:   MedicineRow;
  colorIndex: number;
  onPress:    () => void;
}) {
  const bgColor  = CARD_COLORS[colorIndex % CARD_COLORS.length];
  const barColor = pillBarColor(medicine.pill_count, medicine.refill_alert_at);
  const isLow    = medicine.pill_count <= medicine.refill_alert_at;
  const full     = Math.max(medicine.times_per_day * 30, 30);
  const progress = Math.min(medicine.pill_count / full, 1);

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.78}>
      <View style={[styles.cardAccent, { backgroundColor: bgColor }]}>
        <Text style={styles.cardIcon}>💊</Text>
      </View>
      <View style={styles.cardBody}>
        <View style={styles.cardNameRow}>
          <Text style={styles.medicineName}>{medicine.name}</Text>
          <Text style={styles.medicineDosage}>{medicine.dosage}</Text>
        </View>
        <Text style={styles.medicineFrequency}>{medicine.frequency}</Text>

        {/* Mini pill bar */}
        <View style={styles.miniBarTrack}>
          <View
            style={[
              styles.miniBarFill,
              { width: `${progress * 100}%` as any, backgroundColor: barColor },
            ]}
          />
        </View>

        <View style={styles.stockRow}>
          <View style={[styles.stockBadge, isLow && styles.stockBadgeLow]}>
            <Text style={[styles.stockText, isLow && styles.stockTextLow]}>
              {medicine.pill_count} pills left
            </Text>
          </View>
          {isLow && (
            <Text style={styles.refillAlert}>⚠ Refill soon</Text>
          )}
        </View>
      </View>
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );
}

// ─── screen ──────────────────────────────────────────────────

export default function MedicinesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [medicines,  setMedicines]  = useState<MedicineRow[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter,     setFilter]     = useState<'all' | 'active' | 'low'>('all');

  const fetchMedicines = useCallback(async () => {
    const { data } = await supabase
      .from('medicines')
      .select('id, name, dosage, frequency, times_per_day, pill_count, refill_alert_at, created_at')
      .order('created_at', { ascending: true });
    if (data) setMedicines(data as MedicineRow[]);
    setLoading(false);
  }, []);

  // Refresh on every tab focus so pill counts stay current after taking a dose
  useFocusEffect(
    useCallback(() => { fetchMedicines(); }, [fetchMedicines])
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchMedicines();
    setRefreshing(false);
  }, [fetchMedicines]);

  const filtered =
    filter === 'low'
      ? medicines.filter((m) => m.pill_count <= m.refill_alert_at)
      : medicines;

  const FILTERS: { key: 'all' | 'active' | 'low'; label: string }[] = [
    { key: 'all',    label: 'All' },
    { key: 'active', label: 'Active' },
    { key: 'low',    label: 'Low Stock' },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>My Medicines</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.scanButton}
            onPress={() => navigation.navigate('PrescriptionScanner')}
          >
            <Text style={styles.scanButtonText}>📷 Scan</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => navigation.navigate('AddMedicine')}
          >
            <Text style={styles.addButtonText}>+ Add</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Filters */}
      <View style={styles.filterRow}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[styles.filterText, filter === f.key && styles.filterTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={[styles.list, { gap: Spacing.sm }]}>
          {[0, 1, 2, 3].map((i) => <SkeletonMedicineCard key={i} />)}
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => (
            <MedicineCard
              medicine={item}
              colorIndex={index}
              onPress={() => navigation.navigate('MedicineDetail', { medicineId: item.id })}
            />
          )}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={Colors.primary}
              colors={[Colors.primary]}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>💊</Text>
              <Text style={styles.emptyTitle}>
                {filter === 'low' ? 'No low-stock medicines' : 'No medicines yet'}
              </Text>
              <Text style={styles.emptySub}>
                {filter === 'low'
                  ? 'All your medicines have good stock levels.'
                  : 'Add a medicine or scan a prescription to get started.'}
              </Text>
              {filter !== 'low' && (
                <TouchableOpacity
                  style={styles.emptyAddBtn}
                  onPress={() => navigation.navigate('AddMedicine')}
                >
                  <Text style={styles.emptyAddBtnText}>+ Add Medicine</Text>
                </TouchableOpacity>
              )}
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

// ─── styles ──────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection:     'row',
    justifyContent:    'space-between',
    alignItems:        'center',
    paddingHorizontal: Spacing.md,
    paddingTop:        Spacing.sm,
    paddingBottom:     Spacing.md,
  },
  title: { fontSize: Typography.fontSizeXXL, fontWeight: Typography.fontWeightBold, color: Colors.textPrimary },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  scanButton: {
    backgroundColor:   Colors.primaryLight,
    paddingHorizontal: Spacing.sm,
    paddingVertical:   Spacing.xs + 2,
    borderRadius:      Radius.full,
    borderWidth:       1.5,
    borderColor:       Colors.primary,
  },
  scanButtonText: { color: Colors.primary, fontSize: Typography.fontSizeSM, fontWeight: Typography.fontWeightSemibold },
  addButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical:   Spacing.xs + 2,
    borderRadius:      Radius.full,
  },
  addButtonText: { color: Colors.white, fontSize: Typography.fontSizeSM, fontWeight: Typography.fontWeightSemibold },

  filterRow: { flexDirection: 'row', paddingHorizontal: Spacing.md, gap: Spacing.sm, marginBottom: Spacing.md },
  filterChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical:   Spacing.xs,
    borderRadius:      Radius.full,
    backgroundColor:   Colors.white,
    borderWidth:       1,
    borderColor:       Colors.border,
  },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterText:       { fontSize: Typography.fontSizeSM, color: Colors.textSecondary, fontWeight: Typography.fontWeightMedium },
  filterTextActive: { color: Colors.white },

  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  list: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.xxl, gap: Spacing.sm },

  card: {
    backgroundColor: Colors.white,
    borderRadius:    Radius.md,
    padding:         Spacing.md,
    flexDirection:   'row',
    alignItems:      'center',
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 1 },
    shadowOpacity:   0.05,
    shadowRadius:    4,
    elevation:       1,
  },
  cardAccent: {
    width: 52, height: 52,
    borderRadius:   Radius.md,
    alignItems:     'center',
    justifyContent: 'center',
    marginRight:    Spacing.sm,
  },
  cardIcon:    { fontSize: 26 },
  cardBody:    { flex: 1 },
  cardNameRow: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.xs },
  medicineName: { fontSize: Typography.fontSizeMD, fontWeight: Typography.fontWeightSemibold, color: Colors.textPrimary },
  medicineDosage: { fontSize: Typography.fontSizeXS, color: Colors.textSecondary },
  medicineFrequency: { fontSize: Typography.fontSizeSM, color: Colors.textSecondary, marginTop: 1 },

  miniBarTrack: {
    height:          4,
    backgroundColor: Colors.background,
    borderRadius:    2,
    overflow:        'hidden',
    marginTop:       Spacing.xs,
    marginBottom:    Spacing.xs,
  },
  miniBarFill: { height: '100%', borderRadius: 2 },

  stockRow:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  stockBadge:    { backgroundColor: Colors.primaryLight, paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: Radius.full },
  stockBadgeLow: { backgroundColor: '#FDE8E8' },
  stockText:     { fontSize: Typography.fontSizeXS, color: Colors.primary, fontWeight: Typography.fontWeightMedium },
  stockTextLow:  { color: Colors.error },
  refillAlert:   { fontSize: Typography.fontSizeXS, color: Colors.warning, fontWeight: Typography.fontWeightMedium },
  chevron:       { fontSize: 22, color: Colors.textMuted, marginLeft: Spacing.xs },

  empty: { alignItems: 'center', paddingTop: Spacing.xxl, paddingHorizontal: Spacing.lg },
  emptyIcon:  { fontSize: 52, marginBottom: Spacing.md },
  emptyTitle: { fontSize: Typography.fontSizeLG, fontWeight: Typography.fontWeightSemibold, color: Colors.textPrimary, marginBottom: Spacing.xs },
  emptySub:   { fontSize: Typography.fontSizeSM, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: Spacing.lg },
  emptyAddBtn: { backgroundColor: Colors.primary, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm + 2, borderRadius: Radius.full },
  emptyAddBtnText: { color: Colors.white, fontSize: Typography.fontSizeMD, fontWeight: Typography.fontWeightSemibold },
});
