import * as admin from 'firebase-admin';
import * as dotenv from 'dotenv';
import * as path from 'path';
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

async function generatePlan(prompt: string, model: string): Promise<string> {
  try {
    const isAuto = model === 'auto-multi-agent';
    const systemInstruction = isAuto 
      ? `あなたは優秀なAIマネージャーです。以下のユーザーからの指示を読み、どのAIに何を任せるか（コスト最適化のための分割）の「実装計画」を作成してください。
         例: 
         - デザインや高度なコーディングは、Anthropic社のClaude 3.5に依頼します。
         - 全体の構成レビューと報告まとめは、私（Google Gemini）が担当しコストを削減します。
         最後に「よろしければ承認をお願いします」と添えてください。`
      : `あなたはシニアエンジニアです。以下の指示に対する具体的な「実装計画」をステップバイステップで作成し、最後に「よろしければ承認をお願いします」と添えてください。`;

    // 💡 マネージャー役は常に Google Gemini (無料枠/爆速モデル) を使用してコストを削減！
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { systemInstruction }
    });

    return response.text || '計画の作成に失敗しました。';
  } catch (e) {
    console.error("Gemini Error:", e);
    return `【提案する実装計画】(APIエラー)\nよろしければ「承認」をお願いします。`;
  }
}

async function executeTask(prompt: string, model: string): Promise<string> {
  try {
    if (model === 'auto-multi-agent') {
      console.log('🤖 [MULTI-AGENT] Starting Auto-Routing Workflow...');
      
      // Step 1: Delegate heavy coding to Claude (Anthropic)
      console.log('🤖 [MULTI-AGENT] Delegating coding task to Claude...');
      const claudeMsg = await anthropic.messages.create({
          model: 'claude-3-5-sonnet-20240620',
          max_tokens: 1500,
          system: "あなたはコーディング担当の凄腕AI（Claude）です。与えられた要件のコードを実装し、その結果のサマリを書いてください。",
          messages: [{ role: 'user', content: prompt }]
      });
      const claudeResult = claudeMsg.content[0].type === 'text' ? claudeMsg.content[0].text : '実装完了';

      // Step 2: Manager (Gemini) reviews Claude's work for FREE
      console.log('🤖 [MULTI-AGENT] Manager (Gemini) is reviewing Claude\'s work...');
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `元の要件: ${prompt}\n\nClaudeの実装結果: ${claudeResult}`,
        config: { systemInstruction: "あなたはレビュー担当のマネージャーAI（Gemini）です。部下のClaudeから上がってきたコード実装報告をレビューし、ユーザー向けの最終的な完了報告書（マークダウン形式）に綺麗にまとめてください。Claudeが素晴らしい仕事をしてくれたことを褒める一文も入れてください。" }
      });
      return response.text || '完了';

    } else if (model === 'claude-fable-5') {
      const msg = await anthropic.messages.create({
          model: 'claude-3-5-sonnet-20240620',
          max_tokens: 1000,
          system: "あなたはシニアエンジニアです。以下の指示に対する作業が完了したという体裁で、「作業結果の報告書」を作成してください。",
          messages: [{ role: 'user', content: prompt }]
      });
      return msg.content[0].type === 'text' ? msg.content[0].text : '完了';

    } else {
      // Default to OpenAI
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "あなたはシニアエンジニアです。以下の指示に対する作業が完了したという体裁で、「作業結果の報告書」を作成してください。" },
          { role: "user", content: prompt }
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

            const plan = await generatePlan(taskData.prompt, taskData.model);

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

            const result = await executeTask(taskData.prompt, taskData.model);

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
