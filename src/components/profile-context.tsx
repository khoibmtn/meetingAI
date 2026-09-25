"use client";

import { createContext, useContext } from "react";
import type { Tables } from "@/lib/database.types";

export type CurrentProfile = Pick<
  Tables<"profiles">,
  "id" | "email" | "full_name" | "title" | "department" | "avatar_url" | "role" | "status"
>;

const ProfileContext = createContext<CurrentProfile | null>(null);

export function ProfileProvider({ profile, children }: { profile: CurrentProfile; children: React.ReactNode }) {
  return <ProfileContext.Provider value={profile}>{children}</ProfileContext.Provider>;
}

export function useProfile(): CurrentProfile {
  const p = useContext(ProfileContext);
  if (!p) throw new Error("useProfile phải nằm trong ProfileProvider");
  return p;
}
