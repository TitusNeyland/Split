import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useOnboardingBack } from '../../../lib/onboarding/useOnboardingBack';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Line, Path, Polyline, Rect } from 'react-native-svg';
import {
  ONBOARDING_GOAL_OPTIONS,
  type OnboardingGoalId,
  initialGoalSelection,
  selectionToGoalArray,
  persistOnboardingGoals,
} from '../../../lib/onboarding/onboardingGoals';

const C = {
  bg: '#fff',
  text: '#1a1a18',
  muted: '#888780',
  purple: '#534AB7',
  rowBorder: '#E8E6E1',
  checkBorder: '#D3D1C7',
  selectedBg: '#EEEDFE',
};

function GoalIcon({ id, color }: { id: OnboardingGoalId; color: string }) {
  const sw = 1.5;
  switch (id) {
    case 'split_subscriptions':
      return (
        <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
          <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={sw} />
          <Path d="M12 8v4l3 3" stroke={color} strokeWidth={sw} strokeLinecap="round" />
        </Svg>
      );
    case 'scan_receipts':
      return (
        <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
          <Rect x={5} y={2} width={14} height={20} rx={2} stroke={color} strokeWidth={sw} />
          <Line x1={9} y1={7} x2={15} y2={7} stroke={color} strokeWidth={sw} strokeLinecap="round" />
        </Svg>
      );
    case 'split_roommates':
      return (
        <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
          <Path
            d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"
            stroke={color}
            strokeWidth={sw}
            strokeLinecap="round"
          />
          <Circle cx={9} cy={7} r={4} stroke={color} strokeWidth={sw} />
        </Svg>
      );
    case 'collect_owed':
      return (
        <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
          <Polyline
            points="20 6 9 17 4 12"
            stroke={color}
            strokeWidth={sw}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      );
    case 'track_group_expenses':
      return (
        <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
          <Rect x={1} y={4} width={22} height={16} rx={2} stroke={color} strokeWidth={sw} />
          <Line x1={1} y1={10} x2={23} y2={10} stroke={color} strokeWidth={sw} />
        </Svg>
      );
    default:
      return null;
  }
}

export default function OnboardingGoalsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const goBack = useOnboardingBack('/onboarding');
  const [selected, setSelected] = useState<Record<OnboardingGoalId, boolean>>(() =>
    initialGoalSelection()
  );
  const [saving, setSaving] = useState(false);

  const toggle = useCallback((id: OnboardingGoalId) => {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const goToName = useCallback(() => {
    router.push('/onboarding/name');
  }, [router]);

  const onContinue = useCallback(async () => {
    const goals = selectionToGoalArray(selected);
    setSaving(true);
    try {
      await persistOnboardingGoals(goals);
      goToName();
    } catch {
      Alert.alert('Could not save', 'Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  }, [selected, goToName]);

  const rows = useMemo(
    () =>
      ONBOARDING_GOAL_OPTIONS.map((opt) => {
        const isOn = selected[opt.id];
        return (
          <Pressable
            key={opt.id}
            onPress={() => toggle(opt.id)}
            style={({ pressed }) => [
              styles.optionRow,
              isOn && styles.optionRowSelected,
              pressed && styles.optionRowPressed,
            ]}
          >
            <View style={[styles.optionIcon, { backgroundColor: opt.iconBg }]}>
              <GoalIcon id={opt.id} color={opt.iconColor} />
            </View>
            <Text style={styles.optionLabel}>{opt.label}</Text>
            <View style={[styles.checkOuter, isOn && styles.checkOuterSelected]}>
              {isOn ? (
                <Svg width={10} height={10} viewBox="0 0 24 24" fill="none">
                  <Polyline
                    points="20 6 9 17 4 12"
                    stroke="#fff"
                    strokeWidth={3}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </Svg>
              ) : null}
            </View>
          </Pressable>
        );
      }),
    [selected, toggle]
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.topRow}>
        <Pressable
          onPress={goBack}
          hitSlop={12}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
        >
          <Ionicons name="chevron-back" size={22} color={C.text} />
        </Pressable>
        <Pressable onPress={goToName} hitSlop={12} style={({ pressed }) => pressed && { opacity: 0.6 }}>
          <Text style={styles.skip}>Skip</Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 24 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>What do you want to do?</Text>
        <Text style={styles.sub}>Choose as many as you'd like</Text>

        <View style={styles.optionList}>{rows}</View>

        <View style={styles.spacer} />

        <Pressable
          style={({ pressed }) => [
            styles.primaryBtn,
            (pressed || saving) && styles.primaryBtnPressed,
            saving && styles.primaryBtnDisabled,
          ]}
          onPress={onContinue}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryBtnText}>Continue</Text>
          )}
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 4,
  },
  backBtn: {
    paddingVertical: 4,
    paddingRight: 8,
  },
  skip: {
    fontSize: 13,
    color: C.muted,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: C.text,
    letterSpacing: -0.5,
    lineHeight: 28 * 1.15,
    marginBottom: 10,
  },
  sub: {
    fontSize: 15,
    color: C.muted,
    lineHeight: 15 * 1.5,
    marginBottom: 24,
  },
  optionList: {
    flexGrow: 1,
    gap: 8,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1.5,
    borderColor: C.rowBorder,
    borderRadius: 16,
    backgroundColor: C.bg,
  },
  optionRowSelected: {
    borderColor: C.purple,
    backgroundColor: C.selectedBg,
  },
  optionRowPressed: {
    opacity: 0.92,
  },
  optionIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: C.text,
  },
  checkOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: C.checkBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 'auto',
  },
  checkOuterSelected: {
    backgroundColor: C.purple,
    borderColor: C.purple,
  },
  spacer: {
    flexGrow: 1,
    minHeight: 16,
  },
  primaryBtn: {
    marginTop: 16,
    width: '100%',
    paddingVertical: 16,
    backgroundColor: C.purple,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnPressed: {
    opacity: 0.92,
  },
  primaryBtnDisabled: {
    opacity: 0.85,
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    letterSpacing: -0.2,
  },
});
