import React, { useEffect, useRef } from 'react';
import { Animated, Modal, StyleSheet, Text, View } from 'react-native';
import { Colors, Radius, Spacing, Typography } from '../constants/theme';

type Props = {
  visible: boolean;
  onDone: () => void;
};

export default function SuccessOverlay({ visible, onDone }: Props) {
  const backdropOpacity  = useRef(new Animated.Value(0)).current;
  const cardScale        = useRef(new Animated.Value(0.6)).current;
  const cardOpacity      = useRef(new Animated.Value(0)).current;
  const circleScale      = useRef(new Animated.Value(0)).current;
  const checkScale       = useRef(new Animated.Value(0)).current;
  const textOpacity      = useRef(new Animated.Value(0)).current;
  const pulseScale       = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!visible) return;

    // Reset
    backdropOpacity.setValue(0);
    cardScale.setValue(0.6);
    cardOpacity.setValue(0);
    circleScale.setValue(0);
    checkScale.setValue(0);
    textOpacity.setValue(0);
    pulseScale.setValue(1);

    Animated.sequence([
      // 1. Backdrop + card entry
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.spring(cardScale, {
          toValue: 1,
          tension: 70,
          friction: 7,
          useNativeDriver: true,
        }),
        Animated.timing(cardOpacity, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
      ]),
      // 2. Green circle bounces in
      Animated.spring(circleScale, {
        toValue: 1,
        tension: 120,
        friction: 6,
        useNativeDriver: true,
      }),
      // 3. Checkmark bounces in
      Animated.spring(checkScale, {
        toValue: 1,
        tension: 140,
        friction: 5,
        useNativeDriver: true,
      }),
      // 4. Text fades in
      Animated.timing(textOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      // Pulse ring outward, then dismiss
      Animated.timing(pulseScale, {
        toValue: 1.35,
        duration: 500,
        useNativeDriver: true,
      }).start();

      const dismissTimer = setTimeout(() => {
        Animated.parallel([
          Animated.timing(cardOpacity, {
            toValue: 0,
            duration: 260,
            useNativeDriver: true,
          }),
          Animated.timing(backdropOpacity, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
        ]).start(() => onDone());
      }, 1600);

      return () => clearTimeout(dismissTimer);
    });
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!visible) return null;

  return (
    <Modal transparent animationType="none" visible={visible} statusBarTranslucent>
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
        <Animated.View
          style={[
            styles.card,
            { opacity: cardOpacity, transform: [{ scale: cardScale }] },
          ]}
        >
          {/* Pulse ring */}
          <Animated.View
            style={[
              styles.pulseRing,
              { transform: [{ scale: pulseScale }], opacity: backdropOpacity },
            ]}
          />

          {/* Circle with checkmark */}
          <Animated.View
            style={[styles.circle, { transform: [{ scale: circleScale }] }]}
          >
            <Animated.Text
              style={[styles.checkmark, { transform: [{ scale: checkScale }] }]}
            >
              ✓
            </Animated.Text>
          </Animated.View>

          <Animated.Text style={[styles.title, { opacity: textOpacity }]}>
            Medicine Added!
          </Animated.Text>
          <Animated.Text style={[styles.subtitle, { opacity: textOpacity }]}>
            Daily reminders have been scheduled
          </Animated.Text>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(10, 30, 22, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: 280,
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.xl,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 20,
  },
  pulseRing: {
    position: 'absolute',
    top: Spacing.xl - 4,
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 2.5,
    borderColor: Colors.primaryLight,
  },
  circle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  checkmark: {
    fontSize: 38,
    color: Colors.white,
    fontWeight: Typography.fontWeightBold,
    lineHeight: 44,
  },
  title: {
    fontSize: Typography.fontSizeXXL,
    fontWeight: Typography.fontWeightBold,
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontSize: Typography.fontSizeSM,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
});
