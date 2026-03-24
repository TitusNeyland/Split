import React, { useEffect, useState } from 'react';
;
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { User } from 'firebase/auth';
import { mergePrivacySettings, type PrivacySettings } from '../../lib/privacySettings';
import { savePrivacySettings } from '../../lib/profile';
import {
  getPaymentHistoryForExport,
  sharePaymentHistoryCsv,
  sharePaymentHistoryPdf,
} from '../../lib/paymentHistoryExport';
import { ProfilePurpleToggleVisual } from './ProfilePurpleToggleVisual';

const C = {
  text: '#1a1a18',
  muted: '#888780',
  border: 'rgba(0,0,0,0.06)',
  divider: '#F5F3EE',
  sheetBg: '#F2F0EB',
};

type BoolKey =
  | 'activityVisibleToGroup'
  | 'discoverableByName'
  | 'showBalanceToFriends';

type Props = {
  user: User | null;
  privacySettings: Partial<PrivacySettings> | null | undefined;
  persist: boolean;
  /** Shown in the PDF header (e.g. account display name). */
  userLabelForExport?: string;
};

export default function ProfilePrivacyCard({
  user,
  privacySettings,
  persist,
  userLabelForExport,
}: Props) {
  const insets = useSafeAreaInsets();
  const [prefs, setPrefs] = useState<PrivacySettings>(() =>
    mergePrivacySettings(privacySettings)
  );
  const [exportOpen, setExportOpen] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);

  useEffect(() => {
    setPrefs(mergePrivacySettings(privacySettings));
  }, [user?.uid, privacySettings]);

  const onToggle = (key: BoolKey) => {
    const prev = prefs;
    const next: PrivacySettings = { ...prev, [key]: !prev[key] };
    setPrefs(next);
    if (!persist) return;
    void savePrivacySettings(next).catch(() => {
      setPrefs(prev);
      Alert.alert('Could not save', 'Check your connection and try again.');
    });
  };

  const runExport = async (kind: 'csv' | 'pdf') => {
    const events = getPaymentHistoryForExport();
    const userLine = userLabelForExport?.trim()
      ? `Account: ${userLabelForExport.trim()}`
      : undefined;
    setExportBusy(true);
    try {
      if (kind === 'csv') {
        await sharePaymentHistoryCsv(events);
      } else {
        await sharePaymentHistoryPdf(events, { userLabel: userLine });
      }
      setExportOpen(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Something went wrong.';
      Alert.alert('Export failed', msg);
    } finally {
      setExportBusy(false);
    }
  };

  return (
    <View style={styles.card}>
      <Pressable
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        onPress={() => onToggle('activityVisibleToGroup')}
        accessibilityRole="switch"
        accessibilityState={{ checked: prefs.activityVisibleToGroup }}
        accessibilityLabel="Activity visible to group"
        accessibilityHint="Members see when you pay"
      >
        <View style={[styles.iconBox, styles.iconPeople]}>
          <Ionicons name="people-outline" size={18} color="#fff" />
        </View>
        <View style={styles.mid}>
          <Text style={styles.title}>Activity visible to group</Text>
          <Text style={styles.sub}>Members see when you pay</Text>
        </View>
        <ProfilePurpleToggleVisual value={prefs.activityVisibleToGroup} />
      </Pressable>

      <View style={styles.hairline} />
      <Pressable
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        onPress={() => onToggle('discoverableByName')}
        accessibilityRole="switch"
        accessibilityState={{ checked: prefs.discoverableByName }}
        accessibilityLabel="Allow others to find me by name"
        accessibilityHint="When off, you won’t appear in display name search"
      >
        <View style={[styles.iconBox, { backgroundColor: '#EEEDFE', borderRadius: 10 }]}>
          <Ionicons name="search-outline" size={18} color="#534AB7" />
        </View>
        <View style={styles.mid}>
          <Text style={styles.title}>Allow others to find me by name</Text>
          <Text style={styles.sub}>Appear when people search by display name</Text>
        </View>
        <ProfilePurpleToggleVisual value={prefs.discoverableByName} />
      </Pressable>

      <View style={styles.hairline} />
      <Pressable
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        onPress={() => onToggle('showBalanceToFriends')}
        accessibilityRole="switch"
        accessibilityState={{ checked: prefs.showBalanceToFriends }}
        accessibilityLabel="Show balance to friends"
        accessibilityHint="Others can see your net balance"
      >
        <View style={[styles.iconBox, { backgroundColor: '#F0EEE9', borderRadius: 10 }]}>
          <Ionicons name="eye-outline" size={18} color="#5F5E5A" />
        </View>
        <View style={styles.mid}>
          <Text style={styles.title}>Show balance to friends</Text>
          <Text style={styles.sub}>Others can see your net balance</Text>
        </View>
        <ProfilePurpleToggleVisual value={prefs.showBalanceToFriends} />
      </Pressable>

      <View style={styles.hairline} />
      <Pressable
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        onPress={() => setExportOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Export payment history"
        accessibilityHint="Download as CSV or PDF"
      >
        <View style={[styles.iconBox, { backgroundColor: '#E3F2FD', borderRadius: 10 }]}>
          <Ionicons name="document-text-outline" size={18} color="#1565C0" />
        </View>
        <View style={styles.mid}>
          <Text style={styles.title}>Export payment history</Text>
          <Text style={styles.sub}>Download as CSV or PDF</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={C.muted} />
      </Pressable>

      <Modal
        visible={exportOpen}
        transparent
        animationType="fade"
        onRequestClose={() => !exportBusy && setExportOpen(false)}
      >
        <View style={styles.modalRoot}>
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => !exportBusy && setExportOpen(false)}
            accessibilityLabel="Dismiss"
          />
          <View
            style={[
              styles.sheet,
              { paddingBottom: Math.max(insets.bottom, 16) + 8 },
            ]}
          >
            <View style={styles.sheetGrab} />
            <Text style={styles.sheetTitle}>Export payment history</Text>
            <Text style={styles.sheetSub}>
              Sample data is used until payments are synced from your account.
            </Text>

            {exportBusy ? (
              <View style={styles.busy}>
                <ActivityIndicator size="small" color="#534AB7" />
                <Text style={styles.busyTxt}>Preparing file…</Text>
              </View>
            ) : (
              <>
                <Pressable
                  style={({ pressed }) => [styles.sheetBtn, pressed && styles.sheetBtnPressed]}
                  onPress={() => void runExport('csv')}
                >
                  <Ionicons name="download-outline" size={20} color="#534AB7" />
                  <Text style={styles.sheetBtnTxt}>Download as CSV</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.sheetBtn, pressed && styles.sheetBtnPressed]}
                  onPress={() => void runExport('pdf')}
                >
                  <Ionicons name="document-outline" size={20} color="#534AB7" />
                  <Text style={styles.sheetBtnTxt}>Download as PDF</Text>
                </Pressable>
              </>
            )}

            <Pressable
              style={({ pressed }) => [styles.sheetCancel, pressed && styles.sheetBtnPressed]}
              onPress={() => !exportBusy && setExportOpen(false)}
              disabled={exportBusy}
            >
              <Text style={styles.sheetCancelTxt}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

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
  hairline: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.divider,
    marginLeft: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  rowPressed: {
    opacity: 0.88,
  },
  iconBox: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconPeople: {
    backgroundColor: '#534AB7',
    borderRadius: 10,
  },
  mid: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: C.text,
  },
  sub: {
    fontSize: 12,
    color: C.muted,
    marginTop: 2,
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    backgroundColor: C.sheetBg,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 20,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  sheetGrab: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(0,0,0,0.12)',
    marginBottom: 12,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: C.text,
    marginBottom: 6,
  },
  sheetSub: {
    fontSize: 13,
    color: C.muted,
    marginBottom: 16,
    lineHeight: 18,
  },
  sheetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  sheetBtnPressed: {
    opacity: 0.9,
  },
  sheetBtnTxt: {
    fontSize: 16,
    fontWeight: '600',
    color: '#534AB7',
  },
  sheetCancel: {
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 4,
  },
  sheetCancelTxt: {
    fontSize: 16,
    fontWeight: '600',
    color: C.muted,
  },
  busy: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 24,
  },
  busyTxt: {
    fontSize: 15,
    color: C.muted,
  },
});
