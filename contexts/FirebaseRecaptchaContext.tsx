import React, { createContext, useContext } from 'react';

/** Ref to root `FirebaseRecaptchaVerifierModal` (ApplicationVerifier). */
export type RecaptchaModalRef = React.RefObject<{ verify: () => Promise<string> } | null>;

const FirebaseRecaptchaContext = createContext<RecaptchaModalRef | null>(null);

export function FirebaseRecaptchaProvider({
  verifierRef,
  children,
}: {
  verifierRef: RecaptchaModalRef;
  children: React.ReactNode;
}) {
  return (
    <FirebaseRecaptchaContext.Provider value={verifierRef}>
      {children}
    </FirebaseRecaptchaContext.Provider>
  );
}

export function useFirebaseRecaptchaRef(): RecaptchaModalRef | null {
  return useContext(FirebaseRecaptchaContext);
}
