import { useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  type: 'like' | 'dislike' | null;
}

export default function ReactionOverlay({ type }: Props) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    if (type) {
      opacity.setValue(1);
      scale.setValue(0.5);
      Animated.parallel([
        Animated.timing(scale, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.sequence([
          Animated.delay(400),
          Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
        ]),
      ]).start();
    }
  }, [type, opacity, scale]);

  if (!type) return null;

  return (
    <Animated.View style={[styles.container, { opacity }]} pointerEvents="none">
      <Animated.View style={{ transform: [{ scale }] }}>
        <Ionicons
          name={type === 'like' ? 'thumbs-up' : 'thumbs-down'}
          size={100}
          color={type === 'like' ? '#fff' : '#e84040'}
        />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
});
