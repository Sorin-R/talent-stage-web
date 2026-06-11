import React from 'react';
import type { Insets, PressableProps, PressableStateCallbackType, StyleProp, ViewStyle } from 'react-native';
import { Platform, Pressable } from 'react-native';

const DEFAULT_HIT_SLOP: Insets = {
  top: 12,
  right: 12,
  bottom: 12,
  left: 12,
};

const PRESSED_FEEDBACK_STYLE: ViewStyle = {
  opacity: 0.78,
  transform: [{ scale: 0.97 }],
};

const HOVER_FEEDBACK_STYLE: ViewStyle = {
  opacity: 0.93,
  transform: [{ scale: 1.01 }],
};

const WEB_CURSOR_STYLE = (Platform.OS === 'web'
  ? ({ cursor: 'pointer' } as unknown as ViewStyle)
  : null);

function mergeInteractiveStyle(
  style: PressableProps['style'],
  disabled: boolean | null | undefined,
): (state: PressableStateCallbackType) => StyleProp<ViewStyle> {
  return (state: PressableStateCallbackType) => {
    const baseStyle = typeof style === 'function' ? style(state) : style;
    if (disabled) return baseStyle as StyleProp<ViewStyle>;

    const hoverState = (state as PressableStateCallbackType & { hovered?: boolean }).hovered === true;
    const feedbackStyle = state.pressed
      ? PRESSED_FEEDBACK_STYLE
      : hoverState
        ? HOVER_FEEDBACK_STYLE
        : null;

    if (!feedbackStyle && !WEB_CURSOR_STYLE) return baseStyle as StyleProp<ViewStyle>;
    if (!feedbackStyle && WEB_CURSOR_STYLE) {
      if (Array.isArray(baseStyle)) return [...baseStyle, WEB_CURSOR_STYLE] as StyleProp<ViewStyle>;
      return [baseStyle as StyleProp<ViewStyle>, WEB_CURSOR_STYLE] as StyleProp<ViewStyle>;
    }
    if (Array.isArray(baseStyle)) return [...baseStyle, feedbackStyle] as StyleProp<ViewStyle>;
    return [
      baseStyle as StyleProp<ViewStyle>,
      WEB_CURSOR_STYLE as StyleProp<ViewStyle>,
      feedbackStyle,
    ] as StyleProp<ViewStyle>;
  };
}

const AppPressable = React.forwardRef<any, PressableProps>((props, ref) => {
  const { style, hitSlop, disabled, ...restProps } = props;

  return (
    <Pressable
      ref={ref}
      {...restProps}
      disabled={!!disabled}
      hitSlop={hitSlop ?? DEFAULT_HIT_SLOP}
      style={mergeInteractiveStyle(style, disabled)}
    />
  );
});

AppPressable.displayName = 'AppPressable';

export default AppPressable;
