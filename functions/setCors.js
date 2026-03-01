const admin = require("firebase-admin");
const serviceAccount = require("./credentials.json");

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: "cde-htkt.appspot.com"
});

const bucket = admin.storage().bucket();

bucket.setCorsConfiguration([
    {
        maxAgeSeconds: 3600,
        method: ["GET", "PUT", "POST", "DELETE", "HEAD", "OPTIONS"],
        origin: ["*"],
        responseHeader: ["*"],
    }
]).then(() => {
    console.log("CORS enabled successfully for gs://cde-htkt.firebasestorage.app");
    process.exit(0);
}).catch((err) => {
    console.error("Failed to enable CORS:", err.message);
    process.exit(1);
});
