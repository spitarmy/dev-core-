"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { collection, query, orderBy, onSnapshot, doc, updateDoc } from "firebase/firestore";

export default function Home() {
  const [isClient, setIsClient] = useState(false);
  const [tasks, setTasks] = useState<any[]>([]);
  const router = useRouter();

  useEffect(() => {
    setIsClient(true);
    
    // Firestoreからリアルタイムでタスク一覧を取得
    const q = query(collection(db, "tasks"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const taskData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setTasks(taskData);
    });

    return () => unsubscribe();
  }, []);

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

  // ステータスに応じた色や日本語表示の変換
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
      default:
        return <span style={{ background: 'rgba(139, 92, 246, 0.2)', color: 'var(--primary)', padding: '4px 12px', borderRadius: '12px', fontSize: '0.875rem' }}>{status || "待機中"}</span>;
    }
  };

  return (
    <div className="container">
      <header className="header-layout" style={{ padding: '2rem 0' }}>
        <div>
          <h1 className="text-gradient animate-fade-in" style={{ lineHeight: 1.1, marginBottom: '0.5rem' }}>ZENNOBATE DEV CORE</h1>
          <p className="text-secondary animate-fade-in delay-100">自分専用のAI開発システム</p>
        </div>
        <div className="btn-group animate-fade-in delay-200">
          <button 
            className="btn btn-outline" 
            onClick={() => {
              auth.signOut();
              router.push("/login");
            }}
          >
            ログアウト
          </button>
          <Link href="/task/new" className="btn btn-primary" style={{ textDecoration: 'none' }}>
            + 新しい指示を出す
          </Link>
        </div>
      </header>

      <main>
        <section className="glass-panel" style={{ padding: '2rem', marginBottom: '2rem' }}>
          <h2 className="animate-fade-in delay-300">タスク一覧 (依頼リスト)</h2>
          
          {tasks.length === 0 ? (
            <p className="text-secondary" style={{ marginTop: '1rem' }}>まだ依頼はありません。「新しい指示を出す」からAIに開発を依頼してみましょう。</p>
          ) : (
            <div className="grid-cols-2" style={{ marginTop: '1.5rem' }}>
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
                        <button 
                          className="btn btn-outline" 
                          style={{ padding: '0.3rem 0.8rem', fontSize: '0.8rem' }}
                          onClick={() => handleReject(task.id)}
                        >
                          却下
                        </button>
                        <button 
                          className="btn btn-primary" 
                          style={{ padding: '0.3rem 0.8rem', fontSize: '0.8rem' }}
                          onClick={() => handleApprove(task.id)}
                        >
                          計画を承認
                        </button>
                      </div>
                    )}
                  </div>
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
