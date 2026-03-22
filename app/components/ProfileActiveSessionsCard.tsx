import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { User } from 'firebase/auth';
import {
  subscribeAuthSessions,
  type AuthSessionEntry,
} from '../../lib/authSessionsFirestore';
import { getOrCreateDeviceSessionId } from '../../lib/deviceSessionIdentity';
import { revokeOtherAuthSession } from '../../lib/revokeAuthSession';

const C = {
  text: '#1a1a18',
  muted: '#888780',
  border: 'rgba(0,0,0,0.06)',
  divider: '#F5F3EE',
  green: '#1D9E75',
  red: '#E24B4A',
  lilac: '#EEEDFE',
  purple: '#534AB7',
};

const DEMO_SESSIONS: AuthSessionEntry[] = [
  {
    id: 'demo_phone',
    deviceName: 'iPhone 15 Pro',
    deviceType: 'phone',
    lastActive: new Date(),
  },
  {
    id: 'demo_laptop',
    deviceName: 'MacBook Pro',
    deviceType: 'laptop',
    lastActive: new Date(2026, 2, 14, 12, 0, 0),
  },
  {
    id: 'demo_tablet',
    deviceName: 'iPad Air',
    deviceType: 'tablet',
    lastActive: new Date(2026, 2, 10, 9, 0, 0),
  },
];

function formatLastActive(d: Date): string {
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  const label = d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
  return `Last active ${label}`;
}

function deviceIconName(
  t: AuthSessionEntry['deviceType']
): keyof typeof Ionicons.glyphMap {
  if (t === 'laptop' || t === 'desktop') return 'laptop-outline';
  if (t === 'tablet') return 'tablet-portrait-outline';
  return 'phone-portrait-outline';
}

type Props = {
  user: User | null;
  persist: boolean;
};

export default function ProfileActiveSessionsCard({ user, persist }: Props) {
  const [localSessionId, setLocalSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<AuthSessionEntry[]>([]);
  const [loading, setLoading] = useState(persist);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const id = await getOrCreateDeviceSessionId();
        if (alive) setLocalSessionId(id);
      } catch {
        if (alive) setLocalSessionId(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!persist || !user) {
      setLoading(false);
      setSessions([]);
      return;
    }
    setLoading(true);
    const unsub = subscribeAuthSessions(
      user.uid,
      (list) => {
        setSessions(list);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, [persist, user?.uid]);

  const displayList = useMemo(() => {
    if (persist && user) return sessions;
    return DEMO_SESSIONS;
  }, [persist, user, sessions]);

  const resolveCurrentId = useMemo(() => {
    if (!persist) return DEMO_SESSIONS[0]!.id;
    return localSessionId;
  }, [persist, localSessionId]);

  const onRevoke = useCallback(
    (row: AuthSessionEntry) => {
      if (!persist || !user) {
        Alert.alert('Demo', 'Sign in with Firebase and run the API server to revoke real sessions.');
        return;
      }
      Alert.alert(
        `Sign out of ${row.deviceName}?`,
        'This device will need to log in again.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Revoke',
            style: 'destructive',
            onPress: () =>
              void (async () => {
                setRevokingId(row.id);
                try {
                  const idToken = await user.getIdToken();
                  await revokeOtherAuthSession(user.uid, row.id, idToken);
                } catch (e) {
                  const msg = e instanceof Error ? e.message : 'Could not revoke session.';
                  Alert.alert('Revoke failed', msg);
                } finally {
                  setRevokingId(null);
                }
              })(),
          },
        ]
      );
    },
    [persist, user]
  );

  if (persist && !user) {
    return null;
  }

  return (
    <View style={styles.card}>
      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={C.purple} />
        </View>
      ) : (
        displayList.map((row, i) => {
          const isCurrent = resolveCurrentId != null && row.id === resolveCurrentId;
          return (
            <React.Fragment key={row.id}>
              {i > 0 ? <View style={styles.hairline} /> : null}
              <View style={styles.row}>
                <View style={[styles.iconBox, { backgroundColor: C.lilac }]}>
                  <Ionicons name={deviceIconName(row.deviceType)} size={20} color={C.purple} />
                </View>
                <View style={styles.mid}>
                  <Text style={styles.title}>{row.deviceName}</Text>
                  <Text
                    style={[styles.sub, isCurrent ? styles.subCurrent : styles.subOther]}
                  >
                    {isCurrent
                      ? 'This device · active now'
                      : row.lastActive
                        ? formatLastActive(row.lastActive)
                        : 'Last active unknown'}
                  </Text>
                </View>
                {isCurrent ? (
                  <View style={styles.currentBadge}>
                    <Text style={styles.currentBadgeTxt}>Current</Text>
                  </View>
                ) : (
                  <Pressable
                    onPress={() => onRevoke(row)}
                    disabled={revokingId === row.id}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Revoke ${row.deviceName}`}
                  >
                    {revokingId === row.id ? (
                      <ActivityIndicator size="small" color={C.red} />
                    ) : (
                      <Text style={styles.revokeTxt}>Revoke</Text>
                    )}
                  </Pressable>
                )}
              </View>
            </React.Fragment>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 10,
    elevation: 3,
  },
  loadingRow: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  hairline: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.divider,
    marginLeft: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mid: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: C.text,
  },
  sub: {
    fontSize: 12,
    marginTop: 2,
  },
  subCurrent: {
    color: C.green,
    fontWeight: '500',
  },
  subOther: {
    color: C.muted,
  },
  currentBadge: {
    backgroundColor: 'rgba(29, 158, 117, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  currentBadgeTxt: {
    fontSize: 12,
    fontWeight: '700',
    color: C.green,
  },
  revokeTxt: {
    fontSize: 14,
    fontWeight: '600',
    color: C.red,
  },
});
