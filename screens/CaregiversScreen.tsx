import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Radius, Spacing, Typography } from '../constants/theme';
import { supabase } from '../services/supabase';
import { checkAndSendAlerts, type AlertCheckResult } from '../services/alertService';
import AddCaregiverModal, { type NewCaregiver } from '../components/AddCaregiverModal';
import { SkeletonCaregiverCard } from '../components/Skeleton';
import { useToast } from '../contexts/ToastContext';

// ─── types ───────────────────────────────────────────────────

type Caregiver = {
  id:           string;
  name:         string;
  phone:        string;
  relationship: string;
  created_at:   string;
};

type AlertRecord = {
  id:           string;
  sent_at:      string;
  reason:       string;
  caregivers:   { name: string };
  medicines:    { name: string };
};

// ─── helpers ─────────────────────────────────────────────────

const INITIAL_COLORS = ['#1D9E75', '#5B6BE8', '#E8845B', '#E8635B', '#5BA3E8', '#9C27B0'];

function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

function fmtRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 2)    return 'Just now';
  if (mins < 60)   return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)    return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function fmtAlertTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

const REASON_LABEL: Record<string, string> = {
  missed_dose:  'Missed dose',
  low_stock:    'Low stock',
  skipped_dose: 'Skipped dose',
};

// ─── sub-components ──────────────────────────────────────────

function CaregiverCard({
  caregiver,
  colorIndex,
  onDelete,
}: {
  caregiver:   Caregiver;
  colorIndex:  number;
  onDelete:    (id: string) => void;
}) {
  const color = INITIAL_COLORS[colorIndex % INITIAL_COLORS.length];

  function confirmDelete() {
    Alert.alert(
      'Remove Caregiver',
      `Remove ${caregiver.name}? They will no longer receive missed-dose alerts.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => onDelete(caregiver.id) },
      ]
    );
  }

  return (
    <View style={styles.card}>
      <View style={[styles.avatar, { backgroundColor: color }]}>
        <Text style={styles.avatarText}>{getInitials(caregiver.name)}</Text>
      </View>

      <View style={styles.cardBody}>
        <Text style={styles.caregiverName}>{caregiver.name}</Text>
        <Text style={styles.caregiverRole}>{caregiver.relationship}</Text>
        <View style={styles.cardFooter}>
          <View style={styles.phoneBadge}>
            <Text style={styles.phoneBadgeText}>📱 {caregiver.phone}</Text>
          </View>
        </View>
      </View>

      <TouchableOpacity style={styles.deleteBtn} onPress={confirmDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Text style={styles.deleteBtnText}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

function AlertRow({ alert }: { alert: AlertRecord }) {
  return (
    <View style={styles.alertRow}>
      <View style={styles.alertDot} />
      <View style={styles.alertBody}>
        <Text style={styles.alertTitle} numberOfLines={1}>
          <Text style={styles.alertBold}>{alert.caregivers?.name ?? '—'}</Text>
          {' · '}
          {REASON_LABEL[alert.reason] ?? alert.reason}
        </Text>
        <Text style={styles.alertSub}>
          {alert.medicines?.name ?? '—'} · {fmtAlertTime(alert.sent_at)}
        </Text>
      </View>
      <Text style={styles.alertTime}>{fmtRelativeTime(alert.sent_at)}</Text>
    </View>
  );
}

// ─── main screen ─────────────────────────────────────────────

export default function CaregiversScreen() {
  const { showToast } = useToast();
  const [caregivers,   setCaregivers]   = useState<Caregiver[]>([]);
  const [alerts,       setAlerts]       = useState<AlertRecord[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [showModal,    setShowModal]    = useState(false);
  const [testRunning,  setTestRunning]  = useState(false);

  const fetchData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const [caregiverRes, alertRes] = await Promise.all([
      supabase
        .from('caregivers')
        .select('id, name, phone, relationship, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true }),

      supabase
        .from('caregiver_alerts')
        .select(`
          id,
          sent_at,
          reason,
          caregivers ( name ),
          medicines  ( name )
        `)
        .eq('user_id', user.id)
        .order('sent_at', { ascending: false })
        .limit(20),
    ]);

    if (caregiverRes.data) setCaregivers(caregiverRes.data as Caregiver[]);
    if (alertRes.data)     setAlerts(alertRes.data    as unknown as AlertRecord[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  // ── add ────────────────────────────────────────────────────
  async function handleAddCaregiver(data: NewCaregiver) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not signed in.');

    const { data: row, error } = await supabase
      .from('caregivers')
      .insert({
        user_id:      user.id,
        name:         data.name,
        phone:        data.phone,
        relationship: data.relationship,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    setCaregivers((prev) => [...prev, row as Caregiver]);
  }

  // ── delete ─────────────────────────────────────────────────
  async function handleDelete(id: string) {
    const { error } = await supabase.from('caregivers').delete().eq('id', id);
    if (error) {
      showToast({ type: 'error', message: error.message });
      return;
    }
    setCaregivers((prev) => prev.filter((c) => c.id !== id));
    showToast({ type: 'success', message: 'Caregiver removed.' });
  }

  // ── test alert (dev helper) ────────────────────────────────
  async function handleTestAlert() {
    setTestRunning(true);
    try {
      const result = await checkAndSendAlerts();

      if (result.status === 'no_user') {
        showToast({ type: 'error', message: 'Not signed in.' });
      } else if (result.status === 'no_overdue_reminders') {
        showToast({ type: 'error', message: 'No overdue doses found. A dose must be pending and missed by 2+ hours today.' });
      } else if (result.status === 'no_caregivers') {
        showToast({ type: 'error', message: 'No caregivers added yet.' });
      } else {
        if (result.sent > 0) {
          showToast({ type: 'success', message: `${result.sent} push notification(s) sent to caregiver(s)!` });
        } else if (result.skipped > 0 && result.sent === 0) {
          showToast({ type: 'error', message: 'Alerts already sent for all overdue doses.' });
        } else if (result.failed > 0) {
          showToast({ type: 'error', message: `Failed: ${result.errors[0]}` });
        }
        await fetchData();
      }
    } catch (err) {
      showToast({ type: 'error', message: err instanceof Error ? err.message : 'Alert check failed.' });
    } finally {
      setTestRunning(false);
    }
  }

  // ── render ─────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.title}>Caregivers</Text>
        </View>
        <View style={[styles.list, { gap: Spacing.sm }]}>
          {[0, 1, 2].map((i) => <SkeletonCaregiverCard key={i} />)}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Caregivers</Text>
        <TouchableOpacity style={styles.inviteBtn} onPress={() => setShowModal(true)}>
          <Text style={styles.inviteBtnText}>+ Invite</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={caregivers}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.primary} />
        }
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
            {/* Info banner */}
            <View style={styles.banner}>
              <Text style={styles.bannerIcon}>🔔</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.bannerTitle}>Push Notifications</Text>
                <Text style={styles.bannerSub}>
                  Caregivers receive a push notification when a dose is missed by 2+ hours. They must have MediMind installed.
                </Text>
              </View>
            </View>

            {/* Test button (visible when caregivers exist) */}
            {caregivers.length > 0 && (
              <TouchableOpacity
                style={[styles.testBtn, testRunning && styles.testBtnDisabled]}
                onPress={handleTestAlert}
                disabled={testRunning}
              >
                {testRunning
                  ? <ActivityIndicator color={Colors.primary} size="small" />
                  : <Text style={styles.testBtnText}>⚡ Run Alert Check Now</Text>
                }
              </TouchableOpacity>
            )}
          </>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>👥</Text>
            <Text style={styles.emptyTitle}>No caregivers yet</Text>
            <Text style={styles.emptySub}>
              Add a family member, doctor, or nurse to notify when doses are missed.
            </Text>
            <TouchableOpacity style={styles.emptyAddBtn} onPress={() => setShowModal(true)}>
              <Text style={styles.emptyAddBtnText}>+ Add Caregiver</Text>
            </TouchableOpacity>
          </View>
        }
        renderItem={({ item, index }) => (
          <CaregiverCard
            caregiver={item}
            colorIndex={index}
            onDelete={handleDelete}
          />
        )}
        ListFooterComponent={
          alerts.length > 0 ? (
            <View style={styles.alertSection}>
              <Text style={styles.sectionTitle}>Recent Alerts</Text>
              {alerts.map((a) => <AlertRow key={a.id} alert={a} />)}
            </View>
          ) : null
        }
      />

      <AddCaregiverModal
        visible={showModal}
        onClose={() => setShowModal(false)}
        onSave={handleAddCaregiver}
      />
    </SafeAreaView>
  );
}

// ─── styles ──────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex:            1,
    backgroundColor: Colors.background,
  },
  centerContent: {
    alignItems:     'center',
    justifyContent: 'center',
  },

  header: {
    flexDirection:     'row',
    justifyContent:    'space-between',
    alignItems:        'center',
    paddingHorizontal: Spacing.md,
    paddingTop:        Spacing.sm,
    paddingBottom:     Spacing.md,
  },
  title: {
    fontSize:   Typography.fontSizeXXL,
    fontWeight: Typography.fontWeightBold,
    color:      Colors.textPrimary,
  },
  inviteBtn: {
    backgroundColor:   Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical:   Spacing.xs + 2,
    borderRadius:      Radius.full,
  },
  inviteBtnText: {
    color:      Colors.white,
    fontSize:   Typography.fontSizeSM,
    fontWeight: Typography.fontWeightSemibold,
  },

  list: {
    paddingHorizontal: Spacing.md,
    paddingBottom:     Spacing.xxl,
    gap:               Spacing.sm,
  },

  // banner
  banner: {
    flexDirection:     'row',
    alignItems:        'flex-start',
    backgroundColor:   Colors.primaryLight,
    borderRadius:      Radius.md,
    padding:           Spacing.md,
    gap:               Spacing.sm,
    marginBottom:      Spacing.sm,
  },
  bannerIcon:  { fontSize: 22 },
  bannerTitle: {
    fontSize:     Typography.fontSizeMD,
    fontWeight:   Typography.fontWeightSemibold,
    color:        Colors.primaryDark,
    marginBottom: 2,
  },
  bannerSub: {
    fontSize:   Typography.fontSizeXS,
    color:      Colors.primary,
    lineHeight: 18,
  },

  // test button
  testBtn: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'center',
    borderWidth:       1.5,
    borderColor:       Colors.primary,
    borderRadius:      Radius.md,
    paddingVertical:   Spacing.sm,
    backgroundColor:   Colors.white,
    marginBottom:      Spacing.sm,
    minHeight:         44,
  },
  testBtnDisabled: { opacity: 0.6 },
  testBtnText: {
    fontSize:   Typography.fontSizeSM,
    fontWeight: Typography.fontWeightSemibold,
    color:      Colors.primary,
  },

  // caregiver card
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
  avatar: {
    width:           48,
    height:          48,
    borderRadius:    24,
    alignItems:      'center',
    justifyContent:  'center',
    marginRight:     Spacing.sm,
  },
  avatarText: {
    color:      Colors.white,
    fontSize:   Typography.fontSizeMD,
    fontWeight: Typography.fontWeightBold,
  },
  cardBody:   { flex: 1 },
  caregiverName: {
    fontSize:   Typography.fontSizeMD,
    fontWeight: Typography.fontWeightSemibold,
    color:      Colors.textPrimary,
  },
  caregiverRole: {
    fontSize:  Typography.fontSizeSM,
    color:     Colors.textSecondary,
    marginTop: 2,
  },
  cardFooter: {
    flexDirection: 'row',
    marginTop:     Spacing.xs,
  },
  phoneBadge: {
    backgroundColor: Colors.background,
    borderRadius:    Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical:   2,
    borderWidth:     1,
    borderColor:     Colors.border,
  },
  phoneBadgeText: {
    fontSize:   Typography.fontSizeXS,
    color:      Colors.textSecondary,
  },
  deleteBtn: {
    width:           32,
    height:          32,
    borderRadius:    16,
    backgroundColor: '#FFE8E8',
    alignItems:      'center',
    justifyContent:  'center',
    marginLeft:      Spacing.xs,
  },
  deleteBtnText: { fontSize: 12, color: Colors.error },

  // empty state
  empty: {
    alignItems:   'center',
    paddingTop:   Spacing.xl,
    paddingBottom: Spacing.xl,
  },
  emptyIcon:  { fontSize: 52, marginBottom: Spacing.md },
  emptyTitle: {
    fontSize:     Typography.fontSizeLG,
    fontWeight:   Typography.fontWeightSemibold,
    color:        Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  emptySub: {
    fontSize:     Typography.fontSizeSM,
    color:        Colors.textSecondary,
    textAlign:    'center',
    lineHeight:   20,
    marginBottom: Spacing.lg,
    paddingHorizontal: Spacing.md,
  },
  emptyAddBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical:   Spacing.sm + 2,
    borderRadius:      Radius.full,
  },
  emptyAddBtnText: {
    color:      Colors.white,
    fontSize:   Typography.fontSizeMD,
    fontWeight: Typography.fontWeightSemibold,
  },

  // alert history
  alertSection: {
    marginTop:         Spacing.lg,
    backgroundColor:   Colors.white,
    borderRadius:      Radius.md,
    padding:           Spacing.md,
    shadowColor:       '#000',
    shadowOffset:      { width: 0, height: 1 },
    shadowOpacity:     0.05,
    shadowRadius:      4,
    elevation:         1,
  },
  sectionTitle: {
    fontSize:     Typography.fontSizeMD,
    fontWeight:   Typography.fontWeightSemibold,
    color:        Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  alertRow: {
    flexDirection:  'row',
    alignItems:     'flex-start',
    paddingVertical: Spacing.sm,
    borderTopWidth:  1,
    borderTopColor:  Colors.border,
    gap:             Spacing.sm,
  },
  alertDot: {
    width:           8,
    height:          8,
    borderRadius:    4,
    backgroundColor: Colors.warning,
    marginTop:       5,
    flexShrink:      0,
  },
  alertBody:  { flex: 1 },
  alertTitle: {
    fontSize: Typography.fontSizeSM,
    color:    Colors.textPrimary,
  },
  alertBold: { fontWeight: Typography.fontWeightSemibold },
  alertSub: {
    fontSize:  Typography.fontSizeXS,
    color:     Colors.textMuted,
    marginTop: 2,
  },
  alertTime: {
    fontSize:   Typography.fontSizeXS,
    color:      Colors.textMuted,
    flexShrink: 0,
    marginTop:  2,
  },
});
