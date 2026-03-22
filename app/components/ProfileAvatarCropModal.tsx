import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, runOnJS } from 'react-native-reanimated';
import Svg, { Circle, Defs, Mask, Rect } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { exportAvatarSquareJpeg } from '../../lib/avatarCropExport';

type Props = {
  visible: boolean;
  imageUri: string | null;
  onClose: () => void;
  onConfirm: (processedUri: string) => void | Promise<void>;
};

function clamp(n: number, lo: number, hi: number) {
  'worklet';
  return Math.min(hi, Math.max(lo, n));
}

export function ProfileAvatarCropModal({ visible, imageUri, onClose, onConfirm }: Props) {
  const insets = useSafeAreaInsets();
  const [layout, setLayout] = useState({ w: 0, h: 0 });
  const [iw, setIw] = useState(0);
  const [ih, setIh] = useState(0);
  const [loadErr, setLoadErr] = useState(false);
  const [busy, setBusy] = useState(false);

  const V = useMemo(() => {
    if (layout.w <= 0 || layout.h <= 0) return 280;
    return Math.max(120, Math.min(layout.w - 32, layout.h - 32, 320));
  }, [layout.w, layout.h]);

  const latestRef = useRef({ s: 1, tx: 0, ty: 0 });

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  const savedScale = useSharedValue(1);
  const baseWv = useSharedValue(0);
  const baseHv = useSharedValue(0);
  const Vv = useSharedValue(280);

  const syncLatestJS = useCallback((s: number, tx: number, ty: number) => {
    latestRef.current = { s, tx, ty };
  }, []);

  useEffect(() => {
    Vv.value = V;
  }, [V, Vv]);

  useEffect(() => {
    if (!visible || !imageUri) return;
    setLoadErr(false);
    setIw(0);
    setIh(0);
    translateX.value = 0;
    translateY.value = 0;
    scale.value = 1;
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
    savedScale.value = 1;
    baseWv.value = 0;
    baseHv.value = 0;
    latestRef.current = { s: 1, tx: 0, ty: 0 };
    Image.getSize(
      imageUri,
      (w, h) => {
        if (w > 0 && h > 0) {
          setIw(w);
          setIh(h);
        } else setLoadErr(true);
      },
      () => setLoadErr(true)
    );
  }, [visible, imageUri, translateX, translateY, scale, savedTranslateX, savedTranslateY, savedScale, baseWv, baseHv]);

  const baseW = iw > 0 && V > 0 ? iw * Math.max(V / iw, V / ih) : 0;
  const baseH = ih > 0 && V > 0 ? ih * Math.max(V / iw, V / ih) : 0;

  useEffect(() => {
    if (baseW > 0 && baseH > 0) {
      baseWv.value = baseW;
      baseHv.value = baseH;
    }
  }, [baseW, baseH, baseWv, baseHv]);

  useEffect(() => {
    if (!visible || layout.w <= 0 || iw <= 0 || ih <= 0) return;
    translateX.value = 0;
    translateY.value = 0;
    scale.value = 1;
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
    savedScale.value = 1;
    latestRef.current = { s: 1, tx: 0, ty: 0 };
  }, [visible, layout.w, layout.h, iw, ih, translateX, translateY, scale, savedTranslateX, savedTranslateY, savedScale]);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .onUpdate((e) => {
          const bw = baseWv.value;
          const bh = baseHv.value;
          const v = Vv.value;
          if (bw <= 0 || bh <= 0 || v <= 0) return;
          translateX.value = savedTranslateX.value + e.translationX;
          translateY.value = savedTranslateY.value + e.translationY;
          const s = scale.value;
          const w = bw * s;
          const h = bh * s;
          const minTx = v / 2 - w / 2;
          const maxTx = w / 2 - v / 2;
          const minTy = v / 2 - h / 2;
          const maxTy = h / 2 - v / 2;
          translateX.value = clamp(translateX.value, minTx, maxTx);
          translateY.value = clamp(translateY.value, minTy, maxTy);
        })
        .onEnd(() => {
          savedTranslateX.value = translateX.value;
          savedTranslateY.value = translateY.value;
          runOnJS(syncLatestJS)(scale.value, translateX.value, translateY.value);
        }),
    [
      translateX,
      translateY,
      savedTranslateX,
      savedTranslateY,
      scale,
      baseWv,
      baseHv,
      Vv,
      syncLatestJS,
    ]
  );

  const pinchGesture = useMemo(
    () =>
      Gesture.Pinch()
        .onUpdate((e) => {
          const bw = baseWv.value;
          const bh = baseHv.value;
          const v = Vv.value;
          if (bw <= 0 || bh <= 0 || v <= 0) return;
          const next = clamp(savedScale.value * e.scale, 1, 4);
          scale.value = next;
          const w = bw * next;
          const h = bh * next;
          const minTx = v / 2 - w / 2;
          const maxTx = w / 2 - v / 2;
          const minTy = v / 2 - h / 2;
          const maxTy = h / 2 - v / 2;
          translateX.value = clamp(translateX.value, minTx, maxTx);
          translateY.value = clamp(translateY.value, minTy, maxTy);
        })
        .onEnd(() => {
          savedScale.value = scale.value;
          const bw = baseWv.value;
          const bh = baseHv.value;
          const v = Vv.value;
          const s = scale.value;
          const w = bw * s;
          const h = bh * s;
          const minTx = v / 2 - w / 2;
          const maxTx = w / 2 - v / 2;
          const minTy = v / 2 - h / 2;
          const maxTy = h / 2 - v / 2;
          translateX.value = clamp(translateX.value, minTx, maxTx);
          translateY.value = clamp(translateY.value, minTy, maxTy);
          savedTranslateX.value = translateX.value;
          savedTranslateY.value = translateY.value;
          runOnJS(syncLatestJS)(scale.value, translateX.value, translateY.value);
        }),
    [scale, savedScale, translateX, translateY, savedTranslateX, savedTranslateY, baseWv, baseHv, Vv, syncLatestJS]
  );

  const composed = useMemo(() => Gesture.Simultaneous(panGesture, pinchGesture), [panGesture, pinchGesture]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }, { scale: scale.value }],
  }));

  const onUsePhoto = async () => {
    if (!imageUri || iw <= 0 || ih <= 0 || V <= 0) return;
    const { s, tx, ty } = latestRef.current;
    setBusy(true);
    try {
      const out = await exportAvatarSquareJpeg(imageUri, iw, ih, V, s, tx, ty);
      await onConfirm(out);
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not process photo.';
      Alert.alert('Photo', msg);
    } finally {
      setBusy(false);
    }
  };

  const cx = layout.w > 0 ? layout.w / 2 : 0;
  const cy = layout.h > 0 ? layout.h / 2 : 0;
  const r = V / 2;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <GestureHandlerRootView style={styles.flex}>
        <View style={[styles.flex, { backgroundColor: '#000' }]}>
          <View style={[styles.topBar, { paddingTop: Math.max(insets.top, 12) }]}>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Cancel crop">
              <Text style={styles.topCancel}>Cancel</Text>
            </Pressable>
            <Text style={styles.topTitle}>Move and Scale</Text>
            <View style={{ width: 52 }} />
          </View>

          <View
            style={styles.flex}
            onLayout={(e) => {
              const { width, height } = e.nativeEvent.layout;
              setLayout({ w: width, h: height });
            }}
          >
            {!imageUri || loadErr ? (
              <View style={styles.centerMsg}>
                <Text style={styles.errTxt}>{loadErr ? 'Could not load image.' : ''}</Text>
              </View>
            ) : iw <= 0 || layout.w <= 0 ? (
              <View style={styles.centerMsg}>
                <ActivityIndicator color="#fff" />
              </View>
            ) : (
              <GestureDetector gesture={composed}>
                <View style={styles.flex}>
                  <View style={styles.stage}>
                    <Animated.View
                      style={[
                        {
                          width: baseW,
                          height: baseH,
                          alignSelf: 'center',
                        },
                        animatedStyle,
                      ]}
                    >
                      <Image
                        source={{ uri: imageUri }}
                        style={{ width: baseW, height: baseH }}
                        resizeMode="cover"
                      />
                    </Animated.View>
                  </View>
                </View>
              </GestureDetector>
            )}

            {layout.w > 0 && layout.h > 0 ? (
              <Svg
                width={layout.w}
                height={layout.h}
                style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}
              >
                <Defs>
                  <Mask id="cropHole">
                    <Rect width={layout.w} height={layout.h} fill="white" />
                    <Circle cx={cx} cy={cy} r={r} fill="black" />
                  </Mask>
                </Defs>
                <Rect width={layout.w} height={layout.h} fill="rgba(0,0,0,0.55)" mask="url(#cropHole)" />
                <Circle cx={cx} cy={cy} r={r} stroke="rgba(255,255,255,0.9)" strokeWidth={2} fill="none" />
              </Svg>
            ) : null}
          </View>

          <Text style={styles.hint}>Pinch to zoom · drag to reposition</Text>

          <View style={[styles.bottomActions, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <Pressable
              style={styles.ghostBtn}
              onPress={onClose}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text style={styles.ghostBtnTxt}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.primaryBtn, busy && styles.primaryBtnDisabled]}
              onPress={() => void onUsePhoto()}
              disabled={busy || !imageUri || iw <= 0}
              accessibilityRole="button"
              accessibilityLabel="Use photo"
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnTxt}>Use Photo</Text>
              )}
            </Pressable>
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: '#000',
  },
  topCancel: { fontSize: 16, color: 'rgba(255,255,255,0.72)' },
  topTitle: { fontSize: 16, fontWeight: '600', color: '#fff' },
  stage: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'visible',
  },
  centerMsg: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errTxt: { color: 'rgba(255,255,255,0.6)', fontSize: 14 },
  hint: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    paddingVertical: 10,
    backgroundColor: '#000',
  },
  bottomActions: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 8,
    backgroundColor: '#000',
  },
  ghostBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
  },
  ghostBtnTxt: { fontSize: 15, fontWeight: '600', color: 'rgba(255,255,255,0.85)' },
  primaryBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#534AB7',
    alignItems: 'center',
  },
  primaryBtnDisabled: { opacity: 0.6 },
  primaryBtnTxt: { fontSize: 15, fontWeight: '600', color: '#fff' },
});
