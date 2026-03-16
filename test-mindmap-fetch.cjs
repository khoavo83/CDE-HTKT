const admin = require('firebase-admin');
const path = require('path');
const serviceAccount = require(path.resolve(__dirname, 'functions', 'credentials.json'));

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

async function testFetch() {
    const linksSnap = await db.collection('vanban_node_links').get();
    console.log(`Total vanban_node_links: ${linksSnap.size}`);
    for (const doc of linksSnap.docs) {
        const data = doc.data();
        console.log(`Link: ${doc.id}, nodeId: ${data.nodeId}, vanBanId: ${data.vanBanId}`);

        // Check if vanban exists
        const vbDoc = await db.collection('vanban').doc(data.vanBanId).get();
        console.log(`  vanban ${data.vanBanId} exists: ${vbDoc.exists}`);

        // Check project node
        const nodeDoc = await db.collection('project_nodes').doc(data.nodeId).get();
        console.log(`  project_node ${data.nodeId} exists: ${nodeDoc.exists}, name: ${nodeDoc.data()?.name}`);
    }
}

testFetch().catch(console.error);
