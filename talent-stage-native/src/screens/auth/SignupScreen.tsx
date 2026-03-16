import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { AppColors } from '../../theme/colors';
import { apiFetch } from '../../services/api';
import { useAppStore } from '../../store/useAppStore';
import { toast } from '../../components/Toast';
import type { User } from '../../types';

export default function SignupScreen() {
  const navigation = useNavigation();
  const setSession = useAppStore((s) => s.setSession);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    if (!firstName.trim() || !email.trim() || !password) {
      setError('Please fill all required fields.');
      return;
    }

    const fullName = firstName.trim() + (lastName.trim() ? ' ' + lastName.trim() : '');
    const username = (firstName + (lastName || '')).toLowerCase().replace(/\s+/g, '').slice(0, 22)
      + '_' + String(Date.now()).slice(-4);

    setSubmitting(true);
    const res = await apiFetch<{ token: string; user: User }>('/auth/register', {
      method: 'POST',
      body: {
        username,
        email: email.trim().toLowerCase(),
        password,
        full_name: fullName,
        talent_type: 'Viewer',
      },
    });
    setSubmitting(false);

    if (!res.success || !res.data) {
      setError(res.error || 'Sign up failed.');
      return;
    }

    await setSession(res.data.user, res.data.token);
    toast('Welcome, ' + res.data.user.full_name + '!');
  };

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.logo}>Talents Stage</Text>
      <Text style={styles.heading}>Sign Up</Text>

      <TextInput
        value={firstName}
        onChangeText={setFirstName}
        style={styles.input}
        placeholder="First name"
        placeholderTextColor={AppColors.textSecondary}
      />
      <TextInput
        value={lastName}
        onChangeText={setLastName}
        style={styles.input}
        placeholder="Last name"
        placeholderTextColor={AppColors.textSecondary}
      />
      <TextInput
        value={email}
        onChangeText={setEmail}
        style={styles.input}
        placeholder="Email address"
        placeholderTextColor={AppColors.textSecondary}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <TextInput
        value={password}
        onChangeText={setPassword}
        style={styles.input}
        placeholder="Password"
        placeholderTextColor={AppColors.textSecondary}
        secureTextEntry
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable style={styles.btn} onPress={submit} disabled={submitting}>
        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Sign Up</Text>}
      </Pressable>

      <Pressable onPress={() => navigation.goBack()}>
        <Text style={styles.link}>Already a member? <Text style={{ color: AppColors.accentPrimary }}>Sign In</Text></Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1, backgroundColor: AppColors.backgroundPrimary,
    paddingHorizontal: 20, justifyContent: 'center', gap: 12,
  },
  logo: { color: AppColors.accentPrimary, fontSize: 28, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
  heading: { color: '#fff', fontSize: 18, fontWeight: '700', textAlign: 'center', marginBottom: 4 },
  input: {
    backgroundColor: AppColors.backgroundCard, borderColor: AppColors.borderPrimary,
    borderWidth: 1, borderRadius: 12, color: '#fff', paddingHorizontal: 14, paddingVertical: 12, fontSize: 14,
  },
  btn: {
    backgroundColor: AppColors.accentPrimary, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', minHeight: 46, marginTop: 4,
  },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  link: { color: AppColors.textSecondary, textAlign: 'center', fontSize: 13, marginTop: 4 },
  error: { color: '#ffb4b4', fontSize: 13, textAlign: 'center' },
});
