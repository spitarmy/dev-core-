"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

export default function MemoryPage() {
  const router = useRouter();
  const [memory, setMemory] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    const fetchMemory = async () => {
      try {
        const memDoc = await getDoc(doc(db, "projectInfo", "memory"));
        if (memDoc.exists()) {
          setMemory(memDoc.data().content || "");
        }
      } catch (err) {
        console.error("Failed to fetch memory:", err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchMemory();
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      await setDoc(doc(db, "projectInfo", "memory"), {
        content: memory,
        updatedAt: serverTimestamp()
      }, { merge: true });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error("Failed to save memory:", err);
      alert("保存に失敗しました。");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex-center" style={{ minHeight: '100vh' }}>
        <p className="text-gradient">読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="container">
      <header style={{ padding: '2rem 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="text-gradient" style={{ lineHeight: 1.1, marginBottom: '0.5rem' }}>プロジェクト記憶の管理</h1>
          <p className="text-secondary">AIワーカーが遵守する絶対ルールやアーキテクチャ方針</p>
        </div>
        <Link href="/" className="btn btn-outline" style={{ textDecoration: 'none' }}>
          ← 戻る
        </Link>
      </header>

      <main>
        <section className="glass-panel" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
          <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: '1.2rem' }}>システムプロンプト (Context)</h2>
            <button 
              className="btn btn-primary" 
              onClick={handleSave} 
              disabled={isSaving}
              style={{ padding: '0.5rem 1.5rem' }}
            >
              {isSaving ? '保存中...' : (saveSuccess ? '✅ 保存完了' : '💾 保存する')}
            </button>
          </div>
          
          <p className="text-secondary" style={{ fontSize: '0.9rem', marginBottom: '1rem' }}>
            ここに書かれた内容は、AIがコードを書く際に必ず読み込まれます。<br/>
            例：「Tailwindを使わずに素のCSSで書く」「画面の背景色は黒系にする」「常に日本語でコメントを書く」など。
          </p>

          <textarea 
            className="input-glass"
            style={{ 
              width: '100%', 
              minHeight: '400px', 
              resize: 'vertical', 
              fontFamily: 'monospace',
              fontSize: '0.95rem',
              lineHeight: 1.5,
              padding: '1rem'
            }}
            value={memory}
            onChange={(e) => setMemory(e.target.value)}
            placeholder="プロジェクトのルールを入力してください..."
          />
        </section>
      </main>
    </div>
  );
}
