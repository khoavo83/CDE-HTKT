const admin = require('firebase-admin');
const { google } = require('googleapis');

admin.initializeApp();
const db = admin.firestore();

async function getDriveService() {
    const auth = new google.auth.GoogleAuth({
        keyFile: 'F:/My Drive - Khoa/Web App/Ban HTKT/cde-webapp/functions/service-account.json',
        scopes: ['https://www.googleapis.com/auth/drive']
    });
    return google.drive({ version: 'v3', auth });
}

async function fixSizes() {
    const drive = await getDriveService();
    const snap = await db.collection("vanban").get();
    let count = 0;
    for (const doc of snap.docs) {
        const data = doc.data();
        if (!data.fileSize || data.fileSize === 0) {
            const fileId = data.driveFileId_Original || data.driveId || data.fileId;
            if (fileId) {
                try {
                    const res = await drive.files.get({
                        fileId: fileId,
                        fields: "size",
                        supportsAllDrives: true
                    });
                    if (res.data.size) {
                        const s = parseInt(res.data.size);
                        await db.collection("vanban").doc(doc.id).update({ fileSize: s });
                        console.log(`Updated size for ${doc.id} to ${s}`);
                        count++;
                    }
                } catch(e) {
                    console.log(`Failed for ${doc.id}: ${e.message}`);
                }
            }
        }
    }
    console.log(`Updated ${count} files.`);
}
fixSizes();
