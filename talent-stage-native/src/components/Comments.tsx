import { useState, useEffect, useMemo, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, Image, Modal,
  StyleSheet, KeyboardAvoidingView, Platform, Alert, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../store/useAppStore';
import { apiFetch } from '../services/api';
import { toast } from './Toast';
import { AppColors } from '../theme/colors';
import { REPORT_REASONS } from './ShareSheet';
import type { Comment as CommentType, PaginatedResponse } from '../types';

const DEFAULT_AVATAR = require('../../assets/icon.png');

interface Props {
  videoId: string | null;
  open: boolean;
  onClose: () => void;
}

export default function Comments({ videoId, open, onClose }: Props) {
  const { loggedIn, user } = useAppStore();
  const [comments, setComments] = useState<CommentType[]>([]);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<CommentType | null>(null);
  const [likeLoading, setLikeLoading] = useState<Record<string, boolean>>({});
  const [deleteLoading, setDeleteLoading] = useState<Record<string, boolean>>({});
  const [reportModal, setReportModal] = useState(false);
  const [reportCommentId, setReportCommentId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [reportDesc, setReportDesc] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (videoId && open) void loadComments();
  }, [videoId, open]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 380);
    if (!open) setReplyTo(null);
  }, [open]);

  const thread = useMemo(() => {
    const byId = new Map<string, CommentType>();
    const repliesByParent: Record<string, CommentType[]> = {};
    const roots: CommentType[] = [];

    comments.forEach((c) => byId.set(c.id, c));
    comments.forEach((c) => {
      const parentId = c.parent_comment_id;
      if (parentId && byId.has(parentId)) {
        if (!repliesByParent[parentId]) repliesByParent[parentId] = [];
        repliesByParent[parentId].push(c);
      } else {
        roots.push(c);
      }
    });
    roots.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    Object.values(repliesByParent).forEach((list) =>
      list.sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at)),
    );
    return { roots, repliesByParent };
  }, [comments]);

  const loadComments = async () => {
    if (!videoId) return;
    const data = await apiFetch<PaginatedResponse<CommentType>>('/videos/' + videoId + '/comments?limit=100');
    if (data.success && data.data) {
      setComments(data.data.items || []);
    } else {
      toast('Could not load comments');
    }
  };

  const addComment = async () => {
    if (!text.trim()) return;
    if (!loggedIn) { toast('Sign in to comment'); return; }
    if (!videoId) return;
    const body = text.trim();
    const parentCommentId = replyTo?.id || null;
    setText('');
    const data = await apiFetch('/videos/' + videoId + '/comments', {
      method: 'POST',
      body: { body, parent_comment_id: parentCommentId } as unknown as BodyInit,
    });
    if (!data.success) { toast('Error: ' + data.error); setText(body); return; }
    setReplyTo(null);
    void loadComments();
  };

  const toggleCommentLike = async (commentId: string) => {
    if (!loggedIn) { toast('Sign in to like comments'); return; }
    if (!videoId || likeLoading[commentId]) return;
    setLikeLoading((prev) => ({ ...prev, [commentId]: true }));
    const data = await apiFetch<{ liked: boolean; likes_count: number }>(
      '/videos/' + videoId + '/comments/' + commentId + '/like',
      { method: 'POST' },
    );
    setLikeLoading((prev) => ({ ...prev, [commentId]: false }));
    if (!data.success || !data.data) {
      toast('Error: ' + (data.error || 'Could not like'));
      return;
    }
    setComments((prev) => prev.map((c) =>
      c.id === commentId
        ? { ...c, likes_count: Number(data.data?.likes_count || 0), is_liked: data.data?.liked ? 1 : 0 }
        : c,
    ));
  };

  const deleteOwnComment = (commentId: string) => {
    if (!videoId || !loggedIn) return;
    if (deleteLoading[commentId]) return;
    Alert.alert('Delete comment?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          setDeleteLoading((prev) => ({ ...prev, [commentId]: true }));
          const data = await apiFetch('/videos/' + videoId + '/comments/' + commentId, { method: 'DELETE' });
          setDeleteLoading((prev) => ({ ...prev, [commentId]: false }));
          if (!data.success) { toast('Error: ' + (data.error || 'Could not delete')); return; }
          if (replyTo && replyTo.id === commentId) setReplyTo(null);
          void loadComments();
        },
      },
    ]);
  };

  const submitReport = async () => {
    if (!videoId || !reportCommentId || !reportReason) { toast('Please select a reason'); return; }
    setReportSubmitting(true);
    const data = await apiFetch('/videos/' + videoId + '/comments/' + reportCommentId + '/report', {
      method: 'POST',
      body: { reason: reportReason, description: reportDesc } as unknown as BodyInit,
    });
    setReportSubmitting(false);
    if (!data.success) { toast('Error: ' + data.error); return; }
    setReportModal(false);
    toast('Comment reported. Thank you!');
  };

  const isOwn = (c: CommentType) =>
    !!user && (String(c.user_id) === String(user.id) || c.username === user.username);

  const flattenThread = () => {
    const result: { comment: CommentType; depth: number }[] = [];
    const addWithReplies = (c: CommentType, depth: number) => {
      result.push({ comment: c, depth });
      const replies = thread.repliesByParent[c.id] || [];
      replies.forEach((r) => addWithReplies(r, Math.min(depth + 1, 3)));
    };
    thread.roots.forEach((r) => addWithReplies(r, 0));
    return result;
  };

  const flatData = useMemo(flattenThread, [thread]);

  const renderComment = ({ item }: { item: { comment: CommentType; depth: number } }) => {
    const { comment: c, depth } = item;
    const liked = Number(c.is_liked) > 0;
    const own = isOwn(c);
    const replies = thread.repliesByParent[c.id] || [];

    return (
      <View style={[styles.commentRow, { marginLeft: depth * 18 }]}>
        <Image
          source={c.avatar_url ? { uri: c.avatar_url } : DEFAULT_AVATAR}
          style={styles.avatar}
        />
        <View style={styles.commentBody}>
          <Text style={styles.commentText}>
            <Text style={styles.commentUser}>{c.username} </Text>
            {c.body}
          </Text>
          <View style={styles.commentMeta}>
            <TouchableOpacity
              style={styles.metaBtn}
              onPress={() => void toggleCommentLike(c.id)}
              disabled={!!likeLoading[c.id]}
            >
              <Text style={[styles.metaText, liked && { color: AppColors.danger }]}>
                {liked ? '❤' : '♡'} {Number(c.likes_count || 0)}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.metaBtn} onPress={() => setReplyTo(c)}>
              <Text style={styles.metaText}>Reply</Text>
            </TouchableOpacity>
            {replies.length > 0 && (
              <Text style={styles.metaCount}>{replies.length} repl{replies.length === 1 ? 'y' : 'ies'}</Text>
            )}
          </View>
        </View>
        {own ? (
          <TouchableOpacity onPress={() => deleteOwnComment(c.id)} disabled={!!deleteLoading[c.id]}>
            <Ionicons name="trash-outline" size={16} color="#8d8d8d" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={() => {
            setReportCommentId(c.id);
            setReportReason('');
            setReportDesc('');
            setReportModal(true);
          }}>
            <Ionicons name="flag-outline" size={16} color="#8d8d8d" />
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity style={styles.topDismiss} activeOpacity={1} onPress={onClose} />
        <View style={styles.drawer}>
          <TouchableOpacity style={styles.handleArea} onPress={onClose}>
            <View style={styles.handle} />
            <Text style={styles.closeLabel}>CLOSE</Text>
          </TouchableOpacity>

          <FlatList
            data={flatData}
            keyExtractor={(item) => item.comment.id}
            renderItem={renderComment}
            contentContainerStyle={styles.list}
            ListEmptyComponent={<Text style={styles.empty}>No comments yet</Text>}
          />

          <View style={styles.inputRow}>
            <TextInput
              ref={inputRef}
              style={styles.input}
              placeholder={replyTo ? `Reply to @${replyTo.username}...` : 'Write a comment...'}
              placeholderTextColor="#888"
              value={text}
              onChangeText={setText}
              returnKeyType="send"
              onSubmitEditing={addComment}
            />
            {replyTo && (
              <TouchableOpacity onPress={() => setReplyTo(null)} style={styles.cancelReply}>
                <Text style={styles.cancelReplyText}>Cancel</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={addComment} style={styles.sendBtn}>
              <Ionicons name="send" size={20} color={AppColors.accentPrimary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Report comment modal */}
        <Modal visible={reportModal} transparent animationType="fade" onRequestClose={() => setReportModal(false)}>
          <View style={styles.reportOverlay}>
            <View style={styles.reportContent}>
              <Text style={styles.reportTitle}>Report Comment</Text>
              <ScrollView style={{ maxHeight: 200, marginBottom: 12 }}>
                {REPORT_REASONS.map((r) => (
                  <TouchableOpacity
                    key={r}
                    style={[styles.reasonItem, reportReason === r && styles.reasonActive]}
                    onPress={() => setReportReason(r)}
                  >
                    <Text style={[styles.reasonText, reportReason === r && { color: '#fff', fontWeight: '600' }]}>{r}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <TextInput
                style={styles.reportInput}
                placeholder="Details (optional)..."
                placeholderTextColor="#666"
                value={reportDesc}
                onChangeText={setReportDesc}
                multiline
              />
              <View style={styles.reportButtons}>
                <TouchableOpacity style={styles.reportCancel} onPress={() => setReportModal(false)}>
                  <Text style={{ color: 'rgba(255,255,255,0.6)', fontWeight: '600' }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.reportSubmit, (!reportReason || reportSubmitting) && { opacity: 0.5 }]}
                  onPress={submitReport}
                  disabled={!reportReason || reportSubmitting}
                >
                  <Text style={{ color: '#fff', fontWeight: '700' }}>
                    {reportSubmitting ? 'Reporting...' : 'Report'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1 },
  topDismiss: { flex: 0.38 },
  drawer: {
    flex: 0.62,
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  handleArea: {
    alignItems: 'center',
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#ccc',
    marginBottom: 4,
  },
  closeLabel: {
    fontSize: 10,
    color: '#bbb',
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  list: { padding: 12 },
  empty: { padding: 16, color: '#aaa', fontSize: 13 },
  commentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 12,
  },
  avatar: { width: 34, height: 34, borderRadius: 17 },
  commentBody: { flex: 1 },
  commentText: { color: '#333', fontSize: 13, lineHeight: 18 },
  commentUser: { fontWeight: '700', color: '#333' },
  commentMeta: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  metaBtn: {},
  metaText: { color: '#888', fontSize: 12 },
  metaCount: { color: '#aaa', fontSize: 11 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    backgroundColor: '#fff',
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    color: '#333',
  },
  cancelReply: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 14,
  },
  cancelReplyText: { fontSize: 12, color: '#888' },
  sendBtn: { padding: 6 },
  reportOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    padding: 24,
  },
  reportContent: {
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    padding: 24,
  },
  reportTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 16,
  },
  reasonItem: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginBottom: 4,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  reasonActive: { backgroundColor: AppColors.accentPrimary },
  reasonText: { color: '#ccc', fontSize: 14 },
  reportInput: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12,
    padding: 12,
    color: '#fff',
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 20,
  },
  reportButtons: { flexDirection: 'row', gap: 10 },
  reportCancel: {
    flex: 1,
    padding: 13,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
  },
  reportSubmit: {
    flex: 2,
    padding: 13,
    borderRadius: 12,
    backgroundColor: 'rgba(255,0,0,0.6)',
    alignItems: 'center',
  },
});
