import React from 'react';
import { View, Text, Image, StyleSheet, Pressable, ActivityIndicator, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { userDocPhotoUrl } from '../../lib/profile/profile';
import { useUserProfile } from '../../hooks/useUserProfile';

type Props = {
  size: number;
  initials: string;
  /** Remote or file URI; when set, shown inside a circle (unless `uid` resolves a newer URL). */
  imageUrl?: string | null;
  /** Loads `users/{uid}` via shared cache for `photoURL` / `avatarUrl`. */
  uid?: string | null;
  /** Solid background for initials when no photo; overrides default gradient. */
  initialsBackgroundColor?: string;
  initialsTextColor?: string;
  /** Profile still loading from Firestore — neutral placeholder. */
  loading?: boolean;
  /** When true, shows a centered spinner (e.g. upload). */
  showSpinner?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
  borderWidth?: number;
  borderColor?: string;
  style?: StyleProp<ViewStyle>;
};

export function UserAvatarCircle({
  size,
  initials,
  imageUrl,
  uid,
  initialsBackgroundColor,
  initialsTextColor,
  loading,
  showSpinner,
  onPress,
  accessibilityLabel,
  borderWidth = 0,
  borderColor = 'transparent',
  style,
}: Props) {
  const { profile } = useUserProfile(uid ?? null);
  const fromDoc = userDocPhotoUrl(profile as Record<string, unknown> | null | undefined);
  const explicit =
    typeof imageUrl === 'string' && imageUrl.trim().length > 0 ? imageUrl.trim() : null;
  const resolvedUrl = explicit ?? fromDoc ?? null;

  const r = size / 2;
  const inner = (
    <View
      style={[
        styles.inner,
        {
          width: size,
          height: size,
          borderRadius: r,
          borderWidth,
          borderColor,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      {loading ? (
        <View style={[styles.shimmer, { borderRadius: r }]} />
      ) : resolvedUrl ? (
        <Image
          source={{ uri: resolvedUrl }}
          style={{ width: size, height: size }}
          accessibilityLabel={accessibilityLabel ?? 'Profile photo'}
        />
      ) : initialsBackgroundColor && initialsTextColor ? (
        <View style={[styles.solidInitials, { borderRadius: r, backgroundColor: initialsBackgroundColor }]}>
          <Text style={[styles.initialsPlain, { fontSize: Math.round(size * 0.36), color: initialsTextColor }]}>
            {initials}
          </Text>
        </View>
      ) : (
        <LinearGradient
          colors={['#8B5CF6', '#5B21B6', '#4C1D95']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.grad, { borderRadius: r }]}
        >
          <Text style={[styles.initials, { fontSize: Math.round(size * 0.36) }]}>{initials}</Text>
        </LinearGradient>
      )}
      {showSpinner ? (
        <View style={[styles.spinnerOverlay, { borderRadius: r }]}>
          <ActivityIndicator size="small" color="#fff" />
        </View>
      ) : null}
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
      >
        {inner}
      </Pressable>
    );
  }
  return inner;
}

const styles = StyleSheet.create({
  inner: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  shimmer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  grad: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  solidInitials: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialsPlain: {
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  initials: {
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.5,
  },
  spinnerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(83,74,183,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
