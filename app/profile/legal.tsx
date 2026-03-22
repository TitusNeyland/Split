import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  ScrollView,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  LEGAL_INTRO,
  LEGAL_SECTIONS,
  buildLegalDocumentHtml,
} from '../../constants/legalContent';
import { LEGAL_WEB_URL } from '../../constants/support';

export default function ProfileLegalScreen() {
  const insets = useSafeAreaInsets();

  if (LEGAL_WEB_URL && Platform.OS === 'web') {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <Header />
        <View style={styles.webHint}>
          <Text style={styles.webHintText}>
            View terms and policies in your browser, or use the iOS/Android app.
          </Text>
          <Pressable
            style={styles.openExternal}
            onPress={() => void Linking.openURL(LEGAL_WEB_URL)}
            accessibilityRole="link"
          >
            <Text style={styles.openExternalText}>Open legal page</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <Header />
        <ScrollView contentContainerStyle={styles.scrollPad} showsVerticalScrollIndicator={false}>
          <Text style={styles.docTitle}>Legal</Text>
          <Text style={styles.intro}>{LEGAL_INTRO}</Text>
          <Text style={styles.toc}>
            {LEGAL_SECTIONS.map((s) => s.title).join(' · ')}
          </Text>
          {LEGAL_SECTIONS.map((s) => (
            <View key={s.id} style={styles.section}>
              <Text style={styles.h2}>{s.title}</Text>
              {s.paragraphs.map((p, i) => (
                <Text key={i} style={styles.p}>
                  {p}
                </Text>
              ))}
            </View>
          ))}
        </ScrollView>
      </View>
    );
  }

  const html = buildLegalDocumentHtml();

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Header />
      <WebView
        originWhitelist={['*']}
        source={{ html, baseUrl: 'https://localhost' }}
        style={styles.web}
      />
    </View>
  );
}

function Header() {
  return (
    <View style={styles.header}>
      <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
        <Ionicons name="chevron-back" size={26} color="#534AB7" />
      </Pressable>
      <Text style={styles.headerTitle}>Legal</Text>
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
    fontSize: 17,
    fontWeight: '700',
    color: '#1a1a18',
  },
  web: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollPad: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  docTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1a1a18',
    marginBottom: 8,
  },
  intro: {
    fontSize: 13,
    color: '#888',
    marginBottom: 12,
    lineHeight: 19,
  },
  toc: {
    fontSize: 13,
    color: '#534AB7',
    fontWeight: '600',
    marginBottom: 20,
    lineHeight: 20,
  },
  section: {
    marginBottom: 8,
  },
  h2: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a18',
    marginTop: 16,
    marginBottom: 8,
  },
  p: {
    fontSize: 15,
    lineHeight: 22,
    color: '#444',
    marginBottom: 10,
  },
  webHint: {
    padding: 24,
  },
  webHintText: {
    fontSize: 15,
    color: '#555',
    marginBottom: 16,
    lineHeight: 22,
  },
  openExternal: {
    alignSelf: 'flex-start',
    backgroundColor: '#534AB7',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
  },
  openExternalText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },
});
