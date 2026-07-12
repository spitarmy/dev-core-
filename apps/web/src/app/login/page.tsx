"use client";

import { useState } from "react";
import { signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      if (result.user) {
        // ログイン成功 - ホームへ遷移
        window.location.href = "/";
      }
    } catch (err: any) {
      console.error("Login failed:", err);
      if (err.code === "auth/popup-blocked") {
        setError("ポップアップがブロックされました。ブラウザの設定でポップアップを許可してください。");
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
