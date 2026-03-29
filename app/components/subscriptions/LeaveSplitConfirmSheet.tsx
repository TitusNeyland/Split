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
  red: '#E24B4A',
  greenDark: '#0F6E56',
  handle: '#D3D1C7',
  amberBg: '#FAEEDA',
  amberText: '#854F0B',
};

export type LeaveSplitConfirmSheetProps = {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  subscriptionName: string;
  yourShareMonthlyFormatted: string;
  currentCycleNote: string;
  ownerName: string;
  owedWarning: { amountFormatted: string } | null;
  confirming: boolean;
};

function slideDistance(windowH: number): number {
  return Math.min(windowH * 0.5, 440);
}

export function LeaveSplitConfirmSheet({
  visible,
  onClose,
  onConfirm,
  subscriptionName,
  yourShareMonthlyFormatted,
  currentCycleNote,
  ownerName,
  owedWarning,
  confirming,
}: LeaveSplitConfirmSheetProps) {
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
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={confirming ? undefined : dismiss}
    >
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
              <Ionicons name="log-out-outline" size={28} color={C.red} />
            </View>
            <Text style={styles.title}>Leave this split?</Text>
            <Text style={styles.sub}>
              {`You'll be removed from ${subscriptionName}. You won't be charged for future cycles.`}
            </Text>

            <View style={styles.infoCard}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLbl}>Subscription</Text>
                <Text style={styles.infoVal} numberOfLines={2}>
                  {subscriptionName}
                </Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLbl}>Your share</Text>
                <Text style={styles.infoValRemoved}>
                  {yourShareMonthlyFormatted}
                  /month{' '}
                  <Text style={styles.removedTag}>(removed)</Text>
                </Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLbl}>Current cycle</Text>
                <Text style={[styles.infoVal, styles.infoValRight]} numberOfLines={3}>
                  {currentCycleNote}
                </Text>
              </View>
              <View style={[styles.infoRow, styles.infoRowLast]}>
                <Text style={styles.infoLbl}>Owner notified</Text>
                <Text style={styles.infoVal} numberOfLines={2}>
                  {ownerName}
                </Text>
              </View>
            </View>

            {owedWarning ? (
              <View style={styles.warnBanner}>
                <Ionicons name="alert-circle-outline" size={20} color={C.amberText} style={styles.warnIco} />
                <Text style={styles.warnTxt}>
                  You still owe {owedWarning.amountFormatted} for this cycle. Settle up before leaving.
                </Text>
              </View>
            ) : null}

            <Pressable
              onPress={() => void onConfirm()}
              disabled={confirming}
              style={({ pressed }) => [
                styles.btnPrimary,
                (pressed || confirming) && styles.btnPressed,
                confirming && styles.btnDisabled,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Leave split"
            >
              {confirming ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnPrimaryTxt}>Leave split</Text>
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
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FCEBEB',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(226, 75, 74, 0.25)',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: C.text,
    textAlign: 'center',
    letterSpacing: -0.45,
    marginBottom: 8,
  },
  sub: {
    fontSize: 16,
    color: C.muted,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 18,
    paddingHorizontal: 6,
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
    alignItems: 'flex-start',
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: C.divider,
    gap: 14,
  },
  infoRowLast: {
    borderBottomWidth: 0,
  },
  infoLbl: {
    fontSize: 15,
    color: C.muted,
    flexShrink: 0,
    maxWidth: '42%',
  },
  infoVal: {
    fontSize: 15,
    fontWeight: '500',
    color: C.text,
    flex: 1,
    textAlign: 'right',
  },
  infoValRight: {
    fontWeight: '400',
  },
  infoValRemoved: {
    fontSize: 15,
    fontWeight: '500',
    color: C.muted,
    flex: 1,
    textAlign: 'right',
  },
  removedTag: {
    fontSize: 13,
    fontWeight: '500',
    color: C.muted,
  },
  warnBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: C.amberBg,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  warnIco: {
    marginTop: 2,
  },
  warnTxt: {
    flex: 1,
    fontSize: 14,
    color: C.amberText,
    lineHeight: 20,
  },
  btnPrimary: {
    backgroundColor: C.red,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 10,
  },
  btnPrimaryTxt: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
  },
  btnCancel: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: '#D3D1C7',
  },
  btnCancelTxt: {
    fontSize: 16,
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
