import React, { useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Radius, Spacing, Typography } from '../constants/theme';

const { width: SCREEN_W } = Dimensions.get('window');

// ─── slide data ───────────────────────────────────────────────

type Slide = {
  key:   string;
  emoji: string;
  title: string;
  body:  string;
  bg:    string;
};

const SLIDES: Slide[] = [
  {
    key:   '1',
    emoji: '💊',
    title: 'Your Medicine,\nManaged',
    body:  'Track every dose for every medicine in one place. Set it once — MediMind handles the rest.',
    bg:    '#1D9E75',
  },
  {
    key:   '2',
    emoji: '🔔',
    title: 'Never Miss\na Reminder',
    body:  'Smart daily notifications tell you exactly when to take each medicine — before, with, or after meals.',
    bg:    '#157A5A',
  },
  {
    key:   '3',
    emoji: '👥',
    title: 'Your Care Team,\nAlways Informed',
    body:  'Add family or doctors as caregivers. They get a WhatsApp alert if a dose is missed for 2+ hours.',
    bg:    '#0D6B4D',
  },
];

// ─── props ───────────────────────────────────────────────────

type Props = { onComplete: () => void };

// ─── component ───────────────────────────────────────────────

export default function OnboardingScreen({ onComplete }: Props) {
  const [index, setIndex] = useState(0);
  const listRef           = useRef<FlatList<Slide>>(null);

  const isLast    = index === SLIDES.length - 1;
  const slide     = SLIDES[index];
  const nextLabel = isLast ? '🎉  Get Started' : 'Next  →';

  function handleScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const i = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
    setIndex(i);
  }

  async function handleNext() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isLast) {
      onComplete();
    } else {
      listRef.current?.scrollToIndex({ index: index + 1, animated: true });
    }
  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

      {/* ── Slides ── */}
      <FlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={(s) => s.key}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        renderItem={({ item }) => (
          <View style={[styles.slide, { backgroundColor: item.bg, width: SCREEN_W }]}>
            {/* Decorative rings */}
            <View style={styles.ring1} />
            <View style={styles.ring2} />

            <SafeAreaView style={styles.slideSafe} edges={['top']}>
              <View style={styles.content}>
                <View style={styles.emojiBox}>
                  <Text style={styles.emoji}>{item.emoji}</Text>
                </View>
                <Text style={styles.title}>{item.title}</Text>
                <Text style={styles.body}>{item.body}</Text>
              </View>
            </SafeAreaView>
          </View>
        )}
      />

      {/* ── Skip — absolute, always above slides ── */}
      {!isLast && (
        <SafeAreaView style={styles.skipWrapper} edges={['top']} pointerEvents="box-none">
          <TouchableOpacity style={styles.skipBtn} onPress={onComplete}>
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        </SafeAreaView>
      )}

      {/* ── Bottom nav — stays fixed, color follows current slide ── */}
      <SafeAreaView
        style={[styles.nav, { backgroundColor: slide.bg }]}
        edges={['bottom']}
      >
        {/* Progress dots */}
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                {
                  width:           i === index ? 24 : 8,
                  backgroundColor: i === index ? '#fff' : 'rgba(255,255,255,0.38)',
                },
              ]}
            />
          ))}
        </View>

        {/* Next / Get Started */}
        <TouchableOpacity
          style={[
            styles.nextBtn,
            {
              backgroundColor: isLast ? '#fff' : 'rgba(255,255,255,0.18)',
              borderWidth:     isLast ? 0 : 1.5,
              borderColor:     'rgba(255,255,255,0.35)',
            },
          ]}
          onPress={handleNext}
          activeOpacity={0.82}
        >
          <Text
            style={[
              styles.nextBtnText,
              { color: isLast ? slide.bg : '#fff' },
            ]}
          >
            {nextLabel}
          </Text>
        </TouchableOpacity>
      </SafeAreaView>
    </View>
  );
}

// ─── styles ──────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },

  slide:     { flex: 1 },
  slideSafe: { flex: 1 },

  // Decorative background rings
  ring1: {
    position:     'absolute',
    top:          -100,
    right:        -100,
    width:        320,
    height:       320,
    borderRadius: 160,
    borderWidth:  44,
    borderColor:  'rgba(255,255,255,0.07)',
  },
  ring2: {
    position:     'absolute',
    bottom:       40,
    left:         -70,
    width:        220,
    height:       220,
    borderRadius: 110,
    borderWidth:  32,
    borderColor:  'rgba(255,255,255,0.06)',
  },

  // Slide content
  content: {
    flex:              1,
    alignItems:        'center',
    justifyContent:    'center',
    paddingHorizontal: Spacing.xl,
    paddingBottom:     100,
  },
  emojiBox: {
    width:           112,
    height:          112,
    borderRadius:    Radius.xl,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems:      'center',
    justifyContent:  'center',
    marginBottom:    Spacing.xl + 4,
  },
  emoji: { fontSize: 56 },
  title: {
    fontSize:     34,
    fontWeight:   '800',
    color:        '#fff',
    textAlign:    'center',
    lineHeight:   42,
    marginBottom: Spacing.md,
    letterSpacing: -0.5,
  },
  body: {
    fontSize:   Typography.fontSizeMD,
    color:      'rgba(255,255,255,0.80)',
    textAlign:  'center',
    lineHeight: 25,
    maxWidth:   300,
  },

  // Skip button (absolute over the slide area)
  skipWrapper: {
    position: 'absolute',
    top:      0,
    right:    0,
    left:     0,
  },
  skipBtn: {
    alignSelf:   'flex-end',
    paddingTop:  Spacing.md,
    paddingRight: Spacing.md,
    paddingLeft:  Spacing.md,
    paddingBottom: Spacing.sm,
  },
  skipText: {
    color:      'rgba(255,255,255,0.70)',
    fontSize:   Typography.fontSizeMD,
    fontWeight: '500',
  },

  // Bottom nav
  nav: {
    paddingHorizontal: Spacing.md,
    paddingTop:        Spacing.md,
    paddingBottom:     Spacing.xs,
    gap:               Spacing.md,
  },
  dots: {
    flexDirection:  'row',
    justifyContent: 'center',
    alignItems:     'center',
    gap:            6,
  },
  dot: {
    height:       8,
    borderRadius: 4,
  },
  nextBtn: {
    borderRadius:    Radius.md,
    paddingVertical: Spacing.md,
    alignItems:      'center',
  },
  nextBtnText: {
    fontSize:   Typography.fontSizeLG,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
