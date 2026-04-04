import { useEffect, useState } from 'react';
import { Keyboard, type KeyboardEvent, Platform } from 'react-native';

/** Current software keyboard height in px (0 when hidden). */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const onShow = (e: KeyboardEvent) => setHeight(e.endCoordinates.height);
    const onHide = () => setHeight(0);

    const subShow = Keyboard.addListener(showEvt, onShow);
    const subHide = Keyboard.addListener(hideEvt, onHide);

    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, []);

  return height;
}
