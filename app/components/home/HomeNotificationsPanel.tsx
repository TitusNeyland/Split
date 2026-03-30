import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  acceptSplitInviteFromNotification,
  declineSplitInviteFromNotification,
  formatNotificationRelativeTime,
  getFriendConnectedMetadata,
  getSplitInviteMetadata,
  markFriendConnectedNotificationRead,
  markSplitInviteNotificationInvalidated,
  SPLIT_INVITE_INVALID_ERROR,
  type AppNotification,
} from '../../../lib/home/homeNotificationsFirestore';
import { replaceWithSplitJoinedCelebration } from '../../../lib/navigation/splitJoinedCelebration';
import { getFriendAvatarColors } from '../../../lib/friends/friendAvatar';
import { initialsFromName } from '../../../lib/profile';
import { ServiceIcon } from '../shared/ServiceIcon';
import { UserAvatarCircle } from '../shared/UserAvatarCircle';

const C = {
  purple: '#534AB7',
  muted: '#888780',
  veryMuted: '#B0AEA7',
  text: '#1a1a18',
  bg: '#F2F0EB',
  joinBg: '#EEEDFE',
  declineBg: '#F0EEE9',
  green: '#1D9E75',
  border: 'rgba(0,0,0,0.08)',
};

type Props = {
  visible: boolean;
  onClose: () => void;
  uid: string;
  displayName: string;
  notifications: AppNotification[];
  loading?: boolean;
};

export default function HomeNotificationsPanel({
  visible,
  onClose,
  uid,
  displayName,
  notifications,
  loading,
}: Props) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { height: windowH, width: windowW } = useWindowDimensions();
  const maxH = Math.min(windowH * 0.78, 560);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(5);

  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setVisibleCount(5);
      anim.setValue(0);
      Animated.spring(anim, {
        toValue: 1,
        useNativeDriver: true,
        damping: 22,
        stiffness: 300,
        mass: 0.85,
      }).start();
    }
  }, [visible]);

  // Scale origin: top-right of panel (where bell icon roughly is)
  const panelWidth = windowW - 28;
  const originX = panelWidth / 2 - 22;

  const onJoinSplit = useCallback(
    async (n: AppNotification) => {
      const meta = getSplitInviteMetadata(n);
      if (!meta) {
        Alert.alert('Unable to join', 'Missing invitation details.');
        return;
      }
      setBusyId(n.id);
      try {
        await acceptSplitInviteFromNotification({
          uid,
          displayName,
          notificationId: n.id,
          metadata: meta,
        });
        onClose();
        const ok = await replaceWithSplitJoinedCelebration(router, meta.subscriptionId, uid);
        if (!ok) {
          router.replace({ pathname: '/subscription/[id]', params: { id: meta.subscriptionId } });
        }
      } catch (e) {
        if (e instanceof Error && e.message === SPLIT_INVITE_INVALID_ERROR) {
          Alert.alert(
            'Invite no longer valid',
            'This invite is no longer valid. The owner may have cancelled it.'
          );
          try {
            await markSplitInviteNotificationInvalidated(uid, n.id, !n.read);
          } catch {
            // best-effort
          }
        } else {
          const msg = e instanceof Error ? e.message : 'Could not join this split.';
          Alert.alert('Could not join', msg);
        }
      } finally {
        setBusyId(null);
      }
    },
    [uid, displayName, onClose, router]
  );

  const onDecline = useCallback(
    async (n: AppNotification) => {
      const meta = getSplitInviteMetadata(n);
      if (!meta) {
        Alert.alert('Unable to decline', 'Missing invitation details.');
        return;
      }
      setBusyId(n.id);
      try {
        await declineSplitInviteFromNotification({
          uid,
          notificationId: n.id,
          metadata: meta,
        });
      } catch {
        Alert.alert('Something went wrong', 'Could not update this invitation.');
      } finally {
        setBusyId(null);
      }
    },
    [uid]
  );

  const onViewProfile = useCallback(
    async (n: AppNotification) => {
      const meta = getFriendConnectedMetadata(n);
      if (!meta) {
        Alert.alert('Unable to open', 'Missing friend details.');
        return;
      }
      setBusyId(n.id);
      try {
        onClose();
        router.push(`/friends/${meta.friendUid}`);
        await markFriendConnectedNotificationRead(uid, n.id);
      } catch {
        Alert.alert('Something went wrong', 'Could not open profile.');
      } finally {
        setBusyId(null);
      }
    },
    [uid, onClose, router]
  );

  const empty = !loading && notifications.length === 0;

  const rows = useMemo(() => notifications, [notifications]);
  const visibleRows = useMemo(() => rows.slice(0, visibleCount), [rows, visibleCount]);
  const hasMore = visibleCount < rows.length;

  return (
    <Modal visible={visible} animationType="none" transparent onRequestClose={onClose}>
      <View style={styles.backdropContainer}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdropOverlay, { opacity: anim }]} />
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View
          style={[
            styles.panelWrapper,
            { marginTop: insets.top + 6 },
            {
              opacity: anim,
              transform: [
                { translateX: originX },
                { scale: anim },
                { translateX: -originX },
              ],
            },
          ]}
        >
          <View style={styles.bubbleArrowRow}>
            <View style={styles.bubbleArrow} />
          </View>
          <View style={[styles.sheet, { maxHeight: maxH }]}>
            <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Notifications</Text>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Close notifications"
            >
              <Ionicons name="close" size={24} color={C.text} />
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="small" color={C.purple} />
            </View>
          ) : empty ? (
            <View style={styles.emptyBox}>
              <Ionicons name="notifications-off-outline" size={48} color="#C8C6C0" />
              <Text style={styles.emptyTitle}>No notifications yet</Text>
              <Text style={styles.emptySub}>
                You will be notified when someone invites you to a split or connects with you
              </Text>
            </View>
          ) : (
            <ScrollView
              style={[styles.scroll, { maxHeight: maxH - 50 }]}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {visibleRows.map((n) => (
                <NotificationRow
                  key={n.id}
                  n={n}
                  busy={busyId === n.id}
                  onJoinSplit={onJoinSplit}
                  onDecline={onDecline}
                  onViewProfile={onViewProfile}
                />
              ))}
              {hasMore && (
                <Pressable
                  style={({ pressed }) => [styles.loadMoreBtn, pressed && styles.btnPressed]}
                  onPress={() => setVisibleCount((c) => c + 5)}
                  accessibilityRole="button"
                  accessibilityLabel="Load more notifications"
                >
                  <Text style={styles.loadMoreTxt}>Load more</Text>
                </Pressable>
              )}
            </ScrollView>
          )}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

function NotificationRow({
  n,
  busy,
  onJoinSplit,
  onDecline,
  onViewProfile,
}: {
  n: AppNotification;
  busy: boolean;
  onJoinSplit: (n: AppNotification) => void;
  onDecline: (n: AppNotification) => void;
  onViewProfile: (n: AppNotification) => void;
}) {
  const t = formatNotificationRelativeTime(n.createdAt);
  const unread = !n.read;

  if (n.type === 'split_invite') {
    const meta = getSplitInviteMetadata(n);
    const catalogServiceId =
      typeof meta?.serviceId === 'string' && meta.serviceId.trim() ? meta.serviceId.trim() : undefined;
    const serviceLabel = meta?.subscriptionName?.trim() || 'Subscription';
    const shareLabel =
      meta != null ? `Your share · $${(meta.userShare / 100).toFixed(2)}/month` : n.body;
    const showActions = unread && !n.actioned;
    const actionedLabel =
      n.actioned === 'accepted' ? (
        <Text style={styles.actionedJoined}>Joined ✓</Text>
      ) : n.actioned === 'declined' ? (
        <Text style={styles.actionedDeclined}>Declined</Text>
      ) : null;

    return (
      <View
        style={[
          styles.row,
          unread && !n.actioned && styles.rowUnread,
          n.actioned && styles.rowActioned,
        ]}
      >
        <View style={styles.rowMain}>
          <View style={styles.iconLeft}>
            <ServiceIcon serviceName={serviceLabel} serviceId={catalogServiceId} size={36} />
          </View>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle} numberOfLines={2}>
              {n.title}
            </Text>
            <Text style={styles.rowSub} numberOfLines={2}>
              {shareLabel}
            </Text>
            <Text style={styles.rowTime}>{t}</Text>
            {showActions ? (
              <View style={styles.actionsRow}>
                <Pressable
                  onPress={() => onJoinSplit(n)}
                  disabled={busy}
                  style={({ pressed }) => [
                    styles.btnJoin,
                    pressed && styles.btnPressed,
                    busy && styles.btnDisabled,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Join split"
                >
                  {busy ? (
                    <ActivityIndicator size="small" color={C.purple} />
                  ) : (
                    <Text style={styles.btnJoinTxt}>Join split</Text>
                  )}
                </Pressable>
                <Pressable
                  onPress={() => onDecline(n)}
                  disabled={busy}
                  style={({ pressed }) => [
                    styles.btnDecline,
                    pressed && styles.btnPressed,
                    busy && styles.btnDisabled,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Decline invitation"
                >
                  <Text style={styles.btnDeclineTxt}>Decline</Text>
                </Pressable>
              </View>
            ) : actionedLabel ? (
              <View style={styles.actionedRow}>{actionedLabel}</View>
            ) : null}
          </View>
        </View>
      </View>
    );
  }

  if (n.type === 'friend_connected') {
    const meta = getFriendConnectedMetadata(n);
    const name = meta?.friendName ?? n.title;
    const handle = meta?.friendUsername?.trim()
      ? `@${meta.friendUsername.replace(/^@/, '')}`
      : '';
    const initials = initialsFromName(name);
    const avColors = meta ? getFriendAvatarColors(meta.friendUid) : null;
    const showBtn = !n.read;

    return (
      <View style={[styles.row, unread && styles.rowUnread]}>
        <View style={styles.rowMain}>
          <View style={styles.iconLeft}>
            {meta?.friendAvatarUrl ? (
              <UserAvatarCircle size={36} initials={initials} imageUrl={meta.friendAvatarUrl} />
            ) : (
              <View
                style={[
                  styles.fallbackAv,
                  { backgroundColor: avColors?.backgroundColor ?? '#EEEDFE' },
                ]}
              >
                <Text style={[styles.fallbackAvTxt, { color: avColors?.color ?? C.purple }]}>
                  {initials}
                </Text>
              </View>
            )}
          </View>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle} numberOfLines={2}>
              {n.title}
            </Text>
            {handle ? (
              <Text style={styles.rowSub} numberOfLines={1}>
                {handle}
              </Text>
            ) : null}
            <Text style={styles.rowTime}>{t}</Text>
            {showBtn ? (
              <Pressable
                onPress={() => onViewProfile(n)}
                disabled={busy}
                style={({ pressed }) => [
                  styles.btnView,
                  pressed && styles.btnPressed,
                  busy && styles.btnDisabled,
                ]}
                accessibilityRole="button"
                accessibilityLabel="View profile"
              >
                {busy ? (
                  <ActivityIndicator size="small" color={C.purple} />
                ) : (
                  <Text style={styles.btnJoinTxt}>View profile</Text>
                )}
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.row, unread && styles.rowUnread]}>
      <View style={styles.rowMain}>
        <View style={[styles.iconLeft, styles.genericBell]}>
          <Ionicons name="notifications-outline" size={22} color={C.purple} />
        </View>
        <View style={styles.rowText}>
          <Text style={styles.rowTitle} numberOfLines={3}>
            {n.title}
          </Text>
          {n.body ? (
            <Text style={styles.rowSub} numberOfLines={2}>
              {n.body}
            </Text>
          ) : null}
          <Text style={styles.rowTime}>{t}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdropContainer: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  backdropOverlay: {
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  panelWrapper: {
    width: '100%',
  },
  bubbleArrowRow: {
    alignItems: 'flex-end',
    paddingRight: 18,
  },
  bubbleArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderBottomWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#fff',
  },
  sheet: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    overflow: 'hidden',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F0EEE9',
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: C.text,
  },
  loadingBox: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyBox: {
    paddingHorizontal: 20,
    paddingVertical: 36,
    alignItems: 'center',
  },
  emptyTitle: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: '600',
    color: C.muted,
    textAlign: 'center',
  },
  emptySub: {
    marginTop: 8,
    fontSize: 14,
    color: C.veryMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  scroll: {},
  scrollContent: { paddingBottom: 12 },
  row: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F5F3EE',
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  rowUnread: {
    borderLeftWidth: 3,
    borderLeftColor: C.purple,
  },
  rowActioned: {
    borderLeftWidth: 0,
  },
  rowMain: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  iconLeft: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  genericBell: {
    borderRadius: 10,
    backgroundColor: '#F5F3EE',
  },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: C.text,
    lineHeight: 16,
  },
  rowSub: {
    marginTop: 2,
    fontSize: 10,
    color: C.muted,
    lineHeight: 14,
  },
  rowTime: {
    marginTop: 4,
    fontSize: 9,
    color: C.veryMuted,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  btnJoin: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: C.joinBg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
  },
  btnJoinTxt: {
    fontSize: 13,
    fontWeight: '600',
    color: C.purple,
  },
  btnDecline: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: C.declineBg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
  },
  btnDeclineTxt: {
    fontSize: 13,
    fontWeight: '600',
    color: '#5F5E5A',
  },
  btnView: {
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: C.joinBg,
    minWidth: 120,
    alignItems: 'center',
  },
  btnPressed: { opacity: 0.85 },
  btnDisabled: { opacity: 0.6 },
  actionedRow: { marginTop: 8 },
  actionedJoined: {
    fontSize: 10,
    fontWeight: '600',
    color: C.green,
  },
  actionedDeclined: {
    fontSize: 10,
    fontWeight: '600',
    color: C.muted,
  },
  fallbackAv: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackAvTxt: {
    fontSize: 13,
    fontWeight: '700',
  },
  loadMoreBtn: {
    marginHorizontal: 14,
    marginTop: 10,
    marginBottom: 4,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#F5F3EE',
    alignItems: 'center',
  },
  loadMoreTxt: {
    fontSize: 13,
    fontWeight: '600',
    color: C.purple,
  },
});
