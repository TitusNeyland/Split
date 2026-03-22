import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SubscriptionCard } from './SubscriptionCard';

const C = {
  purple: '#534AB7',
  red: '#E24B4A',
  text: '#1a1a18',
  muted: '#888780',
  border: 'rgba(0,0,0,0.06)',
  green: '#1D9E75',
  greenDark: '#0F6E56',
  orange: '#EF9F27',
  brown: '#854F0B',
  cream: '#FAEEDA',
  divider: '#F0EEE9',
};

type FilterId = 'active' | 'overdue' | 'paused' | 'archived';

function Pip({ initials, bg, color }: { initials: string; bg: string; color: string }) {
  return (
    <View style={[styles.pip, { backgroundColor: bg }]}>
      <Text style={[styles.pipTxt, { color }]}>{initials}</Text>
    </View>
  );
}

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <View style={styles.progTrack}>
      <View style={[styles.progFill, { width: `${pct}%`, backgroundColor: color }]} />
    </View>
  );
}

export function SubscriptionsDemoFloatCard() {
  return (
    <View style={styles.floatCard}>
      <View style={[styles.fcIcon, { backgroundColor: C.cream }]}>
        <Ionicons name="time-outline" size={20} color={C.brown} />
      </View>
      <View style={styles.fcMid}>
        <Text style={styles.fcTitle}>Netflix bills today</Text>
        <Text style={styles.fcSub}>2 of 3 members have paid · Sam still pending</Text>
      </View>
      <Pressable style={styles.nudgeBtn} accessibilityRole="button" accessibilityLabel="Nudge">
        <Text style={styles.nudgeBtnTxt}>Nudge</Text>
      </Pressable>
    </View>
  );
}

function OwnerBadgeRow() {
  return (
    <View style={styles.ownerBadge}>
      <Ionicons name="person-outline" size={10} color={C.purple} />
      <Text style={styles.ownerBadgeTxt}>You pay</Text>
    </View>
  );
}

function NetflixSplitEditor() {
  return (
    <View style={styles.splitEditor}>
      <View style={styles.seHeader}>
        <Text style={styles.seTitle}>Split method</Text>
        <View style={styles.seMethod}>
          <View style={[styles.seOpt, styles.seOptOn]}>
            <Text style={[styles.seOptTxt, styles.seOptTxtOn]}>Equal</Text>
          </View>
          <View style={styles.seOpt}>
            <Text style={styles.seOptTxt}>Custom %</Text>
          </View>
          <View style={styles.seOpt}>
            <Text style={styles.seOptTxt}>Fixed $</Text>
          </View>
        </View>
      </View>
      <View style={styles.splitRow}>
        <View style={[styles.splitAv, { backgroundColor: '#EEEDFE' }]}>
          <Text style={[styles.splitAvTxt, { color: C.purple }]}>JD</Text>
        </View>
        <Text style={styles.splitName}>Jordan (you)</Text>
        <View style={styles.splitInputFake}>
          <Text style={styles.splitInputFakeTxt}>33%</Text>
        </View>
        <Text style={styles.splitAmount}>$7.66</Text>
      </View>
      <View style={styles.splitRow}>
        <View style={[styles.splitAv, { backgroundColor: '#E1F5EE' }]}>
          <Text style={[styles.splitAvTxt, { color: C.greenDark }]}>AL</Text>
        </View>
        <Text style={styles.splitName}>Alex L.</Text>
        <View style={styles.splitInputFake}>
          <Text style={styles.splitInputFakeTxt}>33%</Text>
        </View>
        <Text style={styles.splitAmount}>$7.66</Text>
      </View>
      <View style={[styles.splitRow, styles.splitRowLast]}>
        <View style={[styles.splitAv, { backgroundColor: '#FAECE7' }]}>
          <Text style={[styles.splitAvTxt, { color: '#993C1D' }]}>SM</Text>
        </View>
        <Text style={styles.splitName}>Sam M.</Text>
        <View style={styles.splitInputFake}>
          <Text style={styles.splitInputFakeTxt}>34%</Text>
        </View>
        <Text style={styles.splitAmount}>$7.67</Text>
      </View>
      <View style={[styles.pctTotal, styles.pctOk]}>
        <Text style={styles.pctOkTxt}>Total: 100%</Text>
        <Text style={styles.pctOkTxt}>$22.99 ✓</Text>
      </View>
      <View style={styles.editorActions}>
        <Pressable style={styles.cancelEditorBtn}>
          <Text style={styles.cancelEditorTxt}>Cancel</Text>
        </Pressable>
        <Pressable style={styles.saveEditorBtn}>
          <Text style={styles.saveEditorTxt}>Save · effective next cycle</Text>
        </Pressable>
      </View>
    </View>
  );
}

function NetflixCard() {
  const [editorOpen, setEditorOpen] = useState(false);
  const [priceBannerVisible, setPriceBannerVisible] = useState(true);

  return (
    <SubscriptionCard
      priceChange={
        priceBannerVisible
          ? {
              message: 'Price changed $19.99 → $22.99 · effective next cycle',
              onDismiss: () => setPriceBannerVisible(false),
            }
          : undefined
      }
      icon={{ emoji: '📺', backgroundColor: '#E1F5EE' }}
      name="Netflix Premium"
      cycleLine="Monthly · Mar 18"
      isOwner
      autoCharge="on"
      totalAmount="$22.99"
      perPersonAmount="$7.66/person"
      members={[
        { id: '1', initials: 'JD', backgroundColor: '#EEEDFE', color: C.purple },
        { id: '2', initials: 'AL', backgroundColor: '#E1F5EE', color: C.greenDark },
        { id: '3', initials: 'SM', backgroundColor: '#FAECE7', color: '#993C1D' },
      ]}
      statusPill={{
        backgroundColor: C.cream,
        dotColor: C.orange,
        label: '1 pending',
        textColor: C.brown,
      }}
      dueLabel="Today"
      progress={{
        percentCollected: 66,
        collectedLabel: '$15.32 collected',
        rightLabel: '$22.99',
      }}
      onEditSplitPress={() => setEditorOpen((o) => !o)}
      editSplitButtonLabel={editorOpen ? 'Close editor' : 'Edit split'}
      belowEditSplit={editorOpen ? <NetflixSplitEditor /> : null}
    />
  );
}

function SpotifyCard() {
  return (
    <SubscriptionCard
      icon={{ emoji: '🎵', backgroundColor: '#EEEDFE' }}
      name="Spotify Family"
      cycleLine="Monthly · Mar 25"
      autoCharge="on"
      totalAmount="$16.99"
      perPersonAmount="$3.40/person"
      members={[
        { id: '1', initials: 'JD', backgroundColor: '#EEEDFE', color: C.purple },
        { id: '2', initials: 'AL', backgroundColor: '#E1F5EE', color: C.greenDark },
        { id: '3', initials: 'SM', backgroundColor: '#FAECE7', color: '#993C1D' },
        { id: '4', initials: 'TR', backgroundColor: '#E6F1FB', color: '#185FA5' },
        { id: '5', initials: 'KP', backgroundColor: '#EAF3DE', color: '#3B6D11' },
      ]}
      statusPill={{
        backgroundColor: '#E1F5EE',
        dotColor: C.green,
        label: 'All paid',
        textColor: C.greenDark,
      }}
      dueLabel="7 days"
      progress={{
        percentCollected: 100,
        collectedLabel: '$16.99 collected',
        rightLabel: 'Complete',
        isComplete: true,
      }}
      onEditSplitPress={() => {}}
    />
  );
}

function ICloudCard() {
  return (
    <SubscriptionCard
      icon={{ emoji: '☁️', backgroundColor: '#E6F1FB' }}
      name="iCloud 2TB"
      cycleLine="Monthly · Apr 3"
      autoCharge="off"
      totalAmount="$9.99"
      perPersonAmount="$2.50/person"
      members={[
        { id: '1', initials: 'JD', backgroundColor: '#EEEDFE', color: C.purple },
        { id: '2', initials: 'AL', backgroundColor: '#E1F5EE', color: C.greenDark },
        { id: '3', initials: 'SM', backgroundColor: '#FAECE7', color: '#993C1D' },
        { id: '4', initials: 'TR', backgroundColor: '#E6F1FB', color: '#185FA5' },
      ]}
      statusPill={{
        backgroundColor: '#F0EEE9',
        dotColor: C.muted,
        label: 'Not started',
        textColor: '#5F5E5A',
      }}
      dueLabel="17 days"
      progress={{
        percentCollected: 0,
        collectedLabel: '$0 collected',
        rightLabel: '$9.99',
        rightLabelColor: C.muted,
        barColor: C.muted,
      }}
      onEditSplitPress={() => {}}
    />
  );
}

function HuluOverdueCard() {
  return (
    <View style={[styles.subCard, styles.subCardOverdue]}>
      <View style={styles.overdueBanner}>
        <Ionicons name="alert-circle-outline" size={14} color="#A32D2D" />
        <Text style={styles.overdueBannerTxt}>3 days overdue — Sam hasn&apos;t paid $4.00</Text>
        <Pressable style={styles.remindBtn}>
          <Text style={styles.remindBtnTxt}>Remind</Text>
        </Pressable>
      </View>
      <View style={styles.subMain}>
        <View style={styles.subTop}>
          <View style={[styles.subIco, { backgroundColor: '#FCEBEB' }]}>
            <Text style={styles.subEmoji}>🎬</Text>
          </View>
          <View style={styles.subInfo}>
            <Text style={styles.subName}>Hulu</Text>
            <View style={styles.subMetaRow}>
              <Text style={styles.subCycle}>Monthly · billed Mar 12</Text>
              <OwnerBadgeRow />
            </View>
          </View>
          <View>
            <Text style={[styles.subTotal, { color: C.red }]}>$7.99</Text>
            <Text style={styles.subPer}>$4.00/person</Text>
          </View>
        </View>
        <View style={styles.memberRow}>
          <View style={styles.pips}>
            <Pip initials="JD" bg="#EEEDFE" color={C.purple} />
            <Pip initials="SM" bg="#FAECE7" color="#993C1D" />
          </View>
          <View style={[styles.statusPill, { backgroundColor: '#FCEBEB' }]}>
            <View style={[styles.statusDot, { backgroundColor: C.red }]} />
            <Text style={[styles.statusTxt, { color: '#A32D2D' }]}>Overdue</Text>
          </View>
        </View>
        <View style={styles.progWrap}>
          <ProgressBar pct={50} color={C.red} />
          <View style={styles.progLabels}>
            <Text style={styles.progLbl}>$4.00 of $7.99</Text>
            <Text style={[styles.progAmt, { color: C.red }]}>$3.99 missing</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

function XboxPausedCard() {
  return (
    <View style={[styles.subCard, styles.subCardPaused]}>
      <View style={styles.pausedBanner}>
        <Ionicons name="pause" size={14} color="#5F5E5A" />
        <Text style={styles.pausedBannerTxt}>Paused · skipping billing cycles</Text>
        <Pressable hitSlop={6}>
          <Text style={styles.resumeTxt}>Resume</Text>
        </Pressable>
      </View>
      <View style={styles.subMain}>
        <View style={styles.subTop}>
          <View style={[styles.subIco, { backgroundColor: '#F0EEE9' }]}>
            <Text style={styles.subEmoji}>🎮</Text>
          </View>
          <View style={styles.subInfo}>
            <Text style={[styles.subName, { color: C.muted }]}>Xbox Game Pass</Text>
            <View style={styles.subMetaRow}>
              <Text style={styles.subCycle}>Monthly · was Apr 1</Text>
            </View>
          </View>
          <View>
            <Text style={[styles.subTotal, { color: C.muted }]}>$14.99</Text>
            <Text style={styles.subPer}>$7.50/person</Text>
          </View>
        </View>
        <View style={styles.memberRow}>
          <View style={styles.pips}>
            <Pip initials="JD" bg="#F0EEE9" color={C.muted} />
            <Pip initials="TR" bg="#F0EEE9" color={C.muted} />
          </View>
          <View style={[styles.statusPill, { backgroundColor: '#F0EEE9' }]}>
            <View style={[styles.statusDot, { backgroundColor: C.muted }]} />
            <Text style={[styles.statusTxt, { color: '#5F5E5A' }]}>Paused</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

export function SubscriptionsDemoPanel({ filter }: { filter: FilterId }) {
  if (filter === 'active') {
    return (
      <View style={styles.panel}>
        <View style={styles.sh}>
          <Text style={[styles.shTitle, styles.activeSplitsShTitle]}>Active splits</Text>
          <Text style={[styles.shAction, styles.activeSplitsShAction]}>Sort</Text>
        </View>
        <NetflixCard />
        <SpotifyCard />
        <ICloudCard />
      </View>
    );
  }
  if (filter === 'overdue') {
    return (
      <View style={styles.panel}>
        <View style={styles.sh}>
          <Text style={styles.shTitle}>Needs attention</Text>
        </View>
        <HuluOverdueCard />
      </View>
    );
  }
  if (filter === 'paused') {
    return (
      <View style={styles.panel}>
        <View style={styles.sh}>
          <Text style={styles.shTitle}>Paused</Text>
        </View>
        <XboxPausedCard />
      </View>
    );
  }
  return (
    <View style={styles.panel}>
      <View style={styles.empty}>
        <View style={styles.emptyIcon}>
          <Ionicons name="file-tray-stacked-outline" size={28} color={C.muted} />
        </View>
        <Text style={styles.emptyTitle}>No archived subscriptions</Text>
        <Text style={styles.emptySub}>Cancelled subscriptions{'\n'}will appear here</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  floatCard: {
    backgroundColor: '#fff',
    borderRadius: 22,
    marginHorizontal: 14,
    marginTop: -18,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 0.5,
    borderColor: C.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 12,
    elevation: 3,
  },
  fcIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fcMid: { flex: 1, minWidth: 0 },
  fcTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: C.text,
  },
  fcSub: {
    fontSize: 12,
    color: C.muted,
    marginTop: 2,
  },
  nudgeBtn: {
    backgroundColor: C.purple,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 10,
  },
  nudgeBtnTxt: {
    fontSize: 12,
    fontWeight: '500',
    color: '#fff',
  },
  panel: {
    paddingTop: 4,
  },
  sh: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    marginBottom: 10,
  },
  shTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: C.muted,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  shAction: {
    fontSize: 14,
    color: C.purple,
    fontWeight: '500',
  },
  activeSplitsShTitle: {
    fontSize: 16,
    letterSpacing: 0.55,
  },
  activeSplitsShAction: {
    fontSize: 19,
  },
  subCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    marginBottom: 9,
    borderWidth: 0.5,
    borderColor: C.border,
    overflow: 'hidden',
  },
  subCardOverdue: {
    borderColor: '#F09595',
  },
  subCardPaused: {
    borderColor: '#D3D1C7',
    opacity: 0.95,
  },
  overdueBanner: {
    backgroundColor: '#FCEBEB',
    paddingVertical: 8,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  overdueBannerTxt: {
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
    color: '#A32D2D',
  },
  remindBtn: {
    backgroundColor: C.red,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  remindBtnTxt: {
    fontSize: 11,
    fontWeight: '500',
    color: '#fff',
  },
  pausedBanner: {
    backgroundColor: '#F5F3EE',
    paddingVertical: 8,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  pausedBannerTxt: {
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
    color: '#5F5E5A',
  },
  resumeTxt: {
    fontSize: 12,
    fontWeight: '500',
    color: C.purple,
  },
  subMain: {
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  subTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 11,
  },
  subIco: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subEmoji: {
    fontSize: 18,
  },
  subInfo: {
    flex: 1,
    minWidth: 0,
  },
  subName: {
    fontSize: 15,
    fontWeight: '600',
    color: C.text,
    letterSpacing: -0.2,
  },
  subMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginTop: 3,
  },
  subCycle: {
    fontSize: 12,
    color: C.muted,
  },
  ownerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#EEEDFE',
    borderRadius: 8,
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  ownerBadgeTxt: {
    fontSize: 10,
    fontWeight: '500',
    color: C.purple,
  },
  subTotal: {
    fontSize: 17,
    fontWeight: '600',
    color: C.text,
    textAlign: 'right',
    letterSpacing: -0.3,
  },
  subPer: {
    fontSize: 12,
    color: C.muted,
    textAlign: 'right',
    marginTop: 2,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  pips: {
    flexDirection: 'row',
  },
  pip: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -6,
    borderWidth: 2,
    borderColor: '#fff',
  },
  pipTxt: {
    fontSize: 9,
    fontWeight: '600',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 8,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  statusTxt: {
    fontSize: 10,
    fontWeight: '500',
  },
  progWrap: {
    marginTop: 0,
  },
  progTrack: {
    height: 3,
    backgroundColor: '#F0EEE9',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 5,
  },
  progFill: {
    height: 3,
    borderRadius: 2,
  },
  progLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progLbl: {
    fontSize: 11,
    color: C.muted,
  },
  progAmt: {
    fontSize: 11,
    fontWeight: '600',
  },
  splitEditor: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderTopWidth: 0.5,
    borderTopColor: C.divider,
    backgroundColor: '#FAFAF8',
  },
  seHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    flexWrap: 'wrap',
    gap: 8,
  },
  seTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: C.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  seMethod: {
    flexDirection: 'row',
    backgroundColor: '#F0EEE9',
    borderRadius: 8,
    padding: 2,
    gap: 0,
  },
  seOpt: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 7,
  },
  seOptOn: {
    backgroundColor: '#fff',
  },
  seOptTxt: {
    fontSize: 12,
    fontWeight: '500',
    color: C.muted,
  },
  seOptTxtOn: {
    color: C.purple,
  },
  splitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: '#F5F3EE',
  },
  splitRowLast: {
    borderBottomWidth: 0,
  },
  splitAv: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  splitAvTxt: {
    fontSize: 11,
    fontWeight: '600',
  },
  splitName: {
    flex: 1,
    fontSize: 15,
    color: C.text,
  },
  splitInputFake: {
    width: 44,
    backgroundColor: '#F0EEE9',
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 6,
    alignItems: 'center',
  },
  splitInputFakeTxt: {
    fontSize: 14,
    fontWeight: '500',
    color: C.text,
  },
  splitAmount: {
    width: 56,
    textAlign: 'right',
    fontSize: 15,
    fontWeight: '600',
    color: C.text,
  },
  pctTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    marginTop: 6,
  },
  pctOk: {
    backgroundColor: '#E1F5EE',
  },
  pctOkTxt: {
    fontSize: 13,
    color: C.greenDark,
    fontWeight: '500',
  },
  editorActions: {
    flexDirection: 'row',
    gap: 7,
    marginTop: 10,
  },
  cancelEditorBtn: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: '#F0EEE9',
    borderRadius: 10,
    alignItems: 'center',
  },
  cancelEditorTxt: {
    fontSize: 15,
    fontWeight: '500',
    color: '#5F5E5A',
  },
  saveEditorBtn: {
    flex: 2,
    paddingVertical: 10,
    backgroundColor: C.purple,
    borderRadius: 10,
    alignItems: 'center',
  },
  saveEditorTxt: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptyIcon: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#F0EEE9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '500',
    color: C.text,
    marginBottom: 4,
  },
  emptySub: {
    fontSize: 15,
    color: C.muted,
    textAlign: 'center',
    lineHeight: 22,
  },
});
