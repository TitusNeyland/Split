import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const BORDER = 'rgba(0,0,0,0.06)';

export type HomeQuickActionItem = {
  id: string;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  circleBg: string;
  iconColor: string;
  onPress: () => void;
};

export type HomeQuickActionsRowProps = {
  actions: HomeQuickActionItem[];
};

export function HomeQuickActionsRow({ actions }: HomeQuickActionsRowProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
    >
      {actions.map((a) => (
        <Pressable
          key={a.id}
          style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
          onPress={a.onPress}
          accessibilityRole="button"
          accessibilityLabel={a.label}
        >
          <View style={[styles.iconCircle, { backgroundColor: a.circleBg }]}>
            <Ionicons name={a.icon} size={20} color={a.iconColor} />
          </View>
          <Text style={styles.label} numberOfLines={2}>
            {a.label}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 0,
  },
  scrollContent: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 2,
  },
  btn: {
    minWidth: 74,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 0.5,
    borderColor: BORDER,
    alignItems: 'center',
    flexShrink: 0,
  },
  btnPressed: {
    opacity: 0.92,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    marginTop: 6,
    fontSize: 10,
    fontWeight: '700',
    color: '#1a1a18',
    textAlign: 'center',
    lineHeight: 12,
  },
});
