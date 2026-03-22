import * as Device from 'expo-device';
import { Platform } from 'react-native';

export type AuthSessionDeviceType = 'phone' | 'tablet' | 'laptop' | 'desktop';

export function getDeviceTypeCategory(): AuthSessionDeviceType {
  if (Platform.OS === 'web') return 'laptop';
  const t = Device.deviceType;
  if (t === Device.DeviceType.TABLET) return 'tablet';
  if (t === Device.DeviceType.DESKTOP) return 'laptop';
  if (t === Device.DeviceType.TV) return 'desktop';
  return 'phone';
}

export function getDeviceDisplayName(): string {
  if (Device.modelName) return Device.modelName;
  if (Device.deviceName) return Device.deviceName;
  if (Platform.OS === 'ios') return 'iPhone';
  if (Platform.OS === 'android') return 'Android device';
  return 'Web browser';
}
