import React, { useEffect, useState } from 'react';
;
import { View, Text, StyleSheet, Pressable, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { User } from 'firebase/auth';
import {
  mergeNotificationPreferences,
  type NotificationPreferenceKey,
  type NotificationPreferences,
} from '../../lib/notificationPreferences';
import { saveNotificationPreferences } from '../../lib/profile';
import { ProfilePurpleToggleVisual } from './ProfilePurpleToggleVisual';

const C = {
  text: '#1a1a18',
  muted: '#888780',
  border: 'rgba(0,0,0,0.06)',
  divider: '#F5F3EE',
};

type RowDef = {
  key: NotificationPreferenceKey;
  title: string;
  sub: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconBg: string;
  iconColor: string;
};

const ROWS: RowDef[] = [
  {
    key: 'upcomingRenewals',
    title: 'Upcoming renewals',
    sub: '2 days before billing',
    icon: 'notifications-outline',
    iconBg: '#FAEEDA',
    iconColor: '#854F0B',
  },
  {
    key: 'paymentReceived',
    title: 'Payment received',
    sub: 'When a member pays',
    icon: 'checkmark-circle-outline',
    iconBg: '#E1F5EE',
    iconColor: '#0F6E56',
  },
  {
    key: 'paymentFailed',
    title: 'Payment failed',
    sub: 'Card declined alerts',
    icon: 'alert-circle-outline',
    iconBg: '#FCEBEB',
    iconColor: '#A32D2D',
  },
  {
    key: 'splitChanges',
    title: 'Split changes',
    sub: 'When % or amount is edited',
    icon: 'layers-outline',
    iconBg: '#EEEDFE',
    iconColor: '#534AB7',
  },
  {
    key: 'autoReminders',
    title: 'Auto-reminders',
    sub: 'Nudge overdue members',
    icon: 'chatbubble-outline',
    iconBg: '#F0EEE9',
    iconColor: '#5F5E5A',
  },
];

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
});

type Props = {
  user: User | null;
  notificationPreferences: Partial<NotificationPreferences> | null | undefined;
  /** When false, toggles update UI only (demo / signed out). */
  persist: boolean;
};

export default function ProfileNotificationSettingsCard({
  user,
  notificationPreferences,
  persist,
}: Props) {
  const [prefs, setPrefs] = useState<NotificationPreferences>(() =>
    mergeNotificationPreferences(notificationPreferences)
  );

  useEffect(() => {
    setPrefs(mergeNotificationPreferences(notificationPreferences));
  }, [user?.uid, notificationPreferences]);

  const onToggle = (key: NotificationPreferenceKey) => {
    const prev = prefs;
    const next: NotificationPreferences = { ...prev, [key]: !prev[key] };
    setPrefs(next);
    if (!persist) return;
    void saveNotificationPreferences(next).catch(() => {
      setPrefs(prev);
      Alert.alert(
        'Could not save',
        'Check your connection and try again.'
      );
    });
  };

  return (
    <View style={styles.card}>
      {ROWS.map((row, i) => (
        <React.Fragment key={row.key}>
          {i > 0 ? <View style={styles.hairline} /> : null}
          <Pressable
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            onPress={() => onToggle(row.key)}
            accessibilityRole="switch"
            accessibilityState={{ checked: prefs[row.key] }}
            accessibilityLabel={row.title}
            accessibilityHint={row.sub}
          >
            <View
              style={[
                styles.iconBox,
                { backgroundColor: row.iconBg, borderRadius: 10 },
              ]}
            >
              <Ionicons name={row.icon} size={18} color={row.iconColor} />
            </View>
            <View style={styles.mid}>
              <Text style={styles.title}>{row.title}</Text>
              <Text style={styles.sub}>{row.sub}</Text>
            </View>
            <ProfilePurpleToggleVisual value={prefs[row.key]} />
          </Pressable>
        </React.Fragment>
      ))}
    </View>
  );
}
