import React, { useCallback, useLayoutEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  ActivityIndicator,
  useWindowDimensions,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

const C = {
  bg: '#F2F0EB',
  text: '#1a1a18',
  muted: '#888780',
  border: 'rgba(0,0,0,0.06)',
  divider: '#F5F3EE',
  purple: '#534AB7',
  purpleTint: '#EEEDFE',
  handle: '#D3D1C7',
};

export type RestartSplitConfirmSheetProps = {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  subscriptionName: string;
  firstNewBillLabel: string;
  splitUnchangedLine: string;
  membersNotifiedCount: number;
  confirming: boolean;
};

function slideDistance(windowH: number): number {
  return Math.min(windowH * 0.5, 440);
}

export function RestartSplitConfirmSheet({
  visible,
  onClose,
  onConfirm,
  subscriptionName,
  firstNewBillLabel,
  splitUnchangedLine,
  membersNotifiedCount,
  confirming,
}: RestartSplitConfirmSheetProps) {
  const insets = useSafeAreaInsets();
  const { height: windowH } = useWindowDimensions();
  const maxSheetH = Math.min(windowH * 0.92, 680);

  const translateY = useRef(new Animated.Value(slideDistance(windowH))).current;
  const backdropOp = useRef(new Animated.Value(0)).current;

  const dismiss = useCallback(() => {
    if (confirming) return;
    const dist = slideDistance(windowH);
    Animated.parallel([
      Animated.timing(backdropOp, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: dist, duration: 240, useNativeDriver: true }),
    ]).start(() => onClose());
  }, [confirming, onClose, backdropOp, translateY, windowH]);

  useLayoutEffect(() => {
    if (!visible) {
      translateY.setValue(slideDistance(windowH));
      backdropOp.setValue(0);
      return;
    }
    const dist = slideDistance(windowH);
    translateY.setValue(dist);
    backdropOp.setValue(0);
    Animated.parallel([
      Animated.timing(backdropOp, { toValue: 1, duration: 240, useNativeDriver: true }),
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        damping: 24,
        stiffness: 220,
        mass: 0.85,
      }),
    ]).start();
  }, [visible, windowH, translateY, backdropOp]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={confirming ? undefined : dismiss}>
      <View style={styles.root}>
        <Animated.View style={[styles.backdropWrap, { opacity: backdropOp }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} accessibilityLabel="Dismiss" />
        </Animated.View>

        <Animated.View
          style={[
            styles.sheet,
            {
              paddingBottom: Math.max(insets.bottom, 16),
              maxHeight: maxSheetH,
              transform: [{ translateY }],
            },
          ]}
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            bounces={false}
          >
            <View style={styles.handle} />
            <View style={styles.iconWrap}>
              <Ionicons name="refresh" size={30} color={C.purple} />
            </View>
            <Text style={styles.title}>Restart this split?</Text>
            <Text style={styles.sub}>
              Billing picks back up next cycle. All your settings and members are exactly as you left them.
            </Text>

            <View style={styles.infoCard}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLbl}>Subscription</Text>
                <Text style={styles.infoVal} numberOfLines={2}>
                  {subscriptionName}
                </Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLbl}>First new bill</Text>
                <Text style={[styles.infoVal, styles.infoValPurple]}>{firstNewBillLabel}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLbl}>Split</Text>
                <Text style={styles.infoVal} numberOfLines={2}>
                  {splitUnchangedLine}
                </Text>
              </View>
              <View style={[styles.infoRow, styles.infoRowLast]}>
                <Text style={styles.infoLbl}>Members notified</Text>
                <Text style={styles.infoVal}>
                  {membersNotifiedCount} member{membersNotifiedCount === 1 ? '' : 's'}
                </Text>
              </View>
            </View>

            <Pressable
              onPress={() => void onConfirm()}
              disabled={confirming}
              style={({ pressed }) => [
                styles.btnPrimary,
                (pressed || confirming) && styles.btnPressed,
                confirming && styles.btnDisabled,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Restart split"
            >
              {confirming ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnPrimaryTxt}>Restart split</Text>
              )}
            </Pressable>
            <Pressable
              onPress={dismiss}
              disabled={confirming}
              style={({ pressed }) => [
                styles.btnCancel,
                pressed && !confirming && styles.btnCancelPressed,
                confirming && styles.btnDisabled,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text style={styles.btnCancelTxt}>Cancel</Text>
            </Pressable>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdropWrap: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    backgroundColor: C.bg,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  handle: {
    width: 36,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: C.handle,
    alignSelf: 'center',
    marginBottom: 14,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: C.purpleTint,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: C.text,
    textAlign: 'center',
    letterSpacing: -0.4,
    marginBottom: 10,
  },
  sub: {
    fontSize: 15,
    color: C.muted,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 18,
    paddingHorizontal: 4,
  },
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 13,
    borderWidth: 0.5,
    borderColor: C.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 14,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: C.divider,
    gap: 14,
  },
  infoRowLast: {
    borderBottomWidth: 0,
  },
  infoLbl: {
    fontSize: 14,
    color: C.muted,
    flexShrink: 0,
  },
  infoVal: {
    fontSize: 14,
    fontWeight: '500',
    color: C.text,
    flex: 1,
    textAlign: 'right',
  },
  infoValPurple: {
    color: C.purple,
    fontWeight: '600',
  },
  btnPrimary: {
    backgroundColor: C.purple,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  btnPrimaryTxt: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  btnCancel: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: '#D3D1C7',
  },
  btnCancelTxt: {
    fontSize: 15,
    fontWeight: '500',
    color: C.text,
  },
  btnPressed: {
    opacity: 0.88,
  },
  btnCancelPressed: {
    opacity: 0.75,
  },
  btnDisabled: {
    opacity: 0.65,
  },
});
