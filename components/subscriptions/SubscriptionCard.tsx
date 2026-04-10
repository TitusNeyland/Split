import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ServiceIcon } from '../shared/ServiceIcon';
import { UserAvatarCircle } from '../shared/UserAvatarCircle';

const C = {
  purple: '#534AB7',
  editLink: '#6F6699',
  text: '#1a1a18',
  muted: '#888780',
  border: 'rgba(0,0,0,0.06)',
  green: '#1D9E75',
  greenDark: '#0F6E56',
  brown: '#854F0B',
  cream: '#FAEEDA',
  divider: '#F0EEE9',
  amberBanner: '#FDE68A',
  amberBannerText: '#78350F',
  amberOk: '#B45309',
  redMuted: '#A32D2D',
};

export type SubscriptionCardMember = {
  id: string;
  initials: string;
  backgroundColor: string;
  color: string;
  /** Profile image URL (e.g. current user). */
  avatarUrl?: string | null;
  /** Pending invite slot — dashed pip + clock icon. */
  pending?: boolean;
  /** Expired invite slot — dashed pip + alert styling. */
  inviteExpired?: boolean;
};

export type SubscriptionCardProps = {
  /** When set, shows amber price-change banner; OK calls `onDismiss` (may be async). */
  priceChange?: {
    message: string;
    onDismiss: () => void | Promise<void>;
  };
  /** Letter-mark icon from service name (category color, no brand artwork). */
  serviceName: string;
  /** When set, `ServiceIcon` uses Firestore catalog colors/glyph for this preset. */
  serviceId?: string;
  iconSize?: number;
  name: string;
  nameColor?: string;
  /** Cycle and billing date, e.g. "Monthly · Mar 18". */
  cycleLine: string;
  /** Savings amount for this split, e.g. "$24.50"; omit to hide savings display. */
  savedAmount?: string;
  /** User pays the subscription bill. */
  isOwner?: boolean;
  /** Auto-charge: shown as green Auto-on or gray Auto-off; omit both when not applicable. */
  autoCharge?: 'on' | 'off';
  totalAmount: string;
  perPersonAmount: string;
  totalAmountColor?: string;
  members: SubscriptionCardMember[];
  statusPill: {
    backgroundColor: string;
    dotColor: string;
    label: string;
    textColor: string;
  };
  /** e.g. "Today", "7 days"; omit to hide the due chip. */
  dueLabel?: string;
  progress: {
    percentCollected: number;
    collectedLabel: string;
    rightLabel: string;
    /** When true, `rightLabel` uses success green (e.g. "Complete"). */
    isComplete?: boolean;
    rightLabelColor?: string;
    barColor?: string;
  };
  onEditSplitPress?: () => void;
  /** Opens subscription detail when the main card (not the edit row) is pressed. */
  onCardPress?: () => void;
  editSplitButtonLabel?: string;
  /** Inline split editor or other content below the edit row. */
  belowEditSplit?: React.ReactNode;
  hideEditSplit?: boolean;
  /** Roster members still on pending invite (amber pill on Active tab cards). */
  pendingInviteCount?: number;
  /** Ended split: Delete only (hides edit split). */
  splitEndedActions?: {
    onDelete: () => void;
  };
  /** Visual de-emphasis for ended splits on list cards. */
  faded?: boolean;
};

function MemberPip({
  memberUid,
  initials,
  backgroundColor,
  color,
  avatarUrl,
  pending,
  inviteExpired,
}: {
  memberUid?: string;
  initials: string;
  backgroundColor: string;
  color: string;
  avatarUrl?: string | null;
  pending?: boolean;
  inviteExpired?: boolean;
}) {
  if (!inviteExpired && !pending && (avatarUrl || memberUid)) {
    return (
      <View style={[styles.pip, styles.pipPhoto]}>
        <UserAvatarCircle
          size={24}
          uid={memberUid}
          initials={initials}
          imageUrl={avatarUrl}
          initialsBackgroundColor={backgroundColor}
          initialsTextColor={color}
        />
      </View>
    );
  }
  if (inviteExpired) {
    return (
      <View style={styles.pipInviteExpired} accessibilityLabel="Expired invite">
        <Ionicons name="alert-circle-outline" size={12} color={C.redMuted} style={styles.pipPendingIcon} />
      </View>
    );
  }
  if (pending) {
    return (
      <View style={styles.pipPending} accessibilityLabel="Pending invite">
        <Ionicons name="time-outline" size={12} color={C.muted} style={styles.pipPendingIcon} />
      </View>
    );
  }
  return (
    <View style={[styles.pip, { backgroundColor }]}>
      <Text style={[styles.pipTxt, { color }]}>{initials}</Text>
    </View>
  );
}

function CollectionBar({ pct, color }: { pct: number; color: string }) {
  const w = Math.min(100, Math.max(0, pct));
  return (
    <View style={styles.progTrack}>
      <View style={[styles.progFill, { width: `${w}%`, backgroundColor: color }]} />
    </View>
  );
}

export function SubscriptionCard({
  priceChange,
  serviceName,
  serviceId,
  iconSize = 40,
  name,
  nameColor = C.text,
  cycleLine,
  savedAmount,
  isOwner,
  autoCharge,
  totalAmount,
  perPersonAmount,
  totalAmountColor = C.text,
  members,
  statusPill,
  dueLabel,
  progress,
  onEditSplitPress,
  onCardPress,
  editSplitButtonLabel = 'Edit split',
  belowEditSplit,
  hideEditSplit = false,
  pendingInviteCount = 0,
  splitEndedActions,
  faded = false,
}: SubscriptionCardProps) {
  const barColor = progress.barColor ?? C.green;
  const rightColor = progress.isComplete
    ? C.green
    : (progress.rightLabelColor ?? (progress.percentCollected >= 100 ? C.green : C.text));

  const showDue = Boolean(dueLabel && dueLabel.length > 0);

  const mainBlock = (
    <>
      {priceChange ? (
        <View style={styles.priceBanner}>
          <Ionicons name="alert-circle" size={12} color={C.amberOk} />
          <Text style={styles.priceBannerTxt}>{priceChange.message}</Text>
          <Pressable
            onPress={() => void priceChange.onDismiss()}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Dismiss price change notice"
          >
            <Text style={styles.priceBannerDismiss}>OK</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.main}>
        <View style={styles.topRow}>
          <ServiceIcon
            serviceName={serviceName}
            serviceId={serviceId}
            size={iconSize}
            style={styles.serviceIconTile}
          />
          <View style={[styles.topRowRest, faded && styles.fadedContent]}>
            <View style={styles.info}>
              <Text style={[styles.name, { color: nameColor }]}>{name}</Text>
              <Text style={styles.cycle}>
                {cycleLine}
                {savedAmount ? ` · saved ${savedAmount}` : ''}
              </Text>
              {isOwner || autoCharge === 'on' || autoCharge === 'off' ? (
                <View style={styles.badgeRow}>
                  {isOwner ? (
                    <View style={styles.ownerBadge}>
                      <Ionicons name="person-outline" size={10} color={C.purple} />
                      <Text style={styles.ownerBadgeTxt}>You pay</Text>
                    </View>
                  ) : null}
                  {autoCharge === 'on' ? (
                    <View style={styles.autoOnBadge}>
                      <Ionicons name="checkmark" size={10} color={C.greenDark} />
                      <Text style={styles.autoOnBadgeTxt}>Auto-on</Text>
                    </View>
                  ) : null}
                  {autoCharge === 'off' ? (
                    <View style={styles.autoOffBadge}>
                      <Text style={styles.autoOffBadgeTxt}>Auto-off</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
            <View>
              <Text style={[styles.total, { color: totalAmountColor }]}>{totalAmount}</Text>
              <Text style={styles.perPerson}>{perPersonAmount}</Text>
            </View>
          </View>
        </View>

        <View style={faded ? styles.fadedContent : undefined}>
        <View style={styles.memberRow}>
          <View style={styles.pips}>
            {members.map((m) => (
              <MemberPip
                key={m.id}
                memberUid={m.pending || m.inviteExpired ? undefined : m.id}
                initials={m.initials}
                backgroundColor={m.backgroundColor}
                color={m.color}
                avatarUrl={m.avatarUrl}
                pending={m.pending}
                inviteExpired={m.inviteExpired}
              />
            ))}
          </View>
          <View style={styles.memberRowRight}>
            {pendingInviteCount > 0 ? (
              <View style={styles.pendingPill}>
                <Text style={styles.pendingPillTxt}>
                  {pendingInviteCount} pending invite{pendingInviteCount > 1 ? 's' : ''}
                </Text>
              </View>
            ) : null}
            <View style={[styles.statusPill, { backgroundColor: statusPill.backgroundColor }]}>
              <View style={[styles.statusDot, { backgroundColor: statusPill.dotColor }]} />
              <Text style={[styles.statusTxt, { color: statusPill.textColor }]}>{statusPill.label}</Text>
            </View>
            {showDue ? (
              <View style={styles.dueBadge}>
                <Text style={styles.dueBadgeTxt}>{dueLabel}</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.progWrap}>
          <CollectionBar pct={progress.percentCollected} color={barColor} />
          <View style={styles.progLabels}>
            <Text style={styles.progLbl}>{progress.collectedLabel}</Text>
            <Text style={[styles.progAmt, { color: rightColor }]}>{progress.rightLabel}</Text>
          </View>
        </View>
        </View>
      </View>
    </>
  );

  const hideEdit = hideEditSplit || Boolean(splitEndedActions);

  return (
    <View
      style={[
        styles.card,
        priceChange ? styles.cardPriceChanged : null,
      ]}
    >
      {onCardPress ? (
        <Pressable
          onPress={onCardPress}
          accessibilityRole="button"
          accessibilityLabel={`Open ${name} details`}
        >
          <View>{mainBlock}</View>
        </Pressable>
      ) : (
        mainBlock
      )}

      {splitEndedActions ? (
        <View style={styles.endedActionsRow}>
          <Pressable
            style={styles.endedDeleteBtn}
            onPress={splitEndedActions.onDelete}
            accessibilityRole="button"
            accessibilityLabel="Delete subscription"
          >
            <Text style={styles.endedDeleteTxt}>Delete</Text>
          </Pressable>
        </View>
      ) : null}

      {!hideEdit ? (
        <Pressable
          style={styles.editSplitBtn}
          onPress={onEditSplitPress}
          hitSlop={{ top: 10, bottom: 10, left: 14, right: 14 }}
          accessibilityRole="button"
          accessibilityLabel={editSplitButtonLabel}
        >
          <Ionicons name="create-outline" size={14} color={C.editLink} />
          <Text style={styles.editSplitTxt}>{editSplitButtonLabel}</Text>
        </Pressable>
      ) : null}

      {belowEditSplit}
    </View>
  );
}

const styles = StyleSheet.create({
  /** 40×40 tile, 12px corners (matches Subscriptions demo cards). */
  serviceIconTile: {
    borderRadius: 12,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    marginBottom: 9,
    borderWidth: 0.5,
    borderColor: C.border,
    overflow: 'hidden',
  },
  cardPriceChanged: {
    borderColor: '#FAC775',
  },
  /** Ended cards: dim text/progress only; `ServiceIcon` stays full brand color. */
  fadedContent: {
    opacity: 0.6,
  },
  endedActionsRow: {
    flexDirection: 'row',
    paddingHorizontal: 13,
    paddingBottom: 11,
  },
  endedDeleteBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#FCEBEB',
    alignItems: 'center',
  },
  endedDeleteTxt: {
    fontSize: 11,
    fontWeight: '500',
    color: '#A32D2D',
  },
  priceBanner: {
    backgroundColor: C.amberBanner,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  priceBannerTxt: {
    flex: 1,
    fontSize: 11,
    fontWeight: '500',
    color: C.amberBannerText,
  },
  priceBannerDismiss: {
    fontSize: 14,
    fontWeight: '600',
    color: C.amberOk,
  },
  main: {
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 11,
  },
  topRowRest: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
  },
  info: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  cycle: {
    fontSize: 11,
    color: C.muted,
    marginTop: 3,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  ownerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#EEEDFE',
    borderRadius: 8,
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  ownerBadgeTxt: {
    fontSize: 10,
    fontWeight: '500',
    color: C.purple,
  },
  autoOnBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#E1F5EE',
    borderRadius: 8,
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  autoOnBadgeTxt: {
    fontSize: 10,
    fontWeight: '500',
    color: C.greenDark,
  },
  autoOffBadge: {
    backgroundColor: '#F0EEE9',
    borderRadius: 8,
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  autoOffBadgeTxt: {
    fontSize: 10,
    fontWeight: '500',
    color: C.muted,
  },
  total: {
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'right',
    letterSpacing: -0.3,
  },
  perPerson: {
    fontSize: 11,
    color: C.muted,
    textAlign: 'right',
    marginTop: 2,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  memberRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pips: {
    flexDirection: 'row',
  },
  pendingPill: {
    backgroundColor: '#FAEEDA',
    paddingVertical: 2,
    paddingHorizontal: 7,
    borderRadius: 6,
    alignSelf: 'center',
  },
  pendingPillTxt: {
    fontSize: 9,
    fontWeight: '500',
    color: '#854F0B',
  },
  pip: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -6,
    borderWidth: 2,
    borderColor: '#fff',
  },
  pipPhoto: {
    backgroundColor: '#E8E6E1',
    overflow: 'hidden',
  },
  pipImg: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  pipTxt: {
    fontSize: 9,
    fontWeight: '600',
  },
  pipPending: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#D3D1C7',
    backgroundColor: '#F0EEE9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -6,
    opacity: 0.72,
  },
  pipInviteExpired: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#E8B4B4',
    backgroundColor: '#FCEBEB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -6,
    opacity: 0.88,
  },
  pipPendingIcon: {
    opacity: 0.85,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 8,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  statusTxt: {
    fontSize: 10,
    fontWeight: '500',
  },
  dueBadge: {
    backgroundColor: '#F0EEE9',
    borderRadius: 7,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  dueBadgeTxt: {
    fontSize: 10,
    color: C.muted,
    fontWeight: '500',
  },
  progWrap: {
    marginTop: 0,
  },
  progTrack: {
    height: 3,
    backgroundColor: '#F0EEE9',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 5,
  },
  progFill: {
    height: 3,
    borderRadius: 2,
  },
  progLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progLbl: {
    fontSize: 10,
    color: C.muted,
  },
  progAmt: {
    fontSize: 10,
    fontWeight: '600',
  },
  editSplitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.06)',
  },
  editSplitTxt: {
    fontSize: 12,
    fontWeight: '500',
    color: C.editLink,
    letterSpacing: 0.1,
  },
});
