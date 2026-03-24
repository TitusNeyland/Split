import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Share,
  Platform,
  Linking,
  Alert,
  type ViewStyle,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';

const C = {
  sheetBg: '#F2F0EB',
  purple: '#534AB7',
  text: '#1a1a18',
  muted: '#888780',
  border: 'rgba(0,0,0,0.06)',
};

export type InviteShareSheetPanelProps = {
  inviteUrl: string;
  shareMessage: string;
  /** Optional context, e.g. name from add-member search. */
  subtitle?: string | null;
  onClose: () => void;
  containerStyle?: ViewStyle;
};

export function InviteShareSheetPanel({
  inviteUrl,
  shareMessage,
  subtitle,
  onClose,
  containerStyle,
}: InviteShareSheetPanelProps) {
  const [copied, setCopied] = useState(false);

  const shortUrlDisplay = inviteUrl.replace(/^https?:\/\//i, '');

  const onCopy = useCallback(async () => {
    await Clipboard.setStringAsync(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [inviteUrl]);

  const openOrShare = useCallback(
    async (buildUrl: () => string | null, label: string) => {
      const target = buildUrl();
      if (target) {
        try {
          const can = await Linking.canOpenURL(target);
          if (can) {
            await Linking.openURL(target);
            return;
          }
        } catch {
          /* fall through */
        }
      }
      try {
        await Share.share({
          message: Platform.OS === 'ios' ? shareMessage : `${shareMessage}`,
          url: Platform.OS === 'ios' ? inviteUrl : undefined,
        });
      } catch {
        Alert.alert('Could not open', `Use Copy link or try ${label} from the system share sheet.`);
      }
    },
    [inviteUrl, shareMessage]
  );

  const openMessages = useCallback(() => {
    const body = encodeURIComponent(shareMessage);
    const url =
      Platform.OS === 'ios'
        ? `sms:&body=${body}`
        : `sms:?body=${body}`;
    void openOrShare(() => url, 'Messages');
  }, [openOrShare, shareMessage]);

  const openWhatsApp = useCallback(() => {
    const text = encodeURIComponent(shareMessage);
    void openOrShare(() => `whatsapp://send?text=${text}`, 'WhatsApp');
  }, [openOrShare, shareMessage]);

  const openEmail = useCallback(() => {
    const body = encodeURIComponent(shareMessage);
    const sub = encodeURIComponent('Join me on mySplit');
    void openOrShare(() => `mailto:?subject=${sub}&body=${body}`, 'Email');
  }, [openOrShare, shareMessage]);

  const openSystemShare = useCallback(async () => {
    try {
      await Share.share({
        message: Platform.OS === 'ios' ? shareMessage : `${shareMessage}`,
        ...(Platform.OS === 'ios' ? { url: inviteUrl } : {}),
      });
    } catch {
      /* dismissed */
    }
  }, [inviteUrl, shareMessage]);

  return (
    <View style={[styles.sheet, containerStyle]}>
      <View style={styles.handle} />
      <Text style={styles.sheetTitle}>Invite a friend to mySplit</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

      <View style={styles.shareGrid}>
        <Pressable style={styles.shareApp} onPress={openMessages} accessibilityRole="button" accessibilityLabel="Share via Messages">
          <View style={[styles.shareAppIco, { backgroundColor: '#34C759' }]}>
            <Ionicons name="chatbubble-outline" size={20} color="#fff" />
          </View>
          <Text style={styles.shareAppLbl}>Messages</Text>
        </Pressable>
        <Pressable style={styles.shareApp} onPress={openWhatsApp} accessibilityRole="button" accessibilityLabel="Share via WhatsApp">
          <View style={[styles.shareAppIco, { backgroundColor: '#25D366' }]}>
            <Ionicons name="chatbubble-outline" size={20} color="#fff" />
          </View>
          <Text style={styles.shareAppLbl}>WhatsApp</Text>
        </Pressable>
        <Pressable style={styles.shareApp} onPress={openEmail} accessibilityRole="button" accessibilityLabel="Share via email">
          <View style={[styles.shareAppIco, { backgroundColor: '#1DA1F2' }]}>
            <Ionicons name="mail-outline" size={20} color="#fff" />
          </View>
          <Text style={styles.shareAppLbl}>Email</Text>
        </Pressable>
        <Pressable style={styles.shareApp} onPress={openSystemShare} accessibilityRole="button" accessibilityLabel="More share options">
          <View style={[styles.shareAppIco, { backgroundColor: '#F0EEE9' }]}>
            <Ionicons name="share-social-outline" size={20} color={C.purple} />
          </View>
          <Text style={styles.shareAppLbl}>More</Text>
        </Pressable>
      </View>

      <View style={styles.copyRow}>
        <Ionicons name="link-outline" size={14} color={C.muted} />
        <Text style={styles.copyUrl} numberOfLines={1}>
          {shortUrlDisplay}
        </Text>
        <Pressable onPress={onCopy} style={styles.copyBtn} accessibilityRole="button" accessibilityLabel="Copy invite link">
          <Text style={styles.copyBtnTxt}>{copied ? 'Copied' : 'Copy'}</Text>
        </Pressable>
      </View>

      <Text style={styles.expiryNote}>Link expires in 7 days</Text>

      <Pressable
        onPress={onClose}
        style={({ pressed }) => [styles.sheetCancel, pressed && { opacity: 0.9 }]}
        accessibilityRole="button"
        accessibilityLabel="Close"
      >
        <Text style={styles.sheetCancelTxt}>Cancel</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: C.sheetBg,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 14,
  },
  handle: {
    width: 34,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D3D1C7',
    alignSelf: 'center',
    marginBottom: 10,
  },
  sheetTitle: {
    fontSize: 11,
    color: C.muted,
    textAlign: 'center',
    marginBottom: 9,
    fontWeight: '500',
  },
  subtitle: {
    fontSize: 12,
    color: C.text,
    textAlign: 'center',
    marginBottom: 8,
    fontWeight: '500',
  },
  shareGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 8,
  },
  shareApp: {
    width: '22%',
    minWidth: 72,
    alignItems: 'center',
    gap: 5,
  },
  shareAppIco: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareAppLbl: {
    fontSize: 9,
    color: C.text,
    textAlign: 'center',
  },
  copyRow: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
    borderWidth: 0.5,
    borderColor: C.border,
  },
  copyUrl: {
    flex: 1,
    fontSize: 10,
    color: C.muted,
  },
  copyBtn: {
    backgroundColor: C.purple,
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  copyBtnTxt: {
    fontSize: 10,
    fontWeight: '600',
    color: '#fff',
  },
  expiryNote: {
    fontSize: 10,
    color: C.muted,
    textAlign: 'center',
    marginBottom: 10,
  },
  sheetCancel: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: C.border,
  },
  sheetCancelTxt: {
    fontSize: 13,
    fontWeight: '600',
    color: C.text,
  },
});
