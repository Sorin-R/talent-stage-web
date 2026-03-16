import { useEffect, useRef, useState, useCallback } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';

let _showToast: (msg: string) => void = () => {};

export function toast(msg: string) {
  _showToast(msg);
}

export default function Toast() {
  const [message, setMessage] = useState('');
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((msg: string) => {
    setMessage(msg);
    Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }).start();
    }, 2800);
  }, [opacity]);

  useEffect(() => {
    _showToast = show;
    return () => { _showToast = () => {}; };
  }, [show]);

  return (
    <Animated.View style={[styles.container, { opacity }]} pointerEvents="none">
      <Text style={styles.text}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 100,
    left: 24,
    right: 24,
    alignItems: 'center',
    zIndex: 9999,
  },
  text: {
    backgroundColor: 'rgba(30,30,30,0.95)',
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    overflow: 'hidden',
  },
});
