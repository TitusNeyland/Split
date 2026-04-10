import React, {
  createContext,
  useContext,
  useLayoutEffect,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import type { TextInput } from 'react-native';
import type { SheetFriend, WizardMember } from './memberTypes';

export type AddSubscriptionPickMembersApi = {
  invitedSheetMembers: WizardMember[];
  nonOwnerMemberCount: number;
  friendQuery: string;
  setFriendQuery: (q: string) => void;
  friendsForSheet: SheetFriend[];
  searchingFriends: boolean;
  showSearchEmptyState: boolean;
  friendQueryTooShort: boolean;
  onToggleFriendInSplit: (friend: SheetFriend) => void;
  removeNonOwnerMember: (memberId: string) => void;
  addedMemberIds: Set<string>;
  sheetSearchInputRef: RefObject<TextInput | null>;
  sheetSessionAddedIds: string[];
  onLeavePicker: () => void;
};

const PickMembersApiContext = createContext<AddSubscriptionPickMembersApi | null>(null);

const RegisterPickMembersContext = createContext<
  ((api: AddSubscriptionPickMembersApi | null) => void) | null
>(null);

export function AddSubscriptionPickMembersProvider({ children }: { children: ReactNode }) {
  const [api, setApi] = useState<AddSubscriptionPickMembersApi | null>(null);
  return (
    <RegisterPickMembersContext.Provider value={setApi}>
      <PickMembersApiContext.Provider value={api}>{children}</PickMembersApiContext.Provider>
    </RegisterPickMembersContext.Provider>
  );
}

export function usePickMembersApi(): AddSubscriptionPickMembersApi | null {
  return useContext(PickMembersApiContext);
}

export function useRegisterPickMembersApi(api: AddSubscriptionPickMembersApi | null) {
  const setApi = useContext(RegisterPickMembersContext);
  useLayoutEffect(() => {
    if (!setApi) return;
    setApi(api);
    return () => setApi(null);
  }, [api, setApi]);
}

// Default export to satisfy file-based routing (this file should not be routed)
export default AddSubscriptionPickMembersProvider;
