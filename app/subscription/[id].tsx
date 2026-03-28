import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Modal,
  Image,
  Alert,
  Share,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { ServiceIcon } from '../components/shared/ServiceIcon';
import { SubscriptionDetailSkeleton } from '../components/subscriptions/SubscriptionDetailSkeleton';
import { SubscriptionSplitEditor } from '../components/subscriptions/SubscriptionSplitEditor';
import { spacing } from '../../constants/theme';
import { SUBSCRIPTIONS_DEMO_MODE } from '../../lib/subscription/subscriptionsScreenDemo';
import {
  getDemoSubscriptionDetail,
  type CyclePaymentStatus,
  type SubscriptionDetailMember,
  type SubscriptionHistoryCycle,
} from '../../lib/subscription/subscriptionDetailDemo';
import { resendSplitInvite } from '../../lib/subscription/resendSplitInvite';
import { buildSplitInviteShareMessage } from '../../lib/friends/inviteLinks';
import { useSubscriptionDetailFromFirestore } from '../../lib/subscription/subscriptionDetailFromFirestore';
import { fmtCents } from '../../lib/subscription/addSubscriptionSplitMath';
import { useFirebaseUid } from '../../lib/auth/useFirebaseUid';
import { useProfileAvatarUrl } from '../hooks/useProfileAvatarUrl';

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

function useNextBillingCycleStart() {
  return useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
}

function daysLeftFromMs(ms: number | null | undefined): number {
  if (!ms || !Number.isFinite(ms)) return 0;
  return Math.max(0, Math.ceil((ms - Date.now()) / (24 * 60 * 60 * 1000)));
}

export default function SubscriptionDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string | string[] }>();
  const subscriptionId = typeof id === 'string' ? id : id?.[0] ?? '';
  const { avatarUrl: userAvatarUrl } = useProfileAvatarUrl();
  const firebaseUid = useFirebaseUid();
  const nextCycleStart = useNextBillingCycleStart();

  const [editorOpen, setEditorOpen] = useState(false);
  const [historyModalCycle, setHistoryModalCycle] = useState<SubscriptionHistoryCycle | null>(null);
  const [detailRetryKey, setDetailRetryKey] = useState(0);
  const [resendBusyId, setResendBusyId] = useState<string | null>(null);

  const demoDetail = useMemo(() => {
    if (!SUBSCRIPTIONS_DEMO_MODE || !subscriptionId) return null;
    return getDemoSubscriptionDetail(subscriptionId, userAvatarUrl);
  }, [subscriptionId, userAvatarUrl]);

  const { detail: liveDetail, loading: liveLoading, error: liveError, errorMessage: liveErrorMessage } =
    useSubscriptionDetailFromFirestore(subscriptionId, firebaseUid, userAvatarUrl, {
      enabled: !SUBSCRIPTIONS_DEMO_MODE,
      retryKey: detailRetryKey,
    });

  const detail = SUBSCRIPTIONS_DEMO_MODE ? demoDetail : liveDetail;

  useEffect(() => {
    if (SUBSCRIPTIONS_DEMO_MODE) return;
    if (!subscriptionId.trim()) {
      console.error('SubscriptionDetail: missing subscription id param');
      router.back();
    }
  }, [subscriptionId, router]);

  const openEditor = useCallback(() => setEditorOpen(true), []);
  const closeEditor = useCallback(() => setEditorOpen(false), []);

  const onDemoAction = (title: string) => {
    Alert.alert(title, 'This action will be available when subscription management is connected.');
  };

  const onResendSplitInvite = useCallback(
    async (m: SubscriptionDetailMember) => {
      if (!firebaseUid || SUBSCRIPTIONS_DEMO_MODE || !m.inviteId || !detail?.isOwner) return;
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

  if (!SUBSCRIPTIONS_DEMO_MODE && subscriptionId.trim() && firebaseUid && liveLoading) {
    return (
      <View style={styles.loadingRoot}>
        <StatusBar style="dark" />
        <View style={[styles.loadingTopBar, { paddingTop: insets.top + 12 }]}>
          <Pressable
            onPress={() => router.back()}
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

  if (!SUBSCRIPTIONS_DEMO_MODE && liveError) {
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
          onPress={() => router.back()}
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
          onPress={() => router.back()}
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

  if (!SUBSCRIPTIONS_DEMO_MODE && !firebaseUid && !liveLoading) {
    return (
      <View style={[styles.unknownRoot, { paddingTop: insets.top + 12 }]}>
        <StatusBar style="dark" />
        <Pressable
          onPress={() => router.back()}
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
          onPress={() => router.back()}
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

  const pctCollected =
    detail.totalCents > 0 ? Math.min(100, Math.round((100 * detail.collectedCents) / detail.totalCents)) : 0;

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + spacing.xl }]}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={['#6B3FA0', '#4A1570', '#2D0D45']}
          locations={[0, 0.55, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={[styles.hero, { paddingTop: Math.max(insets.top, 10) + 4 }]}
        >
          <View style={styles.heroTop}>
            <Pressable
              onPress={() => router.back()}
              style={styles.backBtn}
              accessibilityRole="button"
              accessibilityLabel="Back to subscriptions"
            >
              <Ionicons name="chevron-back" size={26} color="#fff" />
            </Pressable>
            <Text style={styles.heroTitle} numberOfLines={2}>
              {detail.displayName}
            </Text>
            <View style={styles.heroTopSpacer} />
          </View>

          <View style={styles.heroIconWrap}>
            <ServiceIcon serviceName={detail.serviceName} size={52} />
          </View>
          <Text style={styles.heroTotal}>{fmtCents(detail.totalCents)}</Text>
          <Text style={styles.heroCycle}>{detail.billingCycleLabel} billing</Text>
          <Text style={styles.heroNext}>Next billing · {detail.nextBillingLabel}</Text>

          <View style={styles.heroBadges}>
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
          </View>
        </LinearGradient>

        <View style={styles.body}>
          <View style={styles.card}>
            <Text style={styles.sectionHeader}>Split breakdown</Text>
            {detail.members.map((m) => {
              if (m.invitePending) {
                const days = daysLeftFromMs(m.inviteExpiresAtMs);
                const lineName = m.displayName.trim() ? m.displayName : 'Pending invite';
                const sub =
                  days > 0
                    ? `Invite pending · expires in ${days} ${days === 1 ? 'day' : 'days'}`
                    : 'Invite pending';
                return (
                  <View key={m.memberId} style={styles.splitRow}>
                    <View style={[styles.splitPip, styles.splitPipPending]}>
                      <Ionicons name="mail-outline" size={18} color={C.muted} />
                    </View>
                    <View style={styles.splitRowMid}>
                      <Text style={styles.splitName} numberOfLines={1}>
                        {lineName}
                      </Text>
                      <Text style={styles.splitPct}>{sub}</Text>
                    </View>
                    <View style={styles.splitRowRight}>
                      <Text style={styles.splitAmt}>{fmtCents(m.amountCents)}</Text>
                      {detail.isOwner && m.inviteId && !SUBSCRIPTIONS_DEMO_MODE ? (
                        <Pressable
                          onPress={() => void onResendSplitInvite(m)}
                          disabled={resendBusyId === m.memberId}
                          style={({ pressed }) => [styles.resendBtn, pressed && styles.resendBtnPressed]}
                          accessibilityRole="button"
                          accessibilityLabel={`Resend invite to ${lineName}`}
                        >
                          <Text style={styles.resendBtnTxt}>
                            {resendBusyId === m.memberId ? '…' : 'Resend'}
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                );
              }
              const st = statusMeta(m.cycleStatus);
              return (
                <View key={m.memberId} style={styles.splitRow}>
                  {m.avatarUrl ? (
                    <View style={[styles.splitPip, styles.splitPipPhoto]}>
                      <Image
                        source={{ uri: m.avatarUrl }}
                        style={styles.splitPipImg}
                        accessibilityLabel={m.displayName}
                      />
                    </View>
                  ) : (
                    <View style={[styles.splitPip, { backgroundColor: m.avatarBg }]}>
                      <Text style={[styles.splitPipTxt, { color: m.avatarColor }]}>{m.initials}</Text>
                    </View>
                  )}
                  <View style={styles.splitRowMid}>
                    <Text style={styles.splitName} numberOfLines={1}>
                      {m.displayName}
                    </Text>
                    <Text style={styles.splitPct}>{m.percent}%</Text>
                  </View>
                  <View style={styles.splitRowRight}>
                    <Text style={styles.splitAmt}>{fmtCents(m.amountCents)}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: st.bg }]}>
                      <Text style={[styles.statusBadgeTxt, { color: st.fg }]}>{st.label}</Text>
                    </View>
                  </View>
                </View>
              );
            })}
            {detail.isOwner
              ? detail.members
                  .filter((m) => m.invitePending)
                  .map((m) => {
                    const label = m.pendingInviteEmail ?? m.displayName;
                    return (
                      <View key={`invite-banner-${m.memberId}`} style={styles.pendingInviteBanner}>
                        <Ionicons name="information-circle-outline" size={18} color="#B45309" />
                        <Text style={styles.pendingInviteBannerTxt}>
                          {label} hasn&apos;t joined yet. Their share will be charged once they accept.
                        </Text>
                      </View>
                    );
                  })
              : null}
            <View style={styles.progTrack}>
              <View style={[styles.progFill, { width: `${pctCollected}%` }]} />
            </View>
            <Text style={styles.progCaption}>
              {detail.paidMemberCount} of {detail.members.length} members paid · {fmtCents(detail.collectedCents)}{' '}
              collected of {fmtCents(detail.totalCents)} total
            </Text>
            {!editorOpen ? (
              <Pressable
                style={({ pressed }) => [styles.editLinkRow, pressed && styles.editLinkRowPressed]}
                onPress={openEditor}
                hitSlop={{ top: 10, bottom: 10, left: 12, right: 12 }}
                accessibilityRole="button"
                accessibilityLabel="Edit split for next billing cycle"
              >
                <Ionicons name="create-outline" size={14} color={C.editLink} />
                <Text style={styles.editLinkTxt}>Edit split</Text>
              </Pressable>
            ) : (
              <SubscriptionSplitEditor
                subscriptionId={detail.id}
                totalCents={detail.totalCents}
                members={detail.editorMembers}
                nextCycleEffectiveFrom={nextCycleStart}
                skipFirestore={SUBSCRIPTIONS_DEMO_MODE}
                onCancel={closeEditor}
                onSaved={closeEditor}
              />
            )}
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
                <Text style={styles.historyMonth}>{row.label}</Text>
                <Text style={styles.historyTotal}>{fmtCents(row.totalCents)}</Text>
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

          <View style={styles.actionsBlock}>
            <Pressable
              style={styles.actionBtn}
              onPress={() => onDemoAction('Pause subscription')}
              accessibilityRole="button"
            >
              <Text style={styles.actionBtnTxt}>Pause subscription</Text>
            </Pressable>
            <Pressable
              style={styles.actionBtn}
              onPress={() => onDemoAction('Archive subscription')}
              accessibilityRole="button"
            >
              <Text style={styles.actionBtnTxt}>Archive subscription</Text>
            </Pressable>
            {!detail.isOwner ? (
              <Pressable
                style={[styles.actionBtn, styles.actionBtnDanger]}
                onPress={() => onDemoAction('Leave split')}
                accessibilityRole="button"
              >
                <Text style={[styles.actionBtnTxt, styles.actionBtnDangerTxt]}>Leave split</Text>
              </Pressable>
            ) : null}
          </View>
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
  pendingInviteBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: C.amberBg,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginTop: 10,
  },
  pendingInviteBannerTxt: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: C.amber,
    lineHeight: 19,
  },
  splitAmt: {
    fontSize: 16,
    fontWeight: '600',
    color: C.text,
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
    fontSize: 16,
    fontWeight: '500',
    color: C.text,
  },
  historyTotal: {
    fontSize: 15,
    fontWeight: '600',
    color: C.text,
    marginRight: 4,
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
