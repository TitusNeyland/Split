import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';

const TRACK_OFF = '#D3D1C7';
const TRACK_ON = '#534AB7';

export const PROFILE_PURPLE_TOGGLE = { w: 42, h: 24, pad: 3, thumb: 18 };

const T = PROFILE_PURPLE_TOGGLE;

const styles = StyleSheet.create({
  toggleTrack: {
    borderRadius: 12,
    justifyContent: 'center',
  },
  toggleThumb: {
    position: 'absolute',
    left: 0,
    top: (T.h - T.thumb) / 2,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
});

/** Purple-on / gray-off switch; 200ms animation. Presentational only — wrap row in Pressable. */
export function ProfilePurpleToggleVisual({ value }: { value: boolean }) {
  const anim = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: value ? 1 : 0,
      duration: 200,
      useNativeDriver: false,
    }).start();
  }, [value, anim]);

  const bg = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [TRACK_OFF, TRACK_ON],
  });
  const thumbX = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [T.pad, T.w - T.thumb - T.pad],
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.toggleTrack,
        {
          width: T.w,
          height: T.h,
          backgroundColor: bg,
        },
      ]}
    >
      <Animated.View
        style={[
          styles.toggleThumb,
          {
            width: T.thumb,
            height: T.thumb,
            borderRadius: T.thumb / 2,
            transform: [{ translateX: thumbX }],
          },
        ]}
      />
    </Animated.View>
  );
}
