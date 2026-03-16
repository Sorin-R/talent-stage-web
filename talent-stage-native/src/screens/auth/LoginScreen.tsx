import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AppColors } from '../../theme/colors';
import { apiFetch } from '../../services/api';
import { useAppStore } from '../../store/useAppStore';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import type { User } from '../../types';

export default function LoginScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const setSession = useAppStore((state) => state.setSession);

  const [emailText, setEmailText] = useState('');
  const [passwordText, setPasswordText] = useState('');
  const [loginErrorText, setLoginErrorText] = useState('');
  const [isSubmittingLogin, setIsSubmittingLogin] = useState(false);

  const submitLogin = async () => {
    setLoginErrorText('');
    if (!emailText.trim() || !passwordText) {
      setLoginErrorText('Please add email and password.');
      return;
    }

    setIsSubmittingLogin(true);
    const loginResponse = await apiFetch<{ token: string; user: User }>('/auth/login', {
      method: 'POST',
      body: {
        email: emailText.trim().toLowerCase(),
        password: passwordText,
      },
    });
    setIsSubmittingLogin(false);

    if (!loginResponse.success || !loginResponse.data) {
      setLoginErrorText(loginResponse.error || 'Login failed now.');
      return;
    }

    await setSession(loginResponse.data.user, loginResponse.data.token);
  };

  return (
    <View style={styles.screenContainer}>
      <Text style={styles.logoText}>Talents Stage</Text>
      <Text style={styles.headingText}>Sign In</Text>

      <TextInput
        value={emailText}
        onChangeText={setEmailText}
        style={styles.formInputField}
        placeholder="Email address"
        placeholderTextColor={AppColors.textSecondary}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <TextInput
        value={passwordText}
        onChangeText={setPasswordText}
        style={styles.formInputField}
        placeholder="Password"
        placeholderTextColor={AppColors.textSecondary}
        secureTextEntry
      />

      {loginErrorText ? <Text style={styles.errorText}>{loginErrorText}</Text> : null}

      <Pressable style={styles.primaryButton} onPress={submitLogin} disabled={isSubmittingLogin}>
        {isSubmittingLogin ? <ActivityIndicator color={AppColors.textPrimary} /> : <Text style={styles.primaryButtonText}>Sign In</Text>}
      </Pressable>

      <Pressable onPress={() => navigation.navigate('Signup')}>
        <Text style={styles.secondaryLinkText}>Create account</Text>
      </Pressable>

      <Pressable onPress={() => navigation.navigate('ForgotPassword')}>
        <Text style={styles.secondaryLinkText}>Forgot password?</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screenContainer: {
    flex: 1,
    backgroundColor: AppColors.backgroundPrimary,
    paddingHorizontal: 20,
    justifyContent: 'center',
    gap: 12,
  },
  logoText: {
    color: AppColors.accentPrimary,
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  headingText: {
    color: AppColors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 4,
  },
  formInputField: {
    backgroundColor: AppColors.backgroundCard,
    borderColor: AppColors.borderPrimary,
    borderWidth: 1,
    borderRadius: 12,
    color: AppColors.textPrimary,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
  },
  primaryButton: {
    backgroundColor: AppColors.accentPrimary,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
    marginTop: 4,
  },
  primaryButtonText: {
    color: AppColors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  secondaryLinkText: {
    color: AppColors.textSecondary,
    textAlign: 'center',
    fontSize: 13,
    textDecorationLine: 'underline',
  },
  errorText: {
    color: '#ffb4b4',
    fontSize: 13,
    textAlign: 'center',
  },
});
