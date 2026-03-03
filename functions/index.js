const { onRequest, onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentUpdated, onDocumentWritten, onDocumentCreated, onDocumentDeleted } = require("firebase-functions/v2/firestore");
const { setGlobalOptions } = require("firebase-functions/v2");

// Thiết lập vùng mặc định cho toàn bộ Functions là Singapore (gần Việt Nam và cùng vùng với DB của bạn)
setGlobalOptions({ region: "asia-southeast1" });

const admin = require("firebase-admin");
const path = require("path");
// const fs = require("fs"); 
// const os = require("os");
// const busboy = require("busboy");
const cors = require("cors")({ origin: true });

admin.initializeApp();
const db = admin.firestore();

// [MỚI] Cấu hình email Admin sẽ được toàn quyền trên Drive
const DRIVE_ADMIN_EMAIL = "khoa.bqldsdt@gmail.com";

/**
 * Hàm hỗ trợ: Cấp quyền 'writer' cho Admin trên một file/folder cụ thể.
 * Giúp Admin có quyền xóa/sửa file dù do Service Account hay User khác tạo.
 */
async function ensureAdminPermission(drive, fileId) {
    if (!fileId) return;
    try {
        await drive.permissions.create({
            fileId: fileId,
            requestBody: {
                role: 'writer',
                type: 'user',
                emailAddress: DRIVE_ADMIN_EMAIL
            },
            sendNotificationEmail: false,
            supportsAllDrives: true
        });
        console.log(`[DEBUG] Granted 'writer' permission to ${DRIVE_ADMIN_EMAIL} for file ID: ${fileId}`);
    } catch (err) {
        // Nếu đã có quyền hoặc lỗi khác, ghi log nhưng không làm treo luồng chính
        console.log(`[DEBUG] Permission grant status for ${fileId}:`, err.message);
    }
}

/**
 * Hàm hỗ trợ: Tìm kiếm tệp hoặc thư mục đã tồn tại trên Drive theo Tên và Thư mục cha.
 * Giúp chống nhân đôi (deduplication) khi đồng bộ.
 */
async function findExistingItem(drive, name, parentId, mimeType = null) {
    try {
        let query = `name = '${name.replace(/'/g, "\\'")}' and trashed = false`;
        if (parentId) {
            query += ` and '${parentId}' in parents`;
        }
        if (mimeType) {
            query += ` and mimeType = '${mimeType}'`;
        }

        const response = await drive.files.list({
            q: query,
            fields: "files(id, name, webViewLink)",
            spaces: 'drive',
            supportsAllDrives: true,
            includeItemsFromAllDrives: true
        });

        if (response.data.files && response.data.files.length > 0) {
            return response.data.files[0]; // Trả về kết quả đầu tiên tìm thấy
        }
        return null;
    } catch (err) {
        console.error(`[DEBUG] Error finding item '${name}':`, err.message);
        return null;
    }
}

// Helper function kết nối Drive - nạp trễ (Lazy Load) để tránh Timeout khi deploy
let driveInstance = null;
async function getDriveService() {
    if (driveInstance) return driveInstance;

    console.log("[DEBUG] Loading Credentials and Google APIs...");
    const SERVICE_ACCOUNT_PATH = path.resolve(__dirname, "credentials.json");
    const credentials = require(SERVICE_ACCOUNT_PATH);

    const { google } = require("googleapis");
    const jwtClient = new google.auth.JWT(
        credentials.client_email,
        null,
        credentials.private_key,
        ["https://www.googleapis.com/auth/drive"]
    );
    await jwtClient.authorize();
    driveInstance = google.drive({ version: "v3", auth: jwtClient });
    return driveInstance;
}

// ==========================================
// PHASE 5: TRUNG TÂM KIỂM SOÁT VĂN BẢN
// ==========================================

// HTTP Callable Function: Nhận base64Data từ client, tạo form rỗng
exports.processDocumentOCR = onCall({ region: 'asia-southeast1', timeoutSeconds: 300, memory: '1GiB' }, async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Bạn phải đăng nhập để thực hiện thao tác này.");
    }
    try {
        const { base64Data, mimeType, driveFileId: inputDriveFileId, fileNameOriginal, totalSizeBytes, dinhKem, folderId, nodeId, docId } = request.data;
        console.log(`[DEBUG] processDocumentOCR start: docId=${docId}, driveFileId=${inputDriveFileId}, mimeType=${mimeType}, fileName=${fileNameOriginal}`);

        let fileMimeType = mimeType || 'application/pdf';
        let fileName = fileNameOriginal || `document_${Date.now()}.pdf`;
        let fileSize = totalSizeBytes || 0;

        // 1. Lấy thông tin cấu hình Thư mục Root Drive (Bắt buộc)
        const settingsDoc = await db.collection("settings").doc("driveFolders").get();
        const driveFolders = settingsDoc.exists ? settingsDoc.data() : null;
        if (!driveFolders || !driveFolders.rootId) {
            throw new Error("Chưa cấu hình Thư mục gốc (Root) Google Drive!");
        }

        // Ưu tiên folderId được truyền lên từ Cây thư mục (Mindmap), nếu không dùng rootId
        const targetParentId = folderId || driveFolders.rootId;

        // 2. Upload sang Google Drive (Nếu client chưa upload)
        let driveFileId = inputDriveFileId || request.data.driveFileId;
        let webViewLink = request.data.webViewLink;
        let base64Content = "";

        const drive = await getDriveService();

        if (!driveFileId) {
            if (!base64Data) {
                throw new Error("Thiếu dữ liệu tệp (base64Data) và không có driveFileId để xử lý.");
            }
            // Chuẩn hóa base64 (loại bỏ header data:image/png;base64, nếu có)
            base64Content = base64Data.split(',').pop() || base64Data;

            const buffer = Buffer.from(base64Content, 'base64');
            const { PassThrough } = require('stream');
            const bufferStream = new PassThrough();
            bufferStream.end(buffer);

            // Hàm upload thử upload vào folder, nếu lỗi fallback về rootId
            const tryUpload = async (parentId) => {
                const { PassThrough: PT } = require('stream');
                const bs = new PT();
                bs.end(Buffer.from(base64Content, 'base64'));
                return drive.files.create({
                    supportsAllDrives: true,
                    resource: { name: fileName, parents: [parentId] },
                    media: { mimeType: fileMimeType, body: bs },
                    fields: 'id, webViewLink'
                });
            };

            let driveResponse;
            try {
                driveResponse = await tryUpload(targetParentId);
                console.log(`[DEBUG] Upload thành công vào folder: ${targetParentId}`);
            } catch (uploadErr) {
                console.warn(`[WARN] Không upload được vào folder ${targetParentId}: ${uploadErr.message}. Fallback về rootId.`);
                driveResponse = await tryUpload(driveFolders.rootId);
                console.log(`[DEBUG] Upload thành công vào rootId: ${driveFolders.rootId}`);
            }

            driveFileId = driveResponse.data.id;
            webViewLink = driveResponse.data.webViewLink;
            console.log(`[DEBUG] Đã upload file mới lên Drive qua OAuth: ${driveFileId}`);

            // Cần cấp quyền reader cho anyone để link xem được trên Web App
            try {
                await drive.permissions.create({
                    fileId: driveFileId,
                    requestBody: { role: 'reader', type: 'anyone' }
                });
            } catch (e) {
                console.log("Không thể chmod anyone cho file chính", e.message);
            }
            // [MỚI] Đảm bảo Admin có quyền trên file mới upload
            await ensureAdminPermission(drive, driveFileId);

        } else {
            console.log(`[DEBUG] Đang xử lý file đã có trên Drive: ${driveFileId}`);
            if (base64Data) {
                base64Content = base64Data.split(',').pop() || base64Data;
            } else {
                // Trường hợp AI rà soát tài liệu cũ, tải từ Drive
                try {
                    const fileMetadata = await drive.files.get({
                        fileId: driveFileId,
                        fields: 'mimeType, size'
                    });
                    fileMimeType = fileMetadata.data.mimeType;
                    fileSize = parseInt(fileMetadata.data.size) || fileSize;

                    const driveDownload = await drive.files.get(
                        { fileId: driveFileId, alt: 'media' },
                        { responseType: 'arraybuffer' }
                    );
                    base64Content = Buffer.from(driveDownload.data).toString('base64');
                    console.log(`[DEBUG] Đã tải file thành công từ Drive để OCR. Size=${base64Content.length}`);
                } catch (driveErr) {
                    console.error("[ERROR] Lỗi khi tải file từ Drive:", driveErr);
                    throw new Error(`Không thể tải file từ Drive (ID: ${driveFileId}). Vui lòng kiểm tra quyền truy cập.`);
                }
            }
        }

        // 4. Gọi Gemini để OCR
        require('dotenv').config();
        const prompt = `Bạn là một chuyên gia hành chính văn phòng chuyên nghiệp. 
        Hãy đọc kỹ văn bản (PDF hoặc Ảnh) được cung cấp và trích xuất các thông tin sau đây chính xác nhất có thể.
        
        YÊU CẦU ĐỊNH DẠNG ĐẦU RA:
        Chỉ trả về DUY NHẤT một chuỗi JSON hợp lệ, không bao gồm bất kỳ văn bản giải thích nào khác ngoài khối mã JSON. 
        Nếu không tìm thấy thông tin cụ thể, hãy để giá trị là chuỗi rỗng "".
        
        Cấu trúc JSON:
          "soKyHieu": "Số và ký hiệu văn bản (Ví dụ: 123/QĐ-UBND)",
          "ngayBanHanh": "Ngày ban hành định dạng YYYY-MM-DD (Nếu chỉ có Ngày... tháng... năm... hãy chuyển sang số)",
          "coQuanBanHanh": "Tên cơ quan ban hành văn bản. LƯU Ý: Nếu phần tiêu đề bên trái có nhiều dòng (ví dụ: dòng trên là cơ quan chủ quản, dòng dưới là cơ quan ban hành trực tiếp), hãy trích xuất dòng DƯỚI CÙNG (ngay sát trên phần Số...). Ví dụ: Dòng 1: UBND TP.HCM, Dòng 2: Ban Quản lý Đường sắt đô thị -> Lấy 'Ban Quản lý Đường sắt đô thị'.",
          "loaiVanBan": "Loại văn bản (Quyết định, Công văn, Tờ trình, Thông báo, Giấy mời, v.v.)",
          "trichYeu": "Trích yếu nội dung văn bản (không quá 200 ký tự)",
          "nguoiKy": "Họ và tên người ký văn bản",
          "soTrang": "Số trang của văn bản (Giá trị là số nguyên. Nếu không rõ hãy để là 1)",
          "diaDiemHop": "Địa điểm họp (Nếu loại văn bản là Giấy mời/Thông báo họp)",
          "ngayHop": "Ngày họp định dạng YYYY-MM-DD (Nếu loại văn bản là Giấy mời/Thông báo họp)",
          "thoiGianHop": "Thời gian họp bổ sung (Giờ/Phút) (Nếu loại văn bản là Giấy mời/Thông báo/Lịch họp, ví dụ: '08:00' hoặc '14h30')"
        }`;
        const apiKey = process.env.GEMINI_API_KEY || request.data.apiKey;

        if (!apiKey) {
            console.error("[ERROR] Missing Gemini API Key");
            throw new Error("Chưa cấu hình API Key cho Gemini AI (GEMINI_API_KEY).");
        }

        console.log(`[DEBUG] API Key (first 6 chars): ${apiKey.substring(0, 6)}...`);
        const fetch = require('node-fetch');

        console.log(`[DEBUG] Diagnostics: Key Prefix=${apiKey.substring(0, 7)}, Mime=${fileMimeType}`);

        // 4. Gọi Gemini để OCR (Retry thông minh: Models & Configs)
        const retryModels = ["gemini-2.0-flash", "gemini-2.5-flash", "gemini-1.5-flash"];
        let ocrResult = {};
        let textResult = "";
        let lastError = "";

        // Tối ưu Payload bằng cách cắt PDF (chỉ lấy max 3 trang đầu)
        let geminiBase64Content = base64Content;
        if (fileMimeType === 'application/pdf') {
            try {
                const { PDFDocument } = require('pdf-lib');
                const pdfDoc = await PDFDocument.load(Buffer.from(base64Content, 'base64'));
                const pageCount = pdfDoc.getPageCount();
                if (pageCount > 3) {
                    const newPdf = await PDFDocument.create();
                    const copiedPages = await newPdf.copyPages(pdfDoc, [0, 1, 2]); // 3 trang đầu
                    copiedPages.forEach((page) => newPdf.addPage(page));
                    const pdfBytes = await newPdf.save();
                    geminiBase64Content = Buffer.from(pdfBytes).toString('base64');
                    console.log(`[DEBUG] Cắt ngắn PDF từ ${pageCount} trang xuống 3 trang cho Gemini OCR để tối ưu Token.`);
                }
            } catch (e) {
                console.error("[ERROR] Không thể cắt ngắn PDF (Fallback sang full PDF):", e.message);
            }
        }

        for (const modelName of retryModels) {
            try {
                console.log(`[DEBUG] Trying Gemini v1beta with ${modelName}...`);
                const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

                // Payload 1: Có JSON mode (thử camelCase)
                const payloadWithJson = {
                    contents: [{
                        parts: [
                            { text: prompt },
                            { inline_data: { mime_type: fileMimeType, data: geminiBase64Content } }
                        ]
                    }],
                    generationConfig: { responseMimeType: "application/json" }
                };

                let response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payloadWithJson)
                });
                let data = await response.json();

                // Nếu lỗi 400 (sai schema), thử lại không có JSON mode
                if (!response.ok && response.status === 400) {
                    console.log(`[DEBUG] ${modelName} rejected JSON mode, retrying without config...`);
                    const payloadSimple = {
                        contents: [{
                            parts: [
                                { text: prompt },
                                { inline_data: { mime_type: fileMimeType, data: geminiBase64Content } }
                            ]
                        }]
                    };
                    response = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payloadSimple)
                    });
                    data = await response.json();
                }

                if (response.ok && data.candidates && data.candidates[0].content) {
                    textResult = data.candidates[0].content.parts[0].text;
                    console.log(`[DEBUG] Success with ${modelName}`);
                    break;
                } else {
                    lastError = data.error ? `${data.error.status}: ${data.error.message}` : "Lỗi không xác định";
                    console.warn(`[DEBUG] ${modelName} failed: ${lastError}`);
                }
            } catch (err) {
                lastError = `Fetch failed: ${err.message}`;
                console.error(`[DEBUG] Error calling ${modelName}:`, err.message);
            }
        }

        if (textResult) {
            console.log("[DEBUG] Raw AI Text received.");
        } else {
            // Chẩn đoán nếu tất cả thất bại
            let modelsDiag = "";
            try {
                const lRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
                const lData = await lRes.json();
                modelsDiag = lData.models ? lData.models.map(m => m.name.split('/').pop()).join(', ') : "trống";
            } catch (e) { modelsDiag = "không check được"; }

            ocrResult = {
                soKyHieu: "LỖI KẾT NỐI AI",
                trichYeu: `Tất cả model đều lỗi. Lỗi cuối: ${lastError}. Models khả dụng cho key này: ${modelsDiag}`
            };
        }

        if (textResult && !ocrResult.soKyHieu) {
            const jsonMatch = textResult.match(/[{\[][\s\S]*[}\]]/);
            if (jsonMatch) {
                try {
                    const parsed = JSON.parse(jsonMatch[0]);
                    ocrResult = Array.isArray(parsed) ? (parsed[0] || {}) : parsed;
                } catch (pe) {
                    ocrResult = { trichYeu: `Parse JSON lỗi: ${pe.message}. Thô: ${textResult.substring(0, 100)}` };
                }
            } else {
                ocrResult = { trichYeu: `AI không trả về JSON. Thô: ${textResult.substring(0, 100)}` };
            }
        }

        // 5. Tạo/Cập nhật Hồ sơ tài liệu
        const targetDocId = docId || db.collection("vanban").doc().id;
        const documentData = {
            id: targetDocId,
            trangThaiDuLieu: "REVIEWING",
            soKyHieu: ocrResult.soKyHieu || "",
            ngayBanHanh: ocrResult.ngayBanHanh || "",
            coQuanBanHanh: ocrResult.coQuanBanHanh || "",
            loaiVanBan: ocrResult.loaiVanBan || "",
            trichYeu: ocrResult.trichYeu || "",
            nguoiKy: ocrResult.nguoiKy || "",
            fileNameOriginal: fileName,
            driveFileId_Original: driveFileId,
            webViewLink: webViewLink,
            dinhKem: dinhKem || [],
            fileSize: totalSizeBytes || 0,
            soTrang: ocrResult.soTrang || 1,
            diaDiemHop: ocrResult.diaDiemHop || "",
            ngayHop: ocrResult.ngayHop || "",
            thoiGianHop: ocrResult.thoiGianHop || "",
            history: admin.firestore.FieldValue.arrayUnion({
                action: docId ? "AI_RECHECK" : "UPLOAD_AND_OCR",
                userId: request.auth.uid,
                userEmail: request.auth.token.email || "Unknown",
                timestamp: new Date().toISOString()
            }),
            createdAt: docId ? undefined : new Date().toISOString(), // Chỉ set createdAt nếu tạo mới
            updatedAt: new Date().toISOString(),
            nodeId: nodeId || null
        };

        // Loại bỏ các trường undefined để tránh lỗi Firestore
        Object.keys(documentData).forEach(key => documentData[key] === undefined && delete documentData[key]);

        await db.collection("vanban").doc(targetDocId).set(documentData, { merge: true });

        return {
            success: true,
            docId: targetDocId,
            data: documentData
        };

        return { success: true, docId: newDocId, data: documentData };
    } catch (error) {
        console.error("processDocumentOCR Error:", error);
        throw new HttpsError("internal", error.message);
    }
});


// ==========================================
// Bước 3: Auto-Rename & Move (Khi nhấn Lưu trên WebApp -> State -> COMPLETED)
// ==========================================
exports.onDocumentStatusUpdate = onDocumentUpdated("vanban/{docId}", async (event) => {
    const newValue = event.data.after.data();
    const previousValue = event.data.before.data();

    // Chỉ kích hoạt khi trạng thái chuyển từ REVIEWING -> COMPLETED
    if (previousValue.trangThaiDuLieu === "REVIEWING" && newValue.trangThaiDuLieu === "COMPLETED") {
        try {
            const drive = await getDriveService();
            const settingsDoc = await db.collection("settings").doc("driveFolders").get();
            const folders = settingsDoc.exists ? settingsDoc.data() : null;

            // Xác định thư mục đích
            let targetFolderId = null;
            if (folders) {
                // Logic phân loại mạnh mẽ: Kiểm tra phanLoaiDoc hoặc phanLoaiVanBan
                const isOutgoing =
                    newValue.phanLoaiDoc === "di" ||
                    newValue.phanLoaiVanBan === "OUTGOING" ||
                    (newValue.loaiVanBan && newValue.loaiVanBan.toLowerCase().includes('đi'));

                if (isOutgoing) targetFolderId = folders.vanBanDiId;
                else targetFolderId = folders.vanBanDenId;
            }

            // Hàm helper di chuyển file (Move)
            const moveFile = async (fileId, newName = null, newParentId = null) => {
                if (!fileId) return;

                // Lấy thông tin thư mục cha hiện tại
                let previousParentsStr = "";
                try {
                    const fileMeta = await drive.files.get({
                        fileId: fileId,
                        fields: 'parents'
                    });
                    if (fileMeta.data.parents) {
                        previousParentsStr = fileMeta.data.parents.join(',');
                    }
                } catch (e) {
                    console.log(`Lỗi khi lấy parents của file ${fileId}:`, e.message);
                }

                const params = {
                    fileId: fileId,
                    supportsAllDrives: true,
                    resource: {}
                };

                if (newName) {
                    params.resource.name = newName;
                }

                if (newParentId) {
                    // Nếu đã ở đúng thư mục thì không cần đổi parent
                    if (!previousParentsStr.includes(newParentId)) {
                        params.addParents = newParentId;
                        if (previousParentsStr) {
                            params.removeParents = previousParentsStr;
                        }
                    }
                }

                await drive.files.update(params);

                // [MỚI] Đảm bảo Admin có quyền sau khi moved/named
                await ensureAdminPermission(drive, fileId);
            };

            // 1. Rename & Move Main File
            let newFileName = newValue.fileNameStandardized;

            if (!newFileName) {
                const safeSoKyHieu = (newValue.soKyHieu || "NOSO").replace(/\//g, "_");
                const safeTrichYeu = (newValue.trichYeu || "KhongTrichYeu")
                    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                    .replace(/[^a-zA-Z0-9 ]/g, "")
                    .replace(/\s+/g, "_")
                    .substring(0, 50);
                newFileName = `${newValue.ngayBanHanh || "NODATE"}_${safeSoKyHieu}_${safeTrichYeu}.pdf`;
            }

            // Đảm bảo có đuôi .pdf nếu là PDF
            if (newValue.fileNameOriginal && newValue.fileNameOriginal.toLowerCase().endsWith('.pdf') && !newFileName.toLowerCase().endsWith('.pdf')) {
                newFileName += '.pdf';
            }

            if (newValue.driveFileId_Original) {
                await moveFile(newValue.driveFileId_Original, newFileName, targetFolderId);
                await event.data.after.ref.update({ fileNameStandardized: newFileName });
            }

            // 2. Move & Auto-Rename Attachments
            if (newValue.dinhKem && Array.isArray(newValue.dinhKem)) {
                // Lấy tên cơ sở của file chính (bỏ đuôi .pdf)
                let baseMainFileName = newFileName;
                if (baseMainFileName.toLowerCase().endsWith('.pdf')) {
                    baseMainFileName = baseMainFileName.substring(0, baseMainFileName.length - 4);
                }

                let index = 1;
                let attachmentUpdated = false;

                for (const attachment of newValue.dinhKem) {
                    if (attachment.driveFileId) {
                        try {
                            const originalFileName = attachment.fileName || "Attachment";
                            // Lấy đuôi mở rộng (ví dụ .docx)
                            const fileExtMatch = originalFileName.match(/\.[0-9a-z]+$/i);
                            const originalExt = fileExtMatch ? fileExtMatch[0] : '';

                            // Tạo tên mới: TenFileChinh_DinhKem_1.docx
                            const newAttachmentName = `${baseMainFileName}_DinhKem_${index}${originalExt}`;

                            await moveFile(attachment.driveFileId, newAttachmentName, targetFolderId);

                            if (attachment.fileName !== newAttachmentName) {
                                attachment.fileName = newAttachmentName;
                                attachmentUpdated = true;
                            }

                            index++;
                        } catch (err) {
                            console.error(`Error moving attachment ${attachment.driveFileId}:`, err);
                        }
                    }
                }

                // Cập nhật database nếu có tên file đính kèm thay đổi
                if (attachmentUpdated) {
                    await event.data.after.ref.update({ dinhKem: newValue.dinhKem });
                }
            }

            console.log(`Auto-Processed Main File ${newValue.driveFileId_Original} by moving directly to target folder.`);
        } catch (error) {
            console.error("Auto Rename/Link Error:", error);
        }
    }
});

// Xóa Busboy API. Dùng Base64 Firebase Callable bên dưới.

// ==========================================
// API UPLOAD TỆP (Dạng Base64 Callable)
// ==========================================
// ==========================================
// API UPLOAD TỆP (Dạng Base64 Callable - Vượt rào cản Service Account Quota)
// ==========================================
exports.uploadFileToDriveBase64 = onCall({ timeoutSeconds: 300 }, async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Bạn phải đăng nhập để thực hiện thao tác này.");
    }
    try {
        const { fileName, mimeType, base64Data, targetParentId } = request.data;
        if (!fileName || !base64Data) {
            throw new Error("Tuyệt đối phải cung cấp fileName và base64Data để tải tệp định kèm lên hệ thống lưu trữ gốc của CDE.");
        }

        const drive = await getDriveService();

        const fileMetadata = {
            name: fileName,
            parents: targetParentId ? [targetParentId] : []
        };

        const bufferStream = new (require("stream").PassThrough)();
        bufferStream.end(Buffer.from(base64Data, "base64"));

        const media = {
            mimeType: mimeType || "application/octet-stream",
            body: bufferStream
        };

        const uploadedFile = await drive.files.create({
            supportsAllDrives: true,
            resource: fileMetadata,
            media: media,
            fields: "id, name, webViewLink, webContentLink"
        });

        // Chia sẻ công khai (Công ty) hoặc Chỉnh sửa để mọi người có thể xem trên CDE-ROOT
        try {
            await drive.permissions.create({
                fileId: uploadedFile.data.id,
                requestBody: {
                    role: 'reader',
                    type: 'anyone'
                }
            });
        } catch (permErr) {
            console.log("Cảnh báo: Không thể set permissions 'anyone' cho file này:", permErr.message);
        }

        // [MỚI] Đảm bảo Admin có quyền trên file upload qua Base64 API
        await ensureAdminPermission(drive, uploadedFile.data.id);

        return {
            success: true,
            file: uploadedFile.data
        };
    } catch (error) {
        console.error("Upload Base64 OAuth Error:", error);
        throw new HttpsError("internal", error.message);
    }
});

// ==========================================
// PHASE 4: GẮN VĂN BẢN VÀO NHÁNH (Mindmap Node)
// ==========================================
exports.attachDocumentToNode = onCall({ timeoutSeconds: 60 }, async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Bạn phải đăng nhập để thực hiện thao tác này.");
    }

    try {
        const { vanBanId, nodeId, projectId } = request.data;
        const drive = await getDriveService();

        // 1. Get origin Document info
        const vbDoc = await db.collection("vanban").doc(vanBanId).get();
        if (!vbDoc.exists) throw new Error("Văn bản gốc không tồn tại");
        const vbData = vbDoc.data();

        // 2. Get Node info
        const nodeDoc = await db.collection("project_nodes").doc(nodeId).get();
        if (!nodeDoc.exists) throw new Error("Nhánh Mindmap không tồn tại");
        const nodeData = nodeDoc.data();

        let copiedFileId = null;

        // 3. Link file to Node's Drive Folder via Shortcut
        if (nodeData.driveFolderId && vbData.driveFileId_Original) {
            try {
                await drive.files.create({
                    supportsAllDrives: true,
                    resource: {
                        name: (vbData.fileNameStandardized || vbData.fileNameOriginal || "Link") + " (Shortcut)",
                        mimeType: 'application/vnd.google-apps.shortcut',
                        shortcutDetails: { targetId: vbData.driveFileId_Original },
                        parents: [nodeData.driveFolderId]
                    }
                });
                copiedFileId = vbData.driveFileId_Original;
                console.log(`Created shortcut for file ${copiedFileId} in Node Folder: ${nodeData.driveFolderId}`);
            } catch (err) {
                console.error(`Error creating shortcut for node: ${err.message}`);
            }
        }

        // 4. Add link to vanban_node_links collection
        const linkRef = db.collection("vanban_node_links").doc();
        await linkRef.set({
            id: linkRef.id,
            vanBanId: vanBanId,
            nodeId: nodeId,
            projectId: projectId,
            createdAt: new Date().toISOString(),
            driveShortcutId: copiedFileId // Lưu ID của file gốc mà shortcut trỏ tới
        });

        return { success: true, linkId: linkRef.id };

    } catch (error) {
        console.error("attachDocumentToNode Error:", error);
        throw new HttpsError("internal", error.message);
    }
});

// ==========================================
// TÍNH TOÁN QUOTA DRIVE CÁC FILE LỖI (BACKFILL API)
// ==========================================
exports.backfillMissingFileSize = onCall({ timeoutSeconds: 540 }, async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Bạn phải đăng nhập để thực hiện thao tác này.");
    }
    try {
        const drive = await getDriveService();
        const docsSnap = await db.collection("vanban").get();
        let syncedCount = 0;

        for (const docSnap of docsSnap.docs) {
            const data = docSnap.data();
            // Nếu fileSize rỗng hoặc 0 thì đi fetch API Drive
            if (!data.fileSize || data.fileSize === 0) {
                let totalBytes = 0;

                // 1. Fetch file gốc
                if (data.driveFileId_Original) {
                    try {
                        const fileMeta = await drive.files.get({
                            fileId: data.driveFileId_Original,
                            fields: "size"
                        });
                        totalBytes += parseInt(fileMeta.data.size || "0", 10);
                    } catch (e) {
                        console.error(`Không lấy được quota file gốc ${data.driveFileId_Original}:`, e.message);
                    }
                }

                // 2. Fetch file đính kèm
                if (data.dinhKem && Array.isArray(data.dinhKem)) {
                    for (const attachment of data.dinhKem) {
                        if (attachment.driveFileId) {
                            try {
                                const attMeta = await drive.files.get({
                                    fileId: attachment.driveFileId,
                                    fields: "size"
                                });
                                totalBytes += parseInt(attMeta.data.size || "0", 10);
                            } catch (e) {
                                console.error(`Lỗi lấy quota đính kèm ${attachment.driveFileId}:`, e.message);
                            }
                        }
                    }
                }

                // 3. Update lại Firestore
                if (totalBytes > 0) {
                    await db.collection("vanban").doc(docSnap.id).update({ fileSize: totalBytes });
                    syncedCount++;
                    console.log(`Đã cập nhật dung lượng cho VB ${docSnap.id}: ${totalBytes} bytes`);
                }
            }
        }

        return {
            success: true,
            message: `Đã đồng bộ lại kích thước cho ${syncedCount} tài liệu cũ.`
        };
    } catch (error) {
        console.error("Lỗi Backfill:", error);
        throw new HttpsError("internal", error.message);
    }
});


// ==========================================
// PHASE 1/4: Khởi tạo Hệ thống Folder trên Drive
// ==========================================

// ==========================================
// PHASE 1/4: Reset & Làm sạch Drive (NUCLEAR OPTION)
// ==========================================
exports.resetDriveStructure = onCall({ timeoutSeconds: 540 }, async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Bạn phải đăng nhập để thực hiện thao tác này.");
    }
    try {
        // Kiểm tra quyền Admin từ Firestore
        const userDoc = await db.collection("users").doc(request.auth.uid).get();
        const userData = userDoc.exists ? userDoc.data() : null;
        const isAdmin = (userData?.role === 'admin') || (request.auth.token.email === DRIVE_ADMIN_EMAIL);

        if (!isAdmin) {
            throw new HttpsError("permission-denied", "Chỉ Admin hệ thống mới có quyền Reset Drive.");
        }

        const drive = await getDriveService();

        /**
         * Hàm hỗ trợ 1: Xóa đệ quy trong thư mục gốc (xử lý các file có thể không do SA sở hữu nhưng SA có quyền xóa)
         */
        const deleteFolderRecursive = async (folderId) => {
            if (!folderId) return;
            try {
                const res = await drive.files.list({
                    q: `'${folderId}' in parents and trashed = false`,
                    fields: "files(id, name, mimeType)",
                    supportsAllDrives: true,
                    includeItemsFromAllDrives: true
                });

                const files = res.data.files || [];
                for (const file of files) {
                    if (file.mimeType === 'application/vnd.google-apps.folder') {
                        await deleteFolderRecursive(file.id);
                    }
                    try {
                        await drive.files.delete({ fileId: file.id, supportsAllDrives: true });
                        console.log(`[RESET] Recursively deleted: ${file.name} (${file.id})`);
                    } catch (e) {
                        console.warn(`[RESET] Failed to recursively delete ${file.id}: ${e.message}`);
                    }
                }
            } catch (err) {
                console.error(`[RESET] Error scanning folder ${folderId}:`, err.message);
            }
        };

        /**
         * Hàm hỗ trợ 2: Càn quét cấp bộ (Deep Sweep).
         * Xóa TẤT CẢ folder và lối tắt (shortcuts) do Service Account tạo ra trên toàn Drive, triệt tiêu tệp mồ côi.
         */
        const deepSweepDrive = async () => {
            console.log("[RESET] Starting Deep Sweep for orphaned SA folders & shortcuts...");
            let pageToken = null;
            let deletedCount = 0;
            do {
                try {
                    const res = await drive.files.list({
                        q: "trashed = false and 'me' in owners and (mimeType = 'application/vnd.google-apps.folder' or mimeType = 'application/vnd.google-apps.shortcut')",
                        fields: "nextPageToken, files(id, name, mimeType)",
                        pageToken: pageToken,
                        supportsAllDrives: true,
                        includeItemsFromAllDrives: true
                    });
                    const files = res.data.files || [];
                    for (const file of files) {
                        try {
                            await drive.files.delete({ fileId: file.id, supportsAllDrives: true });
                            console.log(`[RESET-SWEEP] Deleted orphaned item: ${file.name} (${file.id})`);
                            deletedCount++;
                        } catch (e) {
                            console.warn(`[RESET-SWEEP] Failed to sweep ${file.name} (${file.id}): ${e.message}`);
                        }
                    }
                    pageToken = res.data.nextPageToken;
                } catch (err) {
                    console.error("[RESET-SWEEP] Error during sweep:", err.message);
                    break;
                }
            } while (pageToken);
            console.log(`[RESET] Deep Sweep completed. Deleted ${deletedCount} orphaned items.`);
        };

        // 1. Dọn dẹp dựa trên ID hiện tại
        const settingsDoc = await db.collection("settings").doc("driveFolders").get();
        if (settingsDoc.exists) {
            const folders = settingsDoc.data();
            if (folders.rootId) {
                console.log(`[RESET] Deep cleaning root folder via ID: ${folders.rootId}`);
                await deleteFolderRecursive(folders.rootId);
                try {
                    await drive.files.delete({ fileId: folders.rootId, supportsAllDrives: true });
                    console.log(`[RESET] Successfully deleted root folder ${folders.rootId}`);
                } catch (driveErr) {
                    console.warn(`[RESET] Final root deletion skipped: ${driveErr.message}`);
                }
            }
        }

        // 2. Càn quét toàn bộ tệp mồ côi
        await deepSweepDrive();

        // 2. Xóa cấu hình trong Firestore settings
        await db.collection("settings").doc("driveFolders").delete();
        console.log("[RESET] Deleted settings/driveFolders");

        // 3. Xóa Drive ID trong tất cả project_nodes
        const nodesSnap = await db.collection("project_nodes").get();
        const batch = db.batch();
        nodesSnap.docs.forEach(docSnap => {
            batch.update(docSnap.ref, {
                driveFolderId: admin.firestore.FieldValue.delete(),
                driveFolderLink: admin.firestore.FieldValue.delete()
            });
        });
        await batch.commit();
        console.log(`[RESET] Cleared Drive IDs from ${nodesSnap.size} nodes.`);

        return { success: true, message: "Hệ thống đã dọn dẹp sạch sâu toàn bộ Drive rác. Bạn có thể thực hiện đồng bộ lại." };
    } catch (error) {
        console.error("resetDriveStructure Error:", error);
        throw new HttpsError("internal", error.message);
    }
});

// ==========================================
// PHASE 1/4: Khởi tạo & Đồng bộ Hệ thống Folder trên Drive
// ==========================================

// HTTP Callable: Đồng bộ toàn bộ cấu trúc hiện tại lên Drive
exports.syncDriveStructure = onCall({ timeoutSeconds: 540 }, async (request) => {
    try {
        // Kiểm tra quyền Admin hoặc Manager từ Firestore
        const userDoc = await db.collection("users").doc(request.auth.uid).get();
        const userData = userDoc.exists ? userDoc.data() : null;
        const hasPermission = (userData?.role === 'admin' || userData?.role === 'manager') || (request.auth.token.email === DRIVE_ADMIN_EMAIL);

        if (!hasPermission) {
            throw new HttpsError("permission-denied", "Bạn không có quyền thực hiện đồng bộ Drive.");
        }

        const drive = await getDriveService();

        // 1. Khởi tạo/Lấy thư mục gốc
        let settingsDoc = await db.collection("settings").doc("driveFolders").get();
        let folders = settingsDoc.exists ? settingsDoc.data() : {};

        const createFolder = async (name, parentId = null) => {
            // [DEDUPLICATION] Tìm kiếm trước khi tạo
            const existing = await findExistingItem(drive, name, parentId, "application/vnd.google-apps.folder");
            if (existing) {
                console.log(`[DEBUG] Found existing folder: ${name} (${existing.id})`);
                return existing;
            }

            const folder = await drive.files.create({
                requestBody: {
                    name: name || "Chưa đặt tên",
                    mimeType: "application/vnd.google-apps.folder",
                    parents: parentId ? [parentId] : []
                },
                fields: "id, webViewLink"
            });
            return folder.data;
        };

        if (!folders.rootId) {
            const root = await createFolder("Hệ thống CDE - Ban HTKT");
            folders.rootId = root.id;
            // Cấp quyền Admin cho Root mới
            await ensureAdminPermission(drive, folders.rootId);
        }

        // Luôn đảm bảo cấp quyền cho Admin và người dùng thực hiện lệnh (nếu khác nhau)
        await ensureAdminPermission(drive, folders.rootId);

        if (request.auth.token.email && request.auth.token.email !== DRIVE_ADMIN_EMAIL) {
            console.log(`[DEBUG] Granting writer permission for session user ${request.auth.token.email} on folder ${folders.rootId}`);
            try {
                await drive.permissions.create({
                    fileId: folders.rootId,
                    requestBody: { type: "user", role: "writer", emailAddress: request.auth.token.email }
                });
            } catch (err) {
                // Nếu đã có quyền rồi thì Google sẽ báo lỗi, ta có thể bỏ qua
                console.log("[DEBUG] Permission already exists or error:", err.message);
            }
        }
        if (!folders.vanBanDenId) {
            const f = await createFolder("1. Văn Bản Đến", folders.rootId);
            folders.vanBanDenId = f.id;
        }
        if (!folders.vanBanDiId) {
            const f = await createFolder("2. Văn Bản Đi", folders.rootId);
            folders.vanBanDiId = f.id;
        }
        if (!folders.projectsRootId) {
            const f = await createFolder("3. Hồ sơ Dự án", folders.rootId);
            folders.projectsRootId = f.id;
        }

        await db.collection("settings").doc("driveFolders").set({ ...folders, updatedAt: new Date().toISOString() });

        // 2. Quét và đồng bộ project_nodes (Backfill)
        const nodesSnap = await db.collection("project_nodes").get();
        const nodes = nodesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        let count = 0;
        const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

        const syncNodeRecursive = async (parentId, driveParentId, prefix = "") => {
            // Lọc con và sắp xếp theo order/createdAt để nhất quán với Frontend
            const children = nodes.filter(n => {
                const pId = n.parentId === "" ? null : (n.parentId || null);
                return pId === parentId && n.type !== 'TASK';
            }).sort((a, b) => (a.order ?? a.createdAt) - (b.order ?? b.createdAt));

            for (let i = 0; i < children.length; i++) {
                const node = children[i];
                const currentPrefix = prefix ? `${prefix}${i + 1}.` : `${i + 1}.`;
                const expectedName = `${currentPrefix} ${node.name}`;

                let currentDriveId = node.driveFolderId;

                if (!currentDriveId) {
                    try {
                        const folder = await createFolder(expectedName, driveParentId);
                        currentDriveId = folder.id;
                        await db.collection("project_nodes").doc(node.id).update({
                            driveFolderId: currentDriveId,
                            driveFolderLink: folder.webViewLink || `https://drive.google.com/drive/folders/${currentDriveId}`
                        });
                        count++;
                        console.log(`[DEBUG] Created new folder for node ${node.id}: ${expectedName}`);
                        await sleep(400);
                    } catch (err) {
                        console.error(`Lỗi tạo folder cho node ${node.id}:`, err.message);
                    }
                } else {
                    try {
                        const fileMeta = await drive.files.get({
                            fileId: currentDriveId,
                            fields: "id, name"
                        });
                        if (fileMeta.data.name !== expectedName) {
                            await drive.files.update({
                                fileId: currentDriveId,
                                requestBody: { name: expectedName }
                            });
                            console.log(`[DEBUG] Renamed folder ${currentDriveId} to ${expectedName}`);
                        }
                    } catch (err) {
                        if (err.code === 404) {
                            console.warn(`[DEBUG] Folder ${currentDriveId} not found (404). Recreating...`);
                            const folder = await createFolder(expectedName, driveParentId);
                            currentDriveId = folder.id;
                            await db.collection("project_nodes").doc(node.id).update({
                                driveFolderId: currentDriveId,
                                driveFolderLink: folder.webViewLink || `https://drive.google.com/drive/folders/${currentDriveId}`
                            });
                            console.log(`[DEBUG] Recreated missing folder for node ${node.id}: ${expectedName}`);
                        } else {
                            console.error(`Lỗi kiểm tra/cập nhật folder ${currentDriveId}:`, err.message);
                        }
                    }
                }
                // [PERMISSION FIX] Luôn đảm bảo Admin có quyền Writer trên folder này
                if (currentDriveId) {
                    await ensureAdminPermission(drive, currentDriveId);
                }

                // Tiếp tục đệ quy cho các con - RESET prefix nếu đây là cấp Dự án gốc (level 0)
                if (currentDriveId) {
                    const isRoot = !prefix; // Trong code này, prefix "" tương ứng cấp 0
                    await syncNodeRecursive(node.id, currentDriveId, isRoot ? "" : currentPrefix);
                }
            }
        };

        // Gọi hàm đệ quy để bắt đầu tạo/cập nhật cấu trúc
        await syncNodeRecursive(null, folders.projectsRootId);

        // 3. Đồng bộ Tệp tin Văn bản (SỬ DỤNG LINK - MULTI-PARENT)
        const docsSnap = await db.collection("vanban").get();
        let fileCount = 0;
        const debugLogs = [];
        debugLogs.push(`Found ${docsSnap.size} docs in 'vanban'`);

        for (const doc of docsSnap.docs) {
            const data = doc.data();
            const fileId = data.driveFileId_Original || data.driveId || data.fileId;
            if (fileId) {
                try {
                    // Logic phân loại mạnh mẽ: Kiểm tra phanLoaiVanBan, phanLoaiDoc, hoặc chuỗi loaiVanBan
                    const isOutgoing =
                        data.phanLoaiVanBan === 'OUTGOING' ||
                        data.phanLoaiDoc === 'di' ||
                        (data.loaiVanBan && data.loaiVanBan.toLowerCase().includes('đi'));

                    const targetFolderId = isOutgoing ? folders.vanBanDiId : folders.vanBanDenId;
                    const folderName = isOutgoing ? "Văn bản Đi" : "Văn bản Đến";

                    // [DEDUPLICATION] Kiểm tra shortcut đã tồn tại chưa
                    const shortcutName = (data.fileNameStandardized || data.fileNameOriginal || "VanBan") + " (Shortcut)";
                    const existingShortcut = await findExistingItem(drive, shortcutName, targetFolderId, 'application/vnd.google-apps.shortcut');

                    if (!existingShortcut) {
                        // Tạo Shortcut thay vì addParents (Tránh lỗi multi-parent)
                        await drive.files.create({
                            supportsAllDrives: true,
                            resource: {
                                name: shortcutName,
                                mimeType: 'application/vnd.google-apps.shortcut',
                                shortcutDetails: { targetId: fileId },
                                parents: [targetFolderId]
                            }
                        });
                        // [PERMISSION FIX] Cấp quyền cho Admin trên shortcut mới
                        const news = await findExistingItem(drive, shortcutName, targetFolderId, 'application/vnd.google-apps.shortcut');
                        if (news) await ensureAdminPermission(drive, news.id);

                        debugLogs.push(`[${fileCount + 1}] Tạo mới: "${data.fileNameOriginal || doc.id}" -> ${folderName}`);
                    } else {
                        debugLogs.push(`[${fileCount + 1}] Đã có: "${data.fileNameOriginal || doc.id}" -> ${folderName}`);
                    }

                    fileCount++;
                    await sleep(200);
                } catch (err) {
                    debugLogs.push(`[!] Lỗi shortcut doc ${doc.id}: ${err.message}`);
                }
            }
        }

        debugLogs.push(`--- Đã đồng bộ ${fileCount} văn bản chính ---`);

        // 4. Đồng bộ các Tệp liên kết trong dự án (SỬ DỤNG SHORTCUT)
        const linksSnap = await db.collection("vanban_node_links").get();
        let linkFileCount = 0;
        debugLogs.push(`Bắt đầu đồng bộ ${linksSnap.size} liên kết Mindmap...`);
        for (const linkDoc of linksSnap.docs) {
            const linkData = linkDoc.data();
            const nodeDoc = await db.collection("project_nodes").doc(linkData.nodeId).get();
            const vbDoc = await db.collection("vanban").doc(linkData.vanBanId).get();

            if (nodeDoc.exists && vbDoc.exists) {
                const nodeData = nodeDoc.data();
                const vbData = vbDoc.data();
                const fileId = vbData.driveFileId_Original || vbData.driveId || vbData.fileId;

                if (nodeData.driveFolderId && fileId) {
                    try {
                        const shortcutName = (vbData.fileNameStandardized || vbData.fileNameOriginal || "Link") + " (Shortcut)";
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
                            // [PERMISSION FIX] Cấp quyền cho Admin trên shortcut mới
                            const news = await findExistingItem(drive, shortcutName, nodeData.driveFolderId, 'application/vnd.google-apps.shortcut');
                            if (news) await ensureAdminPermission(drive, news.id);

                            debugLogs.push(`[+] Link: "${vbData.fileNameOriginal || linkData.vanBanId}" -> Nhánh: ${nodeData.name}`);
                        } else {
                            debugLogs.push(`[~] Đã có Link: "${vbData.fileNameOriginal || linkData.vanBanId}" -> Nhánh: ${nodeData.name}`);
                        }
                        linkFileCount++;
                        await sleep(200);
                    } catch (err) {
                        debugLogs.push(`[!] Lỗi shortcut link ${linkDoc.id}: ${err.message}`);
                    }
                }
            }
        }
        debugLogs.push(`=== HOÀN TẤT: Đồng bộ ${fileCount} file và ${linkFileCount} liên kết dự án. ===`);

        return {
            success: true,
            message: `Hệ thống đã chuẩn hóa xong cấu trúc thư mục và ánh xạ Shortcut lên Drive 2TB.`,
            data: folders,
            debug: debugLogs
        };
    } catch (error) {
        console.error("Sync Folders Error:", error);
        throw new HttpsError("internal", `Lỗi đồng bộ: ${error.message}`);
    }
});

// ==========================================
// PHASE 3 (Bổ sung): GẮN VĂN BẢN VÀO NHÁNH MINDMAP
// ==========================================
// Đã xóa hàm trùng lặp attachDocumentToNode ở đây. Phiên bản chuẩn nằm ở trên.

// ==========================================
// PHASE 5: MINDMAP COLOR CODING (TỰ ĐỘNG ĐỔI MÀU NHÁNH THEO TASK)
// ==========================================
exports.updateNodeColorOnTaskChange = onDocumentWritten("tasks/{taskId}", async (event) => {
    // Lấy nodeId từ dữ liệu mới (hoặc dữ liệu cũ nếu bị xóa)
    const data = event.data.after.exists ? event.data.after.data() : event.data.before.data();
    const nodeId = data.lienKetNodeId;
    if (!nodeId) return null;

    try {
        const tasksSnap = await db.collection("tasks").where("lienKetNodeId", "==", nodeId).get();
        if (tasksSnap.empty) {
            // Không còn Task nào -> trả về màu trắng mặc định
            await db.collection("project_nodes").doc(nodeId).update({ mauSac: "#ffffff" });
            return { success: true, color: "#ffffff" };
        }

        let doneCount = 0;
        let totalCount = 0;

        tasksSnap.forEach(doc => {
            totalCount++;
            if (doc.data().trangThai === "DONE") doneCount++;
        });

        let newColor = "#ffffff";
        if (doneCount === totalCount && totalCount > 0) {
            newColor = "#bbf7d0"; // Xanh lá mạ (Đã xong 100%)
        } else if (doneCount > 0) {
            newColor = "#fef08a"; // Vàng nhạt (Đang tiến hành)
        }

        await db.collection("project_nodes").doc(nodeId).update({ mauSac: newColor });
        console.log(`Updated Node ${nodeId} color to ${newColor} (Progress: ${doneCount}/${totalCount})`);

        return { success: true, color: newColor };
    } catch (e) {
        console.error("Error updating node color:", e);
        return null;
    }
});

// ==========================================
// PHASE 6: WEBHOOK NHẬN DATA TỪ GOOGLE SHEET (GAS)
// ==========================================
exports.receiveOCRWebhook = onRequest({ cors: true }, async (req, res) => {
    // Chỉ chấp nhận HTTP POST
    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    try {
        const payload = req.body;

        if (!payload || !payload.driveFileId_Original) {
            return res.status(400).send('Missing required fields');
        }

        const ocrData = payload.ocrData || {};
        const newDocId = db.collection("vanban").doc().id;

        const documentData = {
            id: newDocId,
            trangThaiDuLieu: "REVIEWING",
            soKyHieu: ocrData.soKyHieu || "",
            ngayBanHanh: ocrData.ngayBanHanh || "",
            coQuanBanHanh: ocrData.coQuanBanHanh || "",
            loaiVanBan: ocrData.loaiVanBan || "",
            trichYeu: ocrData.trichYeu || "",
            nguoiKy: ocrData.nguoiKy || "",
            fileNameOriginal: payload.fileNameOriginal || "Unknown",
            driveFileId_Original: payload.driveFileId_Original,
            webViewLink: payload.webViewLink || "",
            dinhKem: [], // App script chỉ scan file chính nên định kèm trống
            fileSize: payload.totalSizeBytes || 0,
            createdAt: new Date().toISOString(),
            source: "GOOGLE_SHEET_OCR"
        };

        // Lưu bản ghi vào Firestore để WebApp tự động lắng nghe (Real-time)
        await db.collection("vanban").doc(newDocId).set(documentData);

        return res.status(200).json({ success: true, docId: newDocId });
    } catch (error) {
        console.error("receiveOCRWebhook Error:", error);
        return res.status(500).send("Internal Server Error: " + error.message);
    }
});

// ==========================================
// PHASE 7: ĐỒNG BỘ CÂY DỰ ÁN LÊN GOOGLE DRIVE
// ==========================================

// Helper Function: Lấy ID thư mục gốc dự án (Projects Root)
async function getProjectsRootFolderId() {
    const settingsDoc = await db.collection("settings").doc("driveFolders").get();
    if (!settingsDoc.exists) return null;
    const folders = settingsDoc.data();
    // Ưu tiên dùng projectsRootId (đã setup tạo), nếu rỗng thì dùng rootId chung
    return folders.projectsRootId || folders.rootId;
}

// Helper Function: Tính toán Tên phân cấp (Ví dụ: "1.2. Mở rộng")
async function getNumberedNodeName(nodeId, nodeName) {
    const nodesSnap = await db.collection("project_nodes").get();
    const nodes = nodesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    let pathIds = [];
    let curr = nodeId;
    while (curr) {
        pathIds.unshift(curr);
        const node = nodes.find(n => n.id === curr);
        curr = node && node.parentId ? node.parentId : null;
    }

    let prefix = "";
    // Bỏ qua cấp dự án gốc (Level 0 - index 0)
    for (let i = 1; i < pathIds.length; i++) {
        const pId = pathIds[i];
        const node = nodes.find(n => n.id === pId);
        if (!node) continue;
        const parentId = node.parentId || null;

        const children = nodes.filter(n => (n.parentId || null) === parentId)
            .sort((a, b) => (a.order ?? a.createdAt) - (b.order ?? b.createdAt));

        const index = children.findIndex(n => n.id === pId);
        if (index !== -1) {
            prefix = prefix ? `${prefix}${index + 1}.` : `${index + 1}.`;
        }
    }

    return prefix ? `${prefix} ${nodeName}` : nodeName;
}

// 1. Tạo Node -> Tạo Folder trên Drive
exports.onProjectNodeCreated = onDocumentCreated("project_nodes/{nodeId}", async (event) => {
    const data = event.data.data();
    const nodeId = event.params.nodeId;
    if (!data.name || data.type === 'TASK') return;

    try {
        const drive = await getDriveService();
        let targetParentId = await getProjectsRootFolderId();

        // Nếu Node này có Cha (nằm lồng bên trong Node khác) -> Tìm Folder ID của Node Cha
        if (data.parentId) {
            const parentDoc = await db.collection("project_nodes").doc(data.parentId).get();
            if (parentDoc.exists && parentDoc.data().driveFolderId) {
                targetParentId = parentDoc.data().driveFolderId;
            }
        }

        if (!targetParentId) {
            console.error("Không tìm thấy Thư mục Cha trên Drive để tạo con cho Node:", nodeId);
            return;
        }

        // Tạo Thư mục Mới trên Drive (Có số thứ tự)
        const expectedName = await getNumberedNodeName(nodeId, data.name);
        const fileMetadata = {
            name: expectedName,
            mimeType: "application/vnd.google-apps.folder",
            parents: [targetParentId]
        };
        const folder = await drive.files.create({
            resource: fileMetadata,
            fields: "id, webViewLink",
        });

        // Cập nhật lại vào Document ở Firestore
        await event.data.ref.update({
            driveFolderId: folder.data.id,
            driveFolderLink: folder.data.webViewLink
        });

        // [MỚI] Đảm bảo Admin có quyền trên folder Node mới
        await ensureAdminPermission(drive, folder.data.id);

        console.log(`Đã tạo thành công thư mục Drive ${folder.data.id} cho Node ${nodeId}`);
    } catch (error) {
        console.error("onProjectNodeCreated Error:", error);
    }
});

// 2. Chỉnh sửa Node -> Đổi tên Folder trên Drive (bao gồm khi thay đổi vị trí/thứ tự)
exports.onProjectNodeUpdated = onDocumentUpdated("project_nodes/{nodeId}", async (event) => {
    const newValue = event.data.after.data();
    const previousValue = event.data.before.data();
    const nodeId = event.params.nodeId;

    const nameChanged = newValue.name !== previousValue.name;
    const orderChanged = newValue.order !== previousValue.order;
    const parentChanged = newValue.parentId !== previousValue.parentId;

    // Bỏ qua các thao tác dành cho TASK (Vì không có Folder Drive)
    if (newValue.type === 'TASK') return;

    // Chỉ xử lý khi có thay đổi liên quan đến tên/vị trí
    if (!nameChanged && !orderChanged && !parentChanged) return;

    try {
        const drive = await getDriveService();

        // Hàm helper đổi tên 1 node trên Drive
        const renameNodeOnDrive = async (nId, nName, nDriveFolderId) => {
            if (!nDriveFolderId) return;
            try {
                const expected = await getNumberedNodeName(nId, nName);
                await drive.files.update({
                    fileId: nDriveFolderId,
                    resource: { name: expected }
                });
                // [MỚI] Đảm bảo Admin có quyền sau khi đổi tên
                await ensureAdminPermission(drive, nDriveFolderId);
                console.log(`Đã đồng bộ tên Drive cho Node ${nId}: ${expected}`);
            } catch (err) {
                console.error(`Lỗi đổi tên Drive Node ${nId}:`, err.message);
            }
        };

        // 1. Đổi tên chính node hiện tại
        await renameNodeOnDrive(nodeId, newValue.name, newValue.driveFolderId);

        // 2. Nếu thứ tự hoặc vị trí cha thay đổi -> đồng bộ tất cả anh em cùng cấp
        if (orderChanged || parentChanged) {
            const nodesSnap = await db.collection("project_nodes").get();
            const allNodes = nodesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

            // Tìm tất cả siblings (cùng parentId với node mới)
            const currentParentId = newValue.parentId || null;
            const siblings = allNodes.filter(n =>
                n.id !== nodeId && (n.parentId || null) === currentParentId && n.driveFolderId
            );

            for (const sib of siblings) {
                await renameNodeOnDrive(sib.id, sib.name, sib.driveFolderId);
            }

            // Nếu đổi cha (di chuyển), cũng phải cập nhật siblings ở vị trí cha cũ
            if (parentChanged) {
                const oldParentId = previousValue.parentId || null;
                const oldSiblings = allNodes.filter(n =>
                    n.id !== nodeId && (n.parentId || null) === oldParentId && n.driveFolderId
                );
                for (const sib of oldSiblings) {
                    await renameNodeOnDrive(sib.id, sib.name, sib.driveFolderId);
                }

                // Di chuyển folder trên Drive sang thư mục cha mới
                if (newValue.driveFolderId) {
                    let newParentDriveId = await getProjectsRootFolderId();
                    if (newValue.parentId) {
                        const parentDoc = await db.collection("project_nodes").doc(newValue.parentId).get();
                        if (parentDoc.exists && parentDoc.data().driveFolderId) {
                            newParentDriveId = parentDoc.data().driveFolderId;
                        }
                    }
                    if (newParentDriveId) {
                        try {
                            // Lấy parent hiện tại trên Drive
                            const file = await drive.files.get({ fileId: newValue.driveFolderId, fields: 'parents' });
                            const previousParents = (file.data.parents || []).join(',');
                            await drive.files.update({
                                fileId: newValue.driveFolderId,
                                addParents: newParentDriveId,
                                removeParents: previousParents,
                                fields: 'id, parents'
                            });
                            // [MỚI] Đảm bảo Admin có quyền sau khi di chuyển thư mục cha
                            await ensureAdminPermission(drive, newValue.driveFolderId);
                            console.log(`Đã di chuyển folder Drive ${newValue.driveFolderId} sang cha mới ${newParentDriveId}`);
                        } catch (moveErr) {
                            console.error("Lỗi di chuyển folder Drive:", moveErr.message);
                        }
                    }
                }
            }
        }
    } catch (error) {
        console.error("onProjectNodeUpdated Error:", error);
    }
});

// 3. Xoá Node -> Xoá (hoặc Đưa vào Thùng Rác) Folder trên Drive
exports.onProjectNodeDeleted = onDocumentDeleted("project_nodes/{nodeId}", async (event) => {
    const data = event.data.data();
    const nodeId = event.params.nodeId;

    if (data.type === 'TASK') return;

    if (data.driveFolderId) {
        try {
            const drive = await getDriveService();
            // Đưa vào thùng rác thay vì xóa vĩnh viễn (để an toàn dữ liệu)
            await drive.files.update({
                fileId: data.driveFolderId,
                resource: { trashed: true }
            });
            console.log(`Đã đưa thư mục Drive của Node ${nodeId} vào Thùng rác`);
        } catch (error) {
            console.error("onProjectNodeDeleted Error:", error);
        }
    }
});

// 4. Khi Đổi tên FIle Văn bản -> Đổi trên trên Drive
exports.onVanBanUpdated = onDocumentUpdated("vanban/{vanBanId}", async (event) => {
    const newVal = event.data.after.data();
    const oldVal = event.data.before.data();

    // Nếu fileNameOriginal thay đổi
    if (newVal.fileNameOriginal && newVal.fileNameOriginal !== oldVal.fileNameOriginal) {
        try {
            const drive = await getDriveService();
            const fileId = newVal.driveFileId_Original || newVal.driveId || newVal.fileId;
            if (fileId) {
                // Rename file gốc
                await drive.files.update({
                    fileId: fileId,
                    requestBody: {
                        name: newVal.fileNameOriginal
                    }
                });
                console.log(`Đổi tên file gốc Drive thành công: ${newVal.fileNameOriginal}`);
            }
        } catch (e) {
            console.error("Lỗi cập nhật tên file vanban trên Drive:", e);
        }
    }
});
