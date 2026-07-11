"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { db, storage } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

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

  const compressImage = (file: File): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 1024;
          const MAX_HEIGHT = 1024;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);

          canvas.toBlob((blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Canvas to Blob failed'));
            }
          }, 'image/jpeg', 0.7);
        };
        img.onerror = (error) => reject(error);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;
    
    setIsSubmitting(true);
    setError(null);
    setSubmitProgress("処理を開始しています...");
    
    try {
      let imageUrl = null;
      if (image) {
        setSubmitProgress("画像を圧縮中...");
        const compressedBlob = await compressImage(image);
        
        setSubmitProgress("画像をアップロード中...");
        const storageRef = ref(storage, `tasks/${Date.now()}_image.jpg`);
        await uploadBytes(storageRef, compressedBlob);
        setSubmitProgress("画像URLを取得中...");
        imageUrl = await getDownloadURL(storageRef);
      }

      setSubmitProgress("タスクをデータベースに保存中...");
      // Firestoreの "tasks" コレクションに新しいタスクを保存
      await addDoc(collection(db, "tasks"), {
        prompt: prompt.trim(),
        model: model,
        imageUrl: imageUrl,
        status: "QUEUED", // 待機中
        createdAt: serverTimestamp(),
      });
      
      setSubmitProgress("送信完了！ホーム画面に戻ります...");
      router.push("/");
    } catch (err: any) {
      console.error("Task creation failed:", err);
      setError("タスクの送信に失敗しました。もう一度お試しください。");
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
