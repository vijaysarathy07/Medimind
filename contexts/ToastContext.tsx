import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Radius, Spacing, Typography } from '../constants/theme';

// ─── types ───────────────────────────────────────────────────

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export type ToastConfig = {
  type?:     ToastType;
  message:   string;
  duration?: number;
};

type ToastCtxValue = {
  showToast: (config: ToastConfig) => void;
};

// ─── context ─────────────────────────────────────────────────

const ToastContext = createContext<ToastCtxValue>({ showToast: () => {} });

export function useToast(): ToastCtxValue {
  return useContext(ToastContext);
}

// ─── style config ────────────────────────────────────────────

const META: Record<ToastType, { icon: string; color: string; bg: string }> = {
  success: { icon: '✓',  color: Colors.primary,  bg: Colors.primaryLight },
  error:   { icon: '✗',  color: Colors.error,    bg: '#FFF5F5' },
  warning: { icon: '⚠',  color: Colors.warning,  bg: '#FFF8F0' },
  info:    { icon: 'ℹ',  color: '#2196F3',       bg: '#E8F0FF' },
};

// ─── toast banner ────────────────────────────────────────────

type BannerProps = {
  type:    ToastType;
  message: string;
  topOffset: number;
};

function ToastBanner({ type, message, topOffset }: BannerProps) {
  const slideY  = useRef(new Animated.Value(-100)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const meta    = META[type];

  useEffect(() => {
    Animated.parallel([
      Animated.spring(slideY, { toValue: 0, tension: 90, friction: 10, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.banner,
        {
          top:             topOffset + Spacing.sm,
          borderLeftColor: meta.color,
          backgroundColor: meta.bg,
          transform:       [{ translateY: slideY }],
          opacity,
        },
      ]}
    >
      <View style={[styles.iconCircle, { backgroundColor: meta.color }]}>
        <Text style={styles.iconText}>{meta.icon}</Text>
      </View>
      <Text style={[styles.message, { color: meta.color }]} numberOfLines={3}>
        {message}
      </Text>
    </Animated.View>
  );
}

// ─── provider ────────────────────────────────────────────────

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const insets  = useSafeAreaInsets();
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const [current, setCurrent] = useState<{
    type: ToastType;
    message: string;
    key: number;
  } | null>(null);

  const showToast = useCallback(
    ({ type = 'info', message, duration = 3200 }: ToastConfig) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      setCurrent({ type, message, key: Date.now() });
      timerRef.current = setTimeout(() => setCurrent(null), duration);
    },
    []
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      <View style={{ flex: 1 }}>
        {children}
        {/* Absolute overlay — box-none so touches pass through */}
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          {current && (
            <ToastBanner
              key={current.key}
              type={current.type}
              message={current.message}
              topOffset={insets.top}
            />
          )}
        </View>
      </View>
    </ToastContext.Provider>
  );
}

// ─── styles ──────────────────────────────────────────────────

const styles = StyleSheet.create({
  banner: {
    position:        'absolute',
    left:            Spacing.md,
    right:           Spacing.md,
    flexDirection:   'row',
    alignItems:      'center',
    padding:         Spacing.md,
    gap:             Spacing.sm,
    borderRadius:    Radius.md,
    borderLeftWidth: 4,
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 4 },
    shadowOpacity:   0.12,
    shadowRadius:    10,
    elevation:       10,
  },
  iconCircle: {
    width:           28,
    height:          28,
    borderRadius:    14,
    alignItems:      'center',
    justifyContent:  'center',
    flexShrink:      0,
  },
  iconText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  message: {
    flex:       1,
    fontSize:   Typography.fontSizeSM,
    fontWeight: '600',
    lineHeight: 20,
  },
});
