import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import {
  ACTIVITY_BADGE_DEFAULT_LABELS,
  ACTIVITY_BADGE_STYLES,
  type ActivitySemanticBadgeVariant,
} from '../lib/activity/activityBadgeSemantics';

export type { ActivitySemanticBadgeVariant };

type Props = {
  variant: ActivitySemanticBadgeVariant;
  /** When omitted, uses the default label for `variant` (feed rows should pass the feed `badge` string). */
  label?: string;
};

export function ActivityBadge({ variant, label }: Props) {
  const { bg, color } = ACTIVITY_BADGE_STYLES[variant];
  const text = label?.trim() || ACTIVITY_BADGE_DEFAULT_LABELS[variant];

  return (
    <View style={[styles.wrap, { backgroundColor: bg }]}>
      <Text style={[styles.txt, { color }]} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  txt: {
    fontSize: 10,
    fontWeight: '500',
  },
});
