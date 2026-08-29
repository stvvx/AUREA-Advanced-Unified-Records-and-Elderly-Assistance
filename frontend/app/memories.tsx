/**
 * app/memories.tsx — LOLO AUREA Long-Term Memory Manager
 *
 * A premium screen that shows what AUREA remembers about the user.
 * Memories are grouped by category, color-coded by priority,
 * and can be individually or bulk-deleted.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Types ────────────────────────────────────────────────────────────────────

type MemoryPriority = 'low' | 'medium' | 'high' | 'critical';
type MemoryCategory =
  | 'personal'
  | 'health'
  | 'preference'
  | 'event'
  | 'conversation'
  | 'other';

interface Memory {
  id: string;
  user_id: number;
  content: string;
  priority: MemoryPriority;
  category: MemoryCategory;
  source_conversation_id?: string;
  created_at: string;
  last_accessed_at?: string;
}

// ─── Theme ────────────────────────────────────────────────────────────────────

const COLORS = {
  bg:          '#0A1628',
  surface:     'rgba(255,255,255,0.055)',
  border:      'rgba(255,255,255,0.1)',
  primary:     '#1E60FF',
  text:        '#F0F4FF',
  textDim:     'rgba(240,244,255,0.55)',
  textFaint:   'rgba(240,244,255,0.3)',
};

const PRIORITY_COLORS: Record<MemoryPriority, string> = {
  critical: '#DC2626',
  high:     '#D97706',
  medium:   '#16A34A',
  low:      '#4B6584',
};

const CATEGORY_CONFIG: Record<
  MemoryCategory,
  { label: string; emoji: string; color: string }
> = {
  personal:     { label: 'Personal',    emoji: '👤', color: '#1E60FF' },
  health:       { label: 'Kalusugan',   emoji: '🏥', color: '#DC2626' },
  preference:   { label: 'Gusto',       emoji: '❤️', color: '#7C3AED' },
  event:        { label: 'Kaganapan',   emoji: '📅', color: '#16A34A' },
  conversation: { label: 'Nabanggit',   emoji: '💬', color: '#0891B2' },
  other:        { label: 'Iba Pa',      emoji: '📝', color: '#4B6584' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BASE_URL =
  process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5000';

function getApiUrl(): string {
  if (Platform.OS === 'android' && BASE_URL.includes('localhost')) {
    return BASE_URL.replace('localhost', '10.0.2.2');
  }
  return BASE_URL;
}

async function fetchMemories(userId: number): Promise<Memory[]> {
  const url = `${getApiUrl()}/api/lolo/memory?userId=${userId}&limit=100`;
  const res  = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.memories || [];
}

async function deleteOneMemory(memoryId: string): Promise<void> {
  const url = `${getApiUrl()}/api/lolo/memory/${memoryId}`;
  const res  = await fetch(url, { method: 'DELETE' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

async function deleteAllMemoriesApi(userId: number): Promise<void> {
  const url = `${getApiUrl()}/api/lolo/memory/all?userId=${userId}`;
  const res  = await fetch(url, { method: 'DELETE' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60000);
  if (mins < 60)    return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs  < 24)    return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30)    return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

// ─── Memory Card ──────────────────────────────────────────────────────────────

const MemoryCard = React.memo(function MemoryCard({
  item,
  onDelete,
  index,
}: {
  item: Memory;
  onDelete: (id: string) => void;
  index: number;
}) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 350,
        delay: index * 50,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 350,
        delay: index * 50,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const cat      = CATEGORY_CONFIG[item.category] || CATEGORY_CONFIG.other;
  const priColor = PRIORITY_COLORS[item.priority]  || PRIORITY_COLORS.low;

  const handleDelete = () => {
    Alert.alert(
      'Burahin ang Alaala?',
      `"${item.content.slice(0, 60)}${item.content.length > 60 ? '…' : ''}"`,
      [
        { text: 'Huwag', style: 'cancel' },
        { text: 'Burahin', style: 'destructive', onPress: () => onDelete(item.id) },
      ]
    );
  };

  return (
    <Animated.View
      style={[
        st.card,
        { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
      ]}
    >
      {/* Priority stripe */}
      <View style={[st.priorityStripe, { backgroundColor: priColor }]} />

      <View style={st.cardBody}>
        {/* Header */}
        <View style={st.cardHeader}>
          <View style={[st.catBadge, { backgroundColor: cat.color + '22', borderColor: cat.color + '55' }]}>
            <Text style={st.catEmoji}>{cat.emoji}</Text>
            <Text style={[st.catLabel, { color: cat.color }]}>{cat.label}</Text>
          </View>
          <Text style={[st.priorityDot, { color: priColor }]}>
            {item.priority.toUpperCase()}
          </Text>
        </View>

        {/* Content */}
        <Text style={st.cardContent}>{item.content}</Text>

        {/* Footer */}
        <View style={st.cardFooter}>
          <Text style={st.timeAgo}>{timeAgo(item.created_at)}</Text>
          <TouchableOpacity
            onPress={handleDelete}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={st.deleteBtn}
          >
            <Text style={st.deleteBtnText}>🗑️</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );
});

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState() {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 1400, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1.00, duration: 1400, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <View style={st.emptyState}>
      <Animated.Text style={[st.emptyIcon, { transform: [{ scale: pulseAnim }] }]}>
        🧠
      </Animated.Text>
      <Text style={st.emptyTitle}>Wala Pang Alaala</Text>
      <Text style={st.emptySubtitle}>
        Habang nakikipag-usap kayo kay Lolo Pat, matututo siya tungkol sa inyo
        at maitatago ang mga mahalagang bagay para maaalala sa susunod.
      </Text>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function MemoriesScreen() {
  const [memories, setMemories]   = useState<Memory[]>([]);
  const [loading, setLoading]     = useState(true);
  const [userId, setUserId]       = useState<number | null>(null);
  const [error, setError]         = useState<string | null>(null);

  // Grouped memories
  const grouped = React.useMemo(() => {
    const order: MemoryCategory[] = [
      'personal', 'health', 'preference', 'event', 'conversation', 'other',
    ];
    const map = new Map<MemoryCategory, Memory[]>();
    order.forEach(cat => {
      const items = memories.filter(m => m.category === cat);
      if (items.length > 0) map.set(cat, items);
    });
    return map;
  }, [memories]);

  // Flat list data: interleaved headers + items
  const flatData = React.useMemo(() => {
    const rows: Array<{ type: 'header'; category: MemoryCategory } | { type: 'item'; memory: Memory; index: number }> = [];
    let globalIdx = 0;
    grouped.forEach((items, cat) => {
      rows.push({ type: 'header', category: cat });
      items.forEach(m => {
        rows.push({ type: 'item', memory: m, index: globalIdx++ });
      });
    });
    return rows;
  }, [grouped]);

  // Load user ID
  useEffect(() => {
    AsyncStorage.getItem('lolo_user_id').then(id => {
      const uid = parseInt(id || '1', 10);
      setUserId(uid);
    });
  }, []);

  // Load memories
  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchMemories(userId);
      setMemories(data);
    } catch (e: any) {
      setError(e.message || 'Hindi ma-load ang mga alaala.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  // Delete one
  const handleDelete = useCallback(async (id: string) => {
    try {
      await deleteOneMemory(id);
      setMemories(prev => prev.filter(m => m.id !== id));
    } catch {
      Alert.alert('Error', 'Hindi ma-bura ang alaala. Pakisubukang muli.');
    }
  }, []);

  // Clear all
  const handleClearAll = useCallback(() => {
    if (!userId || memories.length === 0) return;
    Alert.alert(
      'Burahin Lahat?',
      `Burahin ang lahat ng ${memories.length} alaala ni Lolo Pat tungkol sa inyo? Hindi ito mababawi.`,
      [
        { text: 'Huwag', style: 'cancel' },
        {
          text: 'Burahin Lahat',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAllMemoriesApi(userId);
              setMemories([]);
            } catch {
              Alert.alert('Error', 'Hindi ma-clear ang mga alaala.');
            }
          },
        },
      ]
    );
  }, [userId, memories.length]);

  return (
    <View style={st.screen}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />

      {/* ── Background Gradient ──────────────────────────────────────────── */}
      <LinearGradient
        colors={['#0A1628', '#0D1E38', '#0A1628']}
        style={StyleSheet.absoluteFill}
      />

      {/* ── Decorative orbs ──────────────────────────────────────────────── */}
      <View style={[st.orb, st.orbBlue]}  pointerEvents="none" />
      <View style={[st.orb, st.orbGold]}  pointerEvents="none" />

      {/* ── Top Nav ──────────────────────────────────────────────────────── */}
      <View style={st.topNav}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={st.backBtn}
        >
          <Text style={st.backIcon}>←</Text>
        </TouchableOpacity>

        <View style={st.navCenter}>
          <Text style={st.navTitle}>🧠 Mga Alaala</Text>
          <Text style={st.navSubtitle}>
            {memories.length > 0
              ? `${memories.length} alaala ang naitago`
              : 'Walang alaala pa'}
          </Text>
        </View>

        <TouchableOpacity
          onPress={handleClearAll}
          disabled={memories.length === 0}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={[st.clearBtn, memories.length === 0 && { opacity: 0.3 }]}
        >
          <Text style={st.clearBtnText}>Burahin{'\n'}Lahat</Text>
        </TouchableOpacity>
      </View>

      {/* ── Context Banner ────────────────────────────────────────────────── */}
      <View style={st.banner}>
        <Text style={st.bannerText}>
          💡 Ang mga alaala ay ginagamit ni Lolo Pat para maging mas personal ang diyalogo
        </Text>
      </View>

      {/* ── Content ───────────────────────────────────────────────────────── */}
      {loading ? (
        <View style={st.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={st.loadingText}>Kinukuha ang mga alaala…</Text>
        </View>
      ) : error ? (
        <View style={st.centered}>
          <Text style={st.errorIcon}>⚠️</Text>
          <Text style={st.errorText}>{error}</Text>
          <TouchableOpacity onPress={load} style={st.retryBtn}>
            <Text style={st.retryText}>Subukang Muli</Text>
          </TouchableOpacity>
        </View>
      ) : flatData.length === 0 ? (
        <EmptyState />
      ) : (
        <FlatList
          data={flatData}
          keyExtractor={(item, idx) =>
            item.type === 'header' ? `h-${item.category}` : `m-${item.memory.id}-${idx}`
          }
          contentContainerStyle={st.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            if (item.type === 'header') {
              const cat = CATEGORY_CONFIG[item.category];
              return (
                <View style={st.sectionHeader}>
                  <Text style={st.sectionEmoji}>{cat.emoji}</Text>
                  <Text style={[st.sectionTitle, { color: cat.color }]}>{cat.label}</Text>
                  <View style={[st.sectionLine, { backgroundColor: cat.color + '30' }]} />
                </View>
              );
            }
            return (
              <MemoryCard
                item={item.memory}
                onDelete={handleDelete}
                index={item.index}
              />
            );
          }}
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  screen: {
    flex:            1,
    backgroundColor: COLORS.bg,
    paddingTop:      Platform.OS === 'android' ? 40 : 50,
  },

  // Decorative orbs
  orb: {
    position: 'absolute',
    borderRadius: 999,
  },
  orbBlue: {
    width:           260,
    height:          260,
    backgroundColor: 'rgba(30,96,255,0.07)',
    top:             -80,
    right:           -80,
  },
  orbGold: {
    width:           180,
    height:          180,
    backgroundColor: 'rgba(251,191,36,0.06)',
    bottom:          100,
    left:            -60,
  },

  // Top nav
  topNav: {
    flexDirection:  'row',
    alignItems:     'center',
    paddingHorizontal: 20,
    paddingBottom:  12,
    gap:            12,
  },
  backBtn: {
    width:           40,
    height:          40,
    borderRadius:    20,
    backgroundColor: COLORS.surface,
    alignItems:      'center',
    justifyContent:  'center',
    borderWidth:     1,
    borderColor:     COLORS.border,
  },
  backIcon: {
    fontSize:   18,
    color:      COLORS.text,
    fontWeight: '600',
  },
  navCenter: {
    flex:      1,
    alignItems: 'center',
  },
  navTitle: {
    fontSize:   19,
    fontWeight: '700',
    color:      COLORS.text,
    letterSpacing: 0.3,
  },
  navSubtitle: {
    fontSize:  12,
    color:     COLORS.textDim,
    marginTop: 2,
  },
  clearBtn: {
    paddingVertical:   6,
    paddingHorizontal: 10,
    borderRadius:      10,
    backgroundColor:   'rgba(220,38,38,0.12)',
    borderWidth:       1,
    borderColor:       'rgba(220,38,38,0.3)',
  },
  clearBtnText: {
    fontSize:   10,
    fontWeight: '600',
    color:      '#DC2626',
    textAlign:  'center',
    lineHeight: 14,
  },

  // Banner
  banner: {
    marginHorizontal:  20,
    marginBottom:      16,
    paddingVertical:   10,
    paddingHorizontal: 14,
    borderRadius:      12,
    backgroundColor:   'rgba(30,96,255,0.08)',
    borderWidth:       1,
    borderColor:       'rgba(30,96,255,0.18)',
  },
  bannerText: {
    fontSize:  12,
    color:     COLORS.textDim,
    lineHeight: 17,
  },

  // List
  list: {
    paddingHorizontal: 20,
    paddingBottom:     40,
  },

  // Section header
  sectionHeader: {
    flexDirection:  'row',
    alignItems:     'center',
    marginTop:      24,
    marginBottom:   10,
    gap:            8,
  },
  sectionEmoji: {
    fontSize: 16,
  },
  sectionTitle: {
    fontSize:   13,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  sectionLine: {
    flex:   1,
    height: 1,
  },

  // Memory card
  card: {
    flexDirection:   'row',
    backgroundColor: COLORS.surface,
    borderRadius:    14,
    marginBottom:    10,
    borderWidth:     1,
    borderColor:     COLORS.border,
    overflow:        'hidden',
  },
  priorityStripe: {
    width:        4,
    alignSelf:    'stretch',
    borderRadius: 4,
    margin:       6,
    marginRight:  0,
    minHeight:    48,
  },
  cardBody: {
    flex:    1,
    padding: 14,
    gap:     6,
  },
  cardHeader: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
  },
  catBadge: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingVertical:    3,
    paddingHorizontal:  8,
    borderRadius:       8,
    borderWidth:        1,
    gap:               4,
  },
  catEmoji: {
    fontSize: 11,
  },
  catLabel: {
    fontSize:   10,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  priorityDot: {
    fontSize:   9,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  cardContent: {
    fontSize:   14,
    color:      COLORS.text,
    lineHeight: 21,
    fontWeight: '400',
  },
  cardFooter: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    marginTop:      4,
  },
  timeAgo: {
    fontSize: 11,
    color:    COLORS.textFaint,
  },
  deleteBtn: {
    padding: 4,
  },
  deleteBtnText: {
    fontSize: 14,
  },

  // Empty / loading / error states
  centered: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap:            12,
  },
  loadingText: {
    fontSize: 14,
    color:    COLORS.textDim,
    marginTop: 12,
  },
  emptyState: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  emptyIcon: {
    fontSize:   72,
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize:     22,
    fontWeight:   '700',
    color:        COLORS.text,
    marginBottom:  10,
    textAlign:    'center',
  },
  emptySubtitle: {
    fontSize:   14,
    color:      COLORS.textDim,
    textAlign:  'center',
    lineHeight: 22,
  },
  errorIcon: {
    fontSize: 48,
  },
  errorText: {
    fontSize:  14,
    color:     COLORS.textDim,
    textAlign: 'center',
    lineHeight: 22,
  },
  retryBtn: {
    marginTop:         16,
    paddingVertical:   12,
    paddingHorizontal: 28,
    borderRadius:      24,
    backgroundColor:   COLORS.primary,
  },
  retryText: {
    fontSize:   14,
    fontWeight: '700',
    color:      '#fff',
  },
});
