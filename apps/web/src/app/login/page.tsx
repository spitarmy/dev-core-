"use client";

import { useState, useEffect } from "react";
import { signInWithPopup, signInWithRedirect, getRedirectResult, GoogleAuthProvider } from "firebase/auth";
import { auth } from "@/lib/firebase";

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // F2修正: redirect結果をチェック（iOSからのリダイレクト戻り）
  useEffect(() => {
    getRedirectResult(auth).then((result) => {
      if (result?.user) {
        window.location.href = "/";
      }
    }).catch((err) => {
      console.error("Redirect result error:", err);
    });
  }, []);

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const provider = new GoogleAuthProvider();
      // F2修正: モバイルはredirect、PCはpopup
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      if (isMobile) {
        await signInWithRedirect(auth, provider);
        // redirect後はページ遷移するのでここには戻らない
      } else {
        const result = await signInWithPopup(auth, provider);
        if (result.user) {
          window.location.href = "/";
        }
      }
    } catch (err: any) {
      console.error("Login failed:", err);
      if (err.code === "auth/popup-blocked") {
        // ポップアップブロック時はredirectにフォールバック
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
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex-center" style={{ minHeight: '100vh' }}>
      <div className="glass-card animate-fade-in" style={{ width: '100%', maxWidth: '400px', textAlign: 'center' }}>
        <h1 className="text-gradient" style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>ZENNOBATE</h1>
        <p className="text-secondary" style={{ marginBottom: '2rem' }}>Googleでログインして開始</p>
        
        <button 
          className="btn btn-primary" 
          style={{ width: '100%' }}
          onClick={handleGoogleLogin}
          disabled={isLoading}
        >
          {isLoading ? "ログイン中..." : "Googleアカウントでログイン"}
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
