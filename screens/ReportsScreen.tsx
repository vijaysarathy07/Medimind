import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Sharing from 'expo-sharing';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors, Radius, Spacing, Typography } from '../constants/theme';
import { generateWeeklyReport, type WeeklyReport, type DayStats, type MedicineStats } from '../services/reportService';
import { generatePDF } from '../services/reportGenerator';
import type { RootStackParamList } from '../navigation/types';

// ─── types ───────────────────────────────────────────────────

type Phase = 'idle' | 'loading' | 'ready' | 'sharing';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Reports'>;
};

// ─── constants ───────────────────────────────────────────────

const LOADING_STEPS = [
  { icon: '📊', text: 'Fetching adherence data…' },
  { icon: '🧮', text: 'Calculating statistics…'  },
  { icon: '📄', text: 'Generating PDF report…'  },
];

// ─── helpers ─────────────────────────────────────────────────

function pctColor(pct: number): string {
  if (pct >= 80) return Colors.primary;
  if (pct >= 50) return Colors.warning;
  return Colors.error;
}

function fmtShort(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── sub-components ──────────────────────────────────────────

const CHART_H = 88;

function DayBarChart({ days }: { days: DayStats[] }) {
  return (
    <View>
      <View style={{ height: CHART_H, flexDirection: 'row', alignItems: 'flex-end', gap: 4 }}>
        {days.map((d) => {
          const barH  = d.scheduled > 0 ? Math.max(3, (d.adherence / 100) * CHART_H) : 3;
          const color = d.scheduled === 0
            ? Colors.border
            : pctColor(d.adherence);
          return (
            <View key={d.date} style={{ flex: 1, alignItems: 'center' }}>
              <View style={{
                height:          barH,
                width:           '100%',
                backgroundColor: color,
                borderRadius:    3,
              }} />
            </View>
          );
        })}
      </View>
      <View style={styles.chartAxis} />
      <View style={styles.chartLabels}>
        {days.map((d) => (
          <Text key={d.date} style={styles.chartDayLabel}>{d.dayLabel}</Text>
        ))}
      </View>
      <View style={styles.chartLabels}>
        {days.map((d) => (
          <Text key={d.date} style={styles.chartPctLabel}>
            {d.scheduled > 0 ? `${d.adherence}%` : '—'}
          </Text>
        ))}
      </View>
    </View>
  );
}

function MedBar({ med, index }: { med: MedicineStats; index: number }) {
  const widthAnim = useRef(new Animated.Value(0)).current;
  const color     = pctColor(med.adherence);

  useEffect(() => {
    Animated.timing(widthAnim, {
      toValue:         med.adherence,
      duration:        700,
      delay:           index * 80,
      useNativeDriver: false,
    }).start();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const barWidth = widthAnim.interpolate({
    inputRange:  [0, 100],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.medBarItem}>
      <View style={styles.medBarHeaderRow}>
        <Text style={styles.medBarName}>{med.name}</Text>
        <Text style={[styles.medBarPct, { color }]}>{med.adherence}%</Text>
      </View>
      <View style={styles.medBarTrack}>
        <Animated.View style={[styles.medBarFill, { width: barWidth, backgroundColor: color }]} />
      </View>
      <Text style={styles.medBarSub}>
        {med.taken}/{med.scheduled - med.upcoming} doses completed
        {med.missed  > 0 ? ` · ${med.missed} missed`   : ''}
        {med.skipped > 0 ? ` · ${med.skipped} skipped` : ''}
      </Text>
    </View>
  );
}

function StatBox({ value, label, color, bg }: { value: number; label: string; color: string; bg: string }) {
  return (
    <View style={[styles.statBox, { backgroundColor: bg }]}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ─── main screen ─────────────────────────────────────────────

export default function ReportsScreen({ navigation }: Props) {
  const [phase,     setPhase]     = useState<Phase>('idle');
  const [report,    setReport]    = useState<WeeklyReport | null>(null);
  const [pdfUri,    setPdfUri]    = useState<string | null>(null);
  const [error,     setError]     = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);

  // Cycle through loading steps for better perceived performance
  useEffect(() => {
    if (phase !== 'loading') return;
    setStepIndex(0);
    const t = setInterval(() => setStepIndex((s) => Math.min(s + 1, LOADING_STEPS.length - 1)), 1600);
    return () => clearInterval(t);
  }, [phase]);

  async function handleGenerate() {
    setPhase('loading');
    setError(null);
    try {
      const data = await generateWeeklyReport();
      setReport(data);
      const uri = await generatePDF(data);
      setPdfUri(uri);
      setPhase('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate report.');
      setPhase('idle');
    }
  }

  async function handleShare() {
    if (!pdfUri) return;
    setPhase('sharing');
    try {
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        Alert.alert(
          'Sharing not available',
          'Your device does not support file sharing.',
          [{ text: 'OK' }]
        );
        return;
      }
      await Sharing.shareAsync(pdfUri, {
        mimeType:    'application/pdf',
        dialogTitle: 'Share Adherence Report with Doctor',
        UTI:         'com.adobe.pdf',
      });
    } catch (err) {
      Alert.alert('Error', 'Could not open the share sheet.');
    } finally {
      setPhase('ready');
    }
  }

  const step = LOADING_STEPS[stepIndex];

  // ── render helpers ──────────────────────────────────────────

  function renderHeader() {
    return (
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Adherence Report</Text>
        <View style={{ width: 40 }} />
      </View>
    );
  }

  // ── idle ────────────────────────────────────────────────────
  if (phase === 'idle') {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {renderHeader()}
        <ScrollView contentContainerStyle={styles.centerContent} showsVerticalScrollIndicator={false}>
          <View style={styles.idleCard}>
            <Text style={styles.idleIcon}>📊</Text>
            <Text style={styles.idleTitle}>Weekly Adherence Report</Text>
            <Text style={styles.idleSub}>
              Generate a summary of your last 7 days — doses taken, missed, and per-medicine
              adherence — as a shareable PDF you can email to your doctor.
            </Text>

            <View style={styles.idleFeatureList}>
              {[
                ['📋', '7-day adherence summary'],
                ['📈', 'Daily bar chart trend'],
                ['💊', 'Per-medicine breakdown'],
                ['📤', 'Share-ready PDF'],
              ].map(([icon, text]) => (
                <View key={text} style={styles.idleFeatureRow}>
                  <Text style={styles.idleFeatureIcon}>{icon}</Text>
                  <Text style={styles.idleFeatureText}>{text}</Text>
                </View>
              ))}
            </View>

            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>⚠ {error}</Text>
              </View>
            )}

            <TouchableOpacity style={styles.generateBtn} onPress={handleGenerate} activeOpacity={0.85}>
              <Text style={styles.generateBtnText}>Generate Report</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── loading ─────────────────────────────────────────────────
  if (phase === 'loading') {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {renderHeader()}
        <View style={styles.centerContent}>
          <View style={styles.loadingCard}>
            <ActivityIndicator color={Colors.primary} size="large" style={{ marginBottom: Spacing.md }} />
            <Text style={styles.loadingIcon}>{step.icon}</Text>
            <Text style={styles.loadingText}>{step.text}</Text>
            <View style={styles.stepDots}>
              {LOADING_STEPS.map((_, i) => (
                <View
                  key={i}
                  style={[styles.stepDot, i === stepIndex && styles.stepDotActive]}
                />
              ))}
            </View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ── ready / sharing ─────────────────────────────────────────
  if ((phase === 'ready' || phase === 'sharing') && report) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {renderHeader()}

        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          {/* Period banner */}
          <View style={styles.periodBanner}>
            <Text style={styles.periodText}>
              {fmtShort(report.startDate)} – {fmtShort(report.endDate)}
            </Text>
            <Text style={styles.periodPatient}>{report.patientName}</Text>
          </View>

          {/* ── Overall adherence ── */}
          <View style={[styles.card, styles.adherenceCard]}>
            <View style={styles.adherenceRow}>
              <View>
                <Text style={[styles.adherencePct, { color: pctColor(report.overallAdherence) }]}>
                  {report.overallAdherence}%
                </Text>
                <Text style={styles.adherenceLabel}>Overall Adherence</Text>
              </View>
              <View style={styles.adherenceBarCol}>
                <View style={styles.adherenceBarTrack}>
                  <View
                    style={[
                      styles.adherenceBarFill,
                      {
                        width:           `${report.overallAdherence}%` as any,
                        backgroundColor: pctColor(report.overallAdherence),
                      },
                    ]}
                  />
                </View>
                <Text style={styles.adherenceBarLabel}>
                  {report.totalTaken} of {report.totalScheduled - report.totalUpcoming} completed doses taken
                </Text>
              </View>
            </View>
          </View>

          {/* ── Stat boxes ── */}
          <View style={styles.statRow}>
            <StatBox value={report.totalScheduled} label="Scheduled" color={Colors.textPrimary}   bg={Colors.background} />
            <StatBox value={report.totalTaken}     label="Taken"     color={Colors.primary}       bg={Colors.primaryLight} />
            <StatBox value={report.totalMissed}    label="Missed"    color={Colors.error}         bg="#FFF5F5" />
            <StatBox value={report.totalSkipped}   label="Skipped"   color={Colors.warning}       bg="#FFF8F0" />
          </View>

          {/* ── Daily chart ── */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Daily Trend</Text>
            <DayBarChart days={report.dayStats} />
          </View>

          {/* ── Per-medicine bars ── */}
          {report.medicines.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>By Medicine</Text>
              {report.medicines.map((m, i) => (
                <MedBar key={m.id} med={m} index={i} />
              ))}
            </View>
          )}

          {report.medicines.length === 0 && (
            <View style={styles.card}>
              <Text style={styles.emptyCard}>
                No medicines were scheduled in the last 7 days.
              </Text>
            </View>
          )}

          {/* ── Actions ── */}
          <TouchableOpacity
            style={[styles.shareBtn, phase === 'sharing' && styles.shareBtnDisabled]}
            onPress={handleShare}
            disabled={phase === 'sharing'}
            activeOpacity={0.85}
          >
            {phase === 'sharing' ? (
              <ActivityIndicator color={Colors.white} size="small" />
            ) : (
              <>
                <Text style={styles.shareBtnIcon}>📤</Text>
                <Text style={styles.shareBtnText}>Share with Doctor (PDF)</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.regenerateLink} onPress={handleGenerate}>
            <Text style={styles.regenerateLinkText}>🔄 Regenerate Report</Text>
          </TouchableOpacity>

          <View style={{ height: Spacing.xxl }} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return null;
}

// ─── styles ──────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

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
    borderRadius:    Radius.sm,
    backgroundColor: Colors.background,
  },
  backArrow:   { fontSize: 20, color: Colors.textPrimary },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: Typography.fontSizeLG, fontWeight: Typography.fontWeightBold, color: Colors.textPrimary },

  centerContent: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.md },
  scroll:        { padding: Spacing.md, gap: Spacing.sm },

  // idle
  idleCard: {
    backgroundColor: Colors.white,
    borderRadius:    Radius.lg,
    padding:         Spacing.xl,
    alignItems:      'center',
    width:           '100%',
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 2 },
    shadowOpacity:   0.06,
    shadowRadius:    8,
    elevation:       2,
  },
  idleIcon:  { fontSize: 52, marginBottom: Spacing.md },
  idleTitle: { fontSize: Typography.fontSizeXXL, fontWeight: Typography.fontWeightBold, color: Colors.textPrimary, marginBottom: Spacing.sm, textAlign: 'center' },
  idleSub:   { fontSize: Typography.fontSizeSM, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: Spacing.lg },
  idleFeatureList: { width: '100%', marginBottom: Spacing.lg },
  idleFeatureRow:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.xs + 2 },
  idleFeatureIcon: { fontSize: 18 },
  idleFeatureText: { fontSize: Typography.fontSizeSM, color: Colors.textPrimary },
  errorBox: {
    backgroundColor: '#FFF5F5',
    borderRadius:    Radius.sm,
    padding:         Spacing.sm,
    borderWidth:     1,
    borderColor:     '#FFCDD2',
    marginBottom:    Spacing.md,
    width:           '100%',
  },
  errorText: { fontSize: Typography.fontSizeSM, color: Colors.error },
  generateBtn: {
    backgroundColor: Colors.primary,
    borderRadius:    Radius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    alignItems:      'center',
    shadowColor:     Colors.primary,
    shadowOffset:    { width: 0, height: 4 },
    shadowOpacity:   0.3,
    shadowRadius:    8,
    elevation:       4,
    width:           '100%',
  },
  generateBtnText: { color: Colors.white, fontSize: Typography.fontSizeMD, fontWeight: Typography.fontWeightSemibold },

  // loading
  loadingCard: { alignItems: 'center', padding: Spacing.xl },
  loadingIcon: { fontSize: 40, marginBottom: Spacing.sm },
  loadingText: { fontSize: Typography.fontSizeMD, color: Colors.textSecondary, textAlign: 'center', marginBottom: Spacing.md },
  stepDots:    { flexDirection: 'row', gap: 6 },
  stepDot:     { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.border },
  stepDotActive: { backgroundColor: Colors.primary, width: 16 },

  // ready
  periodBanner: {
    backgroundColor:   Colors.primary,
    borderRadius:      Radius.md,
    padding:           Spacing.md,
    flexDirection:     'row',
    justifyContent:    'space-between',
    alignItems:        'center',
  },
  periodText:    { fontSize: Typography.fontSizeMD, fontWeight: Typography.fontWeightBold, color: Colors.white },
  periodPatient: { fontSize: Typography.fontSizeSM, color: 'rgba(255,255,255,0.8)' },

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

  adherenceCard: { borderLeftWidth: 4, borderLeftColor: Colors.primary },
  adherenceRow:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  adherencePct:  { fontSize: 48, fontWeight: Typography.fontWeightBold, lineHeight: 52 },
  adherenceLabel: { fontSize: Typography.fontSizeXS, color: Colors.textSecondary, marginTop: 2 },
  adherenceBarCol:  { flex: 1 },
  adherenceBarTrack: { height: 10, backgroundColor: Colors.background, borderRadius: 5, overflow: 'hidden', marginBottom: 4 },
  adherenceBarFill:  { height: '100%', borderRadius: 5 },
  adherenceBarLabel: { fontSize: Typography.fontSizeXS, color: Colors.textMuted },

  statRow:  { flexDirection: 'row', gap: Spacing.xs },
  statBox: {
    flex:            1,
    borderRadius:    Radius.md,
    padding:         Spacing.sm,
    alignItems:      'center',
  },
  statValue: { fontSize: Typography.fontSizeXXL, fontWeight: Typography.fontWeightBold, lineHeight: 28 },
  statLabel: { fontSize: 10, color: Colors.textMuted, marginTop: 2, textAlign: 'center' },

  // day chart
  chartAxis:    { height: 2, backgroundColor: Colors.border, marginTop: 0 },
  chartLabels:  { flexDirection: 'row', gap: 4, marginTop: 4 },
  chartDayLabel: { flex: 1, textAlign: 'center', fontSize: 10, fontWeight: Typography.fontWeightSemibold, color: Colors.textSecondary },
  chartPctLabel: { flex: 1, textAlign: 'center', fontSize: 9, color: Colors.textMuted },

  // med bars
  medBarItem: { marginBottom: Spacing.md },
  medBarHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 },
  medBarName:  { fontSize: Typography.fontSizeMD, fontWeight: Typography.fontWeightSemibold, color: Colors.textPrimary, flex: 1 },
  medBarPct:   { fontSize: Typography.fontSizeMD, fontWeight: Typography.fontWeightBold },
  medBarTrack: { height: 8, backgroundColor: Colors.background, borderRadius: 4, overflow: 'hidden', marginBottom: 3 },
  medBarFill:  { height: '100%', borderRadius: 4 },
  medBarSub:   { fontSize: Typography.fontSizeXS, color: Colors.textMuted },

  emptyCard: { fontSize: Typography.fontSizeSM, color: Colors.textMuted, textAlign: 'center', paddingVertical: Spacing.md },

  // share
  shareBtn: {
    backgroundColor: Colors.primary,
    borderRadius:    Radius.md,
    paddingVertical: Spacing.md,
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             Spacing.sm,
    shadowColor:     Colors.primary,
    shadowOffset:    { width: 0, height: 4 },
    shadowOpacity:   0.3,
    shadowRadius:    8,
    elevation:       4,
    minHeight:       52,
  },
  shareBtnDisabled: { opacity: 0.65 },
  shareBtnIcon:     { fontSize: 20 },
  shareBtnText:     { color: Colors.white, fontSize: Typography.fontSizeMD, fontWeight: Typography.fontWeightSemibold },

  regenerateLink:     { alignItems: 'center', paddingVertical: Spacing.md },
  regenerateLinkText: { fontSize: Typography.fontSizeSM, color: Colors.textSecondary },
});
