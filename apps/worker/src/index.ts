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

// 🚀 3社すべての最強AIをセットアップ！
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function generatePlan(prompt: string, model: string, imageBase64?: string, memoryText?: string): Promise<string> {
  try {
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
      model: 'gemini-2.5-flash',
      contents: contents,
      config: { 
        systemInstruction,
        tools: [{ googleSearch: {} }]
      }
    });

    return response.text || '計画の作成に失敗しました。';
  } catch (e) {
    console.error("Gemini Error:", e);
    return `【提案する実装計画】(APIエラー)\nよろしければ「承認」をお願いします。`;
  }
}

async function executeTask(prompt: string, model: string, imageBase64?: string, plan?: string, memoryText?: string): Promise<string> {
  try {
    if (model === 'auto-multi-agent') {
      console.log('🤖 [MULTI-AGENT] Starting Auto-Routing Swarm Workflow...');
      
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

      console.log(`🤖 [MULTI-AGENT] Swarm Team formed with ${swarmPlan.length} agents.`);
      
      const memoryFiles: Record<string, string> = {};
      let totalFilesUpdated = 0;
      let allClaudeResults = "";

      // 各エージェントを順番に呼び出す (Swarm)
      for (const agent of swarmPlan) {
        console.log(`🤖 [MULTI-AGENT] Delegating to: ${agent.role}...`);
        
        let previousContext = "";
        if (Object.keys(memoryFiles).length > 0) {
          previousContext = "\n\n【前の担当者からの引き継ぎコード】\n前任者が以下のファイルを途中まで実装しました。必ずこのコードをベースにして、あなたの担当作業を追加した完全なファイルを出力してください。\n";
          for (const [file, content] of Object.entries(memoryFiles)) {
            previousContext += `--- ${file} ---\n${content}\n\n`;
          }
        }

        const claudeMsg = await anthropic.messages.create({
            model: 'claude-3-5-sonnet-20240620',
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

        const claudeResult = claudeMsg.content[0].type === 'text' ? claudeMsg.content[0].text : '[]';
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
          console.log(`🤖 [MULTI-AGENT] Wrote file: ${file}`);
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
          console.log(`🤖 [MULTI-AGENT] Successfully pushed to GitHub!`);
        }
      } catch (err) {
        console.error("Git push error:", err);
      }

      // Step 2: Manager (Gemini) reviews
      console.log('🤖 [MULTI-AGENT] Manager (Gemini) is reviewing Claude\'s work...');
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `元の要件: ${prompt}\n\nエージェントチームの作業結果: ${allClaudeResults}\n\n更新されたファイル数: ${totalFilesUpdated}\nGitへの自動Push成功: ${pushSuccess ? 'はい' : 'いいえ'}`,
        config: { systemInstruction: "あなたはレビュー担当のマネージャーAIです。部下のAIチーム（Claude達）が連携してコードを書き換えました。各AIの実装内容を読み解き、「どのファイルがどのように変更されたか」をユーザーに分かりやすく解説する完了報告書（マークダウン形式）を作成してください。最後に、自動でGitHubへPushされ本番環境へのデプロイが開始されたことも伝えてください。" }
      });
      
      // Step 3: Update Memory
      console.log('🤖 [MULTI-AGENT] Updating Project Memory...');
      try {
        const memoryUpdateRes = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: `現在の記憶:\n${memoryText || 'なし'}\n\n今回のユーザーの依頼:\n${prompt}\n\n今回の実装内容:\n${allClaudeResults}`,
          config: { systemInstruction: "あなたはAIの記憶を管理するアシスタントです。今回のユーザーの依頼と実装内容から、今後もプロジェクト全体で適用すべき『デザインの好み（例：角丸にする、特定の色を使う）』や『コーディングルール（例：特定のライブラリを使う）』があれば、現在の記憶に追記・修正して、新しい記憶の全文を出力してください。マークダウンなどの装飾は不要です。重要なルールのみを箇条書きで残してください。" }
        });
        const newMemory = memoryUpdateRes.text || memoryText || '';
        await db.collection('projectInfo').doc('memory').set({ content: newMemory, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        console.log('🤖 [MULTI-AGENT] Memory updated successfully.');
      } catch(e) {
        console.error("Failed to update memory", e);
      }

      return response.text || '完了';

    } else if (model === 'system-rollback') {
      console.log('🤖 [ROLLBACK] Executing system rollback...');
      try {
        if (process.env.GITHUB_TOKEN) {
          execSync(`git config --global user.name "Zennobate AI Worker"`);
          execSync(`git config --global user.email "worker@ai.local"`);
          execSync(`git remote set-url origin https://x-access-token:${process.env.GITHUB_TOKEN}@github.com/spitarmy/dev-core-.git`);
          // Revert the last commit safely
          execSync(`git revert --no-edit HEAD`);
          execSync(`git push origin main`);
          console.log(`🤖 [ROLLBACK] Successfully reverted and pushed to GitHub!`);
          return "【ロールバック完了】\n直前の変更を無事に無かったことにし、安全な状態をGitHubへPushしました。";
        } else {
          return "エラー: GITHUB_TOKENが設定されていないためロールバックできません。";
        }
      } catch (err) {
        console.error("Rollback error:", err);
        return "エラー: ロールバックに失敗しました。";
      }

    } else if (model === 'claude-fable-5') {
      const msg = await anthropic.messages.create({
          model: 'claude-3-5-sonnet-20240620',
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
        model: "gpt-4o",
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
    return `【成果報告】(APIエラー)\n実装が完了しました。`;
  }
}

async function startWorker() {
  console.log('🚀 Zennobate Local Worker (Ultimate 3-Agent Optimization) started...');
  console.log('Listening for tasks in Firestore...');

  const tasksRef = db.collection('tasks');
  
  tasksRef.where('status', 'in', ['QUEUED', 'APPROVED'])
    .onSnapshot((snapshot) => {
      snapshot.docChanges().forEach(async (change) => {
        if (change.type === 'added' || change.type === 'modified') {
          const taskData = change.doc.data();
          const taskId = change.doc.id;
          
          if (taskData.status === 'QUEUED') {
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

            const plan = await generatePlan(taskData.prompt, taskData.model, imageBase64, memoryText);

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
            const result = await executeTask(taskData.prompt, taskData.model, imageBase64, planText, memoryText);

            await change.doc.ref.update({
              status: 'COMPLETED',
              summary: result,
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            console.log(`[🎉 DONE] Task T-${taskId.substring(0, 4).toUpperCase()} completed.`);
          }
        }
      });
    }, (error) => {
      console.error('Error listening to tasks:', error);
    });
}

startWorker().catch(console.error);
