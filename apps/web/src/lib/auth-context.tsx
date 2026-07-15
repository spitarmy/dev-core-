"use client";

import { createContext, useContext, ReactNode } from "react";
import { User } from "firebase/auth";

type AuthState = {
  user: User | null;
  loading: boolean;
};

// ログイン画面を完全に廃止し、常にダミーユーザーを返すことでAuthをバイパスする
const dummyUser = { uid: "developer", email: "developer@zennobate.local" } as User;

const AuthContext = createContext<AuthState>({ user: dummyUser, loading: false });

export function AuthProvider({ children }: { children: ReactNode }) {
  return (
    <AuthContext.Provider value={{ user: dummyUser, loading: false }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
