const fs = require('fs');
const admin = require('firebase-admin');

async function reportError() {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    const db = admin.firestore();

    let logContent = 'Log file not found.';
    if (fs.existsSync('build.log')) {
      logContent = fs.readFileSync('build.log', 'utf8');
      // Truncate to the last 5000 characters to prevent massive payloads
      if (logContent.length > 5000) {
        logContent = "...(Truncated)...\n" + logContent.substring(logContent.length - 5000);
      }
    }

    const prompt = `【緊急自動修復】前回のデプロイ（npm run build）で以下のエラーが発生しました。エラーログを分析し、対象のファイルを修正して再度実装してください。\n\n\`\`\`\n${logContent}\n\`\`\``;

    await db.collection('tasks').add({
      prompt: prompt,
      model: 'auto-multi-agent',
      status: 'QUEUED',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log("🔥 SOS Task successfully sent to Firestore!");
  } catch (error) {
    console.error("Failed to report error:", error);
  }
}

reportError();
