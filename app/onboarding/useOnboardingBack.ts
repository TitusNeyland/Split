import { useCallback } from 'react';
import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import { useNavigation } from '@react-navigation/native';

/**
 * Resume via `<Redirect href="/onboarding/email" />` leaves no stack entry to pop — `goBack()` fails.
 * Use explicit fallback routes for each onboarding step.
 */
export function useOnboardingBack(fallback: Href): () => void {
  const router = useRouter();
  const navigation = useNavigation();

  return useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      router.replace(fallback);
    }
  }, [navigation, router, fallback]);
}
