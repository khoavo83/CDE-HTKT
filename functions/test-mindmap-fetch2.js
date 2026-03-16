const admin = require('firebase-admin');
const path = require('path');
const serviceAccount = require(path.resolve(__dirname, 'credentials.json'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function testFetch() {
    const nodesSnap = await db.collection('project_nodes').get();
    const targetNode = nodesSnap.docs.find(d => d.data().name?.includes('Bố trí nhân sự'));
    if (!targetNode) {
        console.log('Node Bố trí nhân sự not found');
        return;
    }
    const nodeId = targetNode.id;
    console.log(`Node ID for "${targetNode.data().name}": ${nodeId}`);

    const linksSnap = await db.collection('vanban_node_links').where('nodeId', '==', nodeId).get();
    console.log(`Found ${linksSnap.size} links for this node.`);
    for (const doc of linksSnap.docs) {
        const data = doc.data();
        console.log(`- Link: ${doc.id}, vanBanId: ${data.vanBanId}`);
        const vbDoc = await db.collection('vanban').doc(data.vanBanId).get();
        console.log(`  vanban exists: ${vbDoc.exists}`);
    }
}
testFetch().catch(console.error);
