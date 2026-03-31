import React, { useCallback, useEffect, useRef, type ComponentProps } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

type IonName = ComponentProps<typeof Ionicons>['name'];

export type ToastType = 'success' | 'error' | 'info';

export type ToastProps = {
  message: string | null;
  onDismiss: () => void;
  /** Default 3000 */
  duration?: number;
  type?: ToastType;
  /** Added on top of safe-area bottom (when `bottom` is not set). Default 8. */
  bottomInsetExtra?: number;
  /** When set, positions the toast this many px from the bottom (e.g. above tab bar). Overrides safe-area + extra. */
  bottom?: number;
  showIcon?: boolean;
  /** Optional outer style (e.g. horizontal margins). */
  style?: StyleProp<ViewStyle>;
};

export function Toast({
  message,
  onDismiss,
  duration = 3000,
  type = 'info',
  bottomInsetExtra = 8,
  bottom: bottomProp,
  showIcon = true,
  style,
}: ToastProps) {
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(18)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  const dismissingRef = useRef(false);

  const dismiss = useCallback(() => {
    if (dismissingRef.current) return;
    dismissingRef.current = true;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 18, duration: 150, useNativeDriver: true }),
    ]).start(() => {
      dismissingRef.current = false;
      onDismissRef.current();
    });
  }, [opacity, translateY]);

  useEffect(() => {
    if (!message?.trim()) {
      opacity.setValue(0);
      translateY.setValue(18);
      return;
    }

    dismissingRef.current = false;
    opacity.setValue(0);
    translateY.setValue(18);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start();

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      dismiss();
    }, duration);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [message, duration, dismiss, opacity, translateY]);

  if (!message) {
    return null;
  }

  const bottom =
    bottomProp !== undefined ? bottomProp : Math.max(insets.bottom, 12) + bottomInsetExtra;

  const iconName =
    type === 'success'
      ? 'checkmark'
      : type === 'error'
        ? 'alert-circle-outline'
        : 'information-circle-outline';

  return (
    <Pressable
      onPress={dismiss}
      style={[styles.wrap, { bottom }, style]}
      accessibilityRole="alert"
      accessibilityLabel={message}
      accessibilityHint="Tap to dismiss"
    >
      <Animated.View
        style={[
          styles.box,
          type === 'success' && styles.boxSuccess,
          type === 'error' && styles.boxError,
          type === 'info' && styles.boxInfo,
          { opacity, transform: [{ translateY }] },
        ]}
      >
        <View style={styles.row}>
          {showIcon ? (
            <Ionicons name={iconName as IonName} size={16} color="#fff" style={styles.icon} />
          ) : null}
          <Text style={[styles.txt, showIcon ? styles.txtWithIcon : styles.txtCenter]}>{message}</Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 20,
    right: 20,
    zIndex: 100,
  },
  box: {
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  boxSuccess: {
    backgroundColor: '#1D9E75',
  },
  boxError: {
    backgroundColor: '#B91C1C',
  },
  boxInfo: {
    backgroundColor: 'rgba(26,26,24,0.92)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  icon: {
    flexShrink: 0,
  },
  txt: {
    fontSize: 14,
    fontWeight: '500',
    color: '#fff',
    lineHeight: 20,
  },
  txtCenter: {
    flex: 1,
    textAlign: 'center',
  },
  txtWithIcon: {
    flex: 1,
    textAlign: 'left',
  },
});
