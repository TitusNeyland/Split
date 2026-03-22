import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

export type ReminderPickCandidate = {
  id: string;
  name: string;
  detail: string;
  overdue: boolean;
};

export type HomeReminderPickerModalProps = {
  visible: boolean;
  onClose: () => void;
  candidates: ReminderPickCandidate[];
  onSelect: (c: ReminderPickCandidate) => void;
};

const C = {
  purple: '#534AB7',
  muted: '#888780',
  text: '#1a1a18',
  border: 'rgba(0,0,0,0.08)',
  red: '#E24B4A',
  sheetBg: '#F2F0EB',
};

export function HomeReminderPickerModal({
  visible,
  onClose,
  candidates,
  onSelect,
}: HomeReminderPickerModalProps) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const maxSheet = Math.min(height * 0.55, 420);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable
          style={styles.backdropFill}
          onPress={onClose}
          accessibilityLabel="Dismiss reminder picker"
        />
        <View style={[styles.sheetOuter, { paddingBottom: insets.bottom + 12 }]} pointerEvents="box-none">
          <View style={[styles.sheet, { maxHeight: maxSheet }]} pointerEvents="auto">
          <View style={styles.sheetHandleArea}>
            <View style={styles.handle} />
          </View>
          <Text style={styles.title}>Send reminder</Text>
          <Text style={styles.subtitle}>Choose who to remind — overdue first.</Text>
          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {candidates.length === 0 ? (
              <Text style={styles.empty}>No members to remind yet.</Text>
            ) : (
              candidates.map((c) => (
                <Pressable
                  key={c.id}
                  style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                  onPress={() => onSelect(c)}
                  accessibilityRole="button"
                  accessibilityLabel={`Remind ${c.name}`}
                >
                  <View style={styles.rowText}>
                    <View style={styles.nameRow}>
                      <Text style={styles.name}>{c.name}</Text>
                      {c.overdue ? (
                        <View style={styles.badge}>
                          <Text style={styles.badgeTxt}>Overdue</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.detail} numberOfLines={2}>
                      {c.detail}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={C.muted} />
                </Pressable>
              ))
            )}
          </ScrollView>
          <Pressable style={styles.cancelBtn} onPress={onClose} accessibilityRole="button">
            <Text style={styles.cancelTxt}>Cancel</Text>
          </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdropFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheetOuter: {
    paddingHorizontal: 14,
  },
  sheet: {
    backgroundColor: C.sheetBg,
    borderRadius: 18,
    borderWidth: 0.5,
    borderColor: C.border,
    overflow: 'hidden',
  },
  sheetHandleArea: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 4,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: C.text,
    paddingHorizontal: 18,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: C.muted,
    paddingHorizontal: 18,
    marginBottom: 12,
  },
  list: {
    maxHeight: 280,
  },
  listContent: {
    paddingHorizontal: 10,
    paddingBottom: 8,
  },
  empty: {
    fontSize: 14,
    color: C.muted,
    textAlign: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 0.5,
    borderColor: C.border,
    marginBottom: 8,
  },
  rowPressed: {
    opacity: 0.9,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: C.text,
  },
  badge: {
    backgroundColor: 'rgba(226,75,74,0.12)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeTxt: {
    fontSize: 11,
    fontWeight: '600',
    color: C.red,
  },
  detail: {
    fontSize: 13,
    color: C.muted,
    marginTop: 2,
  },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 4,
  },
  cancelTxt: {
    fontSize: 16,
    fontWeight: '600',
    color: C.purple,
  },
});
