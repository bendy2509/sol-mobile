import { useEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardEvent, Platform, useWindowDimensions } from 'react-native';

/**
 * How far content pinned to the bottom of a Modal must rise to stay above the keyboard.
 *
 * Android does not resize a Modal's window for the keyboard (edge-to-edge, translucent status
 * bar), so KeyboardAvoidingView does nothing there. This reads the keyboard height from the
 * keyboard events and subtracts whatever the window itself already shrank, so devices that do
 * resize are not lifted twice.
 */
export function useKeyboardOffset(): number {
  const { height } = useWindowDimensions();
  const baseHeight = useRef(height);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (keyboardHeight === 0) baseHeight.current = height;
  }, [height, keyboardHeight]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (e: KeyboardEvent) => setKeyboardHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return Math.max(0, keyboardHeight - (baseHeight.current - height));
}
