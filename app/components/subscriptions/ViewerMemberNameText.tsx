import React from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';

type Props = {
  firstName: string;
  nameStyle?: StyleProp<TextStyle>;
  youLabelStyle?: StyleProp<TextStyle>;
};

/**
 * “Alex (you)” with muted “(you)” — use for the current user in member lists.
 */
export function ViewerMemberNameText({ firstName, nameStyle, youLabelStyle }: Props) {
  return (
    <Text style={nameStyle} numberOfLines={1}>
      {firstName} <Text style={youLabelStyle}>(you)</Text>
    </Text>
  );
}
