import React, { useMemo } from 'react';
;
import { View, Text, StyleSheet, Pressable, Platform, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

function parseAllowedUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  try {
    const u = new URL(decoded);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.toString();
  } catch {
    return null;
  }
}

export default function ProfileWebHelpScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ url?: string; title?: string }>();
  const rawUrl = typeof params.url === 'string' ? params.url : '';
  const title =
    typeof params.title === 'string' && params.title.trim()
      ? params.title.trim()
      : 'Help';
  const uri = useMemo(() => parseAllowedUrl(rawUrl), [rawUrl]);

  if (!uri) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <Header title={title} />
        <View style={styles.center}>
          <Text style={styles.err}>Missing or invalid link.</Text>
        </View>
      </View>
    );
  }

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <Header title={title} />
        <View style={styles.center}>
          <Text style={styles.err}>Open this screen on iOS or Android for the in-app browser.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Header title={title} />
      <WebView
        source={{ uri }}
        style={styles.web}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color="#534AB7" />
          </View>
        )}
      />
    </View>
  );
}

function Header({ title }: { title: string }) {
  return (
    <View style={styles.header}>
      <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
        <Ionicons name="chevron-back" size={26} color="#534AB7" />
      </Pressable>
      <Text style={styles.headerTitle} numberOfLines={1}>
        {title}
      </Text>
      <View style={{ width: 26 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F2F0EB',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
    color: '#1a1a18',
  },
  web: {
    flex: 1,
    backgroundColor: '#fff',
  },
  loading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  center: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  err: {
    fontSize: 15,
    color: '#555',
    textAlign: 'center',
  },
});
