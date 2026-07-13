"use client";

import { useState, useEffect } from "react";
import { signInWithPopup, signInWithRedirect, getRedirectResult, GoogleAuthProvider, onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true); // 初期状態はローディング
  const [isRedirecting, setIsRedirecting] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // 1. まずAuthの状態を確認。すでにログイン済みならホームへ
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        router.replace("/");
        return;
      }
      // ユーザーがいない場合、redirect結果をチェック
      setIsLoading(false);
    });

    // 2. redirect結果をチェック（iOS Safariからの戻り）
    getRedirectResult(auth).then((result) => {
      if (result?.user) {
        router.replace("/");
      }
    }).catch((err) => {
      console.error("Redirect result error:", err);
      setIsLoading(false);
    });

    return () => unsub();
  }, [router]);

  const handleGoogleLogin = async () => {
    setIsRedirecting(true);
    setError(null);
    try {
      const provider = new GoogleAuthProvider();
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      if (isMobile) {
        await signInWithRedirect(auth, provider);
      } else {
        const result = await signInWithPopup(auth, provider);
        if (result.user) {
          router.replace("/");
        }
      }
    } catch (err: any) {
      console.error("Login failed:", err);
      setIsRedirecting(false);
      if (err.code === "auth/popup-blocked") {
        try {
          const provider = new GoogleAuthProvider();
          await signInWithRedirect(auth, provider);
        } catch (e2) {
          setError("ログインに失敗しました。もう一度お試しください。");
        }
      } else if (err.code === "auth/popup-closed-by-user") {
        setError("ログインがキャンセルされました。");
      } else {
        setError(err.message || "ログインに失敗しました");
      }
    }
  };

  // ローディング中やリダイレクト中は最小限の表示
  if (isLoading || isRedirecting) {
    return (
      <div className="flex-center" style={{ minHeight: '100vh' }}>
        <div className="glass-card animate-fade-in" style={{ width: '100%', maxWidth: '400px', textAlign: 'center' }}>
          <h1 className="text-gradient" style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>ZENNOBATE</h1>
          <p className="text-secondary">{isRedirecting ? "ログイン中..." : "認証を確認中..."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-center" style={{ minHeight: '100vh' }}>
      <div className="glass-card animate-fade-in" style={{ width: '100%', maxWidth: '400px', textAlign: 'center' }}>
        <h1 className="text-gradient" style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>ZENNOBATE</h1>
        <p className="text-secondary" style={{ marginBottom: '2rem' }}>Googleでログインして開始</p>
        
        <button 
          className="btn btn-primary" 
          style={{ width: '100%' }}
          onClick={handleGoogleLogin}
        >
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
