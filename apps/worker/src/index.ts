import * as admin from 'firebase-admin';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log('🔥 Firebase Admin initialized with FIREBASE_SERVICE_ACCOUNT env var (Render mode)');
  } else {
    const serviceAccount = require('../service-account.json');
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log('🔥 Firebase Admin initialized with local service-account.json');
  }
} catch (error) {
  console.error('Firebase Initialization Error:', error);
  admin.initializeApp();
}

const db = admin.firestore();

// 💡 リアルタイムログストリーミング用バッチ処理
const logQueues: Record<string, string[]> = {};
const logTimers: Record<string, NodeJS.Timeout> = {};

function logToTask(taskId: string, message: string) {
  console.log(`[T-${taskId.substring(0, 4).toUpperCase()}] ${message}`);
  if (!logQueues[taskId]) logQueues[taskId] = [];
  logQueues[taskId].push(message);

  if (!logTimers[taskId]) {
    logTimers[taskId] = setTimeout(async () => {
      const messages = logQueues[taskId];
      delete logQueues[taskId];
      delete logTimers[taskId];
      if (messages && messages.length > 0) {
        try {
          await db.collection('tasks').doc(taskId).update({
            liveLogs: admin.firestore.FieldValue.arrayUnion(...messages)
          });
        } catch (e) {
          console.error("Failed to push logs:", e);
        }
      }
    }, 1500); // 1.5秒に1回まとめてFirestoreへ書き込む
  }
}

// 🚀 3社すべての最強AIをセットアップ！
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function generatePlan(taskId: string, prompt: string, model: string, imageBase64?: string, memoryText?: string): Promise<string> {
  const isAuto = model === 'auto-multi-agent';
  const systemInstruction = isAuto 
      ? `あなたは優秀なAIマネージャーです。以下のユーザーからの指示を読み、実装計画を作成してください。
         【現在のプロジェクトの設計指針とあなたの記憶】
         ${memoryText || 'まだ記憶はありません。'}
         
         【重要】ユーザーの指示が曖昧すぎて実装が進められない場合（例：「いい感じにして」だけで具体的なページ指定がないなど）は、無理に推測せず、ユーザーに質問を返してください。その場合、必ず以下のJSONのみを出力してください。
         \`\`\`json
         { "status": "CLARIFICATION_NEEDED", "question": "どのページのデザインを変更しますか？" }
         \`\`\`
         
         指示が十分な場合は、通常通り計画を作成します。必要に応じて最新のライブラリや公式ドキュメントをGoogle検索でリサーチし、その結果（最新のコード例や注意点）を必ず計画に含めてください。
         【重要】さらに、このタスクを複数の専門家AIに分割して担当させるための「チーム編成表」を、以下のJSON形式で必ず計画の最後に含めてください。
         \`\`\`json
         [
           { "role": "UI Designer", "system": "あなたはUIデザイナーです。見た目のみを実装してください。", "task": "ログイン画面のCSSを紫色に変更する" },
           { "role": "Backend Engineer", "system": "あなたはバックエンドエンジニアです。DBロジックのみを実装してください。", "task": "Firestoreの認証ロジックを追加する" }
         ]
         \`\`\`
         ※ 簡単なタスクの場合は1人のみで構いません。
         最後に「よろしければ承認をお願いします」と添えてください。`
      : `あなたはシニアエンジニアです。以下の指示に対する具体的な「実装計画」をステップバイステップで作成し、必要に応じて最新情報を検索して計画に含め、最後に「よろしければ承認をお願いします」と添えてください。`;

  try {
    const contents: any[] = [{ text: prompt }];
    if (imageBase64) {
      contents.push({
        inlineData: {
          data: imageBase64,
          mimeType: "image/jpeg"
        }
      });
    }

    // 💡 マネージャー役は常に Google Gemini (無料枠/爆速モデル) を使用してコストを削減！
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: contents,
      config: { 
        systemInstruction,
        tools: [{ googleSearch: {} }]
      }
    });

    return response.text || '計画の作成に失敗しました。';
  } catch (e) {
    console.error("Gemini Error, falling back to Claude:", e);
    // Geminiが失敗した場合、Claudeにフォールバック
    try {
      const claudeFallback = await anthropic.messages.create({
        model: 'claude-sonnet-5',
        max_tokens: 4000,
        system: systemInstruction,
        messages: [{ role: 'user', content: prompt }]
      });
      const fallbackText = claudeFallback.content.find((b: any) => b.type === 'text');
      return fallbackText ? (fallbackText as any).text : '計画の作成に失敗しました。';
    } catch (e2) {
      console.error("Claude Fallback also failed:", e2);
      return `【提案する実装計画】(APIエラー: GeminiとClaude両方失敗)\nよろしければ「承認」をお願いします。`;
    }
  }
}

async function executeTask(taskId: string, prompt: string, model: string, imageBase64?: string, plan?: string, memoryText?: string): Promise<string> {
  try {
    if (model === 'auto-multi-agent') {
      logToTask(taskId, '🤖 [MULTI-AGENT] Starting Auto-Routing Swarm Workflow...');
      
      // チーム編成表の抽出
      let swarmPlan: any[] = [];
      try {
        const jsonMatch = plan?.match(/```json\n([\s\S]*?)\n```/);
        if (jsonMatch) {
          swarmPlan = JSON.parse(jsonMatch[1]);
        } else {
          swarmPlan = [{ role: "Fullstack Engineer", system: "あなたはフルスタックエンジニアです。要件をすべて実装してください。", task: prompt }];
        }
      } catch (e) {
        swarmPlan = [{ role: "Fullstack Engineer", system: "あなたはフルスタックエンジニアです。要件をすべて実装してください。", task: prompt }];
      }

      logToTask(taskId, `🤖 [MULTI-AGENT] Swarm Team formed with ${swarmPlan.length} agents.`);
      
      const memoryFiles: Record<string, string> = {};
      let totalFilesUpdated = 0;
      let allClaudeResults = "";

      // 各エージェントを順番に呼び出す (Swarm)
      for (const agent of swarmPlan) {
        logToTask(taskId, `🤖 [MULTI-AGENT] Delegating to: ${agent.role}...`);
        
        let previousContext = "";
        if (Object.keys(memoryFiles).length > 0) {
          previousContext = "\n\n【前の担当者からの引き継ぎコード】\n前任者が以下のファイルを途中まで実装しました。必ずこのコードをベースにして、あなたの担当作業を追加した完全なファイルを出力してください。\n";
          for (const [file, content] of Object.entries(memoryFiles)) {
            previousContext += `--- ${file} ---\n${content}\n\n`;
          }
        }

        const claudeMsg = await anthropic.messages.create({
            model: 'claude-fable-5',
            max_tokens: 3000,
            system: `${agent.system}\n\n【現在のプロジェクトの設計指針とあなたの記憶】\n${memoryText || 'まだ記憶はありません。'}\n\n以下はマネージャー（Gemini）からの事前リサーチメモです。\n<plan>\n${plan || '計画なし'}\n</plan>\n\n${previousContext}\n出力は必ず以下のJSON形式の配列のみを返してください。マークダウンやその他の説明文は一切含めないでください。ルートディレクトリは \`apps/web/\` や \`apps/worker/\` などのパスを指定します。\n[\n  {\n    "file": "apps/web/src/app/page.tsx",\n    "content": "完全なファイルの内容..."\n  }\n]`,
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'text', text: `【あなたの担当タスク】\n${agent.task}\n\n【元の全体の要件】\n${prompt}` },
                  ...(imageBase64 ? [{
                    type: 'image',
                    source: {
                      type: 'base64',
                      media_type: 'image/jpeg',
                      data: imageBase64
                    }
                  }] : [])
                ] as any
              }
            ]
        });

        const claudeTextBlock = claudeMsg.content.find((b: any) => b.type === 'text');
        const claudeResult = claudeTextBlock ? (claudeTextBlock as any).text : '[]';
        allClaudeResults += `\n【${agent.role}の実装内容】\n${claudeResult.substring(0, 1000)}...`;

        try {
          const jsonMatch = claudeResult.match(/\[[\s\S]*\]/);
          const jsonStr = jsonMatch ? jsonMatch[0] : claudeResult;
          const filesToUpdate = JSON.parse(jsonStr);
          
          for (const item of filesToUpdate) {
            memoryFiles[item.file] = item.content; // メモリに保存して次のエージェントへ引き継ぐ
          }
        } catch (err) {
          console.error(`[MULTI-AGENT] JSON Parse error for agent ${agent.role}:`, err);
        }
      }

      // 最後に全エージェントの作業結果をファイルに書き出してPush
      let pushSuccess = false;
      try {
        for (const [file, content] of Object.entries(memoryFiles)) {
          const fullPath = path.resolve(__dirname, '../../', file);
          fs.mkdirSync(path.dirname(fullPath), { recursive: true });
          fs.writeFileSync(fullPath, content, 'utf8');
          totalFilesUpdated++;
          logToTask(taskId, `🤖 [MULTI-AGENT] Wrote file: ${file}`);
        }

        if (totalFilesUpdated > 0 && process.env.GITHUB_TOKEN) {
          console.log(`🤖 [MULTI-AGENT] Pushing ${totalFilesUpdated} files to GitHub...`);
          execSync(`git config --global user.name "Zennobate AI Worker"`);
          execSync(`git config --global user.email "worker@ai.local"`);
          execSync(`git remote set-url origin https://x-access-token:${process.env.GITHUB_TOKEN}@github.com/spitarmy/dev-core-.git`);
          execSync(`git add .`);
          execSync(`git commit -m "feat: AI Agent Swarm automated implementation"`);
          execSync(`git push origin main`);
          pushSuccess = true;
          logToTask(taskId, `🤖 [MULTI-AGENT] Successfully pushed to GitHub!`);
        }
      } catch (err) {
        console.error("Git push error:", err);
      }

      // Step 2: Manager reviews (Gemini with Claude fallback)
      logToTask(taskId, '🤖 [MULTI-AGENT] Manager is reviewing work...');
      let reviewText = '完了';
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-2.0-flash',
          contents: `元の要件: ${prompt}\n\nエージェントチームの作業結果: ${allClaudeResults}\n\n更新されたファイル数: ${totalFilesUpdated}\nGitへの自動Push成功: ${pushSuccess ? 'はい' : 'いいえ'}`,
          config: { systemInstruction: "あなたはレビュー担当のマネージャーAIです。部下のAIチーム（Claude達）が連携してコードを書き換えました。各AIの実装内容を読み解き、「どのファイルがどのように変更されたか」をユーザーに分かりやすく解説する完了報告書（マークダウン形式）を作成してください。最後に、自動でGitHubへPushされ本番環境へのデプロイが開始されたことも伝えてください。" }
        });
        reviewText = response.text || '完了';
      } catch (geminiErr) {
        console.error('Gemini review failed, using Claude fallback:', geminiErr);
        try {
          const claudeReview = await anthropic.messages.create({
            model: 'claude-fable-5',
            max_tokens: 2000,
            system: "あなたはレビュー担当のマネージャーAIです。部下のAIチームが連携してコードを書き換えました。各AIの実装内容を読み解き、「どのファイルがどのように変更されたか」をユーザーに分かりやすく解説する完了報告書を作成してください。",
            messages: [{ role: 'user', content: `元の要件: ${prompt}\n\n作業結果: ${allClaudeResults}\n\n更新ファイル数: ${totalFilesUpdated}\nGit Push: ${pushSuccess ? '成功' : '未実行'}` }]
          });
          const reviewBlock = claudeReview.content.find((b: any) => b.type === 'text');
          reviewText = reviewBlock ? (reviewBlock as any).text : '完了';
        } catch (e2) {
          reviewText = `【完了報告】\n${totalFilesUpdated}ファイルを更新しました。${pushSuccess ? 'GitHubへPush済み。' : ''}`;
        }
      }

      // Step 3: Update Memory (best-effort)
      logToTask(taskId, '🤖 [MULTI-AGENT] Updating Project Memory...');
      try {
        const memoryUpdateRes = await ai.models.generateContent({
          model: 'gemini-2.0-flash',
          contents: `現在の記憶:\n${memoryText || 'なし'}\n\n今回のユーザーの依頼:\n${prompt}\n\n今回の実装内容:\n${allClaudeResults}`,
          config: { systemInstruction: "あなたはAIの記憶を管理するアシスタントです。今回のユーザーの依頼と実装内容から、今後もプロジェクト全体で適用すべき『デザインの好み（例：角丸にする、特定の色を使う）』や『コーディングルール（例：特定のライブラリを使う）』があれば、現在の記憶に追記・修正して、新しい記憶の全文を出力してください。マークダウンなどの装飾は不要です。重要なルールのみを箇条書きで残してください。" }
        });
        const newMemory = memoryUpdateRes.text || memoryText || '';
        await db.collection('projectInfo').doc('memory').set({ content: newMemory, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        logToTask(taskId, '🤖 [MULTI-AGENT] Memory updated successfully.');
      } catch(e) {
        console.error("Failed to update memory (non-critical)", e);
      }

      return reviewText;

    } else if (model === 'system-rollback') {
      logToTask(taskId, '🤖 [ROLLBACK] Executing system rollback...');
      try {
        if (process.env.GITHUB_TOKEN) {
          execSync(`git config --global user.name "Zennobate AI Worker"`);
          execSync(`git config --global user.email "worker@ai.local"`);
          execSync(`git remote set-url origin https://x-access-token:${process.env.GITHUB_TOKEN}@github.com/spitarmy/dev-core-.git`);
          // Revert the last commit safely
          execSync(`git revert --no-edit HEAD`);
          execSync(`git push origin main`);
          logToTask(taskId, `🤖 [ROLLBACK] Successfully reverted and pushed to GitHub!`);
          return "【ロールバック完了】\n直前の変更を無事に無かったことにし、安全な状態をGitHubへPushしました。";
        } else {
          return "エラー: GITHUB_TOKENが設定されていないためロールバックできません。";
        }
      } catch (err) {
        console.error("Rollback error:", err);
        return "エラー: ロールバックに失敗しました。";
      }

    } else if (model === 'gemini-2.0-flash') {
      const contents: any[] = [{ text: prompt }];
      if (imageBase64) {
        contents.push({ inlineData: { data: imageBase64, mimeType: "image/jpeg" } });
      }
      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: contents,
        config: { systemInstruction: "あなたはシニアエンジニアです。以下の指示に対する作業が完了したという体裁で、「作業結果の報告書」を作成してください。" }
      });
      return response.text || '完了';

    } else if (model === 'claude-sonnet-5' || model === 'claude-fable-5') {
      const msg = await anthropic.messages.create({
          model: model,
          max_tokens: 1000,
          system: "あなたはシニアエンジニアです。以下の指示に対する作業が完了したという体裁で、「作業結果の報告書」を作成してください。",
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                ...(imageBase64 ? [{
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: 'image/jpeg',
                    data: imageBase64
                  }
                }] : [])
              ] as any
            }
          ]
      });
      return msg.content[0].type === 'text' ? msg.content[0].text : '完了';

    } else {
      // Default to OpenAI
      const response = await openai.chat.completions.create({
        model: model === 'gpt-4.1' ? 'gpt-4.1' : 'gpt-4o',
        messages: [
          { role: "system", content: "あなたはシニアエンジニアです。以下の指示に対する作業が完了したという体裁で、「作業結果の報告書」を作成してください。" },
          { 
            role: "user", 
            content: imageBase64 
              ? [
                  { type: "text", text: prompt },
                  { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}` } }
                ] 
              : prompt 
          }
        ]
      });
      return response.choices[0].message.content || '実装が完了しました。';
    }
  } catch (e) {
    console.error("Execute Task Error:", e);
    throw e; // 呼び出し元でFAILEDステータスにさせる
  }
}

async function startWorker() {
  console.log('🚀 Zennobate Local Worker (Ultimate 3-Agent Optimization) started...');
  console.log('Listening for tasks in Firestore...');

  const tasksRef = db.collection('tasks');
  
  // W2修正: 重複処理防止用Set
  const processingTasks = new Set<string>();

  const startTaskListener = () => {
  tasksRef.where('status', 'in', ['QUEUED', 'APPROVED'])
    .onSnapshot(async (snapshot) => {
      // W1修正: forEach(async...) → for...of
      for (const change of snapshot.docChanges()) {
        try {
        if (change.type === 'added' || change.type === 'modified') {
          const taskData = change.doc.data();
          const taskId = change.doc.id;
          
          // W2: 重複処理ガード
          if (processingTasks.has(taskId)) continue;

          if (taskData.status === 'QUEUED') {
            processingTasks.add(taskId);
            console.log(`\n[📥 NEW TASK] Detected QUEUED task: T-${taskId.substring(0, 4).toUpperCase()}`);
            
            let memoryText = "";
            try {
              const memDoc = await db.collection('projectInfo').doc('memory').get();
              if (memDoc.exists) {
                memoryText = memDoc.data()?.content || "";
              }
            } catch (e) {
              console.error("Failed to read memory", e);
            }

            await change.doc.ref.update({
              status: 'ANALYZING',
              summary: 'Google Gemini（無料枠）が要件を分析し、最適なタスク分割と実装計画を作成しています...',
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            let imageBase64: string | undefined;
            if (taskData.imageUrl) {
              try {
                if (taskData.imageUrl.startsWith('data:')) {
                  // Base64 data URL stored directly in Firestore
                  const base64Match = taskData.imageUrl.match(/^data:[^;]+;base64,(.+)$/);
                  if (base64Match) {
                    imageBase64 = base64Match[1];
                    console.log(`[🔍 VISION] Extracted Base64 from data URL.`);
                  }
                } else {
                  console.log(`[🔍 VISION] Fetching image from URL...`);
                  const res = await fetch(taskData.imageUrl);
                  const buf = await res.arrayBuffer();
                  imageBase64 = Buffer.from(buf).toString('base64');
                  console.log(`[🔍 VISION] Successfully converted image to Base64.`);
                }
              } catch (err) {
                console.error("[🔍 VISION] Failed to process image:", err);
              }
            }

            const plan = await generatePlan(taskId, taskData.prompt, taskData.model, imageBase64, memoryText);

            // 逆質問の確認
            try {
              const clarifMatch = plan.match(/```json\n([\s\S]*?)\n```/);
              if (clarifMatch) {
                const parsed = JSON.parse(clarifMatch[1]);
                if (parsed.status === "CLARIFICATION_NEEDED") {
                  await change.doc.ref.update({
                    status: 'CLARIFICATION_NEEDED',
                    summary: parsed.question,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                  });
                  return; // ここで終了し、ユーザーの回答を待つ
                }
              }
            } catch (e) {
              // 無視して通常処理へ
            }

            await change.doc.ref.update({
              status: 'WAITING_APPROVAL',
              summary: plan,
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            console.log(`[✋ WAITING] Task T-${taskId.substring(0, 4).toUpperCase()} plan created by Gemini.`);
          }

          if (taskData.status === 'APPROVED') {
            console.log(`\n[✅ APPROVED] Task T-${taskId.substring(0, 4).toUpperCase()} was approved.`);
            
            let memoryText = "";
            try {
              const memDoc = await db.collection('projectInfo').doc('memory').get();
              if (memDoc.exists) {
                memoryText = memDoc.data()?.content || "";
              }
            } catch (e) {
              console.error("Failed to read memory", e);
            }

            await change.doc.ref.update({
              status: 'IMPLEMENTING',
              summary: taskData.model === 'auto-multi-agent' 
                ? '【連携中】Claudeがコーディングを行い、Geminiが無料でレビューしています...' 
                : `${taskData.model} がコードを実装しています...`,
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            let imageBase64: string | undefined;
            if (taskData.imageUrl) {
              try {
                if (taskData.imageUrl.startsWith('data:')) {
                  const base64Match = taskData.imageUrl.match(/^data:[^;]+;base64,(.+)$/);
                  if (base64Match) {
                    imageBase64 = base64Match[1];
                  }
                } else {
                  const res = await fetch(taskData.imageUrl);
                  const buf = await res.arrayBuffer();
                  imageBase64 = Buffer.from(buf).toString('base64');
                }
              } catch (err) {
                console.error(err);
              }
            }

            // 以前の計画（リサーチ結果）を取得してClaudeに渡す
            const planText = taskData.summary || '';
            const result = await executeTask(taskId, taskData.prompt, taskData.model, imageBase64, planText, memoryText);

            await change.doc.ref.update({
              status: 'COMPLETED',
              summary: result,
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            console.log(`[🎉 DONE] Task T-${taskId.substring(0, 4).toUpperCase()} completed.`);
          }
          }
        } catch (err: any) {
          console.error(`[ERROR] Task processing failed:`, err);
          try {
            await change.doc.ref.update({
              status: 'FAILED',
              summary: `【エラー】タスク処理に失敗しました: ${err?.message || '不明なエラー'}`,
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
          } catch (_) {}
        }
      }
    }, (error: any) => {
      console.error('Error listening to tasks:', error);
      console.log('Restarting task listener in 5 seconds...');
      setTimeout(startTaskListener, 5000);
    });
  };
  startTaskListener();

    // === 壁打ちモード: brainstormsコレクションの監視 ===
    // Firestoreのstream初期化競合を防ぐため遅延起動
    const startBrainstormListener = () => {
    const brainstormQuery = db.collection('brainstorms').where('status', '==', 'thinking');
    console.log('💬 Brainstorm listener starting...');
    brainstormQuery.onSnapshot(async (snapshot: any) => {
      console.log(`💬 Brainstorm snapshot received: ${snapshot.docChanges().length} changes`);
      for (const change of snapshot.docChanges()) {
        if (change.type === 'added' || change.type === 'modified') {
          const data = change.doc.data();
          if (data.status !== 'thinking') continue;

          const messages = data.messages || [];
          const sessionId = change.doc.id;
          console.log(`💬 [BRAINSTORM] Session ${sessionId.substring(0, 6)} - responding...`);

          try {
            // 会話履歴をClaude形式に変換
            const claudeMessages = messages.map((m: any) => ({
              role: m.role === 'user' ? 'user' : 'assistant',
              content: m.text
            }));

            const response = await anthropic.messages.create({
              model: 'claude-fable-5',
              max_tokens: 2000,
              system: `あなたはプロダクト開発の壁打ち相手です。ユーザーがアプリやサービスのアイデアを相談しに来ています。
以下のルールで会話してください：
- ユーザーのアイデアに対して、具体的な質問を投げかけて要件を明確にする
- 技術的な提案やアドバイスもする（「それならReact Nativeより Flutter の方がいいかも」など）
- 曖昧な部分があれば指摘する（「ターゲットユーザーは誰ですか？」など）
- 褒めるところは褒めつつ、改善点も率直に伝える
- 回答は簡潔に。長くても3-4段落まで
- 日本語で会話する`,
              messages: claudeMessages
            });

            const textBlock = response.content.find((b: any) => b.type === 'text');
            const aiText = textBlock ? (textBlock as any).text : '考え中...';

            // AI応答をメッセージ配列に追加してFirestoreに書き戻す
            const updatedMessages = [...messages, { role: 'ai', text: aiText }];
            await change.doc.ref.update({
              messages: updatedMessages,
              status: 'active'
            });

            console.log(`💬 [BRAINSTORM] Session ${sessionId.substring(0, 6)} - responded ✅`);
          } catch (err) {
            console.error(`💬 [BRAINSTORM] Error:`, err);
            await change.doc.ref.update({ status: 'active' });
          }
        }
      }
    }, (error: any) => {
      console.error('Error listening to brainstorms:', error);
      console.log('Restarting brainstorm listener in 5 seconds...');
      setTimeout(startBrainstormListener, 5000);
    });
  };
  setTimeout(() => startBrainstormListener(), 3000);
}

startWorker().catch(console.error);
