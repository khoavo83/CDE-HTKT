const fs = require('fs');
let code = fs.readFileSync('functions/index.js', 'utf8');

const regex = /\/\/ NEW: Tao Shortcut cho cac file dinh kem[\s\S]*?await sleep\(200\);/;

const replacement = `// NEW: Tạo Shortcut cho các file đính kèm
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

code = code.replace(regex, replacement);
fs.writeFileSync('functions/index.js', code);
console.log("Fixed!");
