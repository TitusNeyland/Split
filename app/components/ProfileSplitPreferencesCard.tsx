import React, { useEffect, useState } from 'react';
;
import { View, Text, StyleSheet, Pressable, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { User } from 'firebase/auth';
import {
  mergeSplitPreferences,
  defaultSplitMethodLabel,
  defaultSplitMethodSubLabel,
  type DefaultSplitMethod,
  type SplitPreferences,
} from '../../lib/split-preferences/splitPreferences';
import { saveSplitPreferences } from '../../lib/profile';
import { ProfilePurpleToggleVisual } from './ProfilePurpleToggleVisual';

const C = {
  text: '#1a1a18',
  muted: '#888780',
  border: 'rgba(0,0,0,0.06)',
  divider: '#F5F3EE',
};

type BoolKey = 'alwaysShowExactAmounts' | 'confirmBeforeSplitChanges' | 'changesEffectiveNextCycle';

const TOGGLE_ROWS: {
  key: BoolKey;
  title: string;
  sub: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconBg: string;
  iconColor: string;
}[] = [
  {
    key: 'alwaysShowExactAmounts',
    title: 'Always show exact amounts',
    sub: 'Show $ and % on every view',
    icon: 'eye-outline',
    iconBg: '#E1F5EE',
    iconColor: '#0F6E56',
  },
  {
    key: 'confirmBeforeSplitChanges',
    title: 'Confirm before split changes',
    sub: 'Ask me before saving edits',
    icon: 'shield-outline',
    iconBg: '#EEEDFE',
    iconColor: '#534AB7',
  },
  {
    key: 'changesEffectiveNextCycle',
    title: 'Changes effective next cycle',
    sub: 'Default for split edits',
    icon: 'time-outline',
    iconBg: '#FAEEDA',
    iconColor: '#854F0B',
  },
];

type Props = {
  user: User | null;
  splitPreferences: Partial<SplitPreferences> | null | undefined;
  persist: boolean;
};

export default function ProfileSplitPreferencesCard({
  user,
  splitPreferences,
  persist,
}: Props) {
  const [prefs, setPrefs] = useState<SplitPreferences>(() =>
    mergeSplitPreferences(splitPreferences)
  );

  useEffect(() => {
    setPrefs(mergeSplitPreferences(splitPreferences));
  }, [user?.uid, splitPreferences]);

  const onToggleBool = (key: BoolKey) => {
    const prev = prefs;
    const next: SplitPreferences = { ...prev, [key]: !prev[key] };
    setPrefs(next);
    if (!persist) return;
    void saveSplitPreferences(next).catch(() => {
      setPrefs(prev);
      Alert.alert('Could not save', 'Check your connection and try again.');
    });
  };

  const setMethod = (method: DefaultSplitMethod) => {
    const prev = prefs;
    const next: SplitPreferences = { ...prev, defaultSplitMethod: method };
    setPrefs(next);
    if (!persist) return;
    void saveSplitPreferences(next).catch(() => {
      setPrefs(prev);
      Alert.alert('Could not save', 'Check your connection and try again.');
    });
  };

  const openMethodPicker = () => {
    Alert.alert(
      'Default split method',
      'Pre-selected when you create a new subscription split.',
      [
        { text: 'Equal', onPress: () => setMethod('equal') },
        { text: 'Custom %', onPress: () => setMethod('customPercent') },
        { text: 'Fixed $', onPress: () => setMethod('fixedDollar') },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  return (
    <View style={styles.card}>
      {TOGGLE_ROWS.map((row, i) => (
        <React.Fragment key={row.key}>
          {i > 0 ? <View style={styles.hairline} /> : null}
          <Pressable
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            onPress={() => onToggleBool(row.key)}
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

      <View style={styles.hairline} />
      <Pressable
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        onPress={openMethodPicker}
        accessibilityRole="button"
        accessibilityLabel={`Default split method, ${defaultSplitMethodLabel(prefs.defaultSplitMethod)}`}
        accessibilityHint="Opens options for Equal, Custom percent, or Fixed dollar"
      >
        <View
          style={[
            styles.iconBox,
            { backgroundColor: '#F0EEE9', borderRadius: 10 },
          ]}
        >
          <Ionicons name="card-outline" size={18} color="#5F5E5A" />
        </View>
        <View style={styles.mid}>
          <Text style={styles.title}>Default split method</Text>
          <Text style={styles.sub}>
            {defaultSplitMethodSubLabel(prefs.defaultSplitMethod)}
          </Text>
        </View>
        <View style={styles.methodRight}>
          <Text style={styles.methodValue}>
            {defaultSplitMethodLabel(prefs.defaultSplitMethod)}
          </Text>
          <Ionicons name="chevron-forward" size={18} color={C.muted} />
        </View>
      </Pressable>
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
  methodRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  methodValue: {
    fontSize: 15,
    fontWeight: '500',
    color: C.muted,
  },
});
