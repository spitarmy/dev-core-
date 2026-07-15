"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { signInWithPopup, signInWithRedirect, GoogleAuthProvider } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { collection, query, orderBy, onSnapshot, doc, updateDoc, addDoc, serverTimestamp } from "firebase/firestore";

function TerminalLog({ logs }: { logs: string[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div style={{ background: '#0f172a', padding: '1rem', borderRadius: '8px', marginBottom: '1rem', fontFamily: 'monospace', fontSize: '0.85rem', color: '#10b981', maxHeight: '250px', overflowY: 'auto', border: '1px solid rgba(16, 185, 129, 0.3)', boxShadow: 'inset 0 0 10px rgba(0,0,0,0.5)' }}>
      {logs.map((log, i) => (
        <div key={i} style={{ marginBottom: '0.25rem' }}>$ {log}</div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}

export default function Home() {
  const { user, loading: authLoading } = useAuth();
  const [tasks, setTasks] = useState<any[]>([]);
  const [isRollingBack, setIsRollingBack] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [followUpTaskId, setFollowUpTaskId] = useState<string | null>(null);
  const [followUpText, setFollowUpText] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  // Firestoreリスナー
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "tasks"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snapshot) => {
      setTasks(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => console.error("Firestore error:", error));
    return () => unsub();
  }, [user]);

  // ===== ログイン処理 =====
  const handleGoogleLogin = async () => {
    setLoggingIn(true);
    setLoginError(null);
    try {
      const provider = new GoogleAuthProvider();
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      if (isMobile) {
        await signInWithRedirect(auth, provider);
      } else {
        await signInWithPopup(auth, provider);
      }
    } catch (err: any) {
      setLoggingIn(false);
      if (err.code === "auth/popup-blocked") {
        try { await signInWithRedirect(auth, new GoogleAuthProvider()); }
        catch { setLoginError("ログインに失敗しました。"); }
      } else if (err.code === "auth/popup-closed-by-user") {
        setLoginError("ログインがキャンセルされました。");
      } else {
        setLoginError(err.message || "ログインに失敗しました");
      }
    }
  };

  // ===== ローディング画面 =====
  if (authLoading || loggingIn) {
    return (
      <div className="flex-center" style={{ minHeight: '100vh' }}>
        <div className="glass-card" style={{ textAlign: 'center', padding: '2rem' }}>
          <h1 className="text-gradient" style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>ZENNOBATE</h1>
          <p className="text-secondary">{loggingIn ? 'ログイン中...' : '読み込み中...'}</p>
        </div>
      </div>
    );
  }

  // ===== 未ログイン → ログインボタン（リダイレクトなし！） =====
  if (!user) {
    return (
      <div className="flex-center" style={{ minHeight: '100vh' }}>
        <div className="glass-card" style={{ width: '100%', maxWidth: '400px', textAlign: 'center' }}>
          <h1 className="text-gradient" style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>ZENNOBATE</h1>
          <p className="text-secondary" style={{ marginBottom: '2rem' }}>Googleでログインして開始</p>
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleGoogleLogin}>
            Googleアカウントでログイン
          </button>
          {loginError && (
            <p style={{ color: 'var(--danger)', marginTop: '1rem', fontSize: '0.875rem' }}>{loginError}</p>
          )}
        </div>
      </div>
    );
  }

  // ===== ダッシュボード（ログイン済み） =====
  const handleApprove = async (taskId: string) => {
    try { await updateDoc(doc(db, "tasks", taskId), { status: "APPROVED" }); } catch (e) { console.error(e); }
  };
  const handleReject = async (taskId: string) => {
    try { await updateDoc(doc(db, "tasks", taskId), { status: "REJECTED" }); } catch (e) { console.error(e); }
  };
  const handleRollback = () => setShowConfirm(true);
  const executeRollback = async () => {
    setShowConfirm(false); setIsRollingBack(true);
    try {
      await addDoc(collection(db, "tasks"), {
        prompt: "【システムロールバック】直前の変更を取り消します。", model: "system-rollback",
        status: "QUEUED", createdAt: serverTimestamp(), summary: ""
      });
    } catch (e) { console.error(e); } finally { setIsRollingBack(false); }
  };
  const handleAnswerClarification = async (taskId: string, currentPrompt: string) => {
    const answer = window.prompt("AIからの質問に回答してください:");
    if (!answer) return;
    try {
      await updateDoc(doc(db, "tasks", taskId), {
        status: "QUEUED", prompt: currentPrompt + "\n\n【追加回答】\n" + answer,
        summary: "ユーザーが回答しました。再分析中..."
      });
    } catch (e) { console.error(e); }
  };
  const handleFollowUp = async (taskId: string, originalPrompt: string, previousSummary: string) => {
    if (!followUpText.trim()) return;
    try {
      await addDoc(collection(db, "tasks"), {
        prompt: `【前回の続き】\n前回の指示: ${originalPrompt}\n\n前回AIの報告:\n${previousSummary?.substring(0, 500) || ''}\n\n【追加の指示】\n${followUpText.trim()}`,
        model: "auto-multi-agent", status: "QUEUED", createdAt: serverTimestamp(),
        previousTaskId: taskId, summary: ""
      });
      setFollowUpTaskId(null); setFollowUpText("");
    } catch (e) { console.error(e); }
  };
  const getStatusBadge = (status: string) => {
    const map: Record<string, [string, string, string]> = {
      QUEUED: ['rgba(139,92,246,0.2)', 'var(--primary)', '待機中'],
      ANALYZING: ['rgba(245,158,11,0.2)', 'var(--warning)', '計画作成中'],
      WAITING_APPROVAL: ['rgba(59,130,246,0.2)', '#3b82f6', '承認待ち'],
      APPROVED: ['rgba(16,185,129,0.2)', 'var(--success)', '実装中'],
      IMPLEMENTING: ['rgba(16,185,129,0.2)', 'var(--success)', '実装中'],
      COMPLETED: ['rgba(255,255,255,0.1)', 'var(--text-secondary)', '完了'],
      REJECTED: ['rgba(239,68,68,0.2)', 'var(--danger)', '却下済'],
      FAILED: ['rgba(239,68,68,0.2)', 'var(--danger)', 'エラー'],
      CLARIFICATION_NEEDED: ['rgba(234,179,8,0.2)', '#eab308', '質問があります'],
    };
    const [bg, color, label] = map[status] || ['rgba(139,92,246,0.2)', 'var(--primary)', status || '待機中'];
    return <span style={{ background: bg, color, padding: '4px 12px', borderRadius: '12px', fontSize: '0.875rem',
      ...(status === 'CLARIFICATION_NEEDED' ? { border: '1px solid #eab308' } : {}) }}>{label}</span>;
  };

  return (
    <div className="container">
      {showConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999, padding: '1rem' }}>
          <div className="glass-card" style={{ maxWidth: '360px', width: '100%', textAlign: 'center' }}>
            <p style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>⚠️ 直前のAIの変更を取り消して元に戻しますか？</p>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setShowConfirm(false)}>キャンセル</button>
              <button className="btn btn-primary" style={{ flex: 1, background: 'var(--danger)' }} onClick={executeRollback}>取り消す</button>
            </div>
          </div>
        </div>
      )}

      <header style={{ padding: '2rem 0', textAlign: 'center' }}>
        <h1 className="text-gradient" style={{ lineHeight: 1.1, marginBottom: '0.5rem' }}>ZENNOBATE DEV CORE</h1>
        <p className="text-secondary">自分専用のAI開発システム</p>
        <p style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)', marginTop: '0.25rem', fontFamily: 'monospace' }}>
          {user.email} | タスク: {tasks.length}件
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1rem' }}>
          <Link href="/task/new" className="btn btn-primary" style={{ textDecoration: 'none', width: '100%', textAlign: 'center' }}>
            + 新しい指示を出す
          </Link>
          <Link href="/brainstorm" className="btn btn-outline" style={{ textDecoration: 'none', width: '100%', textAlign: 'center', borderColor: 'rgba(139,92,246,0.4)', color: 'var(--primary)' }}>
            💬 壁打ちモード
          </Link>
          <button className="btn btn-outline" style={{ width: '100%', fontSize: '0.85rem', opacity: 0.6 }}
            onClick={() => auth.signOut()}
          >ログアウト</button>
        </div>
      </header>

      <main>
        <section className="glass-panel" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
          <div style={{ marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.2rem', marginBottom: '0.75rem' }}>タスク一覧 (依頼リスト)</h2>
            <button className="btn btn-outline"
              style={{ color: 'var(--danger)', borderColor: 'rgba(239,68,68,0.3)', fontSize: '0.8rem', padding: '0.4rem 0.8rem', width: '100%' }}
              onClick={handleRollback} disabled={isRollingBack}
            >{isRollingBack ? '処理中...' : '↩️ 直前の変更を取り消す'}</button>
          </div>

          {tasks.length === 0 ? (
            <p className="text-secondary" style={{ marginTop: '1rem' }}>まだ依頼はありません。「新しい指示を出す」からAIに開発を依頼してみましょう。</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
              {tasks.map((task) => (
                <div key={task.id} className="glass-card">
                  <div className="flex-between">
                    <div>
                      <span style={{ color: 'var(--primary)', fontWeight: 600 }}>T-{task.id.slice(0, 4).toUpperCase()}</span>
                      {task.model && <span className="text-secondary" style={{ marginLeft: '10px', fontSize: '0.75rem' }}>[{task.model.split('-')[0]}]</span>}
                    </div>
                    {getStatusBadge(task.status)}
                  </div>
                  <h3 style={{ margin: '1rem 0 0.5rem' }}>{task.prompt ? (task.prompt.length > 50 ? task.prompt.substring(0, 50) + '...' : task.prompt) : '無題のタスク'}</h3>

                  {task.summary && (
                    <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.9rem' }}>
                      <strong>AIからの報告:</strong>
                      <p style={{ marginTop: '0.5rem', whiteSpace: 'pre-wrap' }}>{task.summary}</p>
                    </div>
                  )}

                  {(task.status === 'ANALYZING' || task.status === 'IMPLEMENTING') && task.liveLogs && task.liveLogs.length > 0 && (
                    <TerminalLog logs={task.liveLogs} />
                  )}

                  <div className="flex-between">
                    <span className="text-secondary" style={{ fontSize: '0.875rem' }}>
                      {new Date(task.createdAt?.toDate ? task.createdAt.toDate() : Date.now()).toLocaleString('ja-JP')}
                    </span>
                    {task.status === 'WAITING_APPROVAL' && (
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button className="btn btn-outline" style={{ padding: '0.3rem 0.8rem', fontSize: '0.8rem' }} onClick={() => handleReject(task.id)}>却下</button>
                        <button className="btn btn-primary" style={{ padding: '0.3rem 0.8rem', fontSize: '0.8rem' }} onClick={() => handleApprove(task.id)}>計画を承認</button>
                      </div>
                    )}
                    {task.status === 'CLARIFICATION_NEEDED' && (
                      <button className="btn btn-primary" style={{ padding: '0.3rem 0.8rem', fontSize: '0.8rem' }} onClick={() => handleAnswerClarification(task.id, task.prompt)}>回答する</button>
                    )}
                    {(task.status === 'COMPLETED' || task.status === 'FAILED') && followUpTaskId !== task.id && (
                      <button className="btn btn-outline"
                        style={{ padding: '0.3rem 0.8rem', fontSize: '0.8rem', borderColor: 'rgba(139,92,246,0.4)', color: 'var(--primary)' }}
                        onClick={() => setFollowUpTaskId(task.id)}
                      >→ 続きを指示</button>
                    )}
                  </div>

                  {followUpTaskId === task.id && (
                    <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <textarea className="input-glass" style={{ minHeight: '80px', resize: 'vertical', fontSize: '0.9rem' }}
                        placeholder="続きの指示を入力..." value={followUpText} onChange={(e) => setFollowUpText(e.target.value)} autoFocus />
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button className="btn btn-outline" style={{ flex: 1, fontSize: '0.8rem' }} onClick={() => { setFollowUpTaskId(null); setFollowUpText(""); }}>キャンセル</button>
                        <button className="btn btn-primary" style={{ flex: 1, fontSize: '0.8rem' }}
                          onClick={() => handleFollowUp(task.id, task.prompt, task.summary)} disabled={!followUpText.trim()}
                        >🚀 送信</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="glass-panel" style={{ padding: '2rem' }}>
          <h2>システムの状態</h2>
          <div className="grid-cols-3" style={{ marginTop: '1.5rem' }}>
            <div className="glass-card">
              <p className="text-secondary">開発用PCとの接続</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--success)', boxShadow: '0 0 10px var(--success)' }}></div>
                <strong>接続済み (Online)</strong>
              </div>
            </div>
            <div className="glass-card">
              <p className="text-secondary">今月のAI利用料金</p>
              <h3 style={{ marginTop: '0.5rem' }}>$0.00</h3>
            </div>
            <div className="glass-card">
              <p className="text-secondary">完了したタスク</p>
              <h3 style={{ marginTop: '0.5rem' }}>{tasks.filter(t => t.status === 'COMPLETED').length} 件</h3>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
