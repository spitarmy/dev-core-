"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { signInWithPopup, signInWithRedirect, GoogleAuthProvider } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";

export default function LoginPage() {
  const { user, loading } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const redirected = useRef(false);
  const router = useRouter();

  // ログイン済みならホームへ（1回だけ）
  useEffect(() => {
    if (!loading && user && !redirected.current) {
      redirected.current = true;
      router.replace("/");
    }
  }, [loading, user, router]);

  const handleGoogleLogin = async () => {
    setIsRedirecting(true);
    setError(null);
    try {
      const provider = new GoogleAuthProvider();
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      if (isMobile) {
        await signInWithRedirect(auth, provider);
      } else {
        await signInWithPopup(auth, provider);
        // AuthContextが自動更新 → useEffectでリダイレクト
      }
    } catch (err: any) {
      setIsRedirecting(false);
      if (err.code === "auth/popup-blocked") {
        try { await signInWithRedirect(auth, new GoogleAuthProvider()); }
        catch (e2) { setError("ログインに失敗しました。もう一度お試しください。"); }
      } else if (err.code === "auth/popup-closed-by-user") {
        setError("ログインがキャンセルされました。");
      } else {
        setError(err.message || "ログインに失敗しました");
      }
    }
  };

  // ローディング中 or リダイレクト中 or ログイン済み（遷移待ち）
  if (loading || isRedirecting || user) {
    return (
      <div className="flex-center" style={{ minHeight: '100vh' }}>
        <div className="glass-card" style={{ width: '100%', maxWidth: '400px', textAlign: 'center' }}>
          <h1 className="text-gradient" style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>ZENNOBATE</h1>
          <p className="text-secondary">
            {isRedirecting ? "ログイン中..." : user ? "ホーム画面へ移動中..." : "認証を確認中..."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-center" style={{ minHeight: '100vh' }}>
      <div className="glass-card" style={{ width: '100%', maxWidth: '400px', textAlign: 'center' }}>
        <h1 className="text-gradient" style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>ZENNOBATE</h1>
        <p className="text-secondary" style={{ marginBottom: '2rem' }}>Googleでログインして開始</p>
        
        <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleGoogleLogin}>
          Googleアカウントでログイン
        </button>

        {error && (
          <p style={{ color: 'var(--danger)', marginTop: '1rem', fontSize: '0.875rem', wordBreak: 'break-all' }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
