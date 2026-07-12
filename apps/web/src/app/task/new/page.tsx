"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

export default function NewTaskPage() {
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("auto-multi-agent");
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitProgress, setSubmitProgress] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // F3修正: 認証ガード
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) router.push("/login");
    });
    return () => unsub();
  }, [router]);

  const startListening = () => {
    if (typeof window === 'undefined') return;
    
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("お使いのブラウザは音声入力に対応していません。（SafariやChromeをご利用ください）");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'ja-JP';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setPrompt((prev) => prev + (prev ? "\n" : "") + transcript);
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error", event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
  };

  const readFileAsDataURL = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("ファイルの読み込みに失敗しました"));
      reader.readAsDataURL(file);
    });
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImage(file);
      try {
        const dataUrl = await readFileAsDataURL(file);
        setImagePreview(dataUrl);
      } catch (err) {
        console.error("Image preview failed:", err);
        setImage(null);
        setImagePreview(null);
        alert("画像の読み込みに失敗しました。別の画像を試してください。");
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;
    
    setIsSubmitting(true);
    setError(null);
    setSubmitProgress("処理を開始しています...");
    
    try {
      // 画像がある場合はプレビュー用のdata URLをそのまま使う
      let imageDataUrl: string | null = imagePreview;

      if (imageDataUrl && imageDataUrl.length > 800000) {
        // 800KB超えの場合はスキップ（Firestoreの1MBドキュメント制限）
        setSubmitProgress("画像が大きすぎるため、テキストのみで送信します...");
        imageDataUrl = null;
      }

      if (imageDataUrl) {
        setSubmitProgress("画像付きで送信中...");
      }

      setSubmitProgress("タスクをデータベースに保存中...");
      // Firestoreの "tasks" コレクションに新しいタスクを保存
      // 画像はbase64としてFirestoreに直接保存（Firebase Storageを使わない）
      await addDoc(collection(db, "tasks"), {
        prompt: prompt.trim(),
        model: model,
        imageUrl: imageDataUrl, // base64 data URL or null
        status: "QUEUED", // 待機中
        createdAt: serverTimestamp(),
      });
      
      setSubmitProgress("送信完了！ホーム画面に戻ります...");
      router.push("/");
    } catch (err: any) {
      console.error("Task creation failed:", err);
      setError("タスクの送信に失敗しました: " + (err.message || "不明なエラー"));
      setIsSubmitting(false);
      setSubmitProgress(null);
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <label 
                  htmlFor="prompt" 
                  style={{ color: 'var(--text-secondary)' }}
                >
                  AIにどんな開発や修正を依頼しますか？
                </label>
                <button
                  type="button"
                  onClick={startListening}
                  className={`btn ${isListening ? 'btn-danger' : 'btn-outline'}`}
                  style={{ padding: '0.25rem 0.75rem', fontSize: '0.9rem', borderRadius: '20px' }}
                >
                  {isListening ? '🔴 録音中...' : '🎤 音声で入力'}
                </button>
              </div>
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
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                    e.preventDefault();
                    handleSubmit(e as any);
                  }
                }}
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
                <option value="claude-fable-5">Claude Fable 5 (超高速・高品質コーディング)</option>
                <option value="claude-sonnet-5">Claude Sonnet 5 (最新・バランス型)</option>
                <option value="gpt-4.1">GPT-4.1 (OpenAI最新・高精度)</option>
                <option value="gemini-2.0-flash">Gemini 2.0 Flash (高速・無料枠あり)</option>
              </select>
            </div>

            {/* Image Upload UI */}
            <div style={{ marginBottom: '2rem' }}>
              <label 
                htmlFor="image" 
                style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}
              >
                参考画像（手書きのメモやスクリーンショット）
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <label 
                  htmlFor="image" 
                  className="btn btn-outline"
                  style={{ cursor: 'pointer', padding: '0.5rem 1rem' }}
                >
                  📷 画像を選択
                </label>
                <input
                  type="file"
                  id="image"
                  accept="image/*"
                  onChange={handleImageChange}
                  style={{ display: 'none' }}
                />
                {image && <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{image.name}</span>}
              </div>
              {imagePreview && (
                <div style={{ marginTop: '1rem', position: 'relative', display: 'inline-block' }}>
                  <img 
                    src={imagePreview} 
                    alt="Preview" 
                    style={{ maxWidth: '100%', maxHeight: '200px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }} 
                  />
                  <button 
                    type="button"
                    onClick={() => { setImage(null); setImagePreview(null); }}
                    style={{
                      position: 'absolute', top: '-10px', right: '-10px',
                      background: 'var(--danger)', color: 'white', border: 'none',
                      borderRadius: '50%', width: '24px', height: '24px', cursor: 'pointer'
                    }}
                  >
                    ×
                  </button>
                </div>
              )}
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                {submitProgress && (
                  <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', fontStyle: 'italic', opacity: 0.8 }}>
                    {submitProgress}
                  </span>
                )}
                <button 
                  type="submit" 
                  className="btn btn-primary"
                  disabled={!prompt.trim() || isSubmitting}
                >
                  {isSubmitting ? "送信中..." : "指示を送信"}
                </button>
              </div>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
