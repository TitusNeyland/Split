import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  Modal,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { fmtCents } from '../../../lib/subscription/addSubscriptionSplitMath';
import { getFirebaseAuth, isFirebaseConfigured } from '../../../lib/firebase';
import {
  createSubscriptionFromWizard,
  runSubscriptionWizardSideEffects,
  type WizardMemberRow,
  type WizardSplitMethod,
} from '../../../lib/subscription/createSubscriptionWizardFirestore';
import { attachSplitInvitesToSubscription } from '../../../lib/subscription/splitInviteAttachments';
import {
  billingWhenForSentence,
  formatFirstChargeDateLong,
  formatFirstChargeDateShort,
  getNextFirstChargeDate,
} from '../../../lib/subscription/billingDayFormat';
import { getServiceIconBackgroundColor, ServiceIcon } from '../../../components/shared/ServiceIcon';
import { UserAvatarCircle } from '../../../components/shared/UserAvatarCircle';
import { useProfileAvatarUrl } from '../../../hooks/useProfileAvatarUrl';

function formatCreateSplitError(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'object' && e !== null) {
    const o = e as { code?: unknown; message?: unknown };
    if (typeof o.message === 'string') {
      const code = typeof o.code === 'string' ? o.code : '';
      return code ? `${code}: ${o.message}` : o.message;
    }
  }
  return typeof e === 'string' ? e : 'Unknown error';
}

const C = {
  purple: '#534AB7',
  purpleTint: '#EEEDFE',
  text: '#1a1a18',
  muted: '#888780',
  bg: '#F2F0EB',
  green: '#1D9E75',
  greenDark: '#0F6E56',
  cardBorder: 'rgba(0,0,0,0.06)',
  divider: '#F5F3EE',
  shareBlue: '#2563EB',
  modalSummaryBg: '#F0EEEA',
  warnBg: '#FAEDDD',
  warnText: '#6B4423',
  modalBtnGray: '#E8E6E2',
};

type ReviewMember = WizardMemberRow;

function parseMembersJson(raw: string | undefined): ReviewMember[] {
  if (typeof raw !== 'string' || raw === '') return [];
  try {
    const decoded = decodeURIComponent(raw);
    const data = JSON.parse(decoded) as { members?: ReviewMember[] };
    if (!Array.isArray(data.members)) return [];
    return data.members.map((m) => ({
      memberId: String(m.memberId ?? ''),
      displayName: String(m.displayName ?? ''),
      initials: String(m.initials ?? ''),
      avatarBg: String(m.avatarBg ?? '#EEEDFE'),
      avatarColor: String(m.avatarColor ?? C.purple),
      avatarUrl:
        typeof m.avatarUrl === 'string' && m.avatarUrl.trim()
          ? m.avatarUrl.trim()
          : m.avatarUrl === null
            ? null
            : undefined,
      role: m.role === 'owner' ? 'owner' : 'member',
      percent: typeof m.percent === 'number' && Number.isFinite(m.percent) ? m.percent : 0,
      amountCents:
        typeof m.amountCents === 'number' && Number.isFinite(m.amountCents) ? m.amountCents : 0,
      invitePending: m.invitePending === true,
      pendingInviteEmail:
        typeof m.pendingInviteEmail === 'string' && m.pendingInviteEmail.trim()
          ? m.pendingInviteEmail.trim().toLowerCase()
          : undefined,
    }));
  } catch {
    return [];
  }
}

function splitMethodLabel(method: string): string {
  switch (method) {
    case 'equal':
      return 'Equal';
    case 'custom_percent':
      return 'Custom %';
    case 'fixed_amount':
      return 'Fixed $';
    case 'owner_less':
      return 'Owner less';
    default:
      return method || '—';
  }
}

function splitMethodSubtitle(method: string): string {
  switch (method) {
    case 'equal':
      return 'equal split';
    case 'custom_percent':
      return 'custom % split';
    case 'fixed_amount':
      return 'fixed $ split';
    case 'owner_less':
      return 'owner-less split';
    default:
      return 'split';
  }
}

function isWizardSplitMethod(s: string): s is WizardSplitMethod {
  return (
    s === 'equal' ||
    s === 'custom_percent' ||
    s === 'fixed_amount' ||
    s === 'owner_less'
  );
}

function formatPercent(p: number): string {
  if (Number.isInteger(p) || Math.abs(p - Math.round(p)) < 1e-6) return `${Math.round(p)}%`;
  return `${p.toFixed(1)}%`;
}

function inviteFirstNames(members: ReviewMember[]): string {
  const parts = members
    .filter((m) => m.role !== 'owner')
    .map((m) => {
      const s = m.displayName.trim();
      const cut = s.split(/[\s.]+/)[0];
      return cut || s;
    });
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0]!;
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
}

export default function AddSubscriptionReviewScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { avatarUrl: profileAvatarUrl } = useProfileAvatarUrl();
  const ownerUid = getFirebaseAuth()?.currentUser?.uid ?? null;
  const params = useLocalSearchParams<{
    serviceName?: string;
    serviceId?: string;
    iconColor?: string;
    planName?: string;
    totalCents?: string;
    billingCycle?: string;
    billingDay?: string;
    payerDisplay?: string;
    autoCharge?: string;
    splitMethod?: string;
    membersReviewJson?: string;
  }>();

  const serviceName = typeof params.serviceName === 'string' ? params.serviceName.trim() : '';
  const serviceIdParam = typeof params.serviceId === 'string' ? params.serviceId.trim() : '';
  const planName = typeof params.planName === 'string' ? params.planName.trim() : '';
  const iconColor =
    typeof params.iconColor === 'string' && /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(params.iconColor.trim())
      ? params.iconColor.trim()
      : getServiceIconBackgroundColor(serviceName || planName || 'Subscription');
  const totalCentsRaw = typeof params.totalCents === 'string' ? parseInt(params.totalCents, 10) : NaN;
  const totalCents = Number.isFinite(totalCentsRaw) && totalCentsRaw >= 0 ? totalCentsRaw : 0;
  const billingCycle: 'monthly' | 'yearly' =
    typeof params.billingCycle === 'string' && params.billingCycle === 'yearly'
      ? 'yearly'
      : 'monthly';
  const billingDay = typeof params.billingDay === 'string' ? params.billingDay : '';
  const payerDisplay =
    typeof params.payerDisplay === 'string' && params.payerDisplay.trim()
      ? params.payerDisplay.trim()
      : 'Me (owner)';
  const autoCharge = params.autoCharge !== '0';
  const splitMethodRaw = typeof params.splitMethod === 'string' ? params.splitMethod : '';

  const members = useMemo(
    () => parseMembersJson(params.membersReviewJson),
    [params.membersReviewJson],
  );

  const splitMethod: WizardSplitMethod = isWizardSplitMethod(splitMethodRaw)
    ? splitMethodRaw
    : 'equal';

  const [saving, setSaving] = useState(false);
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);

  const cycleLine = useMemo(() => {
    const c = fmtCents(totalCents);
    return billingCycle === 'yearly' ? `${c} / year` : `${c} / month`;
  }, [totalCents, billingCycle]);

  const inviteLine = useMemo(() => {
    const names = inviteFirstNames(members);
    const when = billingWhenForSentence(billingCycle, billingDay);
    if (!names) {
      return autoCharge
        ? `Members you add will be invited to this split. With auto-charge on, they'll be charged on ${when}.`
        : `Members you add will be invited to this split. You'll request payment manually each cycle.`;
    }
    return autoCharge
      ? `Invites will be sent to ${names}. They'll be charged automatically on ${when}.`
      : `Invites will be sent to ${names}. You'll need to request payment manually each cycle.`;
  }, [members, billingCycle, billingDay, autoCharge]);

  const displayServiceName = planName || serviceName || 'Subscription';
  const nonOwnerInviteCount = useMemo(
    () => members.filter((m) => m.role !== 'owner').length,
    [members],
  );

  const firstChargeDate = useMemo(
    () => getNextFirstChargeDate(billingCycle, billingDay),
    [billingCycle, billingDay],
  );

  const firstChargeDateLabel = useMemo(() => {
    if (!firstChargeDate) return '—';
    return formatFirstChargeDateLong(firstChargeDate);
  }, [firstChargeDate]);

  const confirmWarningCopy = useMemo(() => {
    const n = nonOwnerInviteCount;
    const people = n === 1 ? 'member' : 'members';
    const whenShort = firstChargeDate
      ? formatFirstChargeDateShort(firstChargeDate)
      : billingWhenForSentence(billingCycle, billingDay);
    if (n === 0) {
      return autoCharge
        ? `No other members will be invited. You will be charged automatically on ${whenShort}. This cannot be undone.`
        : `No other members will be invited. Next billing: ${whenShort}. This cannot be undone.`;
    }
    if (autoCharge) {
      return `${n} ${people} will be invited and charged automatically on ${whenShort}. This cannot be undone.`;
    }
    return `${n} ${people} will be invited. Next billing: ${whenShort}. This cannot be undone.`;
  }, [nonOwnerInviteCount, firstChargeDate, billingCycle, billingDay, autoCharge]);

  const ownerShareLine = useMemo(() => {
    const owner = members.find((m) => m.role === 'owner');
    if (!owner) return '—';
    const c = fmtCents(owner.amountCents);
    return billingCycle === 'yearly' ? `${c} / year` : `${c} / month`;
  }, [members, billingCycle]);

  const onEditDetails = useCallback(() => {
    router.replace({
      pathname: '/add-subscription/details',
      params: {
        serviceName,
        ...(serviceIdParam ? { serviceId: serviceIdParam } : {}),
        iconColor,
        planName: planName || serviceName,
        totalCents: String(totalCents),
        billingCycle,
        billingDay,
        autoCharge: autoCharge ? '1' : '0',
      },
    });
  }, [router, serviceName, serviceIdParam, iconColor, planName, totalCents, billingCycle, billingDay, autoCharge]);

  /** Preview the success screen when Firestore is not available (no document written). */
  const navigateToSplitCreated = useCallback(() => {
    const invited = members.filter((m) => m.role === 'member');
    const inviteAvatars = invited.slice(0, 6).map((m) => ({
      initials: m.initials,
      avatarBg: m.avatarBg,
      avatarColor: m.avatarColor,
    }));
    router.replace({
      pathname: '/split-created',
      params: {
        planName: planName || serviceName || 'Subscription',
        totalCents: String(totalCents),
        billingCycle,
        inviteCount: String(invited.length),
        inviteAvatarsJson: encodeURIComponent(JSON.stringify(inviteAvatars)),
      },
    });
  }, [members, planName, serviceName, totalCents, billingCycle, router]);

  const executeCreateSplit = useCallback(async () => {
    setSaving(true);
    try {
      if (!isFirebaseConfigured()) {
        navigateToSplitCreated();
        return;
      }

      const auth = getFirebaseAuth();
      const uid = auth?.currentUser?.uid;
      if (!uid) {
        Alert.alert('Sign in required', 'Sign in to create a subscription split.');
        return;
      }

      const input = {
        actorUid: uid,
        serviceName: serviceName || planName || 'Subscription',
        ...(serviceIdParam ? { serviceId: serviceIdParam } : {}),
        planName: planName || serviceName || 'Subscription',
        iconColor,
        totalCents,
        billingCycle,
        billingDay: billingDay.trim() || '—',
        payerDisplay,
        autoCharge,
        splitMethod,
        members,
      };
      const id = await createSubscriptionFromWizard(input);
      await attachSplitInvitesToSubscription(id, input);
      await runSubscriptionWizardSideEffects(id, input);
      navigateToSplitCreated();
    } catch (e) {
      console.error('create split failed', e);
      Alert.alert('Could not create split', formatCreateSplitError(e));
    } finally {
      setSaving(false);
    }
  }, [
    totalCents,
    members,
    serviceName,
    planName,
    serviceIdParam,
    iconColor,
    billingCycle,
    billingDay,
    payerDisplay,
    autoCharge,
    splitMethod,
    navigateToSplitCreated,
  ]);

  const onRequestCreateSplit = useCallback(() => {
    if (totalCents <= 0 || members.length === 0) {
      Alert.alert('Incomplete split', 'Go back and finish plan cost and members.');
      return;
    }

    if (isFirebaseConfigured()) {
      const auth = getFirebaseAuth();
      if (!auth?.currentUser?.uid) {
        Alert.alert('Sign in required', 'Sign in to create a subscription split.');
        return;
      }
    }

    setConfirmModalVisible(true);
  }, [totalCents, members.length]);

  const onDismissConfirmModal = useCallback(() => {
    if (!saving) setConfirmModalVisible(false);
  }, [saving]);

  const onConfirmSplitFromModal = useCallback(() => {
    setConfirmModalVisible(false);
    void executeCreateSplit();
  }, [executeCreateSplit]);

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <LinearGradient
        colors={['#6B3FA0', '#4A1570', '#2D0D45']}
        locations={[0, 0.6, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={[styles.hero, { paddingTop: Math.max(insets.top, 12) + 4 }]}
      >
        <Pressable
          onPress={() => router.back()}
          style={styles.backRow}
          accessibilityRole="button"
          accessibilityLabel="Back to split setup"
        >
          <Ionicons name="chevron-back" size={26} color="rgba(255,255,255,0.7)" />
          <Text style={styles.backLbl}>Back</Text>
        </Pressable>
        <Text style={styles.title}>Review split</Text>
        <Text style={styles.sub}>Confirm everything looks right</Text>
        <View style={styles.progWrap}>
          <View style={styles.progTrack}>
            <View style={[styles.progFill, { width: '95%' }]} />
          </View>
          <Text style={styles.progLabel}>Step 4 of 4</Text>
        </View>
      </LinearGradient>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.body,
          { paddingBottom: Math.max(insets.bottom, 16) + 140 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionLbl}>Subscription</Text>
        <View style={styles.card}>
          <View style={styles.reviewRow}>
            <Text style={styles.rvLbl}>Service</Text>
            <View style={styles.serviceVal}>
              <ServiceIcon
                serviceName={serviceName || planName || 'Subscription'}
                serviceId={serviceIdParam || undefined}
                size={32}
              />
              <Text style={styles.rvVal} numberOfLines={2}>
                {planName || serviceName || '—'}
              </Text>
            </View>
          </View>
          <View style={styles.reviewRow}>
            <Text style={styles.rvLbl}>Total cost</Text>
            <Text style={styles.rvVal}>{cycleLine}</Text>
          </View>
          <View style={styles.reviewRow}>
            <Text style={styles.rvLbl}>Billing date</Text>
            <Text style={styles.rvVal}>
              {billingDay.trim() ? billingDay : '—'}
            </Text>
          </View>
          <View style={styles.reviewRow}>
            <Text style={styles.rvLbl}>Auto-charge</Text>
            <Text
              style={[
                styles.rvVal,
                autoCharge ? styles.autoOn : styles.autoOff,
              ]}
            >
              {autoCharge ? 'On ✓' : 'Off'}
            </Text>
          </View>
          <View style={[styles.reviewRow, styles.reviewRowLast]}>
            <Text style={styles.rvLbl}>Split method</Text>
            <Text style={[styles.rvVal, styles.rvValPurple]}>{splitMethodLabel(splitMethodRaw)}</Text>
          </View>
        </View>

        <Text style={[styles.sectionLbl, styles.sectionSpaced]}>Members</Text>
        <View style={styles.card}>
          {members.map((m, i) => {
            const isLast = i === members.length - 1;
            return (
              <View key={m.memberId || String(i)} style={[styles.memRow, isLast && styles.memRowLast]}>
                <View style={styles.memAv}>
                  <UserAvatarCircle
                    size={36}
                    uid={
                      m.memberId.startsWith('invite-email-')
                        ? null
                        : m.role === 'owner'
                          ? ownerUid
                          : m.memberId
                    }
                    initials={m.initials}
                    imageUrl={m.role === 'owner' ? profileAvatarUrl : m.avatarUrl}
                    initialsBackgroundColor={m.avatarBg}
                    initialsTextColor={m.avatarColor}
                  />
                </View>
                <View style={styles.memMeta}>
                  <View style={styles.nameRow}>
                    <Text style={styles.memName} numberOfLines={1}>
                      {m.displayName}
                    </Text>
                    {m.role === 'owner' ? (
                      <View style={styles.ownerBadge}>
                        <Text style={styles.ownerBadgeTxt}>Owner</Text>
                      </View>
                    ) : null}
                  </View>
                  {m.role !== 'owner' && m.invitePending ? (
                    <Text style={styles.memPending}>Invited · pending</Text>
                  ) : null}
                </View>
                <Text style={styles.memPct}>{formatPercent(m.percent)}</Text>
                <Text style={styles.memAmt}>{fmtCents(m.amountCents)}</Text>
              </View>
            );
          })}
        </View>

        <View style={styles.infoBanner}>
          <Ionicons name="information-circle-outline" size={20} color={C.purple} style={styles.infoIco} />
          <Text style={styles.infoTxt}>{inviteLine}</Text>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 14) }]}>
        <Pressable
          onPress={onRequestCreateSplit}
          disabled={saving}
          style={({ pressed }) => [
            styles.primaryBtn,
            saving && styles.primaryBtnDisabled,
            pressed && !saving && styles.primaryBtnPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Create split and notify members"
        >
          {saving ? (
            <View style={styles.primaryBtnLoadingRow}>
              <ActivityIndicator color="#fff" />
              <Text style={styles.primaryBtnTxt}>Creating…</Text>
            </View>
          ) : (
            <Text style={styles.primaryBtnTxt}>Create split · notify members</Text>
          )}
        </Pressable>
        <Pressable
          onPress={onEditDetails}
          disabled={saving}
          style={styles.ghostBtn}
          accessibilityRole="button"
          accessibilityLabel="Edit plan details"
        >
          <Text style={styles.ghostBtnTxt}>Edit details</Text>
        </Pressable>
      </View>

      <Modal
        visible={confirmModalVisible}
        transparent
        animationType="fade"
        onRequestClose={onDismissConfirmModal}
      >
        <View style={styles.modalRoot}>
          <Pressable
            style={styles.modalBackdrop}
            onPress={onDismissConfirmModal}
            accessibilityLabel="Dismiss"
          />
          <View style={[styles.modalSheet, { marginBottom: Math.max(insets.bottom, 8) }]}>
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              bounces={false}
            >
              <View style={styles.modalShieldWrap}>
                <View style={styles.modalShieldCircle}>
                  <Ionicons name="shield-checkmark" size={28} color={C.purple} />
                </View>
              </View>
              <Text style={styles.modalTitle}>Confirm this split?</Text>

              <View style={styles.modalSummaryCard}>
                <View style={styles.modalServiceRow}>
                  <ServiceIcon
                    serviceName={serviceName || planName || 'Subscription'}
                    serviceId={serviceIdParam || undefined}
                    size={44}
                  />
                  <View style={styles.modalServiceTxt}>
                    <Text style={styles.modalServiceName} numberOfLines={2}>
                      {displayServiceName}
                    </Text>
                    <Text style={styles.modalServiceSub} numberOfLines={2}>
                      {cycleLine} · {splitMethodSubtitle(splitMethodRaw)}
                    </Text>
                  </View>
                </View>

                <View style={styles.modalDetailRow}>
                  <Text style={styles.modalDetailLbl}>Members</Text>
                  <View style={styles.modalAvatarStack}>
                    {members.slice(0, 6).map((m, i) => (
                      <View
                        key={m.memberId || String(i)}
                        style={[styles.modalStackAv, { marginLeft: i > 0 ? -9 : 0, zIndex: 20 - i }]}
                      >
                        <UserAvatarCircle
                          size={28}
                          uid={
                            m.memberId.startsWith('invite-email-')
                              ? null
                              : m.role === 'owner'
                                ? ownerUid
                                : m.memberId
                          }
                          initials={m.initials}
                          imageUrl={m.role === 'owner' ? profileAvatarUrl : m.avatarUrl}
                          initialsBackgroundColor={m.avatarBg}
                          initialsTextColor={m.avatarColor}
                        />
                      </View>
                    ))}
                  </View>
                </View>

                <View style={styles.modalDetailRow}>
                  <Text style={styles.modalDetailLbl}>First charge</Text>
                  <Text style={styles.modalDetailValStrong}>{firstChargeDateLabel}</Text>
                </View>

                <View style={styles.modalDetailRow}>
                  <Text style={styles.modalDetailLbl}>Your share</Text>
                  <Text style={styles.modalShareVal}>{ownerShareLine}</Text>
                </View>
              </View>

              <View style={styles.modalWarn}>
                <Ionicons name="time-outline" size={22} color={C.warnText} style={styles.modalWarnIco} />
                <Text style={styles.modalWarnTxt}>{confirmWarningCopy}</Text>
              </View>

              <View style={styles.modalActions}>
                <Pressable
                  onPress={onDismissConfirmModal}
                  disabled={saving}
                  style={({ pressed }) => [
                    styles.modalBtnSecondary,
                    pressed && !saving && styles.modalBtnSecondaryPressed,
                    saving && styles.modalBtnDisabled,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Go back"
                >
                  <Text style={styles.modalBtnSecondaryTxt}>Go back</Text>
                </Pressable>
                <Pressable
                  onPress={onConfirmSplitFromModal}
                  disabled={saving}
                  style={({ pressed }) => [
                    styles.modalBtnPrimary,
                    pressed && !saving && styles.modalBtnPrimaryPressed,
                    saving && styles.modalBtnDisabled,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Yes, create split"
                >
                  <Text style={styles.modalBtnPrimaryTxt}>Yes, create split</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
  },
  hero: {
    paddingHorizontal: 18,
    paddingBottom: 24,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 16,
    alignSelf: 'flex-start',
  },
  backLbl: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.6)',
  },
  title: {
    fontSize: 23,
    fontWeight: '600',
    color: '#fff',
    letterSpacing: -0.3,
  },
  sub: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.55)',
    marginTop: 4,
  },
  progWrap: {
    marginTop: 16,
  },
  progTrack: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: '#fff',
  },
  progLabel: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.45)',
    marginTop: 6,
  },
  scroll: {
    flex: 1,
  },
  body: {
    paddingHorizontal: 16,
    paddingTop: 18,
  },
  sectionLbl: {
    fontSize: 14,
    fontWeight: '600',
    color: C.muted,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  sectionSpaced: {
    marginTop: 20,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: C.cardBorder,
    overflow: 'hidden',
  },
  reviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: C.divider,
    gap: 12,
  },
  reviewRowLast: {
    borderBottomWidth: 0,
  },
  rvLbl: {
    fontSize: 15,
    color: C.muted,
    flexShrink: 0,
  },
  rvVal: {
    fontSize: 15,
    fontWeight: '500',
    color: C.text,
    flex: 1,
    textAlign: 'right',
  },
  rvValPurple: {
    color: C.purple,
    fontWeight: '600',
  },
  autoOn: {
    color: C.green,
    fontWeight: '600',
  },
  autoOff: {
    color: C.muted,
    fontWeight: '500',
  },
  serviceVal: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  memRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: C.divider,
  },
  memRowLast: {
    borderBottomWidth: 0,
  },
  memAv: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memAvTxt: {
    fontSize: 11,
    fontWeight: '600',
  },
  memMeta: {
    flex: 1,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  memName: {
    fontSize: 15,
    fontWeight: '500',
    color: C.text,
    flexShrink: 1,
  },
  ownerBadge: {
    backgroundColor: C.purpleTint,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  ownerBadgeTxt: {
    fontSize: 11,
    fontWeight: '600',
    color: C.purple,
  },
  memPending: {
    fontSize: 12,
    color: C.muted,
    marginTop: 4,
  },
  memPct: {
    fontSize: 14,
    color: C.muted,
    width: 44,
    textAlign: 'right',
  },
  memAmt: {
    fontSize: 15,
    fontWeight: '600',
    color: C.text,
    width: 64,
    textAlign: 'right',
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: C.purpleTint,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginTop: 16,
  },
  infoIco: {
    marginTop: 1,
  },
  infoTxt: {
    flex: 1,
    fontSize: 14,
    color: C.purple,
    lineHeight: 20,
    fontWeight: '500',
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: C.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.06)',
    gap: 8,
  },
  primaryBtn: {
    width: '100%',
    paddingVertical: 16,
    backgroundColor: C.purple,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 54,
  },
  primaryBtnDisabled: {
    opacity: 0.7,
  },
  primaryBtnPressed: {
    opacity: 0.92,
  },
  primaryBtnLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  primaryBtnTxt: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
  },
  ghostBtn: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: '#D3D1C7',
    alignItems: 'center',
  },
  ghostBtnTxt: {
    fontSize: 16,
    fontWeight: '500',
    color: C.text,
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.52)',
  },
  modalSheet: {
    backgroundColor: '#fff',
    borderRadius: 22,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 20,
    maxWidth: 400,
    width: '100%',
    alignSelf: 'center',
    zIndex: 1,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 28,
    elevation: 12,
  },
  modalShieldWrap: {
    alignItems: 'center',
    marginBottom: 14,
  },
  modalShieldCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: C.purpleTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: C.text,
    textAlign: 'center',
    letterSpacing: -0.35,
    marginBottom: 18,
  },
  modalSummaryCard: {
    backgroundColor: C.modalSummaryBg,
    borderRadius: 14,
    padding: 14,
    gap: 14,
  },
  modalServiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  modalServiceTxt: {
    flex: 1,
    minWidth: 0,
  },
  modalServiceName: {
    fontSize: 17,
    fontWeight: '700',
    color: C.text,
    letterSpacing: -0.2,
  },
  modalServiceSub: {
    fontSize: 14,
    color: C.muted,
    marginTop: 4,
    lineHeight: 19,
  },
  modalDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.08)',
  },
  modalDetailLbl: {
    fontSize: 15,
    color: C.muted,
    fontWeight: '500',
  },
  modalDetailValStrong: {
    fontSize: 15,
    fontWeight: '700',
    color: C.text,
  },
  modalShareVal: {
    fontSize: 15,
    fontWeight: '700',
    color: C.shareBlue,
  },
  modalAvatarStack: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modalStackAv: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalStackAvTxt: {
    fontSize: 11,
    fontWeight: '700',
  },
  modalWarn: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: C.warnBg,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginTop: 16,
  },
  modalWarnIco: {
    marginTop: 1,
  },
  modalWarnTxt: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: C.warnText,
    lineHeight: 20,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
  modalBtnSecondary: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 15,
    borderRadius: 12,
    backgroundColor: C.modalBtnGray,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnSecondaryPressed: {
    opacity: 0.88,
  },
  modalBtnSecondaryTxt: {
    fontSize: 16,
    fontWeight: '600',
    color: C.text,
  },
  modalBtnPrimary: {
    flex: 2,
    minWidth: 0,
    paddingVertical: 15,
    borderRadius: 12,
    backgroundColor: C.purple,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnPrimaryPressed: {
    opacity: 0.92,
  },
  modalBtnPrimaryTxt: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  modalBtnDisabled: {
    opacity: 0.45,
  },
});
