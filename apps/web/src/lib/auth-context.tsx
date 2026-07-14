"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { onAuthStateChanged, getRedirectResult, User } from "firebase/auth";
import { auth } from "@/lib/firebase";

type AuthState = {
  user: User | null;
  loading: boolean;
};

const AuthContext = createContext<AuthState>({ user: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, loading: true });

  useEffect(() => {
    let resolved = false;

    const checkAuth = async () => {
      try {
        // Step 1: IndexedDBからの復元を待つ
        await auth.authStateReady();
        // Step 2: リダイレクト結果があれば待つ（iOS Safari対策のキモ）
        await getRedirectResult(auth);
      } catch (error) {
        console.error("Auth init error:", error);
      } finally {
        if (!resolved) {
          resolved = true;
          setState({ user: auth.currentUser, loading: false });
        }
      }
    };

    checkAuth();

    // その後の状態変化（別タブでのログインやログアウトなど）
    const unsub = onAuthStateChanged(auth, (user) => {
      if (resolved) {
        setState({ user, loading: false });
      }
    });

    // 念のためのタイムアウト（5秒）
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        setState({ user: auth.currentUser, loading: false });
      }
    }, 5000);

    return () => {
      unsub();
      clearTimeout(timeout);
    };
  }, []);

  return (
    <AuthContext.Provider value={state}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
