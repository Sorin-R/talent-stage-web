import React, { useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import AppPressable from '../../components/AppPressable';
import { useNavigation } from '@react-navigation/native';
import { AppColors } from '../../theme/colors';
import { apiFetch } from '../../services/api';
import { toast } from '../../components/Toast';

export default function ForgotPasswordScreen() {
  const navigation = useNavigation();
  const [email, setEmail] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    if (!email.trim() || !newPwd || !confirmPwd) {
      setError('Please fill all fields.');
      return;
    }
    if (newPwd.length < 8) { setError('Min 8 characters'); return; }
    if (newPwd !== confirmPwd) { setError('Passwords do not match'); return; }

    setSubmitting(true);
    const res = await apiFetch('/auth/reset-password', {
      method: 'POST',
      body: { email: email.trim().toLowerCase(), new_password: newPwd },
    });
    setSubmitting(false);

    if (!res.success) {
      setError(res.error || 'Could not reset password.');
      return;
    }

    toast('Password reset! You can now log in.');
    navigation.goBack();
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.heading}>Forgot Password</Text>
        <Text style={styles.subtitle}>Enter your email and new password</Text>

        <Text style={styles.label}>Email address</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          style={styles.input}
          placeholder="your@email.com"
          placeholderTextColor="#666"
          autoCapitalize="none"
          keyboardType="email-address"
        />

        <Text style={styles.label}>New password</Text>
        <TextInput
          value={newPwd}
          onChangeText={setNewPwd}
          style={styles.input}
          placeholder="Min. 8 characters..."
          placeholderTextColor="#666"
          secureTextEntry
        />

        <Text style={styles.label}>Confirm new password</Text>
        <TextInput
          value={confirmPwd}
          onChangeText={setConfirmPwd}
          style={styles.input}
          placeholder="Repeat new password..."
          placeholderTextColor="#666"
          secureTextEntry
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.buttons}>
          <AppPressable style={styles.cancelBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.cancelText}>Cancel</Text>
          </AppPressable>
          <AppPressable style={[styles.submitBtn, submitting && { opacity: 0.5 }]} onPress={submit} disabled={submitting}>
            {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Reset Password</Text>}
          </AppPressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: AppColors.backgroundPrimary,
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  card: {
    backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2a2a2a',
    borderRadius: 20, padding: 24, width: '100%', maxWidth: 400,
  },
  heading: { fontSize: 18, fontWeight: '700', color: '#fff', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 13, color: 'rgba(255,255,255,0.45)', textAlign: 'center', marginBottom: 20 },
  label: { fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 5 },
  input: {
    backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12, padding: 12, color: '#fff', fontSize: 14, marginBottom: 12,
  },
  error: { color: '#ffb4b4', fontSize: 13, textAlign: 'center', marginBottom: 8 },
  buttons: { flexDirection: 'row', gap: 10, marginTop: 8 },
  cancelBtn: {
    flex: 1, padding: 13, borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', alignItems: 'center',
  },
  cancelText: { color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: '600' },
  submitBtn: {
    flex: 2, padding: 13, borderRadius: 12,
    backgroundColor: AppColors.accentPrimary, alignItems: 'center',
  },
  submitText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
