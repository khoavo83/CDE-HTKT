const fs = require('fs');
let code = fs.readFileSync('functions/index.js', 'utf8');

const replace1 = `        // Gọi hàm đệ quy để bắt đầu tạo/cập nhật cấu trúc
        await syncNodeRecursive(null, folders.projectsRootId, 0, '');

        // NEW: Dọn dẹp các thư mục mồ côi do SA tạo nhưng không có trong project_nodes
        debugLogs.push("Bắt đầu dọn dẹp các thư mục mồ côi trên Drive...");
        const validFolderIds = new Set(nodes.map(n => n.driveFolderId).filter(Boolean));
        let cleanupCount = 0;
        try {
            let pageToken = null;
            do {
                const res = await drive.files.list({
                    q: "trashed = false and 'me' in owners and mimeType = 'application/vnd.google-apps.folder'",
                    fields: "nextPageToken, files(id, name, parents)",
                    pageToken: pageToken,
                    supportsAllDrives: true,
                    includeItemsFromAllDrives: true
                });
                const files = res.data.files || [];
                for (const file of files) {
                    // Bỏ qua các thư mục gốc của hệ thống
                    if (
                        file.id === folders.rootId || 
                        file.id === folders.projectsRootId || 
                        file.id === folders.vanBanDenId || 
                        file.id === folders.vanBanDiId || 
                        file.id === folders.aiInboxDenId || 
                        file.id === folders.aiInboxDiId
                    ) continue;
                    
                    if (!validFolderIds.has(file.id)) {
                        try {
                            await drive.files.update({ fileId: file.id, requestBody: { trashed: true }, supportsAllDrives: true });
                            debugLogs.push(\`[CLEANUP] Đã xóa thư mục mồ côi: \${file.name} (\${file.id})\`);
                            cleanupCount++;
                        } catch(e) {
                            debugLogs.push(\`[CLEANUP] Lỗi xóa thư mục \${file.name}: \${e.message}\`);
                        }
                    }
                }
                pageToken = res.data.nextPageToken;
            } while (pageToken);
        } catch (err) {
            debugLogs.push(\`[CLEANUP] Lỗi khi quét thư mục mồ côi: \${err.message}\`);
        }
        debugLogs.push(\`--- Đã dọn dẹp \${cleanupCount} thư mục rác ---\`);

        // 3. Đồng bộ Tệp tin Văn bản (SỬ DỤNG LINK - MULTI-PARENT)\`;

const replace2 = `// NEW: Tạo Shortcut cho các file đính kèm
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
                                        debugLogs.push(\`[+] Link Đính kèm: "\${attName}" -> Nhánh: \${nodeData.name}\`);
                                    }
                                } catch(e) {
                                    debugLogs.push(\`[!] Lỗi đính kèm phụ lục: \${e.message}\`);
                                }
                            }
                        }
                        
                        await sleep(200);`;


code = code.replace(/\/\/ Gọi hàm đệ quy để bắt đầu tạo\/cập nhật cấu trúc[\s\S]*?\/\/ 3\. Đồng bộ Tệp tin Văn bản \(SỬ DỤNG LINK \- MULTI\-PARENT\)/, replace1);

code = code.replace(/linkFileCount\+\+;[\s\S]*?await sleep\(200\);/, 'linkFileCount++;\n                        ' + replace2);

fs.writeFileSync('functions/index.js', code);
console.log("Done patching.");
