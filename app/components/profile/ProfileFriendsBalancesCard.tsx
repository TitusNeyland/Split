import React, { useMemo, useState } from 'react';
;
import { View, Text, StyleSheet, Pressable, Image } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { CURRENT_USER_AVATAR, getFriendAvatarColors } from '../../../lib/friends/friendAvatar';
import {
  PROFILE_FRIEND_BALANCES,
  PROFILE_TOTAL_FRIEND_COUNT,
  computeNetBarTotals,
  getProfileFriendStackEntries,
  type ProfileFriendBalanceRow,
} from '../../../lib/profile';

const C = {
  text: '#1a1a18',
  muted: '#888780',
  border: 'rgba(0,0,0,0.06)',
  purple: '#534AB7',
  green: '#1D9E75',
  red: '#E24B4A',
  amber: '#EF9F27',
  divider: '#F5F3EE',
  mintIconBg: '#E1F5EE',
  mintIcon: '#0F6E56',
};

const STACK_SHOW = 4;

type Props = {
  userInitials: string;
  /** Current user profile photo from Firestore `avatarUrl`. */
  userAvatarUrl?: string | null;
};

function NetBalanceBar({ owedToYou, youOwe }: { owedToYou: number; youOwe: number }) {
  const ow = Math.max(0, owedToYou);
  const yo = Math.max(0, youOwe);
  const t = ow + yo;

  return (
    <View>
      <View style={netStyles.labelRow}>
        <Text style={netStyles.labelMuted}>Owed to you</Text>
        <Text style={netStyles.labelMuted}>You owe</Text>
      </View>
      <View style={netStyles.barTrack}>
        {t === 0 ? (
          <View style={[netStyles.segment, { flex: 1, backgroundColor: '#E5E2DC' }]} />
        ) : (
          <>
            {ow > 0 ? (
              <View
                style={[
                  netStyles.segment,
                  netStyles.segmentGreen,
                  { flex: Math.max(ow, 0.0001), minWidth: ow > 0 ? 6 : 0 },
                ]}
              />
            ) : null}
            {yo > 0 ? (
              <View
                style={[
                  netStyles.segment,
                  netStyles.segmentRed,
                  { flex: Math.max(yo, 0.0001), minWidth: yo > 0 ? 6 : 0 },
                ]}
              />
            ) : null}
          </>
        )}
      </View>
      <View style={netStyles.amountRow}>
        <Text style={netStyles.amtGreen}>+${ow.toFixed(2)}</Text>
        <Text style={netStyles.amtRed}>-${yo.toFixed(2)}</Text>
      </View>
    </View>
  );
}

function FriendAvatarLarge({
  initials,
  colors,
  imageUrl,
}: {
  initials: string;
  colors: { backgroundColor: string; color: string };
  imageUrl?: string | null;
}) {
  if (imageUrl) {
    return (
      <View style={avatarLg.circle}>
        <Image source={{ uri: imageUrl }} style={avatarLg.photo} accessibilityLabel="Your profile photo" />
      </View>
    );
  }
  return (
    <View style={[avatarLg.circle, { backgroundColor: colors.backgroundColor }]}>
      <Text style={[avatarLg.initials, { color: colors.color }]} numberOfLines={1}>
        {initials}
      </Text>
    </View>
  );
}

function FriendAvatarStackChip({
  id,
  initials,
  index,
}: {
  id: string;
  initials: string;
  index: number;
}) {
  const { backgroundColor, color } = getFriendAvatarColors(id);
  return (
    <View
      style={[
        stackStyles.chip,
        { backgroundColor, marginLeft: index === 0 ? 0 : -11 },
      ]}
    >
      <Text style={[stackStyles.chipTxt, { color }]} numberOfLines={1}>
        {initials}
      </Text>
    </View>
  );
}

function BalanceRow({
  row,
  userInitials,
  userAvatarUrl,
  onPress,
}: {
  row: ProfileFriendBalanceRow;
  userInitials: string;
  userAvatarUrl?: string | null;
  onPress: () => void;
}) {
  const isYouOwe = row.kind === 'you_owe';
  const name = isYouOwe ? 'You' : row.displayName;
  const sub = isYouOwe ? `To ${row.counterpartyShortName} · Tap to pay` : row.subLine;
  const initials = isYouOwe ? userInitials : row.initials;
  const colors = isYouOwe ? CURRENT_USER_AVATAR : getFriendAvatarColors(row.id);

  let rightText = '';
  let rightColor = C.muted;
  if (row.kind === 'they_owe_overdue') {
    rightText = `owes $${(row.amount ?? 0).toFixed(2)}`;
    rightColor = C.red;
  } else if (row.kind === 'they_owe_pending') {
    rightText = `owes $${(row.amount ?? 0).toFixed(2)}`;
    rightColor = C.amber;
  } else if (row.kind === 'settled') {
    rightText = 'settled';
    rightColor = C.green;
  } else if (row.kind === 'you_owe') {
    rightText = `owe $${row.amount.toFixed(2)}`;
    rightColor = C.red;
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [rowStyles.row, pressed && rowStyles.rowPressed]}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${rightText}`}
    >
      <FriendAvatarLarge
        initials={initials}
        colors={colors}
        imageUrl={isYouOwe ? userAvatarUrl : null}
      />
      <View style={rowStyles.mid}>
        <Text style={rowStyles.name} numberOfLines={1}>
          {name}
        </Text>
        <Text style={rowStyles.sub} numberOfLines={2}>
          {sub}
        </Text>
        <Text style={rowStyles.subCount} numberOfLines={1}>
          {row.subscriptionCountLabel}
        </Text>
      </View>
      <Text style={[rowStyles.amount, { color: rightColor }]} numberOfLines={1}>
        {rightText}
      </Text>
    </Pressable>
  );
}

export default function ProfileFriendsBalancesCard({ userInitials, userAvatarUrl }: Props) {
  const [expanded, setExpanded] = useState(false);
  const { owedToYou, youOwe } = useMemo(() => computeNetBarTotals(PROFILE_FRIEND_BALANCES), []);
  const stackEntries = useMemo(() => getProfileFriendStackEntries(), []);
  const visibleStack = stackEntries.slice(0, STACK_SHOW);
  const overflow = Math.max(0, PROFILE_TOTAL_FRIEND_COUNT - visibleStack.length);

  const openFriendActivity = (id: string) => {
    router.push({ pathname: '/activity', params: { friendId: id } });
  };

  const onInvite = () => {
    router.push('/invite-share');
  };

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Pressable
          onPress={() => router.push('/friends')}
          style={({ pressed }) => [styles.headerMain, pressed && styles.rowPressed]}
          accessibilityRole="button"
          accessibilityLabel={`Friends, ${PROFILE_TOTAL_FRIEND_COUNT} friends. Open friends hub`}
        >
          <View style={styles.rowIconPurple}>
            <Ionicons name="people-outline" size={21} color={C.purple} />
          </View>
          <View style={styles.rowContent}>
            <Text style={styles.rowTitle}>Friends</Text>
            <Text style={styles.rowSubMuted}>Invites, search & balances</Text>
            <View style={styles.stackRow}>
              {visibleStack.map((e, i) => (
                <FriendAvatarStackChip key={e.id} id={e.id} initials={e.initials} index={i} />
              ))}
              {overflow > 0 ? (
                <View style={[stackStyles.chip, stackStyles.chipMore, { marginLeft: visibleStack.length === 0 ? 0 : -11 }]}>
                  <Text style={stackStyles.chipMoreTxt}>+{overflow}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </Pressable>
        <Pressable
          onPress={() => setExpanded((e) => !e)}
          style={({ pressed }) => [styles.chevronBtn, pressed && styles.rowPressed]}
          accessibilityRole="button"
          accessibilityLabel={expanded ? 'Collapse friend balances' : 'Expand friend balances'}
          accessibilityState={{ expanded }}
        >
          <Text style={styles.friendCountTxt}>{PROFILE_TOTAL_FRIEND_COUNT} friends</Text>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color="#C8C6C0" />
        </Pressable>
      </View>

      {expanded ? (
        <>
          <View style={styles.netBarWrap}>
            <NetBalanceBar owedToYou={owedToYou} youOwe={youOwe} />
          </View>
          {PROFILE_FRIEND_BALANCES.map((row, i) => (
            <View key={row.id}>
              {i > 0 ? <View style={styles.rowDividerInset} /> : null}
              <View style={styles.expandedRowPad}>
                <BalanceRow
                  row={row}
                  userInitials={userInitials}
                  userAvatarUrl={userAvatarUrl}
                  onPress={() => openFriendActivity(row.id)}
                />
              </View>
            </View>
          ))}
        </>
      ) : null}

      <View style={styles.hairline} />

      <Pressable
        onPress={onInvite}
        style={({ pressed }) => [styles.settingsRow, styles.inviteRow, pressed && styles.rowPressed]}
        accessibilityRole="button"
        accessibilityLabel="Invite a friend"
      >
        <View style={styles.rowIconMint}>
          <Ionicons name="mail-outline" size={21} color={C.mintIcon} />
        </View>
        <View style={styles.rowContent}>
          <Text style={styles.rowTitle}>Invite a friend</Text>
          <Text style={styles.rowSub}>Share your invite link</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color="#C8C6C0" />
      </Pressable>
    </View>
  );
}

const netStyles = StyleSheet.create({
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  labelMuted: {
    fontSize: 12,
    fontWeight: '600',
    color: C.muted,
  },
  barTrack: {
    flexDirection: 'row',
    height: 7,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: '#F0EEE9',
  },
  segment: {
    height: '100%',
  },
  segmentGreen: {
    backgroundColor: C.green,
  },
  segmentRed: {
    backgroundColor: C.red,
  },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  amtGreen: {
    fontSize: 14,
    fontWeight: '700',
    color: C.green,
  },
  amtRed: {
    fontSize: 14,
    fontWeight: '700',
    color: C.red,
  },
});

const stackStyles = StyleSheet.create({
  chip: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  chipTxt: {
    fontSize: 11,
    fontWeight: '700',
  },
  chipMore: {
    backgroundColor: '#F0EEE9',
  },
  chipMoreTxt: {
    fontSize: 11,
    fontWeight: '700',
    color: '#5F5E5A',
  },
});

const avatarLg = StyleSheet.create({
  circle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    overflow: 'hidden',
  },
  photo: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  initials: {
    fontSize: 13,
    fontWeight: '600',
  },
});

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  rowPressed: {
    opacity: 0.85,
  },
  mid: {
    flex: 1,
    minWidth: 0,
    marginRight: 8,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: C.text,
  },
  sub: {
    fontSize: 13,
    color: C.muted,
    marginTop: 2,
    lineHeight: 18,
  },
  subCount: {
    fontSize: 12,
    color: C.muted,
    marginTop: 3,
  },
  amount: {
    fontSize: 15,
    fontWeight: '700',
    flexShrink: 0,
    maxWidth: '38%',
    textAlign: 'right',
  },
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 10,
    elevation: 3,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 14,
    gap: 8,
  },
  headerMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minWidth: 0,
  },
  rowSubMuted: {
    fontSize: 12,
    color: C.muted,
    marginTop: 2,
  },
  chevronBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  inviteRow: {
    borderTopWidth: 0,
  },
  rowPressed: {
    opacity: 0.88,
  },
  rowIconPurple: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#EEEDFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIconMint: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: C.mintIconBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowContent: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: C.text,
  },
  rowSub: {
    fontSize: 13,
    color: C.muted,
    marginTop: 3,
  },
  stackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  friendCountTxt: {
    fontSize: 14,
    fontWeight: '500',
    color: C.muted,
  },
  hairline: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.divider,
    marginLeft: 14,
    marginRight: 14,
  },
  netBarWrap: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#FAFAF8',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#F0EEE9',
  },
  rowDividerInset: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.divider,
    marginLeft: 66,
    marginRight: 14,
  },
  expandedRowPad: {
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
});
