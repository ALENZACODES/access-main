import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { UserProfile } from "@access/shared";
import { applyLanguage, languageWasChosen, type AppLanguage } from "../i18n/index.ts";
import { deleteProfile, getProfile, saveProfile, storageHealth, updateProfileLanguage, withdrawStoredConsent } from "../storage/repository.ts";

interface ProfileState {
  profile: UserProfile | null;
  ready: boolean;
  health: "ok" | "unavailable" | "checking";
  refresh: () => Promise<void>;
  save: (profile: UserProfile) => Promise<void>;
  remove: () => Promise<void>;
  withdraw: () => Promise<UserProfile | null>;
  setLanguage: (language: AppLanguage) => Promise<void>;
}

const ProfileContext = createContext<ProfileState | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [ready, setReady] = useState(false);
  const [health, setHealth] = useState<"ok" | "unavailable" | "checking">("checking");

  const refresh = useCallback(async () => {
    const [nextHealth, nextProfile] = await Promise.all([storageHealth(), getProfile()]);
    setHealth(nextHealth);
    setProfile(nextProfile);
    if (nextProfile && !languageWasChosen()) {
      await applyLanguage(nextProfile.language_preference, false);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = useCallback(async (next: UserProfile) => {
    const stored = await saveProfile(next);
    setProfile(stored);
    await applyLanguage(stored.language_preference, true);
  }, []);

  const remove = useCallback(async () => {
    await deleteProfile();
    setProfile(null);
  }, []);

  const withdraw = useCallback(async () => {
    const stored = await withdrawStoredConsent(new Date().toISOString());
    setProfile(stored);
    return stored;
  }, []);

  const setLanguage = useCallback(async (language: AppLanguage) => {
    await applyLanguage(language, true);
    await updateProfileLanguage(language, new Date().toISOString());
    const next = await getProfile();
    setProfile(next);
  }, []);

  const value = useMemo(
    () => ({ profile, ready, health, refresh, save, remove, withdraw, setLanguage }),
    [profile, ready, health, refresh, save, remove, withdraw, setLanguage],
  );

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfileState(): ProfileState {
  const value = useContext(ProfileContext);
  if (!value) throw new Error("ProfileProvider is missing");
  return value;
}
