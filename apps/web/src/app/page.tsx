"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { collection, query, orderBy, onSnapshot, doc, updateDoc, addDoc, serverTimestamp } from "firebase/firestore";

export default function Home() {
  const [isClient, setIsClient] = useState(false);
  const [tasks, setTasks] = useState<any[]>([]);
  const [isRollingBack, setIsRollingBack] = useState(false);
  const [debugInfo, setDebugInfo] = useState<string>("読み込み中...");
  const [authUser, setAuthUser] = useState<any>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [followUpTaskId, setFollowUpTaskId] = useState<string | null>(null);
  const [followUpText, setFollowUpText] = useState("");
  const unsubFirestoreRef = useRef<(() => void) | null>(null);
  const router = useRouter();

  useEffect(() => {
    setIsClient(true);

    // F1修正: リスナーを適切にクリーンアップ
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      // 前のFirestoreリスナーをクリーンアップ
      if (unsubFirestoreRef.current) {
        unsubFirestoreRef.current();
        unsubFirestoreRef.current = null;
      }

      if (!user) {
        setDebugInfo("未ログイン。ログイン画面へ移動します...");
        router.push("/login");
        return;
      }
      setAuthUser(user);
      setDebugInfo(`ログイン済み: ${user.email} | Firestoreに接続中...`);

      try {
        const q = query(collection(db, "tasks"), orderBy("createdAt", "desc"));
        const unsubFirestore = onSnapshot(q, (snapshot) => {
          const taskData = snapshot.docs.map(d => ({
            id: d.id,
            ...d.data()
          }));
          setTasks(taskData);
          setDebugInfo(`ログイン済み: ${user.email} | タスク: ${taskData.length}件`);
        }, (error) => {
          setDebugInfo(`Firestoreエラー: ${error.code} - ${error.message}`);
          console.error("Firestore error:", error);
        });

        unsubFirestoreRef.current = unsubFirestore;
      } catch (e: any) {
        setDebugInfo(`初期化エラー: ${e.message}`);
      }
    });

    return () => {
      unsubAuth();
      if (unsubFirestoreRef.current) {
        unsubFirestoreRef.current();
        unsubFirestoreRef.current = null;
      }
    };
  }, [router]);

  if (!isClient) return null;

  const handleApprove = async (taskId: string) => {
    try {
      await updateDoc(doc(db, "tasks", taskId), { status: "APPROVED" });
    } catch (e) {
      console.error(e);
    }
  };

  const handleReject = async (taskId: string) => {
    try {
      await updateDoc(doc(db, "tasks", taskId), { status: "REJECTED" });
    } catch (e) {
      console.error(e);
    }
  };

  // F6修正: confirm() の代わりにカスタムUIを使う
  const handleRollback = async () => {
    setShowConfirm(true);
  };

  const executeRollback = async () => {
    setShowConfirm(false);
    setIsRollingBack(true);
    try {
      await addDoc(collection(db, "tasks"), {
        prompt: "【システムロールバック】直前の変更を取り消します。",
        model: "system-rollback",
        status: "QUEUED",
        createdAt: new Date(),
        summary: ""
      });
    } catch (e) {
      console.error(e);
    } finally {
      setIsRollingBack(false);
    }
  };

  const handleAnswerClarification = async (taskId: string, currentPrompt: string) => {
    const answer = window.prompt("AIからの質問に回答してください:");
    if (!answer) return;
    try {
      await updateDoc(doc(db, "tasks", taskId), { 
        status: "QUEUED",
        prompt: currentPrompt + "\n\n【追加回答】\n" + answer,
        summary: "ユーザーが回答しました。再分析中..."
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleFollowUp = async (taskId: string, originalPrompt: string, previousSummary: string) => {
    if (!followUpText.trim()) return;
    try {
      await addDoc(collection(db, "tasks"), {
        prompt: `【前回の続き】\n前回の指示: ${originalPrompt}\n\n前回AIの報告:\n${previousSummary?.substring(0, 500) || ''}\n\n【追加の指示】\n${followUpText.trim()}`,
        model: "auto-multi-agent",
        status: "QUEUED",
        createdAt: serverTimestamp(),
        previousTaskId: taskId,
        summary: ""
      });
      setFollowUpTaskId(null);
      setFollowUpText("");
    } catch (e) {
      console.error(e);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "QUEUED":
        return <span style={{ background: 'rgba(139, 92, 246, 0.2)', color: 'var(--primary)', padding: '4px 12px', borderRadius: '12px', fontSize: '0.875rem' }}>待機中</span>;
      case "ANALYZING":
        return <span style={{ background: 'rgba(245, 158, 11, 0.2)', color: 'var(--warning)', padding: '4px 12px', borderRadius: '12px', fontSize: '0.875rem' }}>計画作成中</span>;
      case "WAITING_APPROVAL":
        return <span style={{ background: 'rgba(59, 130, 246, 0.2)', color: '#3b82f6', padding: '4px 12px', borderRadius: '12px', fontSize: '0.875rem' }}>承認待ち</span>;
      case "APPROVED":
      case "IMPLEMENTING":
        return <span style={{ background: 'rgba(16, 185, 129, 0.2)', color: 'var(--success)', padding: '4px 12px', borderRadius: '12px', fontSize: '0.875rem' }}>実装中</span>;
      case "COMPLETED":
        return <span style={{ background: 'rgba(255, 255, 255, 0.1)', color: 'var(--text-secondary)', padding: '4px 12px', borderRadius: '12px', fontSize: '0.875rem' }}>完了</span>;
      case "REJECTED":
        return <span style={{ background: 'rgba(239, 68, 68, 0.2)', color: 'var(--danger)', padding: '4px 12px', borderRadius: '12px', fontSize: '0.875rem' }}>却下済</span>;
      case "FAILED":
        return <span style={{ background: 'rgba(239, 68, 68, 0.2)', color: 'var(--danger)', padding: '4px 12px', borderRadius: '12px', fontSize: '0.875rem' }}>エラー</span>;
      case "CLARIFICATION_NEEDED":
        return <span style={{ background: 'rgba(234, 179, 8, 0.2)', color: '#eab308', padding: '4px 12px', borderRadius: '12px', fontSize: '0.875rem', border: '1px solid #eab308' }}>質問があります</span>;
      default:
        return <span style={{ background: 'rgba(139, 92, 246, 0.2)', color: 'var(--primary)', padding: '4px 12px', borderRadius: '12px', fontSize: '0.875rem' }}>{status || "待機中"}</span>;
    }
  };

  return (
    <div className="container">
      {/* F6: カスタム確認ダイアログ */}
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
        <div>
          <h1 className="text-gradient animate-fade-in" style={{ lineHeight: 1.1, marginBottom: '0.5rem' }}>ZENNOBATE DEV CORE</h1>
          <p className="text-secondary animate-fade-in delay-100">自分専用のAI開発システム</p>
          <p style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)', marginTop: '0.25rem', fontFamily: 'monospace' }}>{debugInfo}</p>
        </div>
        <div className="animate-fade-in delay-200" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1rem' }}>
          <Link href="/task/new" className="btn btn-primary" style={{ textDecoration: 'none', width: '100%', textAlign: 'center' }}>
            + 新しい指示を出す
          </Link>
          <Link href="/brainstorm" className="btn btn-outline" style={{ textDecoration: 'none', width: '100%', textAlign: 'center', borderColor: 'rgba(139, 92, 246, 0.4)', color: 'var(--primary)' }}>
            💬 壁打ちモード
          </Link>
          {/* F8修正: signOut を await */}
          <button 
            className="btn btn-outline" 
            style={{ width: '100%' }}
            onClick={async () => {
              try { await auth.signOut(); } finally { window.location.href = "/login"; }
            }}
          >
            ログアウト
          </button>
        </div>
      </header>

      <main>
        <section className="glass-panel" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
          <div className="animate-fade-in delay-300" style={{ marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.2rem', marginBottom: '0.75rem' }}>タスク一覧 (依頼リスト)</h2>
            <button 
              className="btn btn-outline" 
              style={{ color: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.3)', fontSize: '0.8rem', padding: '0.4rem 0.8rem', width: '100%' }}
              onClick={handleRollback}
              disabled={isRollingBack}
            >
              {isRollingBack ? '処理中...' : '↩️ 直前の変更を取り消す'}
            </button>
          </div>
          
          {tasks.length === 0 ? (
            <p className="text-secondary" style={{ marginTop: '1rem' }}>まだ依頼はありません。「新しい指示を出す」からAIに開発を依頼してみましょう。</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
              {tasks.map((task) => (
                <div key={task.id} className="glass-card animate-fade-in delay-300">
                  <div className="flex-between">
                    <div>
                      <span style={{ color: 'var(--primary)', fontWeight: 600 }}>T-{task.id.slice(0, 4).toUpperCase()}</span>
                      {task.model && (
                        <span className="text-secondary" style={{ marginLeft: '10px', fontSize: '0.75rem' }}>
                          [{task.model.split('-')[0]}]
                        </span>
                      )}
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
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button className="btn btn-primary" style={{ padding: '0.3rem 0.8rem', fontSize: '0.8rem' }} onClick={() => handleAnswerClarification(task.id, task.prompt)}>回答する</button>
                      </div>
                    )}

                    {(task.status === 'COMPLETED' || task.status === 'FAILED') && followUpTaskId !== task.id && (
                      <button 
                        className="btn btn-outline" 
                        style={{ padding: '0.3rem 0.8rem', fontSize: '0.8rem', borderColor: 'rgba(139, 92, 246, 0.4)', color: 'var(--primary)' }}
                        onClick={() => setFollowUpTaskId(task.id)}
                      >
                        → 続きを指示
                      </button>
                    )}
                  </div>

                  {followUpTaskId === task.id && (
                    <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <textarea
                        className="input-glass"
                        style={{ minHeight: '80px', resize: 'vertical', fontSize: '0.9rem' }}
                        placeholder="続きの指示を入力...（例: 残りのUIも実装して、デザインは角丸で）"
                        value={followUpText}
                        onChange={(e) => setFollowUpText(e.target.value)}
                        autoFocus
                      />
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button className="btn btn-outline" style={{ flex: 1, fontSize: '0.8rem' }} onClick={() => { setFollowUpTaskId(null); setFollowUpText(""); }}>キャンセル</button>
                        <button 
                          className="btn btn-primary" 
                          style={{ flex: 1, fontSize: '0.8rem' }} 
                          onClick={() => handleFollowUp(task.id, task.prompt, task.summary)}
                          disabled={!followUpText.trim()}
                        >
                          🚀 送信
                        </button>
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
