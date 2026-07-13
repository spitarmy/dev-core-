"use client";

import { useState, useEffect } from "react";
import { signInWithPopup, signInWithRedirect, getRedirectResult, GoogleAuthProvider, onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [redirectChecked, setRedirectChecked] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    // 1. Auth状態チェック
    const unsub = onAuthStateChanged(auth, (user) => {
      if (cancelled) return;
      if (user) {
        router.replace("/");
        return;
      }
      setAuthChecked(true);
    });

    // 2. Redirect結果チェック（iOS Safari用）
    getRedirectResult(auth).then((result) => {
      if (cancelled) return;
      if (result?.user) {
        router.replace("/");
      } else {
        setRedirectChecked(true);
      }
    }).catch(() => {
      if (!cancelled) setRedirectChecked(true);
    });

    return () => {
      cancelled = true;
      unsub();
    };
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
      setIsRedirecting(false);
      if (err.code === "auth/popup-blocked") {
        try {
          await signInWithRedirect(auth, new GoogleAuthProvider());
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

  // 両方のチェックが完了するまでローディング表示
  const isReady = authChecked && redirectChecked && !isRedirecting;

  if (!isReady) {
    return (
      <div className="flex-center" style={{ minHeight: '100vh' }}>
        <div className="glass-card" style={{ width: '100%', maxWidth: '400px', textAlign: 'center' }}>
          <h1 className="text-gradient" style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>ZENNOBATE</h1>
          <p className="text-secondary">{isRedirecting ? "ログイン中..." : "認証を確認中..."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-center" style={{ minHeight: '100vh' }}>
      <div className="glass-card" style={{ width: '100%', maxWidth: '400px', textAlign: 'center' }}>
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
