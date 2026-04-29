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

type CaregiverStatus = 'pending' | 'accepted' | 'declined';

type Caregiver = {
  id:           string;
  name:         string;
  phone:        string;
  relationship: string;
  status:       CaregiverStatus;
  created_at:   string;
};

type PendingRequest = {
  id:           string;
  name:         string;
  relationship: string;
  users:        { name: string } | { name: string }[] | null;
};

type AlertRecord = {
  id:         string;
  sent_at:    string;
  reason:     string;
  caregivers: { name: string };
  medicines:  { name: string };
};

// ─── helpers ─────────────────────────────────────────────────

const INITIAL_COLORS = ['#1D9E75', '#5B6BE8', '#E8845B', '#E8635B', '#5BA3E8', '#9C27B0'];

const STATUS_CONFIG: Record<CaregiverStatus, { label: string; color: string; bg: string }> = {
  pending:  { label: 'Pending',  color: '#B45309', bg: '#FEF3C7' },
  accepted: { label: 'Active',   color: Colors.primary, bg: '#D1FAE5' },
  declined: { label: 'Declined', color: Colors.error,   bg: '#FEE2E2' },
};

function getInitials(name: string): string {
  return name.split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
}

function fmtRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 2)  return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function fmtAlertTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function getPatientName(users: PendingRequest['users']): string {
  if (!users) return 'Someone';
  if (Array.isArray(users)) return users[0]?.name ?? 'Someone';
  return users.name ?? 'Someone';
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
  caregiver:  Caregiver;
  colorIndex: number;
  onDelete:   (id: string) => void;
}) {
  const color  = INITIAL_COLORS[colorIndex % INITIAL_COLORS.length];
  const status = STATUS_CONFIG[caregiver.status];

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
        <View style={styles.cardNameRow}>
          <Text style={styles.caregiverName}>{caregiver.name}</Text>
          <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
            <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
          </View>
        </View>
        <Text style={styles.caregiverRole}>{caregiver.relationship}</Text>
        <View style={styles.cardFooter}>
          <View style={styles.phoneBadge}>
            <Text style={styles.phoneBadgeText}>📱 {caregiver.phone}</Text>
          </View>
        </View>
      </View>

      <TouchableOpacity
        style={styles.deleteBtn}
        onPress={confirmDelete}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={styles.deleteBtnText}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

function PendingRequestCard({
  request,
  onAccept,
  onDecline,
}: {
  request:   PendingRequest;
  onAccept:  (id: string) => void;
  onDecline: (id: string) => void;
}) {
  const patientName = getPatientName(request.users);

  return (
    <View style={styles.pendingCard}>
      <View style={styles.pendingIcon}>
        <Text style={{ fontSize: 22 }}>🔔</Text>
      </View>
      <View style={styles.pendingBody}>
        <Text style={styles.pendingTitle}>{patientName}</Text>
        <Text style={styles.pendingSub}>
          wants to add you as their <Text style={styles.pendingRel}>{request.relationship}</Text>
        </Text>
        <View style={styles.pendingActions}>
          <TouchableOpacity style={styles.declineBtn} onPress={() => onDecline(request.id)}>
            <Text style={styles.declineBtnText}>Decline</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.acceptBtn} onPress={() => onAccept(request.id)}>
            <Text style={styles.acceptBtnText}>Accept</Text>
          </TouchableOpacity>
        </View>
      </View>
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
  const [caregivers,      setCaregivers]      = useState<Caregiver[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [alerts,          setAlerts]          = useState<AlertRecord[]>([]);
  const [loading,         setLoading]         = useState(true);
  const [refreshing,      setRefreshing]      = useState(false);
  const [showModal,       setShowModal]       = useState(false);
  const [testRunning,     setTestRunning]     = useState(false);

  const fetchData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const [caregiverRes, alertRes, profileRes] = await Promise.all([
      supabase
        .from('caregivers')
        .select('id, name, phone, relationship, status, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true }),

      supabase
        .from('caregiver_alerts')
        .select(`id, sent_at, reason, caregivers ( name ), medicines ( name )`)
        .eq('user_id', user.id)
        .order('sent_at', { ascending: false })
        .limit(20),

      supabase
        .from('users')
        .select('phone')
        .eq('id', user.id)
        .single(),
    ]);

    if (caregiverRes.data) setCaregivers(caregiverRes.data as Caregiver[]);
    if (alertRes.data)     setAlerts(alertRes.data as unknown as AlertRecord[]);

    // Fetch requests directed at the current user (they are the caregiver)
    if (profileRes.data?.phone) {
      const last10 = profileRes.data.phone.replace(/\D/g, '').slice(-10);
      const { data: requests } = await supabase
        .from('caregivers')
        .select(`id, name, relationship, users!caregivers_user_id_fkey ( name )`)
        .eq('status', 'pending')
        .like('phone', `%${last10}`)
        .neq('user_id', user.id);

      setPendingRequests((requests ?? []) as unknown as PendingRequest[]);
    }

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
        status:       'pending',
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    setCaregivers((prev) => [...prev, row as Caregiver]);

    // Send consent request notification to the caregiver
    await supabase.functions.invoke('send-consent-request', {
      body: { caregiver_id: row.id },
    });
  }

  // ── accept / decline ───────────────────────────────────────
  async function handleAccept(id: string) {
    const { error } = await supabase
      .from('caregivers')
      .update({ status: 'accepted' })
      .eq('id', id);

    if (error) {
      showToast({ type: 'error', message: 'Could not accept request.' });
      return;
    }
    setPendingRequests((prev) => prev.filter((r) => r.id !== id));
    showToast({ type: 'success', message: 'Request accepted! You will now receive alerts.' });
  }

  async function handleDecline(id: string) {
    const { error } = await supabase
      .from('caregivers')
      .update({ status: 'declined' })
      .eq('id', id);

    if (error) {
      showToast({ type: 'error', message: 'Could not decline request.' });
      return;
    }
    setPendingRequests((prev) => prev.filter((r) => r.id !== id));
    showToast({ type: 'success', message: 'Request declined.' });
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

  // ── test alert ─────────────────────────────────────────────
  async function handleTestAlert() {
    setTestRunning(true);
    try {
      const result = await checkAndSendAlerts();
      if (result.status === 'no_user') {
        showToast({ type: 'error', message: 'Not signed in.' });
      } else if (result.status === 'no_overdue_reminders') {
        showToast({ type: 'error', message: 'No overdue doses found. A dose must be pending and missed by 2+ hours today.' });
      } else if (result.status === 'no_caregivers') {
        showToast({ type: 'error', message: 'No accepted caregivers yet.' });
      } else {
        if (result.sent > 0) {
          showToast({ type: 'success', message: `${result.sent} push notification(s) sent!` });
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
            {/* Pending requests directed at current user */}
            {pendingRequests.length > 0 && (
              <View style={styles.pendingSection}>
                <Text style={styles.sectionTitle}>Requests for You</Text>
                {pendingRequests.map((req) => (
                  <PendingRequestCard
                    key={req.id}
                    request={req}
                    onAccept={handleAccept}
                    onDecline={handleDecline}
                  />
                ))}
              </View>
            )}

            {/* Info banner */}
            <View style={styles.banner}>
              <Text style={styles.bannerIcon}>🔔</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.bannerTitle}>Push Notifications</Text>
                <Text style={styles.bannerSub}>
                  Caregivers receive a push notification when a dose is missed by 2+ hours. They must accept your request and have MediMind installed.
                </Text>
              </View>
            </View>

            {/* Test button */}
            {caregivers.some((c) => c.status === 'accepted') && (
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

  // pending requests section
  pendingSection: {
    marginBottom: Spacing.sm,
    gap:          Spacing.sm,
  },
  pendingCard: {
    backgroundColor: '#FFFBEB',
    borderRadius:    Radius.md,
    padding:         Spacing.md,
    flexDirection:   'row',
    alignItems:      'flex-start',
    borderWidth:     1.5,
    borderColor:     '#FDE68A',
    gap:             Spacing.sm,
  },
  pendingIcon: {
    marginTop: 2,
  },
  pendingBody: { flex: 1 },
  pendingTitle: {
    fontSize:   Typography.fontSizeMD,
    fontWeight: Typography.fontWeightSemibold,
    color:      Colors.textPrimary,
  },
  pendingSub: {
    fontSize:   Typography.fontSizeSM,
    color:      Colors.textSecondary,
    marginTop:  2,
  },
  pendingRel: {
    fontWeight: Typography.fontWeightSemibold,
    color:      Colors.textPrimary,
  },
  pendingActions: {
    flexDirection: 'row',
    gap:           Spacing.sm,
    marginTop:     Spacing.sm,
  },
  acceptBtn: {
    flex:            1,
    backgroundColor: Colors.primary,
    borderRadius:    Radius.sm,
    paddingVertical: Spacing.xs + 2,
    alignItems:      'center',
  },
  acceptBtnText: {
    color:      Colors.white,
    fontSize:   Typography.fontSizeSM,
    fontWeight: Typography.fontWeightSemibold,
  },
  declineBtn: {
    flex:            1,
    borderWidth:     1.5,
    borderColor:     Colors.border,
    borderRadius:    Radius.sm,
    paddingVertical: Spacing.xs + 2,
    alignItems:      'center',
    backgroundColor: Colors.white,
  },
  declineBtnText: {
    color:      Colors.textSecondary,
    fontSize:   Typography.fontSizeSM,
    fontWeight: Typography.fontWeightMedium,
  },

  // banner
  banner: {
    flexDirection:   'row',
    alignItems:      'flex-start',
    backgroundColor: Colors.primaryLight,
    borderRadius:    Radius.md,
    padding:         Spacing.md,
    gap:             Spacing.sm,
    marginBottom:    Spacing.sm,
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
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    borderWidth:     1.5,
    borderColor:     Colors.primary,
    borderRadius:    Radius.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.white,
    marginBottom:    Spacing.sm,
    minHeight:       44,
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
    width:          48,
    height:         48,
    borderRadius:   24,
    alignItems:     'center',
    justifyContent: 'center',
    marginRight:    Spacing.sm,
  },
  avatarText: {
    color:      Colors.white,
    fontSize:   Typography.fontSizeMD,
    fontWeight: Typography.fontWeightBold,
  },
  cardBody:    { flex: 1 },
  cardNameRow: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            Spacing.xs,
    flexWrap:       'wrap',
  },
  caregiverName: {
    fontSize:   Typography.fontSizeMD,
    fontWeight: Typography.fontWeightSemibold,
    color:      Colors.textPrimary,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical:   2,
    borderRadius:      Radius.full,
  },
  statusText: {
    fontSize:   10,
    fontWeight: Typography.fontWeightSemibold,
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
    backgroundColor:   Colors.background,
    borderRadius:      Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical:   2,
    borderWidth:       1,
    borderColor:       Colors.border,
  },
  phoneBadgeText: {
    fontSize: Typography.fontSizeXS,
    color:    Colors.textSecondary,
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
    alignItems:    'center',
    paddingTop:    Spacing.xl,
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
    fontSize:          Typography.fontSizeSM,
    color:             Colors.textSecondary,
    textAlign:         'center',
    lineHeight:        20,
    marginBottom:      Spacing.lg,
    paddingHorizontal: Spacing.md,
  },
  emptyAddBtn: {
    backgroundColor:   Colors.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical:   Spacing.sm + 2,
    borderRadius:      Radius.full,
  },
  emptyAddBtnText: {
    color:      Colors.white,
    fontSize:   Typography.fontSizeMD,
    fontWeight: Typography.fontWeightSemibold,
  },

  // section title
  sectionTitle: {
    fontSize:     Typography.fontSizeMD,
    fontWeight:   Typography.fontWeightSemibold,
    color:        Colors.textPrimary,
    marginBottom: Spacing.sm,
  },

  // alert history
  alertSection: {
    marginTop:       Spacing.lg,
    backgroundColor: Colors.white,
    borderRadius:    Radius.md,
    padding:         Spacing.md,
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 1 },
    shadowOpacity:   0.05,
    shadowRadius:    4,
    elevation:       1,
  },
  alertRow: {
    flexDirection:   'row',
    alignItems:      'flex-start',
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
  alertTitle: { fontSize: Typography.fontSizeSM, color: Colors.textPrimary },
  alertBold:  { fontWeight: Typography.fontWeightSemibold },
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
