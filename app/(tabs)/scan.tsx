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
  Modal,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect } from 'expo-router';
import { parseReceiptImage } from '../../lib/receiptApi';
import { setReceiptAssignSession } from '../../lib/receiptParseSession';
import { emptyManualSession, sessionFromParse } from '../../lib/receiptMappers';
import {
  getRecentReceiptById,
  loadRecentReceipts,
  newReceiptId,
  upsertRecentFromSession,
} from '../../lib/recentReceipts';
import type { AssignReceiptLine, ReceiptAssignSession, StoredReceiptRecord } from '../../lib/receiptTypes';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { ServiceIcon } from '../components/ServiceIcon';
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
import { useMergedSplitPreferences } from '../../lib/useMergedSplitPreferences';

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

/** Set to `false` when you no longer need placeholder rows. */
const SHOW_FAKE_RECENT_RECEIPTS = true;

function previewLine(
  id: string,
  name: string,
  total: number,
  assignee: string,
  kind: AssignReceiptLine['kind'] = 'item'
): AssignReceiptLine {
  return {
    id,
    name,
    quantity: 1,
    unit_price: total,
    line_total: total,
    kind,
    confidence: 0.95,
    unreadable: false,
    assignedTo: assignee,
    selected: true,
  };
}

const FAKE_PREVIEW_RECEIPTS: StoredReceiptRecord[] = (() => {
  const t = Date.now();
  const d = (day: number) => new Date(2026, 2, day).getTime();

  const olive: ReceiptAssignSession = {
    merchantName: 'Olive Garden',
    receiptDate: 'March 14, 2026',
    overallConfidence: 0.92,
    receiptId: 'fake_preview_olive',
    splitStatus: 'confirmed',
    readOnly: true,
    lines: [
      previewLine('fp_og_1', 'Chicken Alfredo', 14.99, 'Titus'),
      previewLine('fp_og_2', 'Fettuccine Alfredo', 12.99, 'Alex'),
      previewLine('fp_og_3', 'Caesar Salad', 8.99, 'Sam'),
      previewLine('fp_og_4', 'Breadsticks', 4.99, 'Split'),
      previewLine('fp_og_5', 'Tax + tip', 7.56, 'Split', 'tax'),
    ],
  };

  const chipotle: ReceiptAssignSession = {
    merchantName: 'Chipotle',
    receiptDate: 'March 10, 2026',
    overallConfidence: 0.88,
    receiptId: 'fake_preview_chipotle',
    splitStatus: 'pending',
    readOnly: false,
    lines: [
      previewLine('fp_ch_1', 'Burrito bowl', 12.4, 'Titus'),
      previewLine('fp_ch_2', 'Burrito + drink', 12.4, 'Alex'),
    ],
  };

  const tjs: ReceiptAssignSession = {
    merchantName: "Trader Joe's",
    receiptDate: 'March 7, 2026',
    overallConfidence: 0.9,
    receiptId: 'fake_preview_tjs',
    splitStatus: 'confirmed',
    readOnly: true,
    lines: [
      previewLine('fp_tj_1', 'Groceries (split)', 45, 'Split'),
      previewLine('fp_tj_2', 'Your items', 21.58, 'Titus'),
      previewLine('fp_tj_3', 'Tax', 19.76, 'Split', 'tax'),
    ],
  };

  return [
    {
      id: 'fake_preview_olive',
      updatedAt: t,
      receiptDateMs: d(14),
      merchantName: 'Olive Garden',
      peopleCount: 3,
      itemCount: 7,
      totalAmount: 49.52,
      yourShare: 17.51,
      splitStatus: 'confirmed',
      session: olive,
    },
    {
      id: 'fake_preview_chipotle',
      updatedAt: t - 1,
      receiptDateMs: d(10),
      merchantName: 'Chipotle',
      peopleCount: 2,
      itemCount: 4,
      totalAmount: 24.8,
      yourShare: 12.4,
      splitStatus: 'pending',
      session: chipotle,
    },
    {
      id: 'fake_preview_tjs',
      updatedAt: t - 2,
      receiptDateMs: d(7),
      merchantName: "Trader Joe's",
      peopleCount: 4,
      itemCount: 12,
      totalAmount: 86.34,
      yourShare: 21.58,
      splitStatus: 'confirmed',
      session: tjs,
    },
  ];
})();

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
  const splitPrefs = useMergedSplitPreferences();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [torchOn, setTorchOn] = useState(false);
  const [vfSize, setVfSize] = useState({ w: 0, h: VIEWFINDER_HEIGHT });
  const [cameraReady, setCameraReady] = useState(false);
  const [readingReceipt, setReadingReceipt] = useState(false);
  const [recents, setRecents] = useState<StoredReceiptRecord[]>([]);
  const cameraRef = useRef<CameraView>(null);
  const reactId = useId();
  const patternId = useMemo(() => `scanGrid${reactId.replace(/[^a-zA-Z0-9]/g, '')}`, [reactId]);

  const displayRecents = useMemo(() => {
    if (!SHOW_FAKE_RECENT_RECEIPTS) return recents;
    const fakeIds = new Set(FAKE_PREVIEW_RECEIPTS.map((r) => r.id));
    return [...FAKE_PREVIEW_RECEIPTS, ...recents.filter((r) => !fakeIds.has(r.id))];
  }, [recents]);

  const isWeb = Platform.OS === 'web';
  const showCamera = Boolean(permission?.granted && !isWeb);

  const processReceiptUri = useCallback(async (uri: string, mimeType: string = 'image/jpeg') => {
    setReadingReceipt(true);
    try {
      const parsed = await parseReceiptImage(uri, mimeType);
      const id = newReceiptId();
      const session: ReceiptAssignSession = {
        ...sessionFromParse(parsed, uri),
        receiptId: id,
        splitStatus: 'pending',
        readOnly: false,
      };
      setReceiptAssignSession(session);
      await upsertRecentFromSession(session);
      setRecents(await loadRecentReceipts());
      router.push('/receipt-assign');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Something went wrong.';
      Alert.alert('Could not read receipt', msg);
    } finally {
      setReadingReceipt(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      loadRecentReceipts().then((list) => {
        if (alive) setRecents(list);
      });
      return () => {
        alive = false;
      };
    }, [])
  );

  const openRecentReceipt = useCallback(async (id: string) => {
    if (SHOW_FAKE_RECENT_RECEIPTS && id.startsWith('fake_preview_')) {
      const row = FAKE_PREVIEW_RECEIPTS.find((r) => r.id === id);
      if (row) {
        const readOnly = row.splitStatus === 'confirmed';
        setReceiptAssignSession({
          ...row.session,
          receiptId: row.id,
          splitStatus: row.splitStatus,
          readOnly,
        });
        router.push('/receipt-assign');
      }
      return;
    }
    const row = await getRecentReceiptById(id);
    if (!row) {
      setRecents(await loadRecentReceipts());
      return;
    }
    const readOnly = row.splitStatus === 'confirmed';
    setReceiptAssignSession({
      ...row.session,
      receiptId: row.id,
      splitStatus: row.splitStatus,
      readOnly,
    });
    router.push('/receipt-assign');
  }, []);

  const goActivityReceipts = useCallback(() => {
    router.push({ pathname: '/activity', params: { filter: 'receipts' } });
  }, []);

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
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.85 });
      if (photo?.uri) await processReceiptUri(photo.uri, 'image/jpeg');
    } catch {
      Alert.alert('Could not capture', 'Try again or check camera permissions in Settings.');
    }
  }, [permission?.granted, requestPermission, cameraReady, processReceiptUri]);

  const onUploadPhoto = useCallback(async () => {
    if (isWeb) {
      Alert.alert('Not available', 'Upload a receipt from the mobile app.');
      return;
    }
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Photos', 'Allow photo library access to upload a receipt, or open Settings.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const mime = asset.mimeType ?? 'image/jpeg';
    await processReceiptUri(asset.uri, mime);
  }, [isWeb, processReceiptUri]);

  const onEnterManually = useCallback(() => {
    const session: ReceiptAssignSession = {
      ...emptyManualSession(),
      receiptId: newReceiptId(),
      splitStatus: 'pending',
      readOnly: false,
    };
    setReceiptAssignSession(session);
    router.push('/receipt-assign');
  }, []);

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
      <Modal visible={readingReceipt} transparent animationType="fade">
        <View style={styles.readingOverlay}>
          <ActivityIndicator size="large" color={C.purple} />
          <Text style={styles.readingText}>Reading your receipt…</Text>
        </View>
      </Modal>
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
          <Pressable
            style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.92 }]}
            onPress={onUploadPhoto}
            disabled={readingReceipt}
          >
            <View style={[styles.actionIcon, { backgroundColor: C.lilacSurface }]}>
              <Ionicons name="images-outline" size={16} color={C.purple} />
            </View>
            <Text style={styles.actionTitle}>Upload photo</Text>
            <Text style={styles.actionSub}>From camera roll</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.actionBtn, styles.actionPrimary, pressed && { opacity: 0.92 }]}
            onPress={onTakePhoto}
            disabled={readingReceipt}
          >
            <View style={[styles.actionIcon, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
              <Ionicons name="camera-outline" size={16} color="#fff" />
            </View>
            <Text style={[styles.actionTitle, styles.actionTitleOnPrimary]}>Take photo</Text>
            <Text style={[styles.actionSub, styles.actionSubOnPrimary]}>Point & scan</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.92 }]}
            onPress={onEnterManually}
            disabled={readingReceipt}
          >
            <View style={[styles.actionIcon, { backgroundColor: C.mintSurface }]}>
              <Ionicons name="add" size={18} color={C.mintIcon} />
            </View>
            <Text style={styles.actionTitle}>Enter manually</Text>
            <Text style={styles.actionSub}>Type items in</Text>
          </Pressable>
        </View>

        <View style={styles.recentWrap}>
          <View style={styles.recentHeader}>
            <Text style={styles.recentHeaderTitle}>Recent receipts</Text>
            <Pressable onPress={goActivityReceipts} hitSlop={8}>
              <Text style={styles.recentHeaderLink}>See all</Text>
            </Pressable>
          </View>

          {displayRecents.length === 0 ? (
            <View style={styles.recentEmpty}>
              <View style={styles.recentEmptyArt}>
                <View style={styles.recentEmptyCircle} />
                <View style={styles.recentEmptyCircle2} />
                <View style={styles.recentEmptyIconWrap}>
                  <Ionicons name="receipt-outline" size={42} color="rgba(83,74,183,0.35)" />
                </View>
              </View>
              <Text style={styles.recentEmptyText}>
                No receipts yet · Tap Take photo to scan your first bill
              </Text>
            </View>
          ) : (
            displayRecents.map((r) => (
              <RecentReceiptRow
                key={r.id}
                row={r}
                alwaysShowExactAmounts={splitPrefs.alwaysShowExactAmounts}
                onPress={() => void openRecentReceipt(r.id)}
              />
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function RecentReceiptRow({
  row,
  onPress,
  alwaysShowExactAmounts,
}: {
  row: StoredReceiptRecord;
  onPress: () => void;
  alwaysShowExactAmounts: boolean;
}) {
  const d = new Date(row.receiptDateMs);
  const mon = d.toLocaleString('en-US', { month: 'short' }).toUpperCase();
  const dayNum = d.getDate();
  const sharePct =
    row.totalAmount > 0
      ? Math.round((row.yourShare / row.totalAmount) * 100)
      : 0;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.recentRow, pressed && { opacity: 0.92 }]}
    >
      <View style={styles.recentDateBadge}>
        <Text style={styles.recentMon}>{mon}</Text>
        <Text style={styles.recentDay}>{dayNum}</Text>
      </View>
      <ServiceIcon serviceName={row.merchantName} size={36} />
      <View style={styles.recentMid}>
        <Text style={styles.recentMerchant} numberOfLines={1}>
          {row.merchantName}
        </Text>
        <Text style={styles.recentMeta}>
          {row.peopleCount} {row.peopleCount === 1 ? 'person' : 'people'} · {row.itemCount}{' '}
          {row.itemCount === 1 ? 'item' : 'items'}
        </Text>
      </View>
      <View style={styles.recentRight}>
        <Text style={styles.recentTotal}>${row.totalAmount.toFixed(2)}</Text>
        <Text style={styles.recentShare}>
          {alwaysShowExactAmounts
            ? `your share $${row.yourShare.toFixed(2)} · ${sharePct}%`
            : `your share $${row.yourShare.toFixed(2)}`}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  readingOverlay: {
    flex: 1,
    backgroundColor: 'rgba(242, 240, 235, 0.94)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: 32,
  },
  readingText: {
    fontSize: 17,
    fontWeight: '600',
    color: C.purple,
    textAlign: 'center',
  },
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
  recentWrap: {
    paddingHorizontal: 14,
    paddingTop: 20,
    paddingBottom: 28,
    flexGrow: 1,
  },
  recentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  recentHeaderTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: C.muted,
    letterSpacing: 0.65,
    textTransform: 'uppercase',
  },
  recentHeaderLink: {
    fontSize: 15,
    fontWeight: '500',
    color: C.purple,
  },
  recentEmpty: {
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 12,
  },
  recentEmptyArt: {
    width: 120,
    height: 100,
    marginBottom: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentEmptyCircle: {
    position: 'absolute',
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(83,74,183,0.06)',
    top: 4,
  },
  recentEmptyCircle2: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(83,74,183,0.1)',
    bottom: 8,
    right: 8,
  },
  recentEmptyIconWrap: {
    zIndex: 1,
  },
  recentEmptyText: {
    fontSize: 16,
    color: C.muted,
    textAlign: 'center',
    lineHeight: 23,
    maxWidth: 300,
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 14,
    marginBottom: 7,
    borderWidth: 0.5,
    borderColor: C.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  recentDateBadge: {
    width: 44,
    height: 44,
    borderRadius: 11,
    backgroundColor: C.lilacSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentMon: {
    fontSize: 10,
    fontWeight: '600',
    color: C.purple,
    textTransform: 'uppercase',
  },
  recentDay: {
    fontSize: 17,
    fontWeight: '700',
    color: C.purple,
    lineHeight: 20,
    marginTop: -1,
  },
  recentMid: {
    flex: 1,
    minWidth: 0,
  },
  recentMerchant: {
    fontSize: 16,
    fontWeight: '600',
    color: C.text,
  },
  recentMeta: {
    fontSize: 14,
    color: C.muted,
    marginTop: 3,
  },
  recentRight: {
    alignItems: 'flex-end',
  },
  recentTotal: {
    fontSize: 17,
    fontWeight: '700',
    color: C.text,
  },
  recentShare: {
    fontSize: 13,
    color: C.muted,
    marginTop: 3,
  },
});
