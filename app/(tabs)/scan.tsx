import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Linking,
  Platform,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Defs, Line, Pattern, Rect } from 'react-native-svg';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { PermissionStatus } from 'expo-modules-core';

const C = {
  bg: '#F2F0EB',
  purple: '#534AB7',
  muted: '#888780',
  text: '#1a1a18',
  border: 'rgba(0,0,0,0.06)',
  heroStart: '#6B3FA0',
  heroMid: '#4A1570',
  heroEnd: '#2D0D45',
  viewfinderBg: '#111',
  lilacSurface: '#EEEDFE',
  mintSurface: '#E1F5EE',
  mintIcon: '#0F6E56',
};

const VIEWFINDER_HEIGHT = 230;
const CORNER_INSET = 16;
const CORNER_SIZE = 22;
const CORNER_STROKE = 2.5;

function ViewfinderGrid({ width, height, patternId }: { width: number; height: number; patternId: string }) {
  if (width <= 0 || height <= 0) return null;
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
      <Defs>
        <Pattern id={patternId} width={40} height={40} patternUnits="userSpaceOnUse">
          <Line x1={0} y1={0} x2={0} y2={40} stroke="rgba(255,255,255,0.02)" strokeWidth={1} />
          <Line x1={0} y1={0} x2={40} y2={0} stroke="rgba(255,255,255,0.02)" strokeWidth={1} />
        </Pattern>
      </Defs>
      <Rect width={width} height={height} fill={`url(#${patternId})`} />
    </Svg>
  );
}

function ScanCorners() {
  const corner = (pos: 'tl' | 'tr' | 'bl' | 'br') => {
    const base = {
      position: 'absolute' as const,
      width: CORNER_SIZE,
      height: CORNER_SIZE,
      borderColor: 'rgba(255,255,255,0.8)',
    };
    switch (pos) {
      case 'tl':
        return {
          ...base,
          top: CORNER_INSET,
          left: CORNER_INSET,
          borderTopWidth: CORNER_STROKE,
          borderLeftWidth: CORNER_STROKE,
          borderTopLeftRadius: 4,
        };
      case 'tr':
        return {
          ...base,
          top: CORNER_INSET,
          right: CORNER_INSET,
          borderTopWidth: CORNER_STROKE,
          borderRightWidth: CORNER_STROKE,
          borderTopRightRadius: 4,
        };
      case 'bl':
        return {
          ...base,
          bottom: CORNER_INSET,
          left: CORNER_INSET,
          borderBottomWidth: CORNER_STROKE,
          borderLeftWidth: CORNER_STROKE,
          borderBottomLeftRadius: 4,
        };
      case 'br':
        return {
          ...base,
          bottom: CORNER_INSET,
          right: CORNER_INSET,
          borderBottomWidth: CORNER_STROKE,
          borderRightWidth: CORNER_STROKE,
          borderBottomRightRadius: 4,
        };
    }
  };
  return (
    <>
      <View style={corner('tl')} pointerEvents="none" />
      <View style={corner('tr')} pointerEvents="none" />
      <View style={corner('bl')} pointerEvents="none" />
      <View style={corner('br')} pointerEvents="none" />
    </>
  );
}

function ScanLineOverlay({ height }: { height: number }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, [progress]);

  const animatedStyle = useAnimatedStyle(() => {
    const top = interpolate(progress.value, [0, 1], [height * 0.2, height * 0.8]);
    const opacity = interpolate(progress.value, [0, 0.5, 1], [0.4, 0.9, 0.4]);
    return { top, opacity };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: CORNER_INSET,
          right: CORNER_INSET,
          height: 2,
        },
        animatedStyle,
      ]}
    >
      <LinearGradient
        colors={['transparent', 'rgba(255,255,255,0.6)', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}

export default function ScanScreen() {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [torchOn, setTorchOn] = useState(false);
  const [vfSize, setVfSize] = useState({ w: 0, h: VIEWFINDER_HEIGHT });
  const [cameraReady, setCameraReady] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const reactId = useId();
  const patternId = useMemo(() => `scanGrid${reactId.replace(/[^a-zA-Z0-9]/g, '')}`, [reactId]);

  const isWeb = Platform.OS === 'web';
  const showCamera = Boolean(permission?.granted && !isWeb);

  const onTakePhoto = useCallback(async () => {
    if (Platform.OS === 'web') {
      Alert.alert('Not available', 'Taking photos from the camera is not supported on web.');
      return;
    }
    if (!permission?.granted) {
      await requestPermission();
      return;
    }
    if (!cameraRef.current || !cameraReady) return;
    try {
      await cameraRef.current.takePictureAsync({ quality: 0.85 });
    } catch {
      Alert.alert('Could not capture', 'Try again or check camera permissions in Settings.');
    }
  }, [permission?.granted, requestPermission, cameraReady]);

  const openSettings = useCallback(() => {
    Linking.openSettings();
  }, []);

  useEffect(() => {
    if (isWeb || !permission) return;
    if (permission.status === PermissionStatus.UNDETERMINED) {
      requestPermission();
    }
  }, [isWeb, permission?.status, requestPermission]);

  useEffect(() => {
    if (!showCamera) setCameraReady(false);
  }, [showCamera]);

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom, 12) }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <LinearGradient
          colors={[C.heroStart, C.heroMid, C.heroEnd]}
          locations={[0, 0.6, 1]}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={[styles.hero, { paddingTop: insets.top + 16 }]}
        >
          <View style={styles.heroRow}>
            <View style={styles.heroTitles}>
              <Text style={styles.heroTitle}>Scan receipt</Text>
              <Text style={styles.heroSub}>Point at any receipt to split instantly</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={torchOn ? 'Turn off torch' : 'Turn on torch'}
              onPress={() => setTorchOn((v) => !v)}
              style={({ pressed }) => [styles.heroIconBtn, pressed && { opacity: 0.7 }]}
              hitSlop={10}
            >
              <Ionicons
                name={torchOn ? 'flash' : 'flash-outline'}
                size={22}
                color="rgba(255,255,255,0.75)"
              />
            </Pressable>
          </View>
        </LinearGradient>

        <View style={styles.viewfinderWrap}>
          {showCamera ? (
            <CameraView
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              facing="back"
              enableTorch={torchOn}
              onCameraReady={() => setCameraReady(true)}
              onMountError={() => setCameraReady(false)}
            />
          ) : null}

          <View
            style={[styles.viewfinderInner, !showCamera && { backgroundColor: C.viewfinderBg }]}
            onLayout={(e) => {
              const { width, height } = e.nativeEvent.layout;
              setVfSize({ w: width, h: height });
            }}
          >
            {showCamera ? <View style={styles.cameraDim} pointerEvents="none" /> : null}

            <ViewfinderGrid width={vfSize.w} height={vfSize.h} patternId={patternId} />

            {!showCamera ? (
              <View style={styles.placeholderCenter} pointerEvents="none">
                <View style={styles.camIconWrap}>
                  <Ionicons name="camera-outline" size={26} color="rgba(255,255,255,0.5)" />
                </View>
                <Text style={styles.camHint}>Align receipt within frame</Text>
              </View>
            ) : (
              <View style={styles.hintOverlay} pointerEvents="none">
                <View style={styles.camIconWrap}>
                  <Ionicons name="camera-outline" size={26} color="rgba(255,255,255,0.35)" />
                </View>
                <Text style={styles.camHint}>Align receipt within frame</Text>
              </View>
            )}

            {!isWeb && permission === null ? (
              <View style={styles.permOverlay}>
                <ActivityIndicator color="#fff" />
              </View>
            ) : null}

            {!isWeb &&
            permission &&
            !permission.granted &&
            permission.status === PermissionStatus.DENIED ? (
              <View style={styles.permOverlay}>
                <Text style={styles.permTitle}>Camera access</Text>
                <Text style={styles.permBody}>
                  Split needs the camera to scan receipts. You can try again or enable access in Settings.
                </Text>
                {permission.canAskAgain ? (
                  <Pressable style={styles.permBtn} onPress={() => requestPermission()}>
                    <Text style={styles.permBtnText}>Try again</Text>
                  </Pressable>
                ) : (
                  <Pressable style={styles.permBtn} onPress={openSettings}>
                    <Text style={styles.permBtnText}>Open Settings</Text>
                  </Pressable>
                )}
              </View>
            ) : null}
          </View>

          <ScanCorners />
          <ScanLineOverlay height={vfSize.h || VIEWFINDER_HEIGHT} />
        </View>

        <View style={styles.actions}>
          <Pressable style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.92 }]}>
            <View style={[styles.actionIcon, { backgroundColor: C.lilacSurface }]}>
              <Ionicons name="images-outline" size={16} color={C.purple} />
            </View>
            <Text style={styles.actionTitle}>Upload photo</Text>
            <Text style={styles.actionSub}>From camera roll</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.actionBtn, styles.actionPrimary, pressed && { opacity: 0.92 }]}
            onPress={onTakePhoto}
          >
            <View style={[styles.actionIcon, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
              <Ionicons name="camera-outline" size={16} color="#fff" />
            </View>
            <Text style={[styles.actionTitle, styles.actionTitleOnPrimary]}>Take photo</Text>
            <Text style={[styles.actionSub, styles.actionSubOnPrimary]}>Point & scan</Text>
          </Pressable>

          <Pressable style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.92 }]}>
            <View style={[styles.actionIcon, { backgroundColor: C.mintSurface }]}>
              <Ionicons name="add" size={18} color={C.mintIcon} />
            </View>
            <Text style={styles.actionTitle}>Enter manually</Text>
            <Text style={styles.actionSub}>Type items in</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
  },
  scrollContent: {
    flexGrow: 1,
  },
  hero: {
    paddingHorizontal: 20,
    paddingBottom: 28,
  },
  heroRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  heroTitles: {
    flex: 1,
    paddingRight: 8,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: '#fff',
    letterSpacing: -0.3,
  },
  heroSub: {
    marginTop: 2,
    fontSize: 15,
    color: 'rgba(255,255,255,0.55)',
  },
  heroIconBtn: {
    padding: 4,
    marginTop: -2,
  },
  viewfinderWrap: {
    marginHorizontal: 14,
    marginTop: -14,
    borderRadius: 22,
    overflow: 'hidden',
    height: VIEWFINDER_HEIGHT,
    backgroundColor: C.viewfinderBg,
    position: 'relative',
  },
  viewfinderInner: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  placeholderCenter: {
    alignItems: 'center',
    gap: 8,
    zIndex: 2,
  },
  hintOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    zIndex: 2,
  },
  camIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  camHint: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    paddingHorizontal: 24,
    lineHeight: 20,
  },
  permOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    zIndex: 4,
    gap: 10,
  },
  permTitle: {
    fontSize: 19,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
  },
  permBody: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'center',
    lineHeight: 21,
  },
  permBtn: {
    marginTop: 4,
    backgroundColor: C.purple,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  permBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 14,
  },
  actionBtn: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 0.5,
    borderColor: C.border,
    borderRadius: 14,
    minHeight: 150,
    paddingVertical: 22,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  actionPrimary: {
    backgroundColor: C.purple,
    borderColor: C.purple,
  },
  actionIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: C.text,
    textAlign: 'center',
  },
  actionTitleOnPrimary: {
    color: '#fff',
  },
  actionSub: {
    fontSize: 12,
    color: C.muted,
    textAlign: 'center',
  },
  actionSubOnPrimary: {
    color: 'rgba(255,255,255,0.6)',
  },
});
