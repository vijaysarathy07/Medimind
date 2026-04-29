import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors, Radius, Spacing, Typography } from '../constants/theme';
import { supabase } from '../services/supabase';
import { extractMedicinesFromImage, type ExtractedMedicine } from '../services/anthropic';
import { scheduleDailyReminder } from '../services/notifications';
import type { MealRelation } from '../hooks/useTodaySchedule';
import type { RootStackParamList } from '../navigation/types';

// ─── types ───────────────────────────────────────────────────

type EditableMedicine = {
  _id:         string;
  name:        string;
  dosage:      string;
  timesPerDay: 1 | 2 | 3;
  meal_relation: MealRelation;
};

type Phase =
  | { type: 'camera' }
  | { type: 'preview';   uri: string; base64: string }
  | { type: 'analyzing'; uri: string }
  | { type: 'review';    uri: string; medicines: EditableMedicine[] }
  | { type: 'saving' };

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'PrescriptionScanner'>;
};

// ─── constants ───────────────────────────────────────────────

const ANALYZE_STEPS = [
  { icon: '📸', text: 'Reading prescription...' },
  { icon: '🔍', text: 'Identifying medicines...' },
  { icon: '✨', text: 'Extracting details...' },
];

const FREQ_OPTIONS: { label: string; value: 1 | 2 | 3 }[] = [
  { label: 'Once',   value: 1 },
  { label: 'Twice',  value: 2 },
  { label: 'Thrice', value: 3 },
];

const MEAL_OPTIONS: { label: string; value: MealRelation }[] = [
  { label: 'Before', value: 'before_meal'  },
  { label: 'With',   value: 'with_meal'    },
  { label: 'After',  value: 'after_meal'   },
  { label: 'Any',    value: 'independent'  },
];

const ACCENT_COLORS = ['#1D9E75', '#5B6BE8', '#E8845B', '#E8635B', '#5BA3E8'];

// ─── helpers ─────────────────────────────────────────────────

function parseTimesPerDay(freq: string): 1 | 2 | 3 {
  const s = freq.toLowerCase();
  if (s.includes('twice') || s.includes('two')   || s === '2') return 2;
  if (s.includes('thrice') || s.includes('three') || s === '3') return 3;
  return 1;
}

function defaultReminderTimes(timesPerDay: number): Date[] {
  const base = new Date();
  const hours: number[] =
    timesPerDay === 1 ? [8]
    : timesPerDay === 2 ? [8, 20]
    : [8, 14, 20];
  return hours.map((h) => {
    const d = new Date(base);
    d.setHours(h, 0, 0, 0);
    return d;
  });
}

function toEditable(ex: ExtractedMedicine, idx: number): EditableMedicine {
  return {
    _id:          `${Date.now()}_${idx}`,
    name:         ex.name,
    dosage:       ex.dosage,
    timesPerDay:  parseTimesPerDay(ex.frequency),
    meal_relation: ex.meal_relation,
  };
}

// ─── AnimatedCard ─────────────────────────────────────────────

function AnimatedCard({ index, children }: { index: number; children: React.ReactNode }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(anim, {
      toValue:         1,
      delay:           index * 80,
      tension:         60,
      friction:        8,
      useNativeDriver: true,
    }).start();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Animated.View
      style={{
        opacity:   anim,
        transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}

// ─── EditableMedicineCard ─────────────────────────────────────

type CardProps = {
  medicine: EditableMedicine;
  index:    number;
  onChange: (id: string, patch: Partial<EditableMedicine>) => void;
  onDelete: (id: string) => void;
};

function EditableMedicineCard({ medicine, index, onChange, onDelete }: CardProps) {
  const accent = ACCENT_COLORS[index % ACCENT_COLORS.length];

  return (
    <AnimatedCard index={index}>
      <View style={[styles.medCard, { borderLeftColor: accent }]}>
        {/* Header row */}
        <View style={styles.medCardHeader}>
          <View style={[styles.medIndex, { backgroundColor: accent }]}>
            <Text style={styles.medIndexText}>{index + 1}</Text>
          </View>
          <Text style={styles.medCardTitle} numberOfLines={1}>
            {medicine.name || 'New Medicine'}
          </Text>
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={() => onDelete(medicine._id)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.deleteBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Name */}
        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>Medicine Name</Text>
          <TextInput
            style={styles.fieldInput}
            value={medicine.name}
            onChangeText={(v) => onChange(medicine._id, { name: v })}
            placeholder="e.g. Metformin"
            placeholderTextColor={Colors.textMuted}
            autoCapitalize="words"
          />
        </View>

        {/* Dosage */}
        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>Dosage</Text>
          <TextInput
            style={styles.fieldInput}
            value={medicine.dosage}
            onChangeText={(v) => onChange(medicine._id, { dosage: v })}
            placeholder="e.g. 500mg"
            placeholderTextColor={Colors.textMuted}
          />
        </View>

        {/* Frequency */}
        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>Frequency</Text>
          <View style={styles.chipRow}>
            {FREQ_OPTIONS.map(({ label, value }) => (
              <TouchableOpacity
                key={value}
                style={[
                  styles.chip,
                  medicine.timesPerDay === value && { backgroundColor: accent, borderColor: accent },
                ]}
                onPress={() => onChange(medicine._id, { timesPerDay: value })}
              >
                <Text
                  style={[
                    styles.chipText,
                    medicine.timesPerDay === value && styles.chipTextActive,
                  ]}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Meal relation */}
        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>When to take</Text>
          <View style={styles.chipRow}>
            {MEAL_OPTIONS.map(({ label, value }) => (
              <TouchableOpacity
                key={value}
                style={[
                  styles.chip,
                  medicine.meal_relation === value && { backgroundColor: accent, borderColor: accent },
                ]}
                onPress={() => onChange(medicine._id, { meal_relation: value })}
              >
                <Text
                  style={[
                    styles.chipText,
                    medicine.meal_relation === value && styles.chipTextActive,
                  ]}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    </AnimatedCard>
  );
}

// ─── main screen ─────────────────────────────────────────────

export default function PrescriptionScannerScreen({ navigation }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [phase, setPhase]         = useState<Phase>({ type: 'camera' });
  const [facing, setFacing]       = useState<'back' | 'front'>('back');
  const [flash, setFlash]         = useState<'off' | 'on'>('off');
  const [analyzeStep, setStep]    = useState(0);

  const cameraRef   = useRef<CameraView>(null);
  const pulseAnim   = useRef(new Animated.Value(1)).current;
  const captureAnim = useRef(new Animated.Value(0)).current;

  // Pulse animation while analyzing
  useEffect(() => {
    if (phase.type !== 'analyzing') return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.14, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [phase.type]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cycle analyze step text
  useEffect(() => {
    if (phase.type !== 'analyzing') return;
    setStep(0);
    const t = setInterval(() => setStep((s) => (s + 1) % ANALYZE_STEPS.length), 1900);
    return () => clearInterval(t);
  }, [phase.type]);

  // ── capture ────────────────────────────────────────────────
  const capture = useCallback(async () => {
    if (!cameraRef.current) return;
    // Flash effect
    Animated.sequence([
      Animated.timing(captureAnim, { toValue: 1, duration: 80,  useNativeDriver: true }),
      Animated.timing(captureAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start();

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality:  0.75,
        base64:   true,
        exif:     false,
      });
      const raw = photo.base64 ?? '';
      // Strip data-URI prefix if present
      const base64 = raw.replace(/^data:image\/\w+;base64,/, '');
      setPhase({ type: 'preview', uri: photo.uri, base64 });
    } catch (e) {
      Alert.alert('Camera error', 'Could not take photo. Please try again.');
    }
  }, [captureAnim]);

  // ── analyze ────────────────────────────────────────────────
  const analyze = useCallback(async () => {
    if (phase.type !== 'preview') return;
    const { uri, base64 } = phase;
    setPhase({ type: 'analyzing', uri });

    try {
      const extracted = await extractMedicinesFromImage(base64, 'image/jpeg');
      if (extracted.length === 0) {
        Alert.alert(
          'No medicines found',
          'Claude could not identify any medicines in this photo.\n\nTry retaking the photo in better lighting.',
          [
            { text: 'Retake',       onPress: () => setPhase({ type: 'camera' }) },
            { text: 'Add Manually', onPress: () => setPhase({ type: 'review', uri, medicines: [emptyMedicine()] }) },
          ]
        );
        return;
      }
      setPhase({
        type:      'review',
        uri,
        medicines: extracted.map((e, i) => toEditable(e, i)),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Analysis failed.';
      Alert.alert('Could not analyse', msg, [
        { text: 'Try again',   onPress: () => setPhase({ type: 'preview', uri, base64 }) },
        { text: 'Go back',     onPress: () => setPhase({ type: 'camera' }) },
      ]);
    }
  }, [phase]);

  // ── medicine editing ───────────────────────────────────────
  const emptyMedicine = (): EditableMedicine => ({
    _id:          `manual_${Date.now()}`,
    name:         '',
    dosage:       '',
    timesPerDay:  1,
    meal_relation: 'independent',
  });

  function updateMedicine(id: string, patch: Partial<EditableMedicine>) {
    if (phase.type !== 'review') return;
    setPhase({
      ...phase,
      medicines: phase.medicines.map((m) => m._id === id ? { ...m, ...patch } : m),
    });
  }

  function deleteMedicine(id: string) {
    if (phase.type !== 'review') return;
    setPhase({ ...phase, medicines: phase.medicines.filter((m) => m._id !== id) });
  }

  function addMedicine() {
    if (phase.type !== 'review') return;
    setPhase({ ...phase, medicines: [...phase.medicines, emptyMedicine()] });
  }

  // ── save ────────────────────────────────────────────────────
  const saveAll = useCallback(async () => {
    if (phase.type !== 'review') return;
    const { medicines } = phase;

    const invalid = medicines.find((m) => !m.name.trim());
    if (invalid) {
      Alert.alert('Incomplete', 'Please fill in the medicine name for all entries.');
      return;
    }

    setPhase({ type: 'saving' });
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not signed in. (Auth not yet configured.)');

      for (const med of medicines) {
        const freqLabel = ['', 'Once daily', 'Twice daily', 'Thrice daily'][med.timesPerDay];

        const { data: row, error: medErr } = await supabase
          .from('medicines')
          .insert({
            user_id:         user.id,
            name:            med.name.trim(),
            dosage:          med.dosage.trim(),
            frequency:       freqLabel,
            times_per_day:   med.timesPerDay,
            meal_relation:   med.meal_relation,
            pill_count:      0,
            refill_alert_at: 7,
          })
          .select()
          .single();

        if (medErr) throw medErr;

        const times = defaultReminderTimes(med.timesPerDay);
        await Promise.all(
          times.map(async (time) => {
            const notifId = `med_${row.id}_${time.getHours()}_${time.getMinutes()}`;
            await scheduleDailyReminder(notifId, med.name.trim(), med.dosage.trim(), time);
            await supabase.from('reminders').insert({
              medicine_id:    row.id,
              scheduled_time: time.toISOString(),
              status:         'pending',
            });
          })
        );
      }

      navigation.goBack();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed.';
      Alert.alert('Error', msg);
      navigation.goBack();
    }
  }, [phase, navigation]);

  // ── permission gate ────────────────────────────────────────
  if (!permission) return <View style={styles.container} />;

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.permBox}>
          <Text style={styles.permIcon}>📷</Text>
          <Text style={styles.permTitle}>Camera Access Needed</Text>
          <Text style={styles.permSub}>
            MediMind needs camera access to scan your prescription.
          </Text>
          <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
            <Text style={styles.permBtnText}>Grant Permission</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.permBack} onPress={() => navigation.goBack()}>
            <Text style={styles.permBackText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── camera phase ──────────────────────────────────────────
  if (phase.type === 'camera') {
    return (
      <View style={styles.container}>
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing={facing}
          flash={flash}
        />

        {/* White capture flash overlay */}
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: '#fff', opacity: captureAnim, pointerEvents: 'none' },
          ]}
        />

        {/* UI overlay */}
        <SafeAreaView style={StyleSheet.absoluteFill} edges={['top', 'bottom']}>
          {/* Top bar */}
          <View style={styles.camTopBar}>
            <TouchableOpacity style={styles.camIconBtn} onPress={() => navigation.goBack()}>
              <Text style={styles.camIconText}>✕</Text>
            </TouchableOpacity>
            <Text style={styles.camTitle}>Scan Prescription</Text>
            <TouchableOpacity
              style={styles.camIconBtn}
              onPress={() => setFlash((f) => (f === 'off' ? 'on' : 'off'))}
            >
              <Text style={styles.camIconText}>{flash === 'on' ? '⚡' : '🔦'}</Text>
            </TouchableOpacity>
          </View>

          {/* Framing guide */}
          <View style={styles.frameArea}>
            <View style={styles.frameBox}>
              <View style={[styles.corner, styles.cornerTL]} />
              <View style={[styles.corner, styles.cornerTR]} />
              <View style={[styles.corner, styles.cornerBL]} />
              <View style={[styles.corner, styles.cornerBR]} />
            </View>
            <Text style={styles.frameHint}>Centre the prescription within the frame</Text>
          </View>

          {/* Bottom controls */}
          <View style={styles.camBottomBar}>
            <TouchableOpacity
              style={styles.camFlipBtn}
              onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}
            >
              <Text style={styles.camFlipText}>↺</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.captureBtn} onPress={capture} activeOpacity={0.8}>
              <View style={styles.captureBtnInner} />
            </TouchableOpacity>

            <View style={{ width: 52 }} />
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // ── preview phase ─────────────────────────────────────────
  if (phase.type === 'preview') {
    return (
      <View style={styles.container}>
        <Image source={{ uri: phase.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        <View style={[StyleSheet.absoluteFill, styles.previewOverlay]} />

        <SafeAreaView style={StyleSheet.absoluteFill} edges={['top', 'bottom']}>
          <TouchableOpacity style={styles.camIconBtn} onPress={() => setPhase({ type: 'camera' })}>
            <Text style={styles.camIconText}>←</Text>
          </TouchableOpacity>

          <View style={styles.previewBottom}>
            <Text style={styles.previewTitle}>Prescription captured</Text>
            <Text style={styles.previewSub}>
              Make sure the prescription is clear and well-lit before analysing.
            </Text>
            <TouchableOpacity style={styles.analyseBtn} onPress={analyze} activeOpacity={0.85}>
              <Text style={styles.analyseBtnText}>🔍  Analyse Prescription</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.retakeBtn}
              onPress={() => setPhase({ type: 'camera' })}
            >
              <Text style={styles.retakeBtnText}>Retake</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // ── analyzing phase ───────────────────────────────────────
  if (phase.type === 'analyzing') {
    const step = ANALYZE_STEPS[analyzeStep];
    return (
      <View style={styles.container}>
        <Image source={{ uri: phase.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        <View style={[StyleSheet.absoluteFill, styles.analysingOverlay]} />

        <View style={styles.analysingCenter}>
          {/* Pulsing ring */}
          <Animated.View
            style={[styles.pulseRing, { transform: [{ scale: pulseAnim }] }]}
          />
          {/* Icon card */}
          <View style={styles.analysingCard}>
            <Text style={styles.analysingIcon}>{step.icon}</Text>
            <Text style={styles.analysingText}>{step.text}</Text>
            <View style={styles.dotsRow}>
              {[0, 1, 2].map((i) => (
                <View
                  key={i}
                  style={[
                    styles.dot,
                    { opacity: analyzeStep === i ? 1 : 0.25 },
                  ]}
                />
              ))}
            </View>
          </View>
          <Text style={styles.analysingFootnote}>
            Powered by Claude AI · please wait
          </Text>
        </View>
      </View>
    );
  }

  // ── saving phase ──────────────────────────────────────────
  if (phase.type === 'saving') {
    return (
      <View style={[styles.container, styles.savingContainer]}>
        <Text style={styles.savingIcon}>💊</Text>
        <Text style={styles.savingText}>Saving medicines…</Text>
        <Text style={styles.savingSubtext}>Scheduling your reminders</Text>
      </View>
    );
  }

  // ── review phase ──────────────────────────────────────────
  const { medicines } = phase;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.reviewHeader}>
        <TouchableOpacity
          onPress={() => setPhase({ type: 'camera' })}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.reviewBack}>← Rescan</Text>
        </TouchableOpacity>
        <View style={styles.reviewHeaderCenter}>
          <Text style={styles.reviewTitle}>
            {medicines.length} {medicines.length === 1 ? 'medicine' : 'medicines'} found
          </Text>
          <Text style={styles.reviewSub}>Review and edit before saving</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          contentContainerStyle={styles.reviewScroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Preview thumbnail */}
          <Image source={{ uri: phase.uri }} style={styles.reviewThumb} resizeMode="cover" />

          {/* Medicine cards */}
          {medicines.map((med, i) => (
            <EditableMedicineCard
              key={med._id}
              medicine={med}
              index={i}
              onChange={updateMedicine}
              onDelete={deleteMedicine}
            />
          ))}

          {/* Add another */}
          <TouchableOpacity style={styles.addMoreCard} onPress={addMedicine}>
            <View style={styles.addMoreCircle}>
              <Text style={styles.addMorePlus}>+</Text>
            </View>
            <Text style={styles.addMoreText}>Add medicine manually</Text>
          </TouchableOpacity>

          {/* Save */}
          <TouchableOpacity style={styles.saveBtn} onPress={saveAll} activeOpacity={0.85}>
            <Text style={styles.saveBtnText}>
              Save {medicines.length} {medicines.length === 1 ? 'Medicine' : 'Medicines'}
            </Text>
          </TouchableOpacity>

          <View style={{ height: Spacing.xxl }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── styles ──────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex:            1,
    backgroundColor: '#000',
  },

  // ── permission ──
  permBox: {
    flex:            1,
    backgroundColor: Colors.background,
    alignItems:      'center',
    justifyContent:  'center',
    padding:         Spacing.xl,
  },
  permIcon:     { fontSize: 56, marginBottom: Spacing.md },
  permTitle: {
    fontSize:   Typography.fontSizeXXL,
    fontWeight: Typography.fontWeightBold,
    color:      Colors.textPrimary,
    textAlign:  'center',
    marginBottom: Spacing.sm,
  },
  permSub: {
    fontSize:   Typography.fontSizeMD,
    color:      Colors.textSecondary,
    textAlign:  'center',
    lineHeight: 22,
    marginBottom: Spacing.xl,
  },
  permBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical:   Spacing.sm + 4,
    borderRadius:      Radius.full,
    marginBottom:      Spacing.md,
  },
  permBtnText: {
    color:      Colors.white,
    fontSize:   Typography.fontSizeMD,
    fontWeight: Typography.fontWeightSemibold,
  },
  permBack: { paddingVertical: Spacing.sm },
  permBackText: { color: Colors.textSecondary, fontSize: Typography.fontSizeMD },

  // ── camera ──
  camTopBar: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical:   Spacing.sm,
  },
  camIconBtn: {
    width:           44,
    height:          44,
    borderRadius:    22,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems:      'center',
    justifyContent:  'center',
  },
  camIconText:  { fontSize: 18, color: '#fff' },
  camTitle: {
    fontSize:   Typography.fontSizeMD,
    fontWeight: Typography.fontWeightSemibold,
    color:      '#fff',
  },
  frameArea: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    paddingBottom:  Spacing.xl,
  },
  frameBox: {
    width:  260,
    height: 340,
  },
  corner: {
    position:    'absolute',
    width:       32,
    height:      32,
    borderColor: '#fff',
    borderWidth: 3,
  },
  cornerTL: { top: 0,  left: 0,  borderRightWidth: 0, borderBottomWidth: 0 },
  cornerTR: { top: 0,  right: 0, borderLeftWidth:  0, borderBottomWidth: 0 },
  cornerBL: { bottom: 0, left: 0,  borderRightWidth: 0, borderTopWidth: 0 },
  cornerBR: { bottom: 0, right: 0, borderLeftWidth:  0, borderTopWidth: 0 },
  frameHint: {
    color:     'rgba(255,255,255,0.75)',
    fontSize:  Typography.fontSizeXS,
    marginTop: Spacing.md,
    textAlign: 'center',
  },
  camBottomBar: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingBottom:     Spacing.lg,
  },
  camFlipBtn: {
    width:           52,
    height:          52,
    borderRadius:    26,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems:      'center',
    justifyContent:  'center',
  },
  camFlipText: { color: '#fff', fontSize: 26 },
  captureBtn: {
    width:           76,
    height:          76,
    borderRadius:    38,
    borderWidth:     4,
    borderColor:     '#fff',
    alignItems:      'center',
    justifyContent:  'center',
  },
  captureBtnInner: {
    width:           58,
    height:          58,
    borderRadius:    29,
    backgroundColor: '#fff',
  },

  // ── preview ──
  previewOverlay: {
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  previewBottom: {
    position:        'absolute',
    bottom:          0,
    left:            0,
    right:           0,
    backgroundColor: 'rgba(10,30,22,0.85)',
    padding:         Spacing.lg,
    borderTopLeftRadius:  Radius.xl,
    borderTopRightRadius: Radius.xl,
  },
  previewTitle: {
    fontSize:     Typography.fontSizeXL,
    fontWeight:   Typography.fontWeightBold,
    color:        '#fff',
    marginBottom: Spacing.xs,
  },
  previewSub: {
    fontSize:     Typography.fontSizeSM,
    color:        'rgba(255,255,255,0.7)',
    marginBottom: Spacing.lg,
    lineHeight:   20,
  },
  analyseBtn: {
    backgroundColor: Colors.primary,
    borderRadius:    Radius.md,
    paddingVertical: Spacing.md,
    alignItems:      'center',
    marginBottom:    Spacing.sm,
    shadowColor:     Colors.primary,
    shadowOffset:    { width: 0, height: 4 },
    shadowOpacity:   0.4,
    shadowRadius:    8,
    elevation:       4,
  },
  analyseBtnText: {
    color:      Colors.white,
    fontSize:   Typography.fontSizeMD,
    fontWeight: Typography.fontWeightSemibold,
  },
  retakeBtn: {
    borderRadius:    Radius.md,
    paddingVertical: Spacing.sm + 4,
    alignItems:      'center',
  },
  retakeBtnText: {
    color:    'rgba(255,255,255,0.7)',
    fontSize: Typography.fontSizeMD,
  },

  // ── analyzing ──
  analysingOverlay: {
    backgroundColor: 'rgba(5,20,15,0.7)',
  },
  analysingCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems:     'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position:     'absolute',
    width:        140,
    height:       140,
    borderRadius: 70,
    borderWidth:  2.5,
    borderColor:  'rgba(29,158,117,0.35)',
  },
  analysingCard: {
    width:               220,
    backgroundColor:     'rgba(10,30,22,0.9)',
    borderRadius:        Radius.xl,
    padding:             Spacing.lg,
    alignItems:          'center',
    borderWidth:         1,
    borderColor:         'rgba(29,158,117,0.3)',
  },
  analysingIcon: {
    fontSize:     40,
    marginBottom: Spacing.sm,
  },
  analysingText: {
    color:      '#fff',
    fontSize:   Typography.fontSizeMD,
    fontWeight: Typography.fontWeightSemibold,
    textAlign:  'center',
    lineHeight: 22,
  },
  dotsRow: {
    flexDirection: 'row',
    gap:           8,
    marginTop:     Spacing.md,
  },
  dot: {
    width:           8,
    height:          8,
    borderRadius:    4,
    backgroundColor: Colors.primary,
  },
  analysingFootnote: {
    color:     'rgba(255,255,255,0.4)',
    fontSize:  Typography.fontSizeXS,
    marginTop: Spacing.lg,
  },

  // ── saving ──
  savingContainer: {
    backgroundColor: Colors.background,
    alignItems:      'center',
    justifyContent:  'center',
  },
  savingIcon:    { fontSize: 52, marginBottom: Spacing.md },
  savingText: {
    fontSize:   Typography.fontSizeXXL,
    fontWeight: Typography.fontWeightBold,
    color:      Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  savingSubtext: { fontSize: Typography.fontSizeSM, color: Colors.textSecondary },

  // ── review ──
  reviewHeader: {
    flexDirection:    'row',
    alignItems:       'center',
    paddingHorizontal: Spacing.md,
    paddingVertical:   Spacing.sm,
    backgroundColor:   Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap:               Spacing.sm,
  },
  reviewBack: {
    fontSize:  Typography.fontSizeSM,
    color:     Colors.primary,
    fontWeight: Typography.fontWeightMedium,
    minWidth:  60,
  },
  reviewHeaderCenter: { flex: 1 },
  reviewTitle: {
    fontSize:   Typography.fontSizeLG,
    fontWeight: Typography.fontWeightBold,
    color:      Colors.textPrimary,
  },
  reviewSub: { fontSize: Typography.fontSizeXS, color: Colors.textSecondary },
  reviewScroll: {
    padding:           Spacing.md,
    backgroundColor:   Colors.background,
    gap:               Spacing.sm,
  },
  reviewThumb: {
    width:        '100%',
    height:       120,
    borderRadius: Radius.md,
    marginBottom: Spacing.xs,
  },

  // ── medicine card ──
  medCard: {
    backgroundColor: Colors.white,
    borderRadius:    Radius.md,
    padding:         Spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: Colors.primary,
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 1 },
    shadowOpacity:   0.06,
    shadowRadius:    4,
    elevation:       1,
  },
  medCardHeader: {
    flexDirection:  'row',
    alignItems:     'center',
    marginBottom:   Spacing.md,
    gap:            Spacing.sm,
  },
  medIndex: {
    width:           28,
    height:          28,
    borderRadius:    14,
    alignItems:      'center',
    justifyContent:  'center',
    flexShrink:      0,
  },
  medIndexText: {
    color:      Colors.white,
    fontSize:   Typography.fontSizeSM,
    fontWeight: Typography.fontWeightBold,
  },
  medCardTitle: {
    flex:       1,
    fontSize:   Typography.fontSizeMD,
    fontWeight: Typography.fontWeightSemibold,
    color:      Colors.textPrimary,
  },
  deleteBtn: {
    width:           28,
    height:          28,
    borderRadius:    14,
    backgroundColor: '#FFE8E8',
    alignItems:      'center',
    justifyContent:  'center',
  },
  deleteBtnText: { fontSize: 12, color: Colors.error },

  fieldRow: { marginBottom: Spacing.sm },
  fieldLabel: {
    fontSize:     Typography.fontSizeXS,
    fontWeight:   Typography.fontWeightSemibold,
    color:        Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom:  4,
  },
  fieldInput: {
    backgroundColor: Colors.background,
    borderRadius:    Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical:   Spacing.xs + 2,
    fontSize:         Typography.fontSizeMD,
    color:            Colors.textPrimary,
    borderWidth:      1.5,
    borderColor:      Colors.border,
  },
  chipRow: {
    flexDirection: 'row',
    gap:           Spacing.xs,
    flexWrap:      'wrap',
  },
  chip: {
    paddingHorizontal: Spacing.sm,
    paddingVertical:   Spacing.xs,
    borderRadius:      Radius.full,
    backgroundColor:   Colors.background,
    borderWidth:       1.5,
    borderColor:       Colors.border,
  },
  chipText: {
    fontSize:   Typography.fontSizeSM,
    color:      Colors.textSecondary,
    fontWeight: Typography.fontWeightMedium,
  },
  chipTextActive: {
    color:      Colors.white,
    fontWeight: Typography.fontWeightSemibold,
  },

  // ── add more ──
  addMoreCard: {
    flexDirection:  'row',
    alignItems:     'center',
    backgroundColor: Colors.white,
    borderRadius:   Radius.md,
    padding:        Spacing.md,
    borderWidth:    1.5,
    borderColor:    Colors.border,
    borderStyle:    'dashed',
    gap:            Spacing.sm,
  },
  addMoreCircle: {
    width:           40,
    height:          40,
    borderRadius:    20,
    backgroundColor: Colors.primaryLight,
    alignItems:      'center',
    justifyContent:  'center',
  },
  addMorePlus: { fontSize: 22, color: Colors.primary, lineHeight: 26 },
  addMoreText: {
    fontSize:   Typography.fontSizeMD,
    color:      Colors.primary,
    fontWeight: Typography.fontWeightMedium,
  },

  // ── save ──
  saveBtn: {
    backgroundColor: Colors.primary,
    borderRadius:    Radius.md,
    paddingVertical: Spacing.md,
    alignItems:      'center',
    marginTop:       Spacing.sm,
    shadowColor:     Colors.primary,
    shadowOffset:    { width: 0, height: 4 },
    shadowOpacity:   0.3,
    shadowRadius:    8,
    elevation:       4,
  },
  saveBtnText: {
    color:      Colors.white,
    fontSize:   Typography.fontSizeMD,
    fontWeight: Typography.fontWeightSemibold,
    letterSpacing: 0.3,
  },
});
