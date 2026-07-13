"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "@/lib/firebase";

type AuthState = {
  user: User | null;
  loading: boolean;
};

const AuthContext = createContext<AuthState>({ user: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, loading: true });

  useEffect(() => {
    // authStateReady() はFirebase v10+で使用可能
    // IndexedDB等からの復元が完了してから初めてonAuthStateChangedが発火する
    const unsub = onAuthStateChanged(auth, (user) => {
      setState({ user, loading: false });
    });

    // フォールバック: 5秒経っても初期化が完了しない場合はloadingを解除
    const timeout = setTimeout(() => {
      setState(prev => prev.loading ? { user: null, loading: false } : prev);
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
