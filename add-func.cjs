const fs = require('fs');
let code = fs.readFileSync('functions/index.js', 'utf8');

const newFunction = `
// ==========================================
// ĐỒNG BỘ ĐƠN LẺ MỘT THƯ MỤC (CHỐNG TIMEOUT)
// ==========================================
exports.syncSingleNodeDrive = onCall({ timeoutSeconds: 120 }, async (request) => {
    // 1. Xác thực Admin
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Yêu cầu đăng nhập.");
    }
    if (request.auth.token.email !== DRIVE_ADMIN_EMAIL) {
        const userSnap = await db.collection("users").doc(request.auth.uid).get();
        const userData = userSnap.data();
        if (!userData || userData.role !== 'admin') {
            throw new HttpsError("permission-denied", "Chỉ Admin mới có quyền đồng bộ Drive.");
        }
    }

    const { nodeId } = request.data;
    if (!nodeId) {
        throw new HttpsError("invalid-argument", "Thiếu nodeId.");
    }

    const debugLogs = [];
    debugLogs.push(\`Bắt đầu đồng bộ cục bộ thư mục ID: \${nodeId}\`);

    try {
        const auth = new google.auth.GoogleAuth({
            credentials: {
                client_email: SERVICE_ACCOUNT_EMAIL,
                private_key: PRIVATE_KEY
            },
            scopes: ["https://www.googleapis.com/auth/drive"]
        });
        const drive = google.drive({ version: "v3", auth });

        // Lấy thông tin thư mục
        const nodeDoc = await db.collection("project_nodes").doc(nodeId).get();
        if (!nodeDoc.exists) {
            throw new HttpsError("not-found", "Không tìm thấy thư mục dự án.");
        }
        const nodeData = nodeDoc.data();
        if (!nodeData.driveFolderId) {
            throw new HttpsError("failed-precondition", "Thư mục này chưa được tạo trên Drive. Vui lòng chạy Đồng bộ Cấu trúc (Toàn cục) trước, hoặc tạo một thư mục con bên trong để kích hoạt tạo thư mục.");
        }

        debugLogs.push(\`Thư mục: \${nodeData.name} (\${nodeData.driveFolderId})\`);

        // Lấy danh sách liên kết văn bản
        const linksSnap = await db.collection("vanban_node_links").where("nodeId", "==", nodeId).get();
        debugLogs.push(\`Tìm thấy \${linksSnap.size} văn bản trong thư mục.\`);

        let linkCount = 0;
        let attCount = 0;

        for (const linkDoc of linksSnap.docs) {
            const linkData = linkDoc.data();
            const vbDoc = await db.collection("vanban").doc(linkData.vanBanId).get();
            if (!vbDoc.exists) continue;

            const vbData = vbDoc.data();
            const fileId = vbData.driveFileId_Original || vbData.driveId || vbData.fileId;
            const fileName = vbData.fileNameStandardized || vbData.fileNameOriginal || vbData.soKyHieu || "Link";

            // 1. Tạo shortcut cho file chính
            if (fileId) {
                try {
                    const shortcutName = fileName + " (Shortcut)";
                    const existingShortcut = await findExistingItem(drive, shortcutName, nodeData.driveFolderId, 'application/vnd.google-apps.shortcut');
                    if (!existingShortcut) {
                        await drive.files.create({
                            supportsAllDrives: true,
                            resource: {
                                name: shortcutName,
                                mimeType: 'application/vnd.google-apps.shortcut',
                                shortcutDetails: { targetId: fileId },
                                parents: [nodeData.driveFolderId]
                            }
                        });
                        const news = await findExistingItem(drive, shortcutName, nodeData.driveFolderId, 'application/vnd.google-apps.shortcut');
                        if (news) await ensureAdminPermission(drive, news.id);
                        debugLogs.push(\`[+] Link: "\${fileName}" -> Nhánh: \${nodeData.name}\`);
                        linkCount++;
                    } else {
                        debugLogs.push(\`[~] Đã có Link: "\${fileName}" -> Nhánh: \${nodeData.name}\`);
                    }
                } catch(err) {
                    debugLogs.push(\`[!] Lỗi shortcut văn bản \${fileName}: \${err.message}\`);
                }
            } else {
                debugLogs.push(\`[-] Bỏ qua văn bản "\${fileName}" vì không có file đính kèm chính trên hệ thống.\`);
            }

            // 2. Tạo shortcut cho file đính kèm/phụ lục
            const attachments = [
                ...(vbData.attachments || []),
                ...(vbData.dinhKem || [])
            ];
            
            for (let i = 0; i < attachments.length; i++) {
                const att = attachments[i];
                const attFileId = att.driveFileId_Original || att.driveId || att.fileId || att.id;
                if (attFileId) {
                    try {
                        const attName = (att.fileName || att.originalName || att.name || "DinhKem") + " (Đính kèm)";
                        const existAtt = await findExistingItem(drive, attName, nodeData.driveFolderId, 'application/vnd.google-apps.shortcut');
                        if (!existAtt) {
                            await drive.files.create({
                                supportsAllDrives: true,
                                resource: {
                                    name: attName,
                                    mimeType: 'application/vnd.google-apps.shortcut',
                                    shortcutDetails: { targetId: attFileId },
                                    parents: [nodeData.driveFolderId]
                                }
                            });
                            const newsAtt = await findExistingItem(drive, attName, nodeData.driveFolderId, 'application/vnd.google-apps.shortcut');
                            if (newsAtt) await ensureAdminPermission(drive, newsAtt.id);
                            debugLogs.push(\`[+] Link Phụ lục: "\${attName}" -> Nhánh: \${nodeData.name}\`);
                            attCount++;
                        } else {
                            debugLogs.push(\`[~] Đã có Phụ lục: "\${attName}"\`);
                        }
                    } catch(e) {
                        debugLogs.push(\`[!] Lỗi phụ lục: \${e.message}\`);
                    }
                }
            }
            await sleep(200);
        }

        debugLogs.push(\`=== HOÀN TẤT: Đồng bộ xong \${linkCount} văn bản và \${attCount} phụ lục ===\`);

        return {
            success: true,
            message: \`Đã đồng bộ thành công \${linkCount} văn bản và \${attCount} phụ lục vào thư mục.\`,
            debug: debugLogs
        };
    } catch (error) {
        console.error("syncSingleNodeDrive Error:", error);
        throw new HttpsError("internal", \`Lỗi đồng bộ cục bộ: \${error.message}\`);
    }
});
`;

code += newFunction;
fs.writeFileSync('functions/index.js', code);
console.log("Added syncSingleNodeDrive");
