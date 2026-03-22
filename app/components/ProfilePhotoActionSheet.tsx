import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  TouchableWithoutFeedback,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

const C = {
  sheetBg: '#F2F0EB',
  card: '#fff',
  text: '#1a1a18',
  muted: '#888780',
  danger: '#E24B4A',
  purple: '#534AB7',
  greenTint: '#E1F5EE',
  greenIcon: '#0F6E56',
  purpleTint: '#EEEDFE',
  redTint: '#FCEBEB',
  redIcon: '#A32D2D',
};

type Props = {
  visible: boolean;
  onClose: () => void;
  hasPhoto: boolean;
  onTakePhoto: () => void;
  onChooseLibrary: () => void;
  onRemovePhoto: () => void;
};

export function ProfilePhotoActionSheet({
  visible,
  onClose,
  hasPhoto,
  onTakePhoto,
  onChooseLibrary,
  onRemovePhoto,
}: Props) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.wrap}>
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 14) }]}>
          <View style={styles.handle} />
          <Text style={styles.sheetTitle}>Profile photo</Text>

          <View style={styles.actionsCard}>
            <Pressable
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={() => {
                onTakePhoto();
                onClose();
              }}
              accessibilityRole="button"
              accessibilityLabel="Take photo"
            >
              <View style={[styles.rowIco, { backgroundColor: C.purpleTint }]}>
                <Ionicons name="camera-outline" size={18} color={C.purple} />
              </View>
              <Text style={styles.rowTxt}>Take photo</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.row,
                !hasPhoto && styles.rowNoBorder,
                pressed && styles.rowPressed,
              ]}
              onPress={() => {
                onChooseLibrary();
                onClose();
              }}
              accessibilityRole="button"
              accessibilityLabel="Choose from library"
            >
              <View style={[styles.rowIco, { backgroundColor: C.greenTint }]}>
                <Ionicons name="images-outline" size={18} color={C.greenIcon} />
              </View>
              <Text style={styles.rowTxt}>Choose from library</Text>
            </Pressable>

            {hasPhoto ? (
              <Pressable
                style={({ pressed }) => [styles.row, styles.rowNoBorder, pressed && styles.rowPressed]}
                onPress={() => {
                  onRemovePhoto();
                  onClose();
                }}
                accessibilityRole="button"
                accessibilityLabel="Remove profile photo"
              >
                <View style={[styles.rowIco, { backgroundColor: C.redTint }]}>
                  <Ionicons name="trash-outline" size={18} color={C.redIcon} />
                </View>
                <Text style={[styles.rowTxt, styles.dangerTxt]}>Remove photo</Text>
              </Pressable>
            ) : null}
          </View>

          <Pressable
            style={({ pressed }) => [styles.cancelCard, pressed && styles.rowPressed]}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
          >
            <Text style={styles.cancelTxt}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    backgroundColor: C.sheetBg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D3D1C7',
    alignSelf: 'center',
    marginBottom: 12,
  },
  sheetTitle: {
    fontSize: 12,
    color: C.muted,
    textAlign: 'center',
    marginBottom: 10,
  },
  actionsCard: {
    backgroundColor: C.card,
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F5F3EE',
  },
  rowNoBorder: {
    borderBottomWidth: 0,
  },
  rowPressed: {
    backgroundColor: 'rgba(0,0,0,0.03)',
  },
  rowIco: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTxt: {
    fontSize: 15,
    fontWeight: '500',
    color: C.text,
  },
  dangerTxt: {
    color: C.danger,
  },
  cancelCard: {
    backgroundColor: C.card,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelTxt: {
    fontSize: 15,
    fontWeight: '600',
    color: C.text,
  },
});
