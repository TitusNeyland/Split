import React, { useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  FlatList,
  Keyboard,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useKeyboardHeight } from '../../../hooks/useKeyboardHeight';
import { usePickMembersApi } from './AddSubscriptionPickMembersContext';
import { UserAvatarCircle } from '../../../components/shared/UserAvatarCircle';

const C = {
  purple: '#534AB7',
  purpleTint: '#EEEDFE',
  text: '#1a1a18',
  muted: '#888780',
  bg: '#F2F0EB',
  sheetBg: '#FFFFFF',
  segBg: '#F0EEE9',
  divider: '#E8E6E1',
};

export default function PickMembersScreen() {
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const router = useRouter();
  const api = usePickMembersApi();

  const footerSafeBottom = keyboardHeight > 0 ? 10 : Math.max(insets.bottom, 14);

  useEffect(() => {
    if (!api) router.back();
  }, [api, router]);

  useFocusEffect(
    useCallback(() => {
      const t = setTimeout(() => api?.sheetSearchInputRef.current?.focus(), 150);
      return () => clearTimeout(t);
    }, [api]),
  );

  if (!api) {
    return (
      <View style={[styles.root, styles.fallback]}>
        <StatusBar style="dark" />
      </View>
    );
  }

  const {
    invitedSheetMembers,
    nonOwnerMemberCount,
    friendQuery,
    setFriendQuery,
    friendsForSheet,
    searchingFriends,
    showSearchEmptyState,
    friendQueryTooShort,
    onToggleFriendInSplit,
    removeNonOwnerMember,
    addedMemberIds,
    sheetSearchInputRef,
    sheetSessionAddedIds,
    onLeavePicker,
  } = api;

  const onDone = () => {
    onLeavePicker();
    router.back();
  };

  const onInviteShare = () => {
    onLeavePicker();
    router.push('/invite-share');
  };

  const listEmpty = friendQueryTooShort ? (
    <Text style={styles.listEmptyTxt}>Type at least 3 characters to search people on mySplit.</Text>
  ) : searchingFriends ? (
    <View style={styles.listEmptyCenter}>
      <ActivityIndicator color={C.purple} />
    </View>
  ) : showSearchEmptyState ? (
    <View style={styles.emptyBlock}>
      <View style={styles.emptyIconCircle}>
        <Ionicons name="search" size={28} color={C.muted} />
      </View>
      <Text style={styles.emptyTitle}>No one found</Text>
      <Text style={styles.emptyBody}>
        {`${friendQuery.trim()} isn't on mySplit yet. Invite them to join this split.`}
      </Text>
    </View>
  ) : (
    <Text style={styles.listEmptyTxt}>No matches.</Text>
  );

  return (
    <View style={[styles.root, { paddingBottom: keyboardHeight }]}>
      <StatusBar style="dark" />
      <View style={styles.inner}>
        <View style={styles.mainColumn}>
          <View style={[styles.header, { paddingTop: Math.max(insets.top, 10) }]}>
            <View style={styles.sheetHandle} accessibilityLabel="" />
            <Pressable
              onPress={onDone}
              style={styles.backRow}
              accessibilityRole="button"
              accessibilityLabel="Back"
            >
              <Ionicons name="chevron-back" size={26} color={C.purple} />
              <Text style={styles.backLbl}>Back</Text>
            </Pressable>
            <Text style={styles.headerTitle} accessibilityRole="header">
              {nonOwnerMemberCount > 0
                ? `Add members (${nonOwnerMemberCount} selected)`
                : 'Add members'}
            </Text>
          </View>

          <View style={styles.searchContainer}>
            <Ionicons name="search-outline" size={20} color={C.muted} style={styles.searchLeadingIcon} />
            <TextInput
              ref={sheetSearchInputRef}
              value={friendQuery}
              onChangeText={setFriendQuery}
              placeholder="Search friends or enter email…"
              placeholderTextColor={C.muted}
              style={styles.searchInput}
              returnKeyType="search"
              accessibilityLabel="Search friends"
            />
            {friendQuery.length > 0 ? (
              <Pressable
                onPress={() => {
                  setFriendQuery('');
                  sheetSearchInputRef.current?.focus();
                }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={styles.searchClearBtn}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
              >
                <View style={styles.searchClearCircle}>
                  <Ionicons name="close" size={10} color="#fff" />
                </View>
              </Pressable>
            ) : null}
          </View>

          {invitedSheetMembers.length > 0 ? (
            <View style={styles.invitedBlock}>
              <Text style={styles.invitedSectionLbl} accessibilityRole="header">
                {`Selected (${invitedSheetMembers.length})`}
              </Text>
              {invitedSheetMembers.map((m, index) => (
                <View
                  key={m.memberId}
                  style={[styles.invitedRow, index < invitedSheetMembers.length - 1 && styles.invitedRowBorder]}
                >
                  <UserAvatarCircle
                    size={40}
                    uid={m.memberId.startsWith('invite-email-') ? null : m.memberId}
                    initials={m.initials}
                    imageUrl={m.avatarUrl}
                    initialsBackgroundColor={m.avatarBg}
                    initialsTextColor={m.avatarColor}
                    accessibilityLabel=""
                  />
                  <Text style={styles.invitedName} numberOfLines={1}>
                    {m.displayName}
                  </Text>
                  <Pressable
                    onPress={() => removeNonOwnerMember(m.memberId)}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    style={styles.invitedRemoveBtn}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${m.displayName}`}
                  >
                    <Ionicons name="close" size={20} color={C.muted} />
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}

          <View style={styles.listRegion}>
            <Text style={[styles.sectionLbl, styles.friendsSectionLbl]}>Your friends</Text>

            <FlatList
              data={friendsForSheet}
              extraData={addedMemberIds}
              keyExtractor={(item) => item.memberId}
              style={styles.list}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              onScrollBeginDrag={Keyboard.dismiss}
              ListEmptyComponent={listEmpty}
              renderItem={({ item }) => {
                const added = addedMemberIds.has(item.memberId);
                return (
                  <Pressable
                    style={[styles.friendRow, added && styles.friendRowSelected]}
                    onPress={() => onToggleFriendInSplit(item)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: added }}
                    accessibilityLabel={
                      added
                        ? `${item.displayName}, on split — tap to remove`
                        : `Add ${item.displayName} to split`
                    }
                  >
                    <View style={styles.avatarWrap}>
                      <View style={[styles.avatarInner, item.avatarUrl ? styles.avatarPhoto : null]}>
                        <UserAvatarCircle
                          size={36}
                          uid={item.memberId}
                          initials={item.initials}
                          imageUrl={item.avatarUrl}
                          initialsBackgroundColor={item.avatarBg}
                          initialsTextColor={item.avatarColor}
                          accessibilityLabel=""
                        />
                      </View>
                      {added ? (
                        <View style={styles.addedBadge} accessibilityLabel="Selected for split">
                          <Ionicons name="checkmark" size={14} color="#fff" />
                        </View>
                      ) : null}
                    </View>
                    <View style={styles.friendMeta}>
                      <Text style={styles.friendName} numberOfLines={1}>
                        {item.displayName}
                      </Text>
                      <Text style={styles.friendMutual} numberOfLines={1}>
                        {item.mutualSubscriptionsCount === 0
                          ? 'No mutual subscriptions'
                          : item.mutualSubscriptionsCount === 1
                            ? '1 mutual subscription'
                            : `${item.mutualSubscriptionsCount} mutual subscriptions`}
                      </Text>
                    </View>
                  </Pressable>
                );
              }}
            />
          </View>
        </View>

        <View style={[styles.bottomBar, { paddingBottom: footerSafeBottom }]}>
          <Pressable
            style={styles.inviteCta}
            onPress={onInviteShare}
            accessibilityRole="button"
            accessibilityLabel="Invite to mySplit, share link"
          >
            <View style={styles.inviteIco}>
              <Ionicons name="share-outline" size={20} color={C.purple} />
            </View>
            <View style={styles.inviteCopy}>
              <Text style={styles.inviteTitle}>Invite to mySplit</Text>
              <Text style={styles.inviteSub}>Share an invite link</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={C.muted} />
          </Pressable>
          <Pressable
            onPress={onDone}
            style={({ pressed }) => [styles.doneBtn, pressed && styles.doneBtnPressed]}
            accessibilityRole="button"
            accessibilityLabel={
              sheetSessionAddedIds.length > 0
                ? `Add ${sheetSessionAddedIds.length} member${sheetSessionAddedIds.length === 1 ? '' : 's'} and close`
                : 'Done adding members'
            }
          >
            <Text style={styles.doneBtnTxt}>
              {sheetSessionAddedIds.length > 0
                ? `Add ${sheetSessionAddedIds.length} member${sheetSessionAddedIds.length === 1 ? '' : 's'}`
                : 'Done'}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.sheetBg,
  },
  fallback: {
    backgroundColor: C.sheetBg,
  },
  inner: {
    flex: 1,
    flexDirection: 'column',
    minHeight: 0,
  },
  mainColumn: {
    flex: 1,
    minHeight: 0,
    backgroundColor: C.sheetBg,
  },
  listRegion: {
    flex: 1,
    minHeight: 0,
    backgroundColor: C.sheetBg,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D3D1C7',
    alignSelf: 'center',
    marginBottom: 10,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: C.sheetBg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 8,
    alignSelf: 'flex-start',
  },
  backLbl: {
    fontSize: 16,
    fontWeight: '500',
    color: C.purple,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: C.text,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  invitedBlock: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
    backgroundColor: C.sheetBg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  invitedSectionLbl: {
    fontSize: 12,
    fontWeight: '600',
    color: C.muted,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  invitedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    paddingVertical: 10,
    gap: 12,
  },
  invitedRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.divider,
  },
  invitedName: {
    flex: 1,
    minWidth: 0,
    fontSize: 17,
    fontWeight: '500',
    color: C.text,
  },
  invitedRemoveBtn: {
    padding: 2,
  },
  sectionLbl: {
    fontSize: 12,
    fontWeight: '600',
    color: C.muted,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  friendsSectionLbl: {
    paddingHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.segBg,
    borderRadius: 12,
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 4,
    paddingLeft: 12,
    paddingRight: 6,
    minHeight: 48,
  },
  searchLeadingIcon: {
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    paddingRight: 6,
    fontSize: 16,
    color: C.text,
  },
  searchClearBtn: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingLeft: 4,
  },
  searchClearCircle: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: C.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    flex: 1,
  },
  listContent: {
    flexGrow: 1,
    paddingBottom: 20,
  },
  listEmptyTxt: {
    fontSize: 15,
    color: C.muted,
    paddingTop: 12,
    paddingBottom: 12,
    paddingHorizontal: 24,
    textAlign: 'center',
    lineHeight: 22,
  },
  listEmptyCenter: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  emptyBlock: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  emptyIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#E8E6E1',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: C.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  emptyBody: {
    fontSize: 15,
    color: C.muted,
    textAlign: 'center',
    lineHeight: 22,
  },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 56,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.divider,
  },
  friendRowSelected: {
    backgroundColor: 'rgba(83, 74, 183, 0.06)',
  },
  avatarWrap: {
    position: 'relative',
  },
  avatarInner: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarPhoto: {
    overflow: 'hidden',
  },
  addedBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: C.purple,
    borderWidth: 2,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  friendMeta: {
    flex: 1,
    minWidth: 0,
  },
  friendName: {
    fontSize: 16,
    fontWeight: '500',
    color: C.text,
  },
  friendMutual: {
    fontSize: 13,
    color: C.muted,
    marginTop: 4,
  },
  bottomBar: {
    flexShrink: 0,
    backgroundColor: C.sheetBg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.08)',
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  inviteCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    marginBottom: 4,
  },
  inviteIco: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: C.purpleTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteCopy: {
    flex: 1,
  },
  inviteTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: C.text,
  },
  inviteSub: {
    fontSize: 13,
    color: C.muted,
    marginTop: 2,
  },
  doneBtn: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: C.purple,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtnPressed: {
    opacity: 0.92,
  },
  doneBtnTxt: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
  },
});
