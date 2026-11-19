import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as ImagePicker from 'expo-image-picker';
import { Redirect, useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';

type Announcement = { id: string; title: string; body: string; image_url?: string | null; published?: boolean; created_at?: string; updated_at?: string };
const COLORS = { primary: '#1F5C3E', ink: '#0F1F16', faint: '#7A8E83' };

function apiBase() {
  const env = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (env) return env;
  const host = (Constants.expoConfig?.hostUri || '').split(':')[0];
  return host ? `http://${host}:5000` : 'http://localhost:5000';
}

async function request(path: string, token?: string, options: RequestInit = {}) {
  const response = await fetch(`${apiBase()}${path}`, {
    ...options,
    headers: { ...(options.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'The request could not be completed.');
  return data;
}

export default function AdminAnnouncements() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const canManage = user?.role?.trim().toLowerCase() === 'osca admin';
  const token = user?.token;
  const [items, setItems] = useState<Announcement[]>([]);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Announcement | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const deleteInFlight = React.useRef(false);

  const load = useCallback(async () => {
    if (!canManage || !token) return;
    try {
      const data = await request('/api/announcements', token);
      setItems(data.announcements || []);
    } catch (error) {
      Alert.alert('Could not load announcements', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setLoading(false);
    }
  }, [canManage, token]);

  useEffect(() => { load(); }, [load]);

  const openEditor = (item?: Announcement) => {
    if (!canManage) return;
    setEditorOpen(true);
    setEditing(item || null);
    setTitle(item?.title || '');
    setBody(item?.body || '');
    setImageUrl(item?.image_url || '');
  };

  const chooseImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow photo access to add an image to this announcement.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      base64: true,
    });
    const asset = result.canceled ? undefined : result.assets[0];
    if (asset?.base64) {
      setImageUrl(`data:image/jpeg;base64,${asset.base64}`);
    }
  };

  const save = async () => {
    if (!canManage) return;
    if (!user?.token || !title.trim() || !body.trim()) {
      Alert.alert('Missing details', 'Add an announcement title and message.');
      return;
    }
    setSaving(true);
    try {
      const data = await request(editing ? `/api/announcements/${editing.id}` : '/api/announcements', user.token, {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify({ title: title.trim(), body: body.trim(), image_url: imageUrl || null, published: true }),
      });
      setItems((current) => editing
        ? current.map((item) => item.id === editing.id ? data.announcement : item)
        : [data.announcement]);
      setEditing(null);
      setEditorOpen(false);
      setTitle('');
      setBody('');
      setImageUrl('');
    } catch (error) {
      Alert.alert('Could not save announcement', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!canManage || !deleteTarget || deleteInFlight.current) return;
    if (!user?.token) {
      setDeleteError('Please sign in again before deleting this announcement.');
      return;
    }
    deleteInFlight.current = true;
    setDeleting(true);
    setDeleteError('');
    try {
      await request(`/api/announcements/${encodeURIComponent(deleteTarget.id)}`, user.token, { method: 'DELETE' });
      setItems((current) => current.filter((entry) => entry.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Could not delete the announcement. Try again.');
    } finally {
      deleteInFlight.current = false;
      setDeleting(false);
    }
  };

  if (authLoading) return <View style={s.page}><ActivityIndicator color={COLORS.primary} /></View>;
  if (!user) return <Redirect href="/login" />;
  if (!canManage) return <Redirect href="/(tabs)" />;

  return (
    <View style={s.page}>
      <View style={s.header}>
        <Pressable onPress={() => router.replace('/admin-dashboard')} style={s.iconButton}><Ionicons name="arrow-back" size={20} color="#FFF" /></Pressable>
        <View style={s.headerIcon}><Ionicons name="megaphone" size={21} color="#F6D17A" /></View>
        <View style={{ flex: 1 }}><Text style={s.eyebrow}>OSCA ADMIN</Text><Text style={s.title}>Announcements</Text><Text style={s.subtitle}>Share updates with AUREA residents</Text></View>
        <Pressable onPress={() => { setLoading(true); void load(); }} style={s.iconButton}><Ionicons name="refresh" size={20} color="#FFF" /></Pressable>
      </View>
      <ScrollView contentContainerStyle={s.content}>
        <Pressable onPress={() => openEditor()} style={s.createButton}><Ionicons name="add" size={18} color="#FFF" /><Text style={s.createText}>New announcement</Text></Pressable>
        <Text style={s.empty}>Publishing a new announcement deletes the previous announcement.</Text>
        {loading ? <ActivityIndicator color={COLORS.primary} size="large" /> : items.length === 0 ? <Text style={s.empty}>No announcements yet.</Text> : items.map((item) => (
          <View key={item.id} style={s.card}>
            {item.image_url ? <Image source={{ uri: item.image_url }} style={s.cardImage} resizeMode="cover" /> : null}
            <View style={s.cardTop}><View style={{ flex: 1 }}><Text style={s.cardTitle}>{item.title}</Text><Text style={s.date}>{item.created_at ? new Date(item.created_at).toLocaleString() : ''}</Text></View><View style={s.published}><Text style={s.publishedText}>Published</Text></View></View>
            <Text style={s.body}>{item.body}</Text>
            <View style={s.actions}><Pressable onPress={() => openEditor(item)} style={s.outline}><Text style={s.outlineText}>Edit</Text></Pressable><Pressable onPress={() => { setDeleteError(''); setDeleteTarget(item); }} style={s.delete}><Text style={s.deleteText}>Delete</Text></Pressable></View>
          </View>
        ))}
      </ScrollView>
      <Modal visible={!!deleteTarget} transparent animationType="fade" onRequestClose={() => { if (!deleteInFlight.current) setDeleteTarget(null); }}>
        <View style={s.backdrop}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>Delete announcement?</Text>
            <Text style={s.body}>Delete &quot;{deleteTarget?.title}&quot;? Residents will no longer see this announcement.</Text>
            {deleteError ? <Text accessibilityRole="alert" style={s.deleteText}>{deleteError}</Text> : null}
            <View style={s.actions}>
              <Pressable accessibilityRole="button" disabled={deleting} onPress={() => setDeleteTarget(null)} style={s.outline}><Text style={s.outlineText}>Cancel</Text></Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={deleting ? 'Deleting announcement' : 'Confirm delete announcement'} disabled={deleting} onPress={remove} style={s.delete}>
                {deleting ? <ActivityIndicator color="#B42318" /> : <Text style={s.deleteText}>Delete</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <Modal visible={editorOpen} transparent animationType="fade" onRequestClose={() => { setEditorOpen(false); setEditing(null); setTitle(''); setBody(''); setImageUrl(''); }}>
        <View style={s.backdrop}><View style={s.modal}><View style={s.modalHeader}><Text style={s.modalTitle}>{editing ? 'Edit announcement' : 'New announcement'}</Text><Pressable onPress={() => { setEditorOpen(false); setEditing(null); setTitle(''); setBody(''); setImageUrl(''); }}><Ionicons name="close" size={22} color={COLORS.ink} /></Pressable></View><TextInput value={title} onChangeText={setTitle} placeholder="Announcement title" placeholderTextColor={COLORS.faint} style={s.input} /><TextInput value={body} onChangeText={setBody} placeholder="Write the announcement..." placeholderTextColor={COLORS.faint} style={[s.input, s.bodyInput]} multiline /><Pressable onPress={chooseImage} style={s.imageButton}><Ionicons name="image-outline" size={17} color={COLORS.primary} /><Text style={s.imageButtonText}>{imageUrl ? 'Change image' : 'Add image'}</Text></Pressable>{imageUrl ? <Image source={{ uri: imageUrl }} style={s.preview} resizeMode="cover" /> : null}<Pressable onPress={save} disabled={saving} style={s.save}>{saving ? <ActivityIndicator color="#FFF" /> : <Text style={s.saveText}>{editing ? 'Save changes' : 'Publish announcement'}</Text>}</Pressable></View></View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F2F6F1' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, margin: 18, padding: 14, borderRadius: 20, backgroundColor: '#174C35' },
  iconButton: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' },
  headerIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(215,154,53,0.18)' },
  eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, color: '#F6D17A' },
  title: { fontSize: 20, fontWeight: '700', color: '#FFF' },
  subtitle: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  content: { padding: 18, gap: 12 },
  createButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, padding: 13, borderRadius: 13, backgroundColor: '#1F5C3E' },
  createText: { color: '#FFF', fontWeight: '700', fontSize: 13 },
  card: { padding: 16, borderRadius: 16, backgroundColor: '#FFF', gap: 10, borderWidth: 1, borderColor: '#E1EADF' },
  cardImage: { width: '100%', height: 150, borderRadius: 12 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#0F1F16' },
  date: { fontSize: 11, color: '#7A8E83', marginTop: 4 },
  published: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 10, backgroundColor: '#DDF1E4' },
  publishedText: { fontSize: 10, fontWeight: '700', color: '#1F5C3E' },
  body: { fontSize: 13, lineHeight: 20, color: '#41564A' },
  actions: { flexDirection: 'row', gap: 8 },
  outline: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: '#1F5C3E' },
  outlineText: { color: '#1F5C3E', fontSize: 12, fontWeight: '700' },
  delete: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 10, backgroundColor: '#FDECEA' },
  deleteText: { color: '#B3432E', fontSize: 12, fontWeight: '700' },
  empty: { padding: 30, textAlign: 'center', color: '#41564A' },
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, backgroundColor: 'rgba(0,0,0,0.4)' },
  modal: { width: '100%', maxWidth: 560, padding: 20, borderRadius: 20, backgroundColor: '#FFF', gap: 12 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#0F1F16' },
  input: { borderWidth: 1, borderColor: '#E1EADF', borderRadius: 12, padding: 12, color: '#0F1F16', fontSize: 13 },
  bodyInput: { minHeight: 120, textAlignVertical: 'top' },
  imageButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, padding: 11, borderRadius: 12, borderWidth: 1, borderColor: '#BFD6C5' },
  imageButtonText: { color: '#1F5C3E', fontSize: 13, fontWeight: '700' },
  preview: { width: '100%', height: 130, borderRadius: 12 },
  save: { padding: 13, borderRadius: 12, alignItems: 'center', backgroundColor: '#1F5C3E' },
  saveText: { color: '#FFF', fontWeight: '700', fontSize: 13 },
});
