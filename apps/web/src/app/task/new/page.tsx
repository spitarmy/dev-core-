"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

export default function NewTaskPage() {
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("auto-multi-agent");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;
    
    setIsSubmitting(true);
    setError(null);
    
    try {
      // Firestoreの "tasks" コレクションに新しいタスクを保存
      await addDoc(collection(db, "tasks"), {
        prompt: prompt.trim(),
        model: model,
        status: "QUEUED", // 待機中
        createdAt: serverTimestamp(),
      });
      
      router.push("/");
    } catch (err: any) {
      console.error("Task creation failed:", err);
      setError("タスクの送信に失敗しました。もう一度お試しください。");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container" style={{ maxWidth: '800px', padding: '2rem 1.5rem' }}>
      <header className="flex-between" style={{ marginBottom: '2rem' }}>
        <button 
          className="btn btn-outline" 
          onClick={() => router.push("/")}
          style={{ padding: '0.5rem 1rem' }}
        >
          ← 戻る
        </button>
        <h2>新しい指示を出す</h2>
        <div style={{ width: '80px' }}></div> {/* Spacer */}
      </header>

      <main>
        <div className="glass-panel" style={{ padding: '2rem' }}>
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '1.5rem' }}>
              <label 
                htmlFor="prompt" 
                style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}
              >
                AIにどんな開発や修正を依頼しますか？
              </label>
              <textarea
                id="prompt"
                className="input-glass"
                style={{ 
                  minHeight: '150px', 
                  resize: 'vertical',
                  fontSize: '1.1rem',
                  lineHeight: '1.5'
                }}
                placeholder="例: 新しいプロジェクト作成機能を追加して。ボタンの色は青でお願いします。"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                autoFocus
              />
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label 
                htmlFor="model" 
                style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}
              >
                担当AI（モデル）の選択
              </label>
              <select
                id="model"
                className="input-glass"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                style={{ cursor: 'pointer' }}
              >
                <option value="auto-multi-agent" style={{ fontWeight: 'bold' }}>✨ Auto (AI同士で分担・コスト最適化)</option>
                <option value="gemini-3.5-ultra">Google Gemini 3.5 Ultra (総合的で高度なタスク)</option>
                <option value="claude-fable-5">Claude Fable 5 (超高速・高品質コーディング)</option>
                <option value="gpt-5.6-sol">GPT-5.6 Sol (複雑な設計と自律エージェント)</option>
              </select>
            </div>
            
            {error && (
              <p style={{ color: 'var(--danger)', marginBottom: '1rem', fontSize: '0.875rem' }}>
                {error}
              </p>
            )}

            <div className="flex-between">
              <span className="text-muted" style={{ fontSize: '0.875rem' }}>
                <kbd style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '4px' }}>Cmd + Enter</kbd> でも送信できます
              </span>
              <button 
                type="submit" 
                className="btn btn-primary"
                disabled={!prompt.trim() || isSubmitting}
              >
                {isSubmitting ? "送信中..." : "指示を送信"}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
