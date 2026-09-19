import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import {
  fetchChatMessages,
  fetchChatThreads,
  sendChatMessage,
  type ChatMessage,
  type ChatThread,
} from '../services/chatApi';

const C = {
  bg: '#F4F7F4',
  card: '#FFFFFF',
  ink: '#122018',
  inkSoft: '#465A4E',
  inkFaint: '#7E9486',
  primary: '#1F5C3E',
  primaryDark: '#103322',
  primaryMid: '#2B7A53',
  primarySoft: '#DCEDE2',
  gold: '#C4892E',
  goldDark: '#7A5214',
  goldSoft: '#FBF0DC',
  white: '#FFFFFF',
  line: '#DCE7DF',
  userBubble: '#1F5C3E',
  adminBubble: '#FFFFFF',
  danger: '#B3432E',
};

const sp = (n: number) => n * 4;
const webPointer = Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {};

const QUICK_PROMPTS = [
  'Kailan po ang distribution ng Birthday Cash Gift?',
  'Paano po mag-apply ng bagong OSCA ID?',
  'Ano po ang requirements para sa Centenarian Benefit?',
  'Saan po ang opisina ng OSCA at anong oras bukas?',
  'May available po bang medical assistance ngayon?',
];

function formatTime(isoString?: string): string {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export default function ChatScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const userRole = (user?.role || 'user').toLowerCase();
  const isAdmin = userRole === 'osca admin' || userRole === 'super admin';

  // For Admin: active thread selection
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(false);
  const [selectedUser, setSelectedUser] = useState<ChatThread | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Messages in active conversation
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);

  // Measured height of header (+ banner) so KeyboardAvoidingView offset works
  // correctly on every device/notch size instead of a hardcoded number.
  const [headerHeight, setHeaderHeight] = useState(0);

  const flatListRef = useRef<FlatList>(null);

  // Keyboard listeners — only used to auto-scroll to the latest message.
  // NOTE: we intentionally do NOT track keyboard height here anymore.
  // On Android, the OS (softwareKeyboardLayoutMode: "resize") already
  // shrinks the screen when the keyboard opens. Also adding manual
  // paddingBottom on top of that caused the large empty gap seen above
  // the keyboard — the two compensations were stacking.
  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => {
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 80);
      }
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => { }
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Active target senior citizen user ID
  const activeUserId = isAdmin ? selectedUser?.userId : user?.id;

  // ── 1. Poll threads for Admin ─────────────────────────────────────────────
  const loadThreads = async () => {
    if (!isAdmin) return;
    try {
      const data = await fetchChatThreads();
      setThreads(data);
    } catch (err) {
      console.warn('[Chat] Failed to load threads:', err);
    }
  };

  useEffect(() => {
    if (!isAdmin) return;
    setLoadingThreads(true);
    loadThreads().finally(() => setLoadingThreads(false));

    const interval = setInterval(loadThreads, 3000);
    return () => clearInterval(interval);
  }, [isAdmin]);

  // ── 2. Poll messages for active conversation ──────────────────────────────
  const loadMessages = async () => {
    if (!activeUserId) return;
    try {
      const msgs = await fetchChatMessages(activeUserId, userRole);
      setMessages(msgs);
    } catch (err) {
      console.warn('[Chat] Failed to load messages:', err);
    }
  };

  useEffect(() => {
    if (!activeUserId) {
      setLoadingMessages(false);
      return;
    }

    setLoadingMessages(true);
    loadMessages().finally(() => setLoadingMessages(false));

    const interval = setInterval(loadMessages, 2500);
    return () => clearInterval(interval);
  }, [activeUserId]);

  // ── 3. Send message handler ───────────────────────────────────────────────
  const handleSend = async (textToSend?: string) => {
    const text = (textToSend ?? inputText).trim();
    if (!text || !activeUserId || !user?.id) return;

    const senderName = [user.firstName, user.lastName].filter(Boolean).join(' ') || (isAdmin ? 'OSCA Admin' : 'Senior Citizen');
    const optimisticMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      userId: activeUserId,
      senderId: user.id,
      senderRole: isAdmin ? 'osca admin' : 'user',
      senderName,
      message: text,
      read: false,
      createdAt: new Date().toISOString(),
    };

    // Optimistic UI update
    setMessages((prev) => [...prev, optimisticMsg]);
    setInputText('');
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);

    setSending(true);
    try {
      await sendChatMessage({
        userId: activeUserId,
        senderId: user.id,
        senderRole: isAdmin ? 'osca admin' : 'user',
        senderName,
        message: text,
      });
      await loadMessages();
      if (isAdmin) loadThreads();
    } catch (err) {
      Alert.alert('Send Error', err instanceof Error ? err.message : 'Could not send message.');
    } finally {
      setSending(false);
    }
  };

  // Filtered threads for Admin search
  const filteredThreads = useMemo(() => {
    if (!searchQuery.trim()) return threads;
    const q = searchQuery.toLowerCase();
    return threads.filter(
      (t) =>
        t.userName.toLowerCase().includes(q) ||
        (t.contact && t.contact.includes(q)) ||
        t.lastMessage.toLowerCase().includes(q)
    );
  }, [threads, searchQuery]);

  // ── Render Message Item ───────────────────────────────────────────────────
  const renderMessageItem = ({ item }: { item: ChatMessage }) => {
    const isMe = item.senderId === user?.id || (isAdmin && item.senderRole !== 'user') || (!isAdmin && item.senderRole === 'user');

    return (
      <View style={[s.bubbleRow, isMe ? s.bubbleRowMe : s.bubbleRowOther]}>
        {!isMe && (
          <View style={s.senderAvatar}>
            <Ionicons
              name={item.senderRole !== 'user' ? 'shield-checkmark' : 'person'}
              size={14}
              color={item.senderRole !== 'user' ? C.goldDark : C.primaryDark}
            />
          </View>
        )}

        <View style={[s.bubble, isMe ? s.bubbleMe : s.bubbleOther]}>
          {!isMe && (
            <Text style={s.senderRoleLabel}>
              {item.senderRole !== 'user' ? '🏛️ OSCA Administrator' : item.senderName || 'Senior Citizen'}
            </Text>
          )}

          <Text style={[s.messageText, isMe ? s.messageTextMe : s.messageTextOther]}>
            {item.message}
          </Text>

          <View style={s.bubbleFooter}>
            <Text style={[s.timeText, isMe ? s.timeTextMe : s.timeTextOther]}>
              {formatTime(item.createdAt)}
            </Text>
            {isMe && (
              <Ionicons
                name={item.read ? 'checkmark-done' : 'checkmark'}
                size={14}
                color={item.read ? '#90EE90' : 'rgba(255,255,255,0.6)'}
              />
            )}
          </View>
        </View>
      </View>
    );
  };

  // ── Render Admin Thread List ──────────────────────────────────────────────
  if (isAdmin && !selectedUser) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <StatusBar barStyle="dark-content" backgroundColor={C.bg} />

        {/* Top Header */}
        <View style={s.header}>
          <TouchableOpacity
            style={[s.backBtn, webPointer]}
            onPress={() => router.back()}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={22} color={C.primaryDark} />
          </TouchableOpacity>

          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={s.headerTitle}>OSCA Live Help Desk</Text>
            <Text style={s.headerSubtitle}>Senior Citizen Inquiries</Text>
          </View>

          <TouchableOpacity
            style={[s.refreshBtn, webPointer]}
            onPress={loadThreads}
            activeOpacity={0.7}
          >
            <Ionicons name="refresh-outline" size={20} color={C.primaryDark} />
          </TouchableOpacity>
        </View>

        {/* Search Bar */}
        <View style={s.searchWrap}>
          <Ionicons name="search" size={18} color={C.inkFaint} />
          <TextInput
            style={s.searchInput}
            placeholder="Search by name, contact, or inquiry..."
            placeholderTextColor={C.inkFaint}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={16} color={C.inkFaint} />
            </TouchableOpacity>
          )}
        </View>

        {/* Thread List */}
        {loadingThreads ? (
          <View style={s.centerBox}>
            <ActivityIndicator size="large" color={C.primary} />
            <Text style={s.loadingText}>Loading conversations...</Text>
          </View>
        ) : filteredThreads.length === 0 ? (
          <View style={s.emptyBox}>
            <View style={s.emptyIconCircle}>
              <Ionicons name="chatbubbles-outline" size={40} color={C.primaryMid} />
            </View>
            <Text style={s.emptyTitle}>No Active Inquiries</Text>
            <Text style={s.emptySubtitle}>
              When senior citizens send questions or inquiries to OSCA, they will appear here in real-time.
            </Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={s.threadList}>
            {filteredThreads.map((thread) => (
              <TouchableOpacity
                key={thread.userId}
                style={[s.threadCard, webPointer]}
                onPress={() => setSelectedUser(thread)}
                activeOpacity={0.8}
              >
                <View style={s.threadAvatarWrap}>
                  {thread.avatarUrl ? (
                    <Image source={{ uri: thread.avatarUrl }} style={s.threadAvatar} />
                  ) : (
                    <View style={s.threadAvatarFallback}>
                      <Ionicons name="person" size={22} color={C.primaryDark} />
                    </View>
                  )}
                  {thread.unreadCount > 0 && <View style={s.unreadDot} />}
                </View>

                <View style={{ flex: 1 }}>
                  <View style={s.threadTitleRow}>
                    <Text style={s.threadName} numberOfLines={1}>
                      {thread.userName}
                    </Text>
                    <Text style={s.threadTime}>{formatTime(thread.lastMessageAt)}</Text>
                  </View>

                  <Text style={[s.threadPreview, thread.unreadCount > 0 && s.threadPreviewUnread]} numberOfLines={2}>
                    {thread.lastSenderRole !== 'user' ? 'You: ' : ''}
                    {thread.lastMessage}
                  </Text>
                </View>

                {thread.unreadCount > 0 && (
                  <View style={s.unreadBadge}>
                    <Text style={s.unreadBadgeText}>{thread.unreadCount}</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </SafeAreaView>
    );
  }

  // ── Conversation Screen (Senior Citizen OR Admin viewing a specific Senior) ──
  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />

      {/* Header + Banner wrapped together and measured, so the
          KeyboardAvoidingView offset below always matches the actual
          on-screen header height instead of a hardcoded guess. */}
      <View onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}>
        {/* Top Header */}
        <View style={s.header}>
          <TouchableOpacity
            style={[s.backBtn, webPointer]}
            onPress={() => {
              if (isAdmin && selectedUser) {
                setSelectedUser(null);
              } else {
                router.back();
              }
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={22} color={C.primaryDark} />
          </TouchableOpacity>

          <View style={s.headerAvatarWrap}>
            {isAdmin ? (
              selectedUser?.avatarUrl ? (
                <Image source={{ uri: selectedUser.avatarUrl }} style={s.headerAvatar} />
              ) : (
                <View style={s.headerAvatarFallback}>
                  <Ionicons name="person" size={18} color={C.primaryDark} />
                </View>
              )
            ) : (
              <View style={[s.headerAvatarFallback, { backgroundColor: C.primarySoft }]}>
                <Ionicons name="business" size={18} color={C.primaryDark} />
              </View>
            )}
          </View>

          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={s.headerTitle} numberOfLines={1}>
              {isAdmin ? selectedUser?.userName || 'Senior Citizen' : 'OSCA Assistance Desk'}
            </Text>
            <View style={s.statusRow}>
              <View style={s.onlineDot} />
              <Text style={s.headerSubtitle}>
                {isAdmin ? `ID #${selectedUser?.userId} • Municipality of Pateros` : 'Online • Municipality of Pateros'}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={[s.refreshBtn, webPointer]}
            onPress={loadMessages}
            activeOpacity={0.7}
          >
            <Ionicons name="refresh-outline" size={20} color={C.primaryDark} />
          </TouchableOpacity>
        </View>

        {/* Senior Informative Banner */}
        {!isAdmin && (
          <View style={s.infoBanner}>
            <Ionicons name="shield-checkmark" size={16} color={C.primaryDark} />
            <Text style={s.infoBannerText}>
              Opisyal na tulong mula sa Office of Senior Citizens Affairs (OSCA) Pateros.
            </Text>
          </View>
        )}
      </View>

      {/* Message List */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}
      >
        {loadingMessages ? (
          <View style={s.centerBox}>
            <ActivityIndicator size="large" color={C.primary} />
            <Text style={s.loadingText}>Loading conversation...</Text>
          </View>
        ) : messages.length === 0 ? (
          <View style={s.emptyBox}>
            <View style={s.emptyIconCircle}>
              <Ionicons name="chatbubbles-outline" size={44} color={C.primaryMid} />
            </View>
            <Text style={s.emptyTitle}>
              {isAdmin ? 'No Messages Yet' : 'Magandang Araw po!'}
            </Text>
            <Text style={s.emptySubtitle}>
              {isAdmin
                ? 'Send a warm greeting or answer this senior citizen’s questions.'
                : 'May katanungan po ba kayo tungkol sa benefits, OSCA ID, o serbisyo? Mag-type lang po sa ibaba.'}
            </Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderMessageItem}
            contentContainerStyle={s.messageList}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          />
        )}

        {/* Senior Quick Inquiry Prompt Chips */}
        {!isAdmin && messages.length <= 4 && (
          <View style={s.quickPromptsWrap}>
            <Text style={s.quickPromptHeader}>Pumili ng katanungan:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.quickPromptsRow}>
              {QUICK_PROMPTS.map((prompt, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={[s.promptChip, webPointer]}
                  onPress={() => handleSend(prompt)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="help-circle-outline" size={14} color={C.primaryDark} />
                  <Text style={s.promptChipText}>{prompt}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Input Bar */}
        <View style={s.inputContainer}>
          <TextInput
            style={s.input}
            placeholder={isAdmin ? 'Type your response as OSCA Admin...' : 'Sumulat ng mensahe sa OSCA...'}
            placeholderTextColor={C.inkFaint}
            value={inputText}
            onChangeText={setInputText}
            onFocus={() => {
              setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
            }}
            multiline
            maxLength={1000}
          />

          <TouchableOpacity
            style={[s.sendBtn, (!inputText.trim() || sending) && s.sendBtnDisabled, webPointer]}
            onPress={() => handleSend()}
            disabled={!inputText.trim() || sending}
            activeOpacity={0.85}
          >
            {sending ? (
              <ActivityIndicator size="small" color={C.white} />
            ) : (
              <Ionicons name="send" size={18} color={C.white} />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: C.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: sp(4),
    paddingVertical: sp(3),
    backgroundColor: C.card,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatarWrap: {
    marginLeft: 8,
  },
  headerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  headerAvatarFallback: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: 'FraunTitle',
    fontSize: 16,
    fontWeight: '700',
    color: C.ink,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#16A34A',
    marginRight: 5,
  },
  headerSubtitle: {
    fontFamily: 'InterBody',
    fontSize: 11.5,
    color: C.inkFaint,
  },

  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.goldSoft,
    paddingHorizontal: sp(4),
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#EEDDB8',
  },
  infoBannerText: {
    fontFamily: 'InterBody',
    fontSize: 12,
    color: C.goldDark,
    flex: 1,
    fontWeight: '600',
  },

  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: sp(5),
  },
  loadingText: {
    fontFamily: 'InterBody',
    fontSize: 13,
    color: C.inkFaint,
    marginTop: 8,
  },

  emptyBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: sp(6),
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: C.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: sp(3),
  },
  emptyTitle: {
    fontFamily: 'FraunTitle',
    fontSize: 20,
    color: C.ink,
    marginBottom: 6,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontFamily: 'InterBody',
    fontSize: 13.5,
    color: C.inkSoft,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 320,
  },

  /* Search Bar (Admin) */
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.card,
    margin: sp(3),
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.line,
  },
  searchInput: {
    flex: 1,
    fontFamily: 'InterBody',
    fontSize: 14,
    color: C.ink,
  },

  /* Thread List (Admin) */
  threadList: {
    paddingHorizontal: sp(3),
    paddingBottom: sp(6),
  },
  threadCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    padding: sp(3.5),
    borderRadius: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: C.line,
    gap: 12,
  },
  threadAvatarWrap: {
    position: 'relative',
  },
  threadAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
  },
  threadAvatarFallback: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: C.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadDot: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#DC2626',
    borderWidth: 2,
    borderColor: C.card,
  },
  threadTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  threadName: {
    fontFamily: 'InterBody',
    fontWeight: '700',
    fontSize: 15,
    color: C.ink,
    flex: 1,
    marginRight: 6,
  },
  threadTime: {
    fontFamily: 'InterBody',
    fontSize: 11,
    color: C.inkFaint,
  },
  threadPreview: {
    fontFamily: 'InterBody',
    fontSize: 13,
    color: C.inkSoft,
    lineHeight: 18,
  },
  threadPreviewUnread: {
    fontWeight: '700',
    color: C.ink,
  },
  unreadBadge: {
    backgroundColor: '#DC2626',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: 'center',
  },
  unreadBadgeText: {
    fontFamily: 'InterBody',
    fontWeight: '700',
    fontSize: 11,
    color: C.white,
  },

  /* Messages */
  messageList: {
    padding: sp(4),
    paddingBottom: sp(6),
  },
  bubbleRow: {
    flexDirection: 'row',
    marginBottom: 12,
    alignItems: 'flex-end',
  },
  bubbleRowMe: {
    justifyContent: 'flex-end',
  },
  bubbleRowOther: {
    justifyContent: 'flex-start',
  },
  senderAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: C.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
    marginBottom: 2,
  },
  bubble: {
    maxWidth: '78%',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleMe: {
    backgroundColor: C.userBubble,
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: C.adminBubble,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: C.line,
  },
  senderRoleLabel: {
    fontFamily: 'InterBody',
    fontWeight: '700',
    fontSize: 10.5,
    color: C.goldDark,
    marginBottom: 4,
  },
  messageText: {
    fontFamily: 'InterBody',
    fontSize: 14.5,
    lineHeight: 21,
  },
  messageTextMe: {
    color: C.white,
  },
  messageTextOther: {
    color: C.ink,
  },
  bubbleFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    marginTop: 4,
  },
  timeText: {
    fontFamily: 'InterBody',
    fontSize: 10,
  },
  timeTextMe: {
    color: 'rgba(255,255,255,0.7)',
  },
  timeTextOther: {
    color: C.inkFaint,
  },

  /* Quick Prompts */
  quickPromptsWrap: {
    paddingHorizontal: sp(3),
    paddingVertical: 8,
    backgroundColor: C.card,
    borderTopWidth: 1,
    borderTopColor: C.line,
  },
  quickPromptHeader: {
    fontFamily: 'InterBody',
    fontSize: 11,
    fontWeight: '700',
    color: C.inkFaint,
    marginBottom: 6,
    paddingLeft: 4,
  },
  quickPromptsRow: {
    gap: 8,
  },
  promptChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: C.primarySoft,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#C3E0CC',
  },
  promptChipText: {
    fontFamily: 'InterBody',
    fontSize: 12,
    fontWeight: '600',
    color: C.primaryDark,
  },

  /* Input Container */
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: sp(3),
    paddingVertical: sp(2.5),
    backgroundColor: C.card,
    borderTopWidth: 1,
    borderTopColor: C.line,
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: C.bg,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    fontFamily: 'InterBody',
    fontSize: 14.5,
    color: C.ink,
    maxHeight: 100,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: '#9DB3A6',
  },
});