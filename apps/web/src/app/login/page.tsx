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
      await signInWithPopup(auth, provider);
      router.push("/");
    } catch (err: any) {
      console.error("Login failed:", err);
      setError(err.message || "Failed to login");
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
          <p style={{ color: 'var(--danger)', marginTop: '1rem', fontSize: '0.875rem' }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
