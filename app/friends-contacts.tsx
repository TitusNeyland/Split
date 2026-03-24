import React from 'react';
;
import { View, Text, StyleSheet, Pressable, ScrollView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import * as Contacts from 'expo-contacts';

const C = {
  text: '#1a1a18',
  muted: '#888780',
  purple: '#534AB7',
  green: '#0F6E56',
  sheetBg: '#F2F0EB',
};

export default function FriendsContactsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const onAllow = async () => {
    const { status } = await Contacts.requestPermissionsAsync();
    if (status === 'granted') {
      Alert.alert(
        'Contacts access on',
        'When Firebase is wired, we’ll match hashed numbers to people on mySplit. Nothing is uploaded yet in this build.',
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } else {
      Alert.alert(
        'No access',
        'You can enable contacts later in Settings if you change your mind.',
      );
    }
  };

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <LinearGradient
        colors={['#6B3FA0', '#4A1570', '#2D0D45']}
        locations={[0, 0.6, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={[styles.hero, { paddingTop: Math.max(insets.top, 12) + 4 }]}
      >
        <Pressable
          onPress={() => router.back()}
          style={styles.backRow}
          accessibilityRole="button"
          accessibilityLabel="Back to Friends"
        >
          <Ionicons name="chevron-back" size={22} color="rgba(255,255,255,0.65)" />
          <Text style={styles.backLbl}>Friends</Text>
        </Pressable>
        <Text style={styles.pageTitle}>Find from contacts</Text>
      </LinearGradient>

      <ScrollView
        style={styles.body}
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingTop: 20,
          paddingBottom: insets.bottom + 32,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.permIcon}>
          <Ionicons name="people-outline" size={32} color={C.purple} />
        </View>
        <Text style={styles.headline}>Find your people</Text>
        <Text style={styles.bodyTxt}>
          We’ll check which of your contacts are already on mySplit. We never store or share your
          contacts — only anonymous hashes are used.
        </Text>

        <View style={styles.bullets}>
          <Bullet text="Phone numbers are hashed before leaving your device" />
          <Bullet text="Your contacts are never stored on our servers" />
          <Bullet text="Non-mySplit contacts are immediately discarded" />
        </View>

        <Pressable
          onPress={() => void onAllow()}
          style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed]}
          accessibilityRole="button"
          accessibilityLabel="Allow access to contacts"
        >
          <Text style={styles.primaryBtnTxt}>Allow access to contacts</Text>
        </Pressable>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.secondaryBtn, pressed && styles.secondaryBtnPressed]}
          accessibilityRole="button"
        >
          <Text style={styles.secondaryBtnTxt}>Not now</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function Bullet({ text }: { text: string }) {
  return (
    <View style={bulletStyles.row}>
      <View style={bulletStyles.ico}>
        <Ionicons name="checkmark" size={14} color={C.green} />
      </View>
      <Text style={bulletStyles.txt}>{text}</Text>
    </View>
  );
}

const bulletStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  ico: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#E1F5EE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  txt: {
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
    color: C.text,
    lineHeight: 17,
  },
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.sheetBg,
  },
  hero: {
    paddingHorizontal: 16,
    paddingBottom: 22,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 12,
  },
  backLbl: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
  },
  pageTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
    letterSpacing: -0.3,
  },
  body: {
    flex: 1,
    backgroundColor: C.sheetBg,
  },
  permIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#EEEDFE',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 14,
  },
  headline: {
    fontSize: 18,
    fontWeight: '700',
    color: C.text,
    textAlign: 'center',
    marginBottom: 10,
    letterSpacing: -0.3,
  },
  bodyTxt: {
    fontSize: 13,
    color: C.muted,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 22,
  },
  bullets: {
    backgroundColor: '#F8F7F4',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 22,
  },
  primaryBtn: {
    backgroundColor: C.purple,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  primaryBtnPressed: {
    opacity: 0.92,
  },
  primaryBtnTxt: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  secondaryBtn: {
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#D3D1C7',
  },
  secondaryBtnPressed: {
    opacity: 0.88,
  },
  secondaryBtnTxt: {
    fontSize: 14,
    color: C.muted,
  },
});
