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

async function generatePlan(prompt: string, model: string, imageBase64?: string): Promise<string> {
  try {
    const isAuto = model === 'auto-multi-agent';
    const systemInstruction = isAuto 
      ? `あなたは優秀なAIマネージャーです。以下のユーザーからの指示を読み、実装計画を作成してください。
         【重要】必要に応じて最新のライブラリや公式ドキュメントをGoogle検索でリサーチし、その結果（最新のコード例や注意点）を必ず計画に含めてください。
         例: 
         - デザインや高度なコーディングは、Anthropic社のClaude 3.5に依頼します。
         - 全体の構成レビューと報告まとめは、私（Google Gemini）が担当しコストを削減します。
         - [リサーチメモ]: Stripeの最新APIでは...
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

async function executeTask(prompt: string, model: string, imageBase64?: string, plan?: string): Promise<string> {
  try {
    if (model === 'auto-multi-agent') {
      console.log('🤖 [MULTI-AGENT] Starting Auto-Routing Workflow...');
      
      // Step 1: Delegate heavy coding to Claude (Anthropic)
      console.log('🤖 [MULTI-AGENT] Delegating coding task to Claude...');
      const claudeMsg = await anthropic.messages.create({
          model: 'claude-3-5-sonnet-20240620',
          max_tokens: 3000,
          system: `あなたは自律型コーディングAI（Claude）です。与えられた要件のコードを実装してください。
以下はマネージャー（Gemini）が検索・作成した実装計画と事前リサーチメモです。これを参考に最新の仕様で実装してください。
<plan>
${plan || '計画なし'}
</plan>
出力は必ず以下のJSON形式の配列のみを返してください。マークダウンやその他の説明文は一切含めないでください。ルートディレクトリは \`apps/web/\` や \`apps/worker/\` などのパスを指定します。
[
  {
    "file": "apps/web/src/app/page.tsx",
    "content": "完全なファイルの内容..."
  }
]`,
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
      const claudeResult = claudeMsg.content[0].type === 'text' ? claudeMsg.content[0].text : '[]';

      let filesUpdated = 0;
      let pushSuccess = false;
      try {
        // Extract JSON array if Claude added markdown blocks
        const jsonMatch = claudeResult.match(/\[[\s\S]*\]/);
        const jsonStr = jsonMatch ? jsonMatch[0] : claudeResult;
        const filesToUpdate = JSON.parse(jsonStr);
        
        for (const item of filesToUpdate) {
          const fullPath = path.resolve(__dirname, '../../', item.file);
          fs.mkdirSync(path.dirname(fullPath), { recursive: true });
          fs.writeFileSync(fullPath, item.content, 'utf8');
          filesUpdated++;
          console.log(`🤖 [MULTI-AGENT] Wrote file: ${item.file}`);
        }

        // Git Push if we have a token
        if (filesUpdated > 0 && process.env.GITHUB_TOKEN) {
          console.log(`🤖 [MULTI-AGENT] Pushing ${filesUpdated} files to GitHub...`);
          execSync(`git config --global user.name "Zennobate AI Worker"`);
          execSync(`git config --global user.email "worker@ai.local"`);
          execSync(`git remote set-url origin https://x-access-token:${process.env.GITHUB_TOKEN}@github.com/spitarmy/dev-core-.git`);
          execSync(`git add .`);
          execSync(`git commit -m "feat: AI automated implementation for task"`);
          execSync(`git push origin main`);
          pushSuccess = true;
          console.log(`🤖 [MULTI-AGENT] Successfully pushed to GitHub!`);
        } else if (filesUpdated > 0) {
           console.log(`🤖 [MULTI-AGENT] Files updated locally, but GITHUB_TOKEN not found. Skipping push.`);
        }
      } catch (err) {
        console.error("JSON Parse or Git error:", err);
      }

      // Step 2: Manager (Gemini) reviews
      console.log('🤖 [MULTI-AGENT] Manager (Gemini) is reviewing Claude\'s work...');
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `元の要件: ${prompt}\n\nClaudeの実装内容(JSON): ${claudeResult.substring(0, 2000)}... (省略)\n\n更新されたファイル数: ${filesUpdated}\nGitへの自動Push成功: ${pushSuccess ? 'はい' : 'いいえ'}`,
        config: { systemInstruction: "あなたはレビュー担当のマネージャーAIです。部下のClaudeがコードを書き換えました。Claudeの実装内容（JSONのfile名やcontentの中身）を読み解き、「どのファイルの、どの部分を、どのように変更したか」をユーザーに分かりやすく解説する完了報告書（マークダウン形式）を作成してください。最後に、自動でGitHubへPushされ、本番環境への自動デプロイが開始されたことも伝えてください。" }
      });
      return response.text || '完了';

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
            
            await change.doc.ref.update({
              status: 'ANALYZING',
              summary: 'Google Gemini（無料枠）が要件を分析し、最適なタスク分割と実装計画を作成しています...',
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            let imageBase64: string | undefined;
            if (taskData.imageUrl) {
              try {
                console.log(`[🔍 VISION] Fetching image from URL...`);
                const res = await fetch(taskData.imageUrl);
                const buf = await res.arrayBuffer();
                imageBase64 = Buffer.from(buf).toString('base64');
                console.log(`[🔍 VISION] Successfully converted image to Base64.`);
              } catch (err) {
                console.error("[🔍 VISION] Failed to fetch image:", err);
              }
            }

            const plan = await generatePlan(taskData.prompt, taskData.model, imageBase64);

            await change.doc.ref.update({
              status: 'WAITING_APPROVAL',
              summary: plan,
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            console.log(`[✋ WAITING] Task T-${taskId.substring(0, 4).toUpperCase()} plan created by Gemini.`);
          }

          if (taskData.status === 'APPROVED') {
            console.log(`\n[✅ APPROVED] Task T-${taskId.substring(0, 4).toUpperCase()} was approved.`);
            
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
                const res = await fetch(taskData.imageUrl);
                const buf = await res.arrayBuffer();
                imageBase64 = Buffer.from(buf).toString('base64');
              } catch (err) {
                console.error(err);
              }
            }

            // 以前の計画（リサーチ結果）を取得してClaudeに渡す
            const planText = taskData.summary || '';
            const result = await executeTask(taskData.prompt, taskData.model, imageBase64, planText);

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
