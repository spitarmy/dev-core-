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

    // Step 1: authStateReady() で初期状態の確定を待つ（IndexedDB復元完了まで）
    auth.authStateReady().then(() => {
      if (!resolved) {
        resolved = true;
        setState({ user: auth.currentUser, loading: false });
      }
    });

    // Step 2: その後の状態変化を監視
    const unsub = onAuthStateChanged(auth, (user) => {
      // authStateReady()より先に来た場合も対応
      resolved = true;
      setState({ user, loading: false });
    });

    // Step 3: iOS Safari redirect結果をチェック
    getRedirectResult(auth).catch(() => {});

    // フォールバック: 3秒でタイムアウト
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        setState({ user: auth.currentUser, loading: false });
      }
    }, 3000);

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
