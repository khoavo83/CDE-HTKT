
const admin = require('firebase-admin');

if (admin.apps.length === 0) {
    admin.initializeApp({
        projectId: 'cde-htkt'
    });
}

const db = admin.firestore();

async function checkData() {
    console.log("--- Checking project_nodes ---");
    const nodesSnap = await db.collection("project_nodes").get();
    const nodes = nodesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    const project3 = nodes.find(n => n.name && n.name.includes("Dự án Bồi thường"));
    if (project3) {
        console.log("Project 3 found:", project3.id, project3.name, "DriveID:", project3.driveFolderId);

        const childNodes = nodes.filter(n => {
            const pId = n.parentId === "" ? null : (n.parentId || null);
            return pId === project3.id;
        });

        console.log(`Found ${childNodes.length} children for Project 3`);
        childNodes.forEach(n => {
            console.log(`- Child: ${n.name} (ID: ${n.id}), DriveID: ${n.driveFolderId}`);
        });

        const targetChild = nodes.find(n => n.name && n.name.toLowerCase().includes("kế hoạch triển khai"));
        if (targetChild) {
            console.log("Target Child Found Anywhere:", targetChild.id, targetChild.name, "ParentID:", targetChild.parentId, "DriveID:", targetChild.driveFolderId);

            console.log("\n--- Checking vanban_node_links for this node ---");
            const linksSnap = await db.collection("vanban_node_links").where("nodeId", "==", targetChild.id).get();
            if (!linksSnap.empty) {
                for (const l of linksSnap.docs) {
                    const lData = l.data();
                    console.log("Link Found: vanBanId=", lData.vanBanId);
                    const vbDoc = await db.collection("vanban").doc(lData.vanBanId).get();
                    if (vbDoc.exists) {
                        const vbData = vbDoc.data();
                        console.log("Document Content:", vbData.soKyHieu, vbData.trichYeu, "DriveID:", vbData.driveFileId_Original);
                    } else {
                        console.log("Document NOT found in vanban collection!");
                    }
                }
            } else {
                console.log("No links found for node", targetChild.id);
            }
        } else {
            console.log("Child Node 'Kế hoạch triển khai' NOT found anywhere in Firestore");
        }
    } else {
        console.log("Project 3 NOT found");
    }

    console.log("\n--- Searching for Document 351/BC-BQLĐSĐT directly ---");
    // Search by exact soKyHieu
    const vbSnap = await db.collection("vanban").where("soKyHieu", "==", "351/BC-BQLĐSĐT").get();
    if (!vbSnap.empty) {
        vbSnap.forEach(doc => {
            console.log("Direct Search Match:", doc.id, doc.data().soKyHieu, doc.data().trichYeu);
        });
    } else {
        // Broad search
        const allVb = await db.collection("vanban").get();
        const matches = allVb.docs.filter(d => {
            const skh = (d.data().soKyHieu || "").toString();
            return skh.includes("351");
        });
        console.log(`Found ${matches.length} fallback matches for '351'`);
        matches.forEach(d => console.log(`- ${d.id}: ${d.data().soKyHieu}`));
    }
}

checkData().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
});
