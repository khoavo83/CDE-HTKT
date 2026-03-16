const admin = require("firebase-admin");
const path = require("path");

const SERVICE_ACCOUNT_PATH = path.resolve(__dirname, "credentials.json");
const CREDENTIALS = require(SERVICE_ACCOUNT_PATH);

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(CREDENTIALS)
    });
}

const db = admin.firestore();

async function updateSettings() {
    try {
        await db.collection("settings").doc("driveFolders").set({
            rootId: "1furSuhinzZI9YXqSRcBrP5tWvKpqsoVx",
            projectsRootId: "1furSuhinzZI9YXqSRcBrP5tWvKpqsoVx",
            vanBanDenId: "1furSuhinzZI9YXqSRcBrP5tWvKpqsoVx",
            vanBanDiId: "1furSuhinzZI9YXqSRcBrP5tWvKpqsoVx",
            updatedAt: new Date().toISOString()
        }, { merge: true });
        console.log("Cập nhật ID thư mục CDE-HTKT thành công!");
    } catch (e) {
        console.error("Lỗi:", e);
    }
}

updateSettings();
