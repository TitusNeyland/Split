import { Platform } from 'react-native';
import * as Linking from 'expo-linking';

/** Replace with real store IDs when published. */
const IOS_APP_STORE =
  process.env.EXPO_PUBLIC_IOS_APP_STORE_URL?.trim() || 'https://apps.apple.com/app/id0000000000';
const PLAY_STORE =
  process.env.EXPO_PUBLIC_ANDROID_PLAY_STORE_URL?.trim() ||
  'https://play.google.com/store/apps/details?id=com.mysplit.app';

export function openAppStoreDownload(): void {
  void Linking.openURL(Platform.OS === 'ios' ? IOS_APP_STORE : PLAY_STORE);
}
