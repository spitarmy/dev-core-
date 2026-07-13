"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import {
  collection, doc, addDoc, updateDoc, onSnapshot,
  query, orderBy, serverTimestamp, Timestamp
} from "firebase/firestore";

type Message = {
  role: "user" | "ai";
  text: string;
  timestamp?: any;
};

export default function BrainstormPage() {
  const { user, loading: authLoading } = useAuth();
  const [isClient, setIsClient] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const redirected = useRef(false);
  const router = useRouter();

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!authLoading && !user && !redirected.current) {
      redirected.current = true;
      router.replace("/");
    }
    if (user) {
      setUserId(user.uid);
    }
  }, [authLoading, user, router]);

  // セッションのリアルタイム監視
  useEffect(() => {
    if (!sessionId) return;
    const unsub = onSnapshot(doc(db, "brainstorms", sessionId), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setMessages(data.messages || []);
        if (data.status === "thinking") {
          setIsLoading(true);
        } else {
          setIsLoading(false);
        }
      }
    });
    return () => unsub();
  }, [sessionId]);

  // 自動スクロール
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const startNewSession = async () => {
    if (!userId) return;
    try {
      const docRef = await addDoc(collection(db, "brainstorms"), {
        userId,
        messages: [],
        status: "active",
        createdAt: serverTimestamp(),
      });
      setSessionId(docRef.id);
      setMessages([]);
    } catch (err) {
      console.error("Session creation failed:", err);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || !sessionId || isLoading) return;

    const newMessage: Message = { role: "user", text: input.trim() };
    const updatedMessages = [...messages, newMessage];

    setInput("");
    setMessages(updatedMessages); // 楽観的UI更新
    setIsLoading(true);

    try {
      await updateDoc(doc(db, "brainstorms", sessionId), {
        messages: updatedMessages,
        status: "thinking",
      });
    } catch (err) {
      console.error("Send failed:", err);
      setMessages(messages); // 元に戻す
      setIsLoading(false);
    }
  };

  const createTaskFromBrainstorm = async () => {
    if (!sessionId || messages.length === 0) return;
    setIsLoading(true);

    try {
      const conversationSummary = messages
        .map((m) => `${m.role === "user" ? "ユーザー" : "AI"}: ${m.text}`)
        .join("\n\n");

      const taskPrompt = `【壁打ちモードでの相談結果】\n以下の会話で決まった内容を実装してください。\n\n${conversationSummary}`;

      await addDoc(collection(db, "tasks"), {
        prompt: taskPrompt,
        model: "auto-multi-agent",
        imageUrl: null,
        status: "QUEUED",
        createdAt: serverTimestamp(),
        brainstormId: sessionId,
      });

      await updateDoc(doc(db, "brainstorms", sessionId), {
        status: "submitted",
      });

      router.push("/");
    } catch (err) {
      console.error("Task creation failed:", err);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isClient) return null;

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", maxWidth: "600px", margin: "0 auto", padding: "0 1rem" }}>
      {/* ヘッダー */}
      <header style={{ padding: "1rem 0", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <button className="btn btn-outline" style={{ fontSize: "0.85rem", padding: "0.4rem 0.8rem" }} onClick={() => router.push("/")}>
          ← 戻る
        </button>
        <h1 style={{ fontSize: "1.2rem", margin: 0 }}>💬 壁打ちモード</h1>
        <div style={{ width: "60px" }} />
      </header>

      {/* セッション未開始 */}
      {!sessionId ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1.5rem", textAlign: "center" }}>
          <div className="glass-card" style={{ maxWidth: "360px", width: "100%" }}>
            <p style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>🧠</p>
            <h2 style={{ fontSize: "1.3rem", marginBottom: "0.75rem" }}>AIと相談しながら要件を固める</h2>
            <p className="text-secondary" style={{ fontSize: "0.9rem", lineHeight: 1.6, marginBottom: "1.5rem" }}>
              まだ曖昧なアイデアでもOK。AIが質問してくれるので、チャットしながら要件を練り上げましょう。
            </p>
            <button className="btn btn-primary" style={{ width: "100%" }} onClick={startNewSession}>
              壁打ちを始める
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* チャットエリア */}
          <div style={{ flex: 1, overflowY: "auto", paddingBottom: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {/* 開始メッセージ */}
            {messages.length === 0 && !isLoading && (
              <div style={{ textAlign: "center", padding: "2rem 1rem" }}>
                <p className="text-secondary" style={{ fontSize: "0.9rem" }}>
                  何を作りたいか、ざっくりでOKです！
                </p>
              </div>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
                }}
              >
                <div
                  style={{
                    maxWidth: "85%",
                    padding: "0.75rem 1rem",
                    borderRadius: msg.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                    background: msg.role === "user"
                      ? "linear-gradient(135deg, var(--primary), var(--accent))"
                      : "rgba(255,255,255,0.08)",
                    color: "white",
                    fontSize: "0.9rem",
                    lineHeight: 1.6,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {msg.role === "ai" && (
                    <span style={{ fontSize: "0.7rem", opacity: 0.6, display: "block", marginBottom: "0.25rem" }}>🤖 AI</span>
                  )}
                  {msg.text}
                </div>
              </div>
            ))}

            {/* ローディング */}
            {isLoading && (
              <div style={{ display: "flex", justifyContent: "flex-start" }}>
                <div style={{ padding: "0.75rem 1rem", borderRadius: "16px 16px 16px 4px", background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)", fontSize: "0.9rem" }}>
                  🤖 考え中...
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* 入力エリア */}
          <div style={{ flexShrink: 0, paddingBottom: "env(safe-area-inset-bottom, 1rem)", paddingTop: "0.5rem", borderTop: "1px solid rgba(255,255,255,0.1)" }}>
            {/* タスク作成ボタン */}
            {messages.length >= 4 && (
              <button
                className="btn btn-primary"
                style={{ width: "100%", marginBottom: "0.5rem", background: "linear-gradient(135deg, #10b981, #059669)" }}
                onClick={createTaskFromBrainstorm}
                disabled={isLoading}
              >
                🚀 この内容でタスク作成
              </button>
            )}

            <div style={{ display: "flex", gap: "0.5rem" }}>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder="メッセージを入力..."
                disabled={isLoading}
                style={{
                  flex: 1,
                  padding: "0.75rem 1rem",
                  borderRadius: "12px",
                  border: "1px solid rgba(255,255,255,0.15)",
                  background: "rgba(255,255,255,0.05)",
                  color: "white",
                  fontSize: "0.9rem",
                  outline: "none",
                }}
              />
              <button
                className="btn btn-primary"
                style={{ padding: "0.75rem 1rem", flexShrink: 0 }}
                onClick={sendMessage}
                disabled={!input.trim() || isLoading}
              >
                送信
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
