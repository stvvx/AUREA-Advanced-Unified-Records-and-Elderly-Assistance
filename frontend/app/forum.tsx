import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { useAuth } from '../context/AuthContext';

function apiBase() {
  const hostUri = Constants.expoConfig?.hostUri || '';
  const host = hostUri.split(':')[0];
  const env = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (env) return env.includes('localhost') && host ? env.replace('localhost', host) : env;
  return Platform.OS === 'android' ? 'http://10.0.2.2:5000' : 'http://localhost:5000';
}

const API = apiBase();

export default function ForumScreen() {
  const { user } = useAuth();
  const [posts, setPosts] = useState<any[]>([]);
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [editingPost, setEditingPost] = useState<string | null>(null);
  const [editingComment, setEditingComment] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});

  const load = async () => {
    if (!user?.token) return;
    setLoading(true);
    try {
      const response = await fetch(`${API}/api/community/posts`, { headers: { Authorization: `Bearer ${user.token}` } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Could not load the community forum.');
      setPosts(data.posts ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not load the community forum.');
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [user?.token]);

  const publish = async () => {
    if (!user?.token || !body.trim()) {
      setMessage('Write something before posting.');
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`${API}/api/community/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` },
        body: JSON.stringify({ body }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Could not publish your post.');
      setBody(''); setMessage('Post published.');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not publish your post.');
    } finally { setSaving(false); }
  };

  const changePost = async (postId: string, method: 'PATCH' | 'DELETE', body?: string) => {
    if (!user?.token) return;
    const response = await fetch(`${API}/api/community/posts/${postId}`, {
      method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` },
      ...(body ? { body: JSON.stringify({ body }) } : {}),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Could not update the post.');
    await load();
  };

  const toggleLike = async (postId: string) => {
    if (!user?.token) return;
    const response = await fetch(`${API}/api/community/posts/${postId}/like`, {
      method: 'POST', headers: { Authorization: `Bearer ${user.token}` },
    });
    if (!response.ok) {
      const data = await response.json();
      setMessage(data.message || 'Could not update the reaction.');
      return;
    }
    const data = await response.json();
    setPosts((current) => current.map((post) => post.id === postId
      ? { ...post, liked_by_me: data.liked, likes_count: data.likes_count } : post));
  };

  const addComment = async (postId: string) => {
    const text = (commentDrafts[postId] || '').trim();
    if (!user?.token || !text) return;
    const response = await fetch(`${API}/api/community/posts/${postId}/comments`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` },
      body: JSON.stringify({ body: text }),
    });
    const data = await response.json();
    if (!response.ok) { setMessage(data.message || 'Could not add the comment.'); return; }
    setCommentDrafts((current) => ({ ...current, [postId]: '' }));
    await load();
  };

  const changeComment = async (commentId: string, method: 'PATCH' | 'DELETE', body?: string) => {
    if (!user?.token) return;
    const response = await fetch(`${API}/api/community/comments/${commentId}`, {
      method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` },
      ...(body ? { body: JSON.stringify({ body }) } : {}),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Could not update the comment.');
    setEditingComment(null);
    await load();
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}><View><Text style={styles.eyebrow}>AUREA COMMUNITY</Text><Text style={styles.title}>Community Forum</Text></View><Ionicons name="people-circle" size={42} color="#1F5C3E" /></View>
        <Text style={styles.subtitle}>Share helpful information, ask questions, and support fellow Pateros seniors.</Text>
        <View style={styles.composer}>
          <TextInput
            style={styles.composerInput}
            placeholder="Post something..."
            placeholderTextColor="#71857A"
            value={body}
            onChangeText={setBody}
            multiline
          />
          <Pressable style={styles.addButton} onPress={publish} disabled={saving} accessibilityRole="button" accessibilityLabel="Publish post">
            {saving ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="add" size={25} color="#fff" />}
          </Pressable>
        </View>
        {message ? <Text style={styles.message}>{message}</Text> : null}
        <Text style={styles.sectionTitle}>Recent discussions</Text>
        {loading ? <ActivityIndicator color="#1F5C3E" /> : posts.length === 0 ? <Text style={styles.empty}>No discussions yet. Be the first to start one.</Text> : posts.map((post) => (
          <View style={styles.post} key={post.id}>
            {editingPost === post.id
              ? <TextInput style={[styles.input, styles.multiline]} value={editBody} onChangeText={setEditBody} multiline />
              : <Text style={styles.postBody}>{post.body}</Text>}
            <Text style={styles.meta}>{post.users?.first_name ?? 'AUREA member'} · {post.created_at ?? ''}</Text>
            <View style={styles.postActions}>
              <Pressable onPress={() => toggleLike(post.id)} style={styles.action}><Ionicons name={post.liked_by_me ? 'heart' : 'heart-outline'} size={19} color={post.liked_by_me ? '#B3432E' : '#71857A'} /><Text style={styles.actionText}>{post.likes_count || 0}</Text></Pressable>
              {post.user_id === user?.id && (editingPost === post.id
                ? <><Pressable onPress={async () => { try { await changePost(post.id, 'PATCH', editBody.trim()); setEditingPost(null); } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not update the post.'); } }} style={styles.action}><Text style={styles.actionText}>Save</Text></Pressable><Pressable onPress={() => setEditingPost(null)} style={styles.action}><Text style={styles.actionText}>Cancel</Text></Pressable></>
                : <><Pressable onPress={() => { setEditingPost(post.id); setEditBody(post.body); }} style={styles.action}><Text style={styles.actionText}>Edit</Text></Pressable><Pressable onPress={() => Alert.alert('Delete post', 'Delete this post?', [{ text: 'Cancel' }, { text: 'Delete', style: 'destructive', onPress: () => changePost(post.id, 'DELETE').catch((error) => setMessage(error.message)) }])} style={styles.action}><Text style={styles.deleteText}>Delete</Text></Pressable></>)}
            </View>
            {(post.comments || []).map((comment: any) => (
              <View style={styles.comment} key={comment.id}>
                {editingComment === comment.id ? <TextInput style={styles.commentInput} value={editBody} onChangeText={setEditBody} /> : <Text style={styles.commentBody}>{comment.body}</Text>}
                <Text style={styles.commentMeta}>{comment.users?.first_name ?? 'AUREA member'}</Text>
                {comment.user_id === user?.id && (editingComment === comment.id
                  ? <View style={styles.postActions}><Pressable onPress={() => changeComment(comment.id, 'PATCH', editBody.trim()).catch((error) => setMessage(error.message))} style={styles.action}><Text style={styles.actionText}>Save</Text></Pressable><Pressable onPress={() => setEditingComment(null)} style={styles.action}><Text style={styles.actionText}>Cancel</Text></Pressable></View>
                  : <View style={styles.postActions}><Pressable onPress={() => { setEditingComment(comment.id); setEditBody(comment.body); }} style={styles.action}><Text style={styles.actionText}>Edit</Text></Pressable><Pressable onPress={() => Alert.alert('Delete comment', 'Delete this comment?', [{ text: 'Cancel' }, { text: 'Delete', style: 'destructive', onPress: () => changeComment(comment.id, 'DELETE').catch((error) => setMessage(error.message)) }])} style={styles.action}><Text style={styles.deleteText}>Delete</Text></Pressable></View>)}
              </View>
            ))}
            <View style={styles.commentComposer}><TextInput style={styles.commentInput} placeholder="Add a comment..." value={commentDrafts[post.id] || ''} onChangeText={(text) => setCommentDrafts((current) => ({ ...current, [post.id]: text }))} /><Pressable onPress={() => addComment(post.id)}><Ionicons name="send" size={19} color="#1F5C3E" /></Pressable></View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F6F8F2' },
  container: { padding: 20, paddingBottom: 48 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eyebrow: { color: '#7E5417', fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
  title: { color: '#132018', fontSize: 28, fontWeight: '700' },
  subtitle: { color: '#3E5246', fontSize: 15, lineHeight: 22, marginTop: 8, marginBottom: 18 },
  composer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, padding: 10, marginBottom: 22, borderWidth: 1, borderColor: '#DCE7D8' },
  composerInput: { flex: 1, minHeight: 48, maxHeight: 110, paddingHorizontal: 10, paddingVertical: 8, color: '#132018', textAlignVertical: 'center' },
  addButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1F5C3E' },
  input: { borderWidth: 1, borderColor: '#DCE7D8', borderRadius: 10, padding: 12, marginBottom: 10, color: '#132018' },
  multiline: { minHeight: 90, textAlignVertical: 'top' },
  buttonText: { color: '#fff', fontWeight: '700' },
  message: { color: '#7E5417', marginBottom: 14 },
  sectionTitle: { color: '#132018', fontSize: 20, fontWeight: '700', marginBottom: 10 },
  post: { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 10 },
  postTitle: { color: '#1F5C3E', fontSize: 17, fontWeight: '700' },
  postBody: { color: '#3E5246', fontSize: 15, lineHeight: 21, marginTop: 7 },
  meta: { color: '#71857A', fontSize: 12, marginTop: 12 },
  postActions: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 10 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 3 },
  actionText: { color: '#1F5C3E', fontSize: 12, fontWeight: '700' },
  deleteText: { color: '#B3432E', fontSize: 12, fontWeight: '700' },
  comment: { marginTop: 12, marginLeft: 10, paddingLeft: 12, borderLeftWidth: 2, borderLeftColor: '#DCE7D8' },
  commentBody: { color: '#3E5246', fontSize: 13, lineHeight: 18 },
  commentMeta: { color: '#71857A', fontSize: 11, marginTop: 4 },
  commentComposer: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, paddingLeft: 10, borderTopWidth: 1, borderTopColor: '#EEF3EB' },
  commentInput: { flex: 1, minHeight: 38, paddingVertical: 8, color: '#132018', fontSize: 13 },
  empty: { color: '#71857A', paddingVertical: 16 },
});
