import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TouchableOpacity,
  Modal,
  Alert,
  Share,
  BackHandler,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { ServiceIcon } from '../../../components/shared/ServiceIcon';
import { UserAvatarCircle } from '../../../components/shared/UserAvatarCircle';
import { SubscriptionDetailSkeleton } from '../../../components/subscriptions/SubscriptionDetailSkeleton';
import { spacing } from '../../../constants/theme';
import type {
  CyclePaymentStatus,
  SubscriptionDetailMember,
  SubscriptionHistoryCycle,
} from '../../../lib/subscription/subscriptionDetailTypes';
import { resendSplitInvite } from '../../../lib/subscription/resendSplitInvite';
import { buildSplitInviteShareMessage } from '../../../lib/friends/inviteLinks';
import {
  mapFirestoreSubscriptionToDetailModel,
  useSubscriptionDetailFromFirestore,
} from '../../../lib/subscription/subscriptionDetailFromFirestore';
import {
  buildSubscriptionDetailPrefillPlaceholder,
  parseSubscriptionDetailPrefillParam,
} from '../../../lib/subscription/subscriptionDetailPrefill';
import { fmtCents } from '../../../lib/subscription/addSubscriptionSplitMath';
import { useFirebaseUid } from '../../../lib/auth/useFirebaseUid';
import { useProfileAvatarUrl } from '../../../hooks/useProfileAvatarUrl';
import { useViewerFirstName } from '../../../hooks/useViewerFirstName';
import { EndSplitConfirmSheet } from '../../../components/subscriptions/EndSplitConfirmSheet';
import { endSubscriptionSplit } from '../../../lib/subscription/endSplitFirestore';
import { formatSettingsPercentsLine, membersOwingBeforeEndSplit } from '../../../lib/subscription/endSplitHelpers';
import {
  setPendingEndSplitToast,
  setPendingSubscriptionsTabToast,
} from '../../../lib/subscription/endSplitNavigationToast';
import { LeaveSplitConfirmSheet } from '../../../components/subscriptions/LeaveSplitConfirmSheet';
import { leaveSubscriptionSplit } from '../../../lib/subscription/leaveSplitFirestore';
import { clearOwnerMemberLeftBanner } from '../../../lib/subscription/clearOwnerMemberLeftBannerFirestore';
import { clearSplitInviteDeclineNotices } from '../../../lib/subscription/splitInviteDeclineNoticesFirestore';
import { removePendingSplitInvite } from '../../../lib/subscription/removePendingSplitInviteFirestore';
import { useSubscriptions } from '../../../contexts/SubscriptionsContext';

const C = {
  bg: '#F2F0EB',
  purple: '#534AB7',
  purpleTint: '#EEEDFE',
  editLink: '#6F6699',
  text: '#1a1a18',
  muted: '#888780',
  border: 'rgba(0,0,0,0.06)',
  divider: '#F0EEE9',
  green: '#1D9E75',
  greenDark: '#0F6E56',
  red: '#E24B4A',
  amber: '#B45309',
  amberBg: '#FEF3C7',
  cream: '#FAEEDA',
};

function statusMeta(status: CyclePaymentStatus): { label: string; bg: string; fg: string } {
  if (status === 'paid') return { label: 'Paid', bg: '#E1F5EE', fg: C.greenDark };
  if (status === 'overdue') return { label: 'Overdue', bg: '#FCEBEB', fg: '#A32D2D' };
  return { label: 'Pending', bg: C.cream, fg: C.amber };
}

function daysLeftFromMs(ms: number | null | undefined): number {
  if (!ms || !Number.isFinite(ms)) return 0;
  return Math.max(0, Math.ceil((ms - Date.now()) / (24 * 60 * 60 * 1000)));
}

function pendingPrimaryLabel(m: SubscriptionDetailMember): string {
  const email = m.pendingInviteEmail ?? m.rosterEmail ?? null;
  if (email) return email;
  return m.displayName?.trim() || 'Invite';
}

function coverageFirstName(m: SubscriptionDetailMember): string {
  const raw =
    m.displayName?.trim() ||
    m.pendingInviteEmail?.split('@')[0] ||
    m.rosterEmail?.split('@')[0] ||
    'Member';
  const first = raw.split(/\s+/)[0] ?? 'Member';
  return first || 'Member';
}

export default function SubscriptionDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id, backToSubs: backToSubsRaw, prefillData } = useLocalSearchParams<{
    id: string | string[];
    backToSubs?: string | string[];
    prefillData?: string | string[];
  }>();
  const subscriptionId = typeof id === 'string' ? id : id?.[0] ?? '';
  const backToSubsTab =
    backToSubsRaw === '1' ||
    backToSubsRaw === 'true' ||
    (Array.isArray(backToSubsRaw) && (backToSubsRaw[0] === '1' || backToSubsRaw[0] === 'true'));

  const navigateBack = useCallback(() => {
    if (backToSubsTab) {
      router.replace('/(tabs)/subscriptions');
      return;
    }
    router.back();
  }, [router, backToSubsTab]);

  useFocusEffect(
    useCallback(() => {
      if (!backToSubsTab) return undefined;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        router.replace('/(tabs)/subscriptions');
        return true;
      });
      return () => sub.remove();
    }, [backToSubsTab, router])
  );
  const { avatarUrl: userAvatarUrl, displayName: profileDisplayName } = useProfileAvatarUrl();
  const { firstName: viewerFirstName } = useViewerFirstName();
  const firebaseUid = useFirebaseUid();
  const { subscriptions } = useSubscriptions();
  const [historyModalCycle, setHistoryModalCycle] = useState<SubscriptionHistoryCycle | null>(null);
  const [detailRetryKey, setDetailRetryKey] = useState(0);
  const [resendBusyId, setResendBusyId] = useState<string | null>(null);
  const [removeBusyId, setRemoveBusyId] = useState<string | null>(null);
  const [endSplitSheetOpen, setEndSplitSheetOpen] = useState(false);
  const [endSplitBusy, setEndSplitBusy] = useState(false);
  const [leaveSheetOpen, setLeaveSheetOpen] = useState(false);
  const [leaveBusy, setLeaveBusy] = useState(false);

  const { detail: liveDetail, loading: liveLoading, error: liveError, errorMessage: liveErrorMessage } =
    useSubscriptionDetailFromFirestore(subscriptionId, firebaseUid, userAvatarUrl, viewerFirstName, {
      enabled: true,
      retryKey: detailRetryKey,
    });

  const contextPrefillDetail = useMemo(() => {
    if (!subscriptionId.trim() || !firebaseUid) return null;
    const doc = subscriptions.find((s) => s.id === subscriptionId);
    if (!doc) return null;
    return mapFirestoreSubscriptionToDetailModel(
      doc as Record<string, unknown> & { id: string },
      firebaseUid,
      userAvatarUrl,
      viewerFirstName
    );
  }, [subscriptionId, subscriptions, firebaseUid, userAvatarUrl, viewerFirstName]);

  const paramPrefillPayload = useMemo(() => parseSubscriptionDetailPrefillParam(prefillData), [prefillData]);

  const paramPrefillDetail = useMemo(() => {
    if (!paramPrefillPayload || !subscriptionId.trim() || !firebaseUid) return null;
    return buildSubscriptionDetailPrefillPlaceholder(
      subscriptionId.trim(),
      firebaseUid,
      userAvatarUrl,
      viewerFirstName,
      {
        displayName: paramPrefillPayload.displayName,
        serviceId: paramPrefillPayload.serviceId,
        totalCents: paramPrefillPayload.totalCents,
        isOwner: paramPrefillPayload.isOwner,
      }
    );
  }, [paramPrefillPayload, subscriptionId, firebaseUid, userAvatarUrl, viewerFirstName]);

  const mergedPrefillDetail = useMemo(
    () => contextPrefillDetail ?? paramPrefillDetail,
    [contextPrefillDetail, paramPrefillDetail]
  );

  const detail =
    liveError === 'not-found' || liveError === 'permission'
      ? null
      : (liveDetail ?? mergedPrefillDetail);

  const declineInviteBannerLine = useMemo(() => {
    const first = detail?.splitInviteDeclineNotices?.[0];
    if (!first) return '';
    const name = first.declinerName?.trim() || 'Someone';
    return `${name} declined your invite`;
  }, [detail]);

  const handleDismissDeclineBanner = useCallback(async () => {
    if (!subscriptionId.trim()) return;
    try {
      await clearSplitInviteDeclineNotices(subscriptionId.trim());
      setDetailRetryKey((k) => k + 1);
    } catch (e) {
      Alert.alert('Could not dismiss', e instanceof Error ? e.message : 'Try again.');
    }
  }, [subscriptionId]);

  useEffect(() => {
    if (!subscriptionId.trim()) {
      console.error('SubscriptionDetail: missing subscription id param');
      router.back();
    }
  }, [subscriptionId, router]);

  const navigateToEditSplit = useCallback(() => {
    if (!subscriptionId.trim()) return;
    router.push(`/subscription/${subscriptionId.trim()}/edit-split` as never);
  }, [router, subscriptionId]);

  const handleEndSplit = () => {
    setEndSplitSheetOpen(true);
  };

  const uidForEndSplit = useMemo(() => firebaseUid ?? '', [firebaseUid]);

  const endSplitSheetModel = useMemo(() => {
    if (!detail || !uidForEndSplit) return null;
    const owing = membersOwingBeforeEndSplit(detail.members, uidForEndSplit);
    const first = owing[0];
    return {
      subscriptionName: detail.displayName,
      settingsSavedLine: formatSettingsPercentsLine(detail.members),
      membersNotifiedCount: detail.members.filter((m) => !m.invitePending && !m.inviteExpired).length,
      pendingWarning: first
        ? { memberName: first.displayName, amountFormatted: fmtCents(first.amountCents) }
        : null,
    };
  }, [detail, uidForEndSplit]);

  const handleConfirmEndSplit = useCallback(async () => {
    if (!detail || !detail.isOwner || !firebaseUid) return;
    setEndSplitBusy(true);
    try {
      const ownerName = profileDisplayName?.trim() || 'Someone';
      const recipientUids = detail.members
        .filter((m) => m.memberId !== firebaseUid && !m.invitePending && !m.inviteExpired)
        .map((m) => m.memberId);
      await endSubscriptionSplit({
        subscriptionId: subscriptionId.trim(),
        endedByUid: firebaseUid,
        ownerDisplayName: ownerName,
        subscriptionDisplayName: detail.displayName,
        recipientUids,
      });
      setEndSplitSheetOpen(false);
      setPendingEndSplitToast(`Split ended · ${detail.displayName} moved to Ended tab`);
      router.replace('/(tabs)/subscriptions');
    } catch (e) {
      Alert.alert('Could not end split', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setEndSplitBusy(false);
    }
  }, [detail, firebaseUid, profileDisplayName, subscriptionId, router]);

  const viewerMemberRow = useMemo(() => {
    if (!detail || !firebaseUid) return null;
    return detail.members.find((m) => m.memberId === firebaseUid) ?? null;
  }, [detail, firebaseUid]);

  const viewerIsMember = useMemo(() => {
    if (!detail || !firebaseUid) return true;
    return detail.members.some((m) => m.memberId === firebaseUid);
  }, [detail, firebaseUid]);

  const leaveSplitSheetModel = useMemo(() => {
    if (!detail || detail.isOwner || !firebaseUid) return null;
    const m = viewerMemberRow;
    if (!m || m.invitePending || m.inviteExpired) return null;
    const ownerName = detail.payerName?.trim() || 'Owner';
    const cycleNote =
      m.cycleStatus === 'paid'
        ? 'This cycle is marked paid on your account.'
        : m.cycleStatus === 'overdue'
          ? 'You have an overdue balance for this billing cycle.'
          : 'You have a pending balance for this billing cycle.';
    const owed =
      m.cycleStatus === 'pending' || m.cycleStatus === 'overdue'
        ? { amountFormatted: fmtCents(m.amountCents) }
        : null;
    return {
      subscriptionName: detail.displayName,
      yourShareMonthlyFormatted: fmtCents(m.amountCents),
      currentCycleNote: cycleNote,
      ownerName,
      owedWarning: owed,
    };
  }, [detail, firebaseUid, viewerMemberRow]);

  const handleLeaveSplitPress = () => {
    if (!leaveSplitSheetModel) return;
    setLeaveSheetOpen(true);
  };

  const handleConfirmLeaveSplit = useCallback(async () => {
    if (!detail || detail.isOwner || !firebaseUid) return;
    setLeaveBusy(true);
    try {
      await leaveSubscriptionSplit({ subscriptionId: subscriptionId.trim(), memberUid: firebaseUid });
      setLeaveSheetOpen(false);
      setPendingSubscriptionsTabToast(`You left ${detail.displayName}`, 'active', 'success');
      router.replace('/(tabs)/subscriptions');
    } catch (e) {
      Alert.alert('Could not leave split', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setLeaveBusy(false);
    }
  }, [detail, firebaseUid, subscriptionId, router]);

  const handleDismissOwnerLeftBanner = useCallback(async () => {
    if (!subscriptionId.trim() || !detail?.isOwner) return;
    try {
      await clearOwnerMemberLeftBanner(subscriptionId.trim());
      setDetailRetryKey((k) => k + 1);
    } catch (e) {
      Alert.alert('Could not dismiss', e instanceof Error ? e.message : 'Try again.');
    }
  }, [subscriptionId, detail?.isOwner]);

  const onResendSplitInvite = useCallback(
    async (m: SubscriptionDetailMember) => {
      if (!firebaseUid || !m.inviteId || !detail?.isOwner) return;
      setResendBusyId(m.memberId);
      try {
        const newId = await resendSplitInvite({
          subscriptionId: subscriptionId.trim(),
          ownerUid: firebaseUid,
          oldInviteId: m.inviteId,
          memberId: m.memberId,
          recipientEmailRaw: m.pendingInviteEmail,
        });
        const msg = buildSplitInviteShareMessage(detail.displayName, newId);
        try {
          await Share.share({ message: msg });
        } catch {
          /* user dismissed share sheet */
        }
        setDetailRetryKey((k) => k + 1);
      } catch (e) {
        Alert.alert('Could not resend', e instanceof Error ? e.message : 'Try again.');
      } finally {
        setResendBusyId(null);
      }
    },
    [firebaseUid, detail, subscriptionId],
  );

  const onRemovePendingInvite = useCallback(
    (m: SubscriptionDetailMember) => {
      if (!m.inviteId || !detail?.isOwner) return;
      if (!firebaseUid) return;
      Alert.alert(
        'Remove invite',
        `Remove ${pendingPrimaryLabel(m)} from this split? They can no longer accept this invite.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: () => {
              void (async () => {
                setRemoveBusyId(m.memberId);
                try {
                  await removePendingSplitInvite({
                    subscriptionId: subscriptionId.trim(),
                    ownerUid: firebaseUid,
                    inviteId: m.inviteId!,
                  });
                  setDetailRetryKey((k) => k + 1);
                  const name = coverageFirstName(m);
                  Alert.alert(
                    'Update split percentages?',
                    `You removed ${name} from this split. Update the split percentages to redistribute their share.`,
                    [
                      { text: 'Later', style: 'cancel' },
                      { text: 'Edit split', onPress: () => navigateToEditSplit() },
                    ]
                  );
                } catch (e) {
                  Alert.alert('Could not remove', e instanceof Error ? e.message : 'Try again.');
                } finally {
                  setRemoveBusyId(null);
                }
              })();
            },
          },
        ]
      );
    },
    [detail?.isOwner, firebaseUid, subscriptionId, navigateToEditSplit],
  );

  if (subscriptionId.trim() && firebaseUid && liveLoading && !liveDetail && !mergedPrefillDetail) {
    return (
      <View style={styles.loadingRoot}>
        <StatusBar style="dark" />
        <View style={[styles.loadingTopBar, { paddingTop: insets.top + 12 }]}>
          <Pressable
            onPress={navigateBack}
            style={styles.unknownBack}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="chevron-back" size={28} color={C.purple} />
          </Pressable>
        </View>
        <SubscriptionDetailSkeleton />
      </View>
    );
  }

  if (liveError) {
    const isNotFound = liveError === 'not-found';
    const title = isNotFound
      ? 'This subscription could not be found'
      : liveError === 'permission'
        ? 'Unable to open subscription'
        : 'Something went wrong loading this split';
    const errSub = isNotFound
      ? 'It may have been removed, or the link is invalid.'
      : liveError === 'permission'
        ? 'You do not have access to this subscription.'
        : 'Check your connection and try again.';
    const showRetry = liveError === 'unavailable';
    return (
      <View style={[styles.unknownRoot, { paddingTop: insets.top + 12 }]}>
        <StatusBar style="dark" />
        <Pressable
          onPress={navigateBack}
          style={styles.unknownBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={28} color={C.purple} />
        </Pressable>
        <Text style={styles.unknownTitle}>{title}</Text>
        <Text style={styles.unknownSub}>{errSub}</Text>
        {liveErrorMessage && !isNotFound ? (
          <Text style={styles.unknownTech}>{liveErrorMessage}</Text>
        ) : null}
        <Pressable
          style={styles.unknownPrimaryBtn}
          onPress={navigateBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={styles.unknownPrimaryBtnTxt}>Go back</Text>
        </Pressable>
        {showRetry ? (
          <Pressable
            style={styles.unknownSecondaryBtn}
            onPress={() => setDetailRetryKey((k) => k + 1)}
            accessibilityRole="button"
            accessibilityLabel="Try again"
          >
            <Text style={styles.unknownSecondaryBtnTxt}>Try again</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  if (!firebaseUid && !liveLoading) {
    return (
      <View style={[styles.unknownRoot, { paddingTop: insets.top + 12 }]}>
        <StatusBar style="dark" />
        <Pressable
          onPress={navigateBack}
          style={styles.unknownBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={28} color={C.purple} />
        </Pressable>
        <Text style={styles.unknownTitle}>Sign in required</Text>
        <Text style={styles.unknownSub}>Sign in to view this subscription.</Text>
      </View>
    );
  }

  if (!detail) {
    return (
      <View style={[styles.unknownRoot, { paddingTop: insets.top + 12 }]}>
        <StatusBar style="dark" />
        <Pressable
          onPress={navigateBack}
          style={styles.unknownBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={28} color={C.purple} />
        </Pressable>
        <Text style={styles.unknownTitle}>This subscription could not be found</Text>
        <Text style={styles.unknownSub}>It may have been removed, or the link is invalid.</Text>
      </View>
    );
  }

  if (firebaseUid && !detail.isOwner && !viewerIsMember) {
    return (
      <View style={[styles.unknownRoot, { paddingTop: insets.top + 12 }]}>
        <StatusBar style="dark" />
        <Pressable
          onPress={navigateBack}
          style={styles.unknownBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={28} color={C.purple} />
        </Pressable>
        <Ionicons name="information-circle-outline" size={40} color={C.muted} style={{ marginBottom: 12 }} />
        <Text style={styles.unknownTitle}>You don&apos;t have access to this split</Text>
        <Text style={styles.unknownSub}>
          {`You’re no longer a member of ${detail.displayName.trim() || 'this subscription'}. If you were removed, ask the owner to re-invite you.`}
        </Text>
        <Pressable
          style={styles.unknownPrimaryBtn}
          onPress={navigateBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={styles.unknownPrimaryBtnTxt}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const activeTotal = detail.activeMembersTotalCents;
  const pctCollected =
    activeTotal > 0 ? Math.min(100, Math.round((100 * detail.collectedCents) / activeTotal)) : 0;
  const activeMemberCount = detail.members.filter((m) => !m.invitePending && !m.inviteExpired).length;
  const pendingInviteMembers = detail.members.filter((m) => m.invitePending);

  const ended = (detail.lifecycleStatus ?? 'active') === 'ended';

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + spacing.xl }]}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={
            ended ? (['#2C2C2A', '#1A1A18', '#111110'] as const) : (['#6B3FA0', '#4A1570', '#2D0D45'] as const)
          }
          locations={[0, 0.55, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={[styles.hero, { paddingTop: Math.max(insets.top, 10) + 4 }]}
        >
          <View style={styles.heroTop}>
            <Pressable
              onPress={navigateBack}
              style={styles.backBtn}
              accessibilityRole="button"
              accessibilityLabel={backToSubsTab ? 'Back to Subs' : 'Back to subscriptions'}
            >
              <Ionicons name="chevron-back" size={26} color={ended ? 'rgba(255,255,255,0.4)' : '#fff'} />
            </Pressable>
            <Text style={[styles.heroTitle, ended && styles.heroTitleEnded]} numberOfLines={2}>
              {detail.displayName}
            </Text>
            <View style={styles.heroTopSpacer} />
          </View>

          <View style={styles.heroIconWrap}>
            <ServiceIcon serviceName={detail.serviceName} serviceId={detail.serviceId} size={52} />
          </View>
          <Text
            style={[styles.heroTotal, ended && styles.heroTotalEnded]}
            adjustsFontSizeToFit
            numberOfLines={1}
            minimumFontScale={0.6}
          >
            {fmtCents(detail.totalCents)}
          </Text>
          {ended ? (
            <Text style={styles.heroEndedLine}>Ended · billing stopped</Text>
          ) : (
            <>
              <Text style={styles.heroCycle}>{detail.billingCycleLabel} billing</Text>
              <Text style={styles.heroNext}>Next billing · {detail.nextBillingLabel}</Text>
            </>
          )}

          <View style={styles.heroBadges}>
            {ended ? (
              <View style={styles.readOnlyBadge}>
                <Ionicons name="close" size={11} color="rgba(255,255,255,0.22)" />
                <Text style={styles.readOnlyBadgeTxt}>Split ended · read only</Text>
              </View>
            ) : (
              <>
                {detail.isOwner ? (
                  <View style={styles.ownerBadge}>
                    <Ionicons name="person-outline" size={12} color="#C4B5FD" />
                    <Text style={styles.ownerBadgeTxt}>You pay</Text>
                  </View>
                ) : (
                  <View style={styles.ownerBadge}>
                    <Ionicons name="person-outline" size={12} color="#C4B5FD" />
                    <Text style={styles.ownerBadgeTxt}>{detail.payerName ?? 'Owner'} pays</Text>
                  </View>
                )}
                {detail.autoCharge === 'on' ? (
                  <View style={styles.autoOnBadge}>
                    <Ionicons name="checkmark" size={12} color={C.greenDark} />
                    <Text style={styles.autoOnBadgeTxt}>Auto-on</Text>
                  </View>
                ) : (
                  <View style={styles.autoOffBadge}>
                    <Text style={styles.autoOffBadgeTxt}>Auto-off</Text>
                  </View>
                )}
              </>
            )}
          </View>
        </LinearGradient>

        <View style={styles.body}>
          {!ended && detail.isOwner && (detail.splitInviteDeclineNotices?.length ?? 0) > 0 ? (
            <View style={styles.declinedBanner} accessibilityRole="summary">
              <View style={styles.declinedBannerTextCol}>
                <Text style={styles.declinedBannerTitle}>{declineInviteBannerLine}</Text>
                <Text style={styles.declinedBannerSub}>
                  You can invite someone else to fill this slot.
                </Text>
              </View>
              <View style={styles.declinedBannerActions}>
                <Pressable
                  onPress={() => navigateToEditSplit()}
                  style={({ pressed }) => [styles.declinedBannerBtn, pressed && styles.declinedBannerBtnPressed]}
                  accessibilityRole="button"
                  accessibilityLabel="Invite someone else"
                >
                  <Text style={styles.declinedBannerBtnTxt}>Invite someone else</Text>
                </Pressable>
                <Pressable
                  onPress={() => void handleDismissDeclineBanner()}
                  style={({ pressed }) => [styles.declinedBannerDismiss, pressed && styles.declinedBannerBtnPressed]}
                  accessibilityRole="button"
                  accessibilityLabel="Dismiss decline notice"
                >
                  <Text style={styles.declinedBannerDismissTxt}>Dismiss</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
          {ended ? (
            <View style={styles.endedInfoRow} accessibilityRole="text">
              <Text style={styles.endedInfoTxt}>
                {detail.endedOnLabel
                  ? `This split ended on ${detail.endedOnLabel}`
                  : 'This split ended'}
              </Text>
            </View>
          ) : null}

          {!ended && detail.isOwner && detail.ownerMemberLeftBanner ? (
            <View style={styles.ownerNoticeBanner} accessibilityRole="summary">
              <Ionicons name="alert-circle-outline" size={18} color={C.amber} style={styles.ownerNoticeIcon} />
              <Text style={styles.ownerNoticeTxt} accessibilityRole="text">
                {`${detail.ownerMemberLeftBanner.leaverDisplayName} left this split · You're now covering their share (${fmtCents(
                  detail.ownerMemberLeftBanner.shareCents
                )})`}
              </Text>
              <Pressable
                onPress={() => void handleDismissOwnerLeftBanner()}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Dismiss notice"
              >
                <Text style={styles.ownerNoticeDismiss}>Dismiss</Text>
              </Pressable>
            </View>
          ) : null}

          {!ended && detail.isOwner && detail.customSplitNeedsRebalance ? (
            <Pressable
              style={styles.ownerRebalanceBanner}
              onPress={() => navigateToEditSplit()}
              accessibilityRole="button"
              accessibilityLabel="Edit split to fix percentages"
            >
              <Ionicons name="information-circle-outline" size={18} color={C.amber} style={styles.ownerNoticeIcon} />
              <Text style={styles.ownerRebalanceTxt}>
                Percentages no longer add up to 100%. Tap to open Edit split and update the split.
              </Text>
            </Pressable>
          ) : null}

          <View style={[styles.card, ended && styles.cardEnded]}>
            <Text style={styles.sectionHeader}>{ended ? 'Final breakdown' : 'Split breakdown'}</Text>
            {detail.members.map((m) => {
              if (m.inviteExpired) {
                if (ended) {
                  return (
                    <View key={m.memberId} style={styles.splitRow}>
                      <View style={[styles.splitPip, styles.splitPipPending, styles.splitPipEndedMuted]}>
                        <Ionicons name="mail-outline" size={18} color={C.muted} />
                      </View>
                      <View style={styles.splitRowMid}>
                        <Text style={[styles.splitName, styles.splitTextEnded]} numberOfLines={1}>
                          {pendingPrimaryLabel(m)}
                        </Text>
                        <Text style={[styles.splitPct, styles.splitTextEnded]}>Invite expired</Text>
                      </View>
                      <View style={styles.splitRowRight}>
                        <Text
                          style={[styles.splitAmt, styles.splitTextEnded]}
                          adjustsFontSizeToFit
                          numberOfLines={1}
                          minimumFontScale={0.6}
                        >
                          {fmtCents(m.amountCents)}
                        </Text>
                        <View style={[styles.statusBadge, { backgroundColor: '#FCEBEB' }]}>
                          <Text style={[styles.statusBadgeTxt, { color: '#A32D2D' }]}>Expired</Text>
                        </View>
                      </View>
                    </View>
                  );
                }
                const primaryExpired = pendingPrimaryLabel(m);
                return (
                  <View key={m.memberId} style={styles.pendingMemberRow}>
                    <View style={styles.pendingAvatar}>
                      <Ionicons name="mail-outline" size={14} color="#888780" />
                    </View>
                    <View style={styles.memberInfo}>
                      <Text style={styles.pendingName} numberOfLines={1}>
                        {primaryExpired}
                      </Text>
                      <View style={styles.expiredSubRow}>
                        <Text style={styles.pendingSub}>Invite expired</Text>
                        <View style={styles.expiredPill} accessibilityLabel="Expired">
                          <Text style={styles.expiredPillTxt}>Expired</Text>
                        </View>
                      </View>
                    </View>
                    {detail.isOwner && m.inviteId ? (
                      <View style={styles.pendingActions}>
                        <Pressable
                          onPress={() => void onResendSplitInvite(m)}
                          disabled={resendBusyId === m.memberId || removeBusyId === m.memberId}
                          style={({ pressed }) => [styles.resendPill, pressed && styles.resendPillPressed]}
                          accessibilityRole="button"
                          accessibilityLabel={`Resend invite to ${primaryExpired}`}
                        >
                          <Text style={styles.resendPillTxt}>
                            {resendBusyId === m.memberId ? '…' : 'Resend'}
                          </Text>
                        </Pressable>
                        <Pressable
                          onPress={() => onRemovePendingInvite(m)}
                          disabled={removeBusyId === m.memberId || resendBusyId === m.memberId}
                          accessibilityRole="button"
                          accessibilityLabel={`Remove invite for ${primaryExpired}`}
                        >
                          <Text style={styles.removeInviteTxt}>
                            {removeBusyId === m.memberId ? '…' : 'Remove'}
                          </Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                );
              }
              if (m.invitePending) {
                if (ended) {
                  return (
                    <View key={m.memberId} style={styles.splitRow}>
                      <View style={[styles.splitPip, styles.splitPipPending, styles.splitPipEndedMuted]}>
                        <Ionicons name="mail-outline" size={18} color={C.muted} />
                      </View>
                      <View style={styles.splitRowMid}>
                        <Text style={[styles.splitName, styles.splitTextEnded]} numberOfLines={1}>
                          {m.displayName.trim() ? m.displayName : 'Pending invite'}
                        </Text>
                        <Text style={[styles.splitPct, styles.splitTextEnded]}>Invite not accepted</Text>
                      </View>
                      <View style={styles.splitRowRight}>
                        <Text
                          style={[styles.splitAmt, styles.splitTextEnded]}
                          adjustsFontSizeToFit
                          numberOfLines={1}
                          minimumFontScale={0.6}
                        >
                          {fmtCents(m.amountCents)}
                        </Text>
                        <View style={[styles.statusBadge, { backgroundColor: '#F0EEE9' }]}>
                          <Text style={[styles.statusBadgeTxt, { color: C.muted }]}>Ended</Text>
                        </View>
                      </View>
                    </View>
                  );
                }
                const days = daysLeftFromMs(m.inviteExpiresAtMs);
                const primary = pendingPrimaryLabel(m);
                const sub =
                  days > 0
                    ? `Invite sent · expires in ${days} ${days === 1 ? 'day' : 'days'}`
                    : 'Invite sent';
                return (
                  <View key={m.memberId} style={styles.pendingMemberRow}>
                    <View style={styles.pendingAvatar}>
                      <Ionicons name="mail-outline" size={14} color="#888780" />
                    </View>
                    <View style={styles.memberInfo}>
                      <Text style={styles.pendingName} numberOfLines={1}>
                        {primary}
                      </Text>
                      <Text style={styles.pendingSub}>{sub}</Text>
                    </View>
                    {detail.isOwner && m.inviteId ? (
                      <View style={styles.pendingActions}>
                        <Pressable
                          onPress={() => void onResendSplitInvite(m)}
                          disabled={resendBusyId === m.memberId || removeBusyId === m.memberId}
                          style={({ pressed }) => [styles.resendPill, pressed && styles.resendPillPressed]}
                          accessibilityRole="button"
                          accessibilityLabel={`Resend invite to ${primary}`}
                        >
                          <Text style={styles.resendPillTxt}>
                            {resendBusyId === m.memberId ? '…' : 'Resend'}
                          </Text>
                        </Pressable>
                        <Pressable
                          onPress={() => onRemovePendingInvite(m)}
                          disabled={removeBusyId === m.memberId || resendBusyId === m.memberId}
                          accessibilityRole="button"
                          accessibilityLabel={`Remove invite for ${primary}`}
                        >
                          <Text style={styles.removeInviteTxt}>
                            {removeBusyId === m.memberId ? '…' : 'Remove'}
                          </Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                );
              }
              const st = ended
                ? { label: 'Ended', bg: '#F0EEE9', fg: C.muted }
                : statusMeta(m.cycleStatus);
              return (
                <View key={m.memberId} style={styles.splitRow}>
                  <View style={[styles.splitPip, styles.splitPipPhoto, ended && styles.splitPipEnded]}>
                    <UserAvatarCircle
                      size={36}
                      uid={m.memberId}
                      initials={m.initials}
                      imageUrl={m.avatarUrl}
                      initialsBackgroundColor={ended ? '#F0EEE9' : m.avatarBg}
                      initialsTextColor={ended ? C.muted : m.avatarColor}
                      accessibilityLabel={m.displayName}
                    />
                  </View>
                  <View style={styles.splitRowMid}>
                    <Text style={[styles.splitName, ended && styles.splitTextEnded]} numberOfLines={1}>
                      {m.displayName}
                    </Text>
                    <Text style={[styles.splitPct, ended && styles.splitTextEnded]}>{m.percent}%</Text>
                  </View>
                  <View style={styles.splitRowRight}>
                    <Text
                      style={[styles.splitAmt, ended && styles.splitTextEnded]}
                      adjustsFontSizeToFit
                      numberOfLines={1}
                      minimumFontScale={0.6}
                    >
                      {fmtCents(m.amountCents)}
                    </Text>
                    <View style={[styles.statusBadge, { backgroundColor: st.bg }]}>
                      <Text style={[styles.statusBadgeTxt, { color: st.fg }]}>{st.label}</Text>
                    </View>
                  </View>
                </View>
              );
            })}
            {!ended && detail.isOwner && pendingInviteMembers.length > 0 ? (
              <View style={styles.ownerCoverageBlock}>
                {pendingInviteMembers.map((m) => (
                  <Text key={`cover-${m.memberId}`} style={styles.ownerCoverageTxt}>
                    You are currently covering {coverageFirstName(m)}&apos;s share ({fmtCents(m.amountCents)})
                    until they accept.
                  </Text>
                ))}
              </View>
            ) : null}
            {!ended ? (
              <>
                <View style={styles.progTrack}>
                  <View style={[styles.progFill, { width: `${pctCollected}%` }]} />
                </View>
                <Text
                  style={styles.progCaption}
                  adjustsFontSizeToFit
                  numberOfLines={2}
                  minimumFontScale={0.6}
                >
                  {detail.paidMemberCount} of {activeMemberCount} members paid ·{' '}
                  {fmtCents(detail.collectedCents)} collected of {fmtCents(activeTotal)} total
                </Text>
              </>
            ) : null}
            {!ended && detail.isOwner ? (
              <Pressable
                style={({ pressed }) => [styles.editLinkRow, pressed && styles.editLinkRowPressed]}
                onPress={navigateToEditSplit}
                hitSlop={{ top: 10, bottom: 10, left: 12, right: 12 }}
                accessibilityRole="button"
                accessibilityLabel="Edit split"
              >
                <Ionicons name="create-outline" size={14} color={C.editLink} />
                <Text style={styles.editLinkTxt}>Edit split</Text>
              </Pressable>
            ) : null}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionHeader}>Billing history</Text>
            {detail.history.map((row) => (
              <Pressable
                key={row.key}
                style={styles.historyRow}
                onPress={() => setHistoryModalCycle(row)}
                accessibilityRole="button"
                accessibilityLabel={`${row.label}, ${row.allPaid ? 'all paid' : 'partial'}`}
              >
                <Text style={styles.historyMonth} numberOfLines={1}>
                  {row.label}
                </Text>
                <View style={styles.historyTotalWrap}>
                  <Text
                    style={styles.historyTotal}
                    adjustsFontSizeToFit
                    numberOfLines={1}
                    minimumFontScale={0.6}
                  >
                    {fmtCents(row.totalCents)}
                  </Text>
                </View>
                <View
                  style={[
                    styles.historyPill,
                    row.allPaid ? styles.historyPillPaid : styles.historyPillPartial,
                  ]}
                >
                  <Text style={[styles.historyPillTxt, row.allPaid ? styles.historyPillTxtPaid : undefined]}>
                    {row.allPaid ? 'All paid' : 'Partial'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={C.muted} />
              </Pressable>
            ))}
          </View>

          {!ended && (detail.isOwner || leaveSplitSheetModel) ? (
            <View style={styles.actionsBlock}>
              <Text style={styles.manageSectionLbl}>Manage</Text>
              {detail.isOwner ? (
                <TouchableOpacity onPress={handleEndSplit} style={styles.actionCard} activeOpacity={0.75}>
                  <Text style={styles.actionTextDanger}>End split</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={handleLeaveSplitPress}
                  style={styles.actionCard}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel="Leave split"
                >
                  <Text style={styles.actionTextDanger}>Leave split</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : null}
        </View>
      </ScrollView>

      <Modal
        visible={historyModalCycle !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setHistoryModalCycle(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setHistoryModalCycle(null)}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{historyModalCycle?.label}</Text>
              <Pressable
                onPress={() => setHistoryModalCycle(null)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={26} color={C.muted} />
              </Pressable>
            </View>
            <Text style={styles.modalSub}>Who paid what</Text>
            {historyModalCycle?.lines.map((line) => (
              <View key={line.memberId} style={styles.modalLine}>
                <Text style={styles.modalLineName} numberOfLines={1}>
                  {line.displayName}
                </Text>
                <Text style={styles.modalLineAmt}>{fmtCents(line.amountCents)}</Text>
                <View
                  style={[
                    styles.statusBadge,
                    { backgroundColor: line.paid ? '#E1F5EE' : C.cream },
                  ]}
                >
                  <Text
                    style={[
                      styles.statusBadgeTxt,
                      { color: line.paid ? C.greenDark : C.amber },
                    ]}
                  >
                    {line.paid ? 'Paid' : 'Unpaid'}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </Pressable>
      </Modal>

      {endSplitSheetModel ? (
        <EndSplitConfirmSheet
          visible={endSplitSheetOpen}
          onClose={() => {
            if (!endSplitBusy) setEndSplitSheetOpen(false);
          }}
          onConfirm={handleConfirmEndSplit}
          subscriptionName={endSplitSheetModel.subscriptionName}
          settingsSavedLine={endSplitSheetModel.settingsSavedLine}
          membersNotifiedCount={endSplitSheetModel.membersNotifiedCount}
          pendingWarning={endSplitSheetModel.pendingWarning}
          confirming={endSplitBusy}
        />
      ) : null}

      {leaveSplitSheetModel ? (
        <LeaveSplitConfirmSheet
          visible={leaveSheetOpen}
          onClose={() => {
            if (!leaveBusy) setLeaveSheetOpen(false);
          }}
          onConfirm={handleConfirmLeaveSplit}
          subscriptionName={leaveSplitSheetModel.subscriptionName}
          yourShareMonthlyFormatted={leaveSplitSheetModel.yourShareMonthlyFormatted}
          currentCycleNote={leaveSplitSheetModel.currentCycleNote}
          ownerName={leaveSplitSheetModel.ownerName}
          owedWarning={leaveSplitSheetModel.owedWarning}
          confirming={leaveBusy}
        />
      ) : null}
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
    paddingHorizontal: 18,
    paddingBottom: 28,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
  },
  backBtn: {
    paddingVertical: 4,
    paddingRight: 8,
  },
  heroTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  heroTopSpacer: {
    width: 34,
  },
  heroIconWrap: {
    alignItems: 'center',
    marginBottom: 12,
  },
  heroTotal: {
    fontSize: 32,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    letterSpacing: -0.5,
    width: '100%',
    alignSelf: 'stretch',
  },
  heroCycle: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.72)',
    textAlign: 'center',
    marginTop: 4,
  },
  heroNext: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
    marginTop: 8,
  },
  heroTitleEnded: {
    color: 'rgba(255,255,255,0.4)',
  },
  heroTotalEnded: {
    color: 'rgba(255,255,255,0.3)',
  },
  heroEndedLine: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.25)',
    textAlign: 'center',
    marginTop: 6,
  },
  readOnlyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 10,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignSelf: 'center',
    opacity: 0.85,
  },
  readOnlyBadgeTxt: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.22)',
    fontWeight: '500',
  },
  endedInfoRow: {
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  endedInfoTxt: {
    fontSize: 13,
    color: C.muted,
    lineHeight: 18,
  },
  ownerNoticeBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: C.amberBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(180, 83, 9, 0.22)',
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  ownerNoticeIcon: {
    marginTop: 2,
  },
  ownerNoticeTxt: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: C.amber,
    lineHeight: 20,
  },
  ownerNoticeDismiss: {
    fontSize: 13,
    fontWeight: '600',
    color: C.editLink,
  },
  ownerRebalanceBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#F0EEE9',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  ownerRebalanceTxt: {
    flex: 1,
    fontSize: 14,
    color: C.muted,
    lineHeight: 20,
  },
  splitPipEndedMuted: {
    opacity: 0.7,
  },
  cardEnded: {
    opacity: 0.45,
  },
  splitTextEnded: {
    color: C.muted,
  },
  splitPipEnded: {
    opacity: 0.85,
  },
  heroBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
  },
  ownerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 10,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  ownerBadgeTxt: {
    fontSize: 13,
    fontWeight: '500',
    color: '#EDE9FE',
  },
  autoOnBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E1F5EE',
    borderRadius: 10,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  autoOnBadgeTxt: {
    fontSize: 13,
    fontWeight: '600',
    color: C.greenDark,
  },
  autoOffBadge: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 10,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  autoOffBadgeTxt: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.75)',
  },
  body: {
    paddingHorizontal: 14,
    marginTop: -12,
  },
  declinedBanner: {
    backgroundColor: C.amberBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(180, 83, 9, 0.22)',
    padding: 14,
    marginBottom: 14,
  },
  declinedBannerTextCol: {
    marginBottom: 10,
  },
  declinedBannerTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: C.amber,
    marginBottom: 4,
  },
  declinedBannerSub: {
    fontSize: 13,
    color: C.muted,
    lineHeight: 18,
  },
  declinedBannerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
  },
  declinedBannerBtn: {
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  declinedBannerBtnPressed: {
    opacity: 0.75,
  },
  declinedBannerBtnTxt: {
    fontSize: 14,
    fontWeight: '600',
    color: C.purple,
  },
  declinedBannerDismiss: {
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  declinedBannerDismissTxt: {
    fontSize: 14,
    fontWeight: '500',
    color: C.muted,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    borderWidth: 0.5,
    borderColor: C.border,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '600',
    color: C.muted,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  splitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: C.divider,
  },
  pendingMemberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: C.divider,
  },
  pendingAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#D3D1C7',
    backgroundColor: '#F0EEE9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberInfo: {
    flex: 1,
    minWidth: 0,
  },
  pendingName: {
    fontSize: 15,
    fontWeight: '500',
    color: C.muted,
  },
  pendingSub: {
    fontSize: 13,
    color: C.muted,
    marginTop: 2,
  },
  expiredSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
  },
  expiredPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: '#FCEBEB',
  },
  expiredPillTxt: {
    fontSize: 11,
    fontWeight: '600',
    color: '#A32D2D',
  },
  pendingActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  resendPill: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#F0EEE9',
  },
  resendPillPressed: {
    opacity: 0.7,
  },
  resendPillTxt: {
    fontSize: 12,
    fontWeight: '600',
    color: C.muted,
  },
  removeInviteTxt: {
    fontSize: 13,
    fontWeight: '600',
    color: C.red,
  },
  ownerCoverageBlock: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.divider,
    gap: 8,
  },
  ownerCoverageTxt: {
    fontSize: 12,
    color: C.muted,
    lineHeight: 18,
  },
  splitPip: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  splitPipPhoto: {
    backgroundColor: '#E8E6E1',
    overflow: 'hidden',
  },
  splitPipImg: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  splitPipTxt: {
    fontSize: 13,
    fontWeight: '600',
  },
  splitPipPending: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#C4C2BC',
    backgroundColor: '#FAFAF8',
  },
  splitRowMid: {
    flex: 1,
    minWidth: 0,
  },
  splitName: {
    fontSize: 16,
    fontWeight: '600',
    color: C.text,
  },
  splitPct: {
    fontSize: 13,
    color: C.muted,
    marginTop: 2,
  },
  splitRowRight: {
    alignItems: 'flex-end',
    gap: 6,
    flexShrink: 1,
    minWidth: 0,
    maxWidth: '44%',
  },
  resendBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: C.purpleTint,
  },
  resendBtnPressed: {
    opacity: 0.75,
  },
  resendBtnTxt: {
    fontSize: 13,
    fontWeight: '600',
    color: C.purple,
  },
  splitAmt: {
    fontSize: 16,
    fontWeight: '600',
    color: C.text,
    width: '100%',
    textAlign: 'right',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusBadgeTxt: {
    fontSize: 11,
    fontWeight: '600',
  },
  progTrack: {
    height: 4,
    backgroundColor: C.divider,
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 14,
  },
  progFill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: C.green,
  },
  progCaption: {
    fontSize: 12,
    color: C.muted,
    marginTop: 8,
    lineHeight: 17,
    width: '100%',
  },
  editLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    alignSelf: 'stretch',
    gap: 4,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.06)',
  },
  editLinkRowPressed: {
    opacity: 0.65,
  },
  editLinkTxt: {
    fontSize: 12,
    fontWeight: '500',
    color: C.editLink,
    letterSpacing: 0.1,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: C.divider,
    gap: 8,
  },
  historyMonth: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    fontWeight: '500',
    color: C.text,
  },
  historyTotalWrap: {
    flexShrink: 1,
    minWidth: 0,
    maxWidth: '38%',
    marginRight: 4,
    alignItems: 'flex-end',
  },
  historyTotal: {
    fontSize: 15,
    fontWeight: '600',
    color: C.text,
    width: '100%',
    textAlign: 'right',
  },
  historyPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  historyPillPaid: {
    backgroundColor: '#E1F5EE',
  },
  historyPillPartial: {
    backgroundColor: C.amberBg,
  },
  historyPillTxt: {
    fontSize: 12,
    fontWeight: '600',
    color: C.amber,
  },
  historyPillTxtPaid: {
    color: C.greenDark,
  },
  actionsBlock: {
    gap: 10,
    marginTop: 4,
    marginBottom: 8,
  },
  manageSectionLbl: {
    fontSize: 12,
    fontWeight: '600',
    color: C.muted,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  actionCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: 'rgba(226,75,74,0.2)',
    paddingVertical: 15,
    alignItems: 'center',
  },
  actionTextDanger: {
    fontSize: 16,
    fontWeight: '500',
    color: C.red,
  },
  actionBtn: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: C.border,
    paddingVertical: 15,
    alignItems: 'center',
  },
  actionBtnTxt: {
    fontSize: 16,
    fontWeight: '500',
    color: C.text,
  },
  actionBtnDanger: {
    borderColor: 'rgba(226,75,74,0.35)',
  },
  actionBtnDangerTxt: {
    color: C.red,
    fontWeight: '600',
  },
  unknownRoot: {
    flex: 1,
    backgroundColor: C.bg,
    paddingHorizontal: 24,
  },
  unknownBack: {
    alignSelf: 'flex-start',
    marginBottom: 20,
  },
  unknownTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: C.text,
    marginBottom: 8,
  },
  unknownSub: {
    fontSize: 16,
    color: C.muted,
    lineHeight: 22,
    marginBottom: 16,
  },
  unknownTech: {
    fontSize: 12,
    color: C.muted,
    lineHeight: 18,
    marginBottom: 16,
    fontFamily: 'monospace',
  },
  unknownPrimaryBtn: {
    alignSelf: 'flex-start',
    backgroundColor: C.purple,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 10,
  },
  unknownPrimaryBtnTxt: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  unknownSecondaryBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  unknownSecondaryBtnTxt: {
    fontSize: 16,
    fontWeight: '600',
    color: C.purple,
  },
  loadingRoot: {
    flex: 1,
    backgroundColor: C.bg,
  },
  loadingTopBar: {
    paddingHorizontal: 24,
    backgroundColor: C.bg,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 18,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: C.text,
  },
  modalSub: {
    fontSize: 14,
    color: C.muted,
    marginBottom: 12,
  },
  modalLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: C.divider,
  },
  modalLineName: {
    flex: 1,
    fontSize: 15,
    color: C.text,
  },
  modalLineAmt: {
    fontSize: 15,
    fontWeight: '600',
    color: C.text,
    marginRight: 4,
  },
});
