/**
 * GOOGLE APPS SCRIPT - AUTO OCR VĂN BẢN (GEMINI 1.5 PRO / FLASH) -> FIREBASE FIRESTORE DIRECT
 * Tác giả: AI (Antigravity Kiến trúc)
 * Tự động quét file PDF trong thư mục Drive, OCR, đẩy lên Sheet và lưu thẳng vào Firebase Firestore bằng REST API.
 * KHÔNG CẦN CLOUD FUNCTIONS, HOÀN TOÀN MIỄN PHÍ.
 */

// ==========================================
// CẤU HÌNH HỆ THỐNG (BẠN CHỈ CẦN SỬA Ở ĐÂY)
// ==========================================
var GEMINI_API_KEY = PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY");
var INPUT_FOLDER_ID = PropertiesService.getScriptProperties().getProperty("INPUT_FOLDER_ID");
var TARGET_SPREADSHEET_ID = PropertiesService.getScriptProperties().getProperty("TARGET_SPREADSHEET_ID");
var SHEET_NAME = "Database"; // Tên của tab Trang tính bạn đã sửa (chú ý chữ D viết hoa)
var MAX_FILES_PER_RUN = 3; // Số file xử lý mỗi 1 phút

// --- FIREBASE SERVICE ACCOUNT CREDENTIALS --- //
// Thay bằng JSON Credentials tải từ Firebase Console
var FIREBASE_PROJECT_ID = "cde-htkt";
var FIREBASE_CLIENT_EMAIL = "firebase-adminsdk-fbsvc@cde-htkt.iam.gserviceaccount.com";
var FIREBASE_PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDL2nbumtdJOyiE\nlX47FNdeEvcuJAp9TdNH9yCVvNofeCx9KYuQA0zGUiVjUiT4HmgXwBrELF0RqDY4\nZOCb5MmThlFBpoovl+bu/UkN1bekd5V4OoVg0ChenurkY0NmueY3+ozNxHiwsIOd\ndo1NVYRXIAkM2yi+cG3B40+HK9Kj3FoXmcBWa3DZdL5USwJXBOoV9RdbFA0dtnJd\nYtgVZ+TMMBHzVQhl8kEoC3nrpDdHwny6McZJMARgn5M6VsIBEAtqCby9fLPCU0M/\nVTLS0uI4puZIt+LKjWz4vV0gjt8dzwTfaninJ9yrYDLY8JUcDKNFZvNNNdcxRrhx\nvzbAPUaTAgMBAAECggEABRrzcVyH+YnVcdb+nAMuTs+ILwWKP7YdwJOKiavhOJPw\nmH5CxDhyiUfDlb4YAyDCOAOnIY4AExhuQ/5LkIvryNm+mjea0vNQCy2YhHpIPAKE\nrnsLHeNIrfBdiJrvZ38bXWaIdTTI78ytfYzB02B9ABbJmaLsqjK0BPzCedINCrtH\nQeQ4NPSSUJGXWvr6pZWbBOxIos9CpQRy/llKLJLBGXjm94C7/405MmUQL+IXzPpu\nj5ol1JasAEvJdJX7y+OcY1ArCJeS17olSFJkzTuWrze52aQTOxM0UTnyg5NGtoHG\nAfRbUwsM2Y534g/t5nPDw+sHrdk//VXWHqWDG0vrBQKBgQDxSyUwOCeJN2Y1QFGV\ncYExnIbZRLkWq+yfJIYFpv3G4VVqS99n/q+QX5Qs30KQVty8RiCHqonQcmcYSUCE\no7hSvuOcvGOSq7keJsRR4RUF2kAt3hGqTi6NJrMl1/36U8lXNJ7Mw1TgHQ2FVM4Z\nHUYVHhrFvtZLc5uLCszKlKvmjwKBgQDYRyXj1VXQttTiPLWWjBokK31w15+JNC39\nZdUdAhoPSGwwJWiCTXWD0B1uf15ZFVPw9LqYlG69eS39ovQVjHoSBbLaXj6is9dc\n+IxWD5y2szfe7oV0dy/Rc1KM5N52HNixd/QiZiD1gT/gc9VgcACnIKteiQjNhHQQ\nLN92onqBvQKBgQCryedRHDmxrJp9ASzUa/oiGyG6n/3ykTam2vb8ITb+mEEaq6gD\nv0S5UgMJq24Vm3IOLRNN43G40SprFQP1Kya46qTcWxe9PbtPJySQcuJnx0n4HemP\nyZfE8K+NGuj8hxiKmLEScWMFKEoPCiCtqrTRphxDeynQkB9Gb8r707tLKwKBgAJl\nV2AcvuSfAeC3t3NBfhCkgrE7UkMc1t2VwTSfD1bYAIrP/0ZiQUkChzDwLEVkXRew\nPljuXAOxUfcbVQTgF4IXmhGdNahrwZkAD93sMlo7xgSsM8JEh70UP/fbmTNJwoTE\nxWmUJA1ULzb3UYfN9dPkIsHbVsOgEgET3i3cQuspAoGAfbs6e3bNpBPZTi077H+c\n9dxAJnNlgBFWyJhXzO0ct2XjHa/kR4WxCDUgxxOPg389ZfmUSh8tsktnHzDlqVOR\nJOq9bODKyUuQ3AmpM550RvxSC/D16cIQpjaBf40RNq1k4fn0/uJs/+cmvFBVdU/Z\n/V9//3IRoziDZbU5Bo7RK/M=\n-----END PRIVATE KEY-----\n";

// ==========================================

function autoProcessNewDocuments() {
    if (!TARGET_SPREADSHEET_ID || !INPUT_FOLDER_ID || !GEMINI_API_KEY) {
        Logger.log("LỖI: Chưa cấu hình đủ TARGET_SPREADSHEET_ID, INPUT_FOLDER_ID hoặc GEMINI_API_KEY trong Thuộc tính tập lệnh!");
        return;
    }

    var folder = DriveApp.getFolderById(INPUT_FOLDER_ID);
    var files = folder.getFilesByType(MimeType.PDF);
    var sheet = SpreadsheetApp.openById(TARGET_SPREADSHEET_ID).getSheetByName(SHEET_NAME);

    if (!sheet) {
        Logger.log("Lỗi: Không tìm thấy Sheet có tên là " + SHEET_NAME);
        return;
    }

    var lastRow = sheet.getLastRow();
    var processedIds = getProcessedFileIds(sheet);

    var count = 0;

    while (files.hasNext() && count < MAX_FILES_PER_RUN) {
        var file = files.next();
        var fileId = file.getId();

        if (!processedIds.includes(fileId)) {
            Logger.log("Đang xử lý file mới: " + file.getName());

            try {
                var base64Data = Utilities.base64Encode(file.getBlob().getBytes());
                var ocrResultJSON = parseDocumentWithGemini(base64Data, "application/pdf");

                if (ocrResultJSON) {
                    // Ghi dữ liệu vào Google Sheet
                    var newRowIndex = lastRow + count + 1;

                    sheet.getRange(newRowIndex, 1).setValue(fileId);
                    sheet.getRange(newRowIndex, 2).setValue(file.getName());
                    sheet.getRange(newRowIndex, 3).setValue(file.getUrl());
                    sheet.getRange(newRowIndex, 4).setValue(ocrResultJSON.soKyHieu || "");
                    sheet.getRange(newRowIndex, 5).setValue(ocrResultJSON.ngayBanHanh || "");
                    sheet.getRange(newRowIndex, 6).setValue(ocrResultJSON.coQuanBanHanh || "");
                    sheet.getRange(newRowIndex, 7).setValue(ocrResultJSON.loaiVanBan || "");
                    sheet.getRange(newRowIndex, 8).setValue(ocrResultJSON.trichYeu || "");
                    sheet.getRange(newRowIndex, 9).setValue(ocrResultJSON.nguoiKy || "");
                    sheet.getRange(newRowIndex, 10).setValue(ocrResultJSON.soTrang || "");
                    sheet.getRange(newRowIndex, 11).setValue("DONE_OCR");
                    sheet.getRange(newRowIndex, 12).setValue(new Date());

                    Logger.log("Đã ghi Sheet thành công: " + file.getName());

                    // GHI THẲNG Database FIREBASE BẰNG TÀI KHOẢN ADMIN (KHÔNG CẦN CHỜ WEBHOOK)
                    writeToFirestore(fileId, file.getName(), file.getUrl(), ocrResultJSON);

                    count++;
                }
            } catch (e) {
                Logger.log("LỖI CỤC BỘ KHI XỬ LÝ " + file.getName() + ": " + e.message);
            }
        }
    }

    if (count === 0) Logger.log("Không có file mới nào cần xử lý.");
    else Logger.log("Đã xử lý xong " + count + " file trong lượt này.");
}

// ------------------------------------------
// HÀM HỖ TRỢ: Lấy danh sách ID đã chạy
// ------------------------------------------
function getProcessedFileIds(sheet) {
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return [];
    var idValues = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    var ids = [];
    for (var i = 0; i < idValues.length; i++) {
        if (idValues[i][0] && idValues[i][0] !== "") ids.push(idValues[i][0].toString());
    }
    return ids;
}

// ------------------------------------------
// HÀM HỖ TRỢ: Gọi API Gemini (REST API)
// ------------------------------------------
function parseDocumentWithGemini(base64Data, mimeType) {
    if (!GEMINI_API_KEY) throw new Error("LỖI: Chưa cấu hình GEMINI_API_KEY trong Thuộc tính tập lệnh!");

    var url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + GEMINI_API_KEY;
    var payload = {
        "contents": [{
            "parts": [
                { "text": "Bạn là một chuyên gia văn thư làm việc tại Việt Nam. Dưới đây là văn bản hành chính tôi đưa bạn. \nYêu cầu trích xuất thông tin thành ĐÚNG định dạng JSON dưới đây. Nếu không rõ thông tin, hãy để giá trị rỗng \"\".\nKHÔNG BAO YẾM TRONG DẤU BACKTICKS (```json...```). Trả về JSON thuần tuý.\n\nCấu trúc:\n{\n  \"soKyHieu\": \"123/QD\",\n  \"ngayBanHanh\": \"YYYY-MM-DD\",\n  \"coQuanBanHanh\": \"UBND ABC\",\n  \"loaiVanBan\": \"Quyết định\",\n  \"trichYeu\": \"Tóm tắt nội dung chính (1 câu duy nhất)\",\n  \"nguoiKy\": \"Trần Văn A\",\n  \"soTrang\": \"Kích thước hoặc độ dài số lượng trang của tệp này (1 chỉ số nguyên duy nhất, ví dụ: 3)\"\n}" },
                { "inlineData": { "mimeType": mimeType, "data": base64Data } }
            ]
        }]
    };

    var options = {
        "method": "POST",
        "contentType": "application/json",
        "payload": JSON.stringify(payload),
        "muteHttpExceptions": true
    };

    var response = UrlFetchApp.fetch(url, options);
    var jsonResponse = JSON.parse(response.getContentText());

    if (response.getResponseCode() !== 200) {
        Logger.log("Lỗi API Gemini: " + response.getContentText());
        throw new Error("Lỗi API Gemini");
    }

    try {
        var responseText = jsonResponse.candidates[0].content.parts[0].text;
        var cleanedJsonString = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
        return JSON.parse(cleanedJsonString);
    } catch (e) {
        throw new Error("Gemini trả về chuỗi JSON không hợp lệ");
    }
}

// ==============================================================================
// PHẦN KẾT NỐI FIREBASE BẰNG OAUTH2 (SERVICE ACCOUNT) TRỰC TIẾP TRÊN CODE
// KHÔNG DÙNG CLOUD FUNCTIONS
// ==============================================================================

// 1. Tạo JWT bằng Service Account
function createJwt() {
    var header = {
        alg: 'RS256',
        typ: 'JWT'
    };
    var now = Math.floor(Date.now() / 1000);
    var payload = {
        iss: FIREBASE_CLIENT_EMAIL,
        sub: FIREBASE_CLIENT_EMAIL,
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600,
        scope: 'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/cloud-platform'
    };

    var encodedHeader = Utilities.base64EncodeWebSafe(JSON.stringify(header)).replace(/=+$/, "");
    var encodedPayload = Utilities.base64EncodeWebSafe(JSON.stringify(payload)).replace(/=+$/, "");
    var signatureInput = encodedHeader + '.' + encodedPayload;

    var key = FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
    var signature = Utilities.computeRsaSha256Signature(signatureInput, key);
    var encodedSignature = Utilities.base64EncodeWebSafe(signature).replace(/=+$/, "");

    return signatureInput + '.' + encodedSignature;
}

// 2. Kêu Google đổi JWT sang Google Access Token
function getGoogleAccessToken() {
    var jwt = createJwt();
    var payload = {
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt
    };

    var options = {
        method: 'post',
        payload: payload,
        muteHttpExceptions: true
    };

    var response = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', options);
    if (response.getResponseCode() == 200) {
        return JSON.parse(response.getContentText()).access_token;
    } else {
        Logger.log('Lỗi lấy Token: ' + response.getContentText());
        return null;
    }
}

// 3. Ghi trực tiếp vào Firestore Database (REST API Google Cloud)
function writeToFirestore(driveId, fileName, driveUrl, ocrData) {
    var token = getGoogleAccessToken();
    if (!token) {
        Logger.log("Không thể tạo kết nối vào Firebase.");
        return;
    }

    var collectionPath = "projects/" + FIREBASE_PROJECT_ID + "/databases/(default)/documents/vanban";
    var url = "https://firestore.googleapis.com/v1/" + collectionPath;

    // Custom hàm tạo UUID 16 kí tự cho ID ngẫu nhiên vì Firestore REST API ko tự tạo bằng POST được tốt
    var newDocId = Utilities.getUuid().replace(/-/g, '').substring(0, 20);
    var timestamp = new Date().toISOString();

    // Bóc dữ liệu OCR chuẩn hóa Firebase (Kiểu String)
    var soKyHieu = ocrData.soKyHieu ? String(ocrData.soKyHieu) : "";
    var ngayBanHanh = ocrData.ngayBanHanh ? String(ocrData.ngayBanHanh) : "";
    var coQuanBanHanh = ocrData.coQuanBanHanh ? String(ocrData.coQuanBanHanh) : "";
    var loaiVanBan = ocrData.loaiVanBan ? String(ocrData.loaiVanBan) : "";
    var trichYeu = ocrData.trichYeu ? String(ocrData.trichYeu) : "";
    var nguoiKy = ocrData.nguoiKy ? String(ocrData.nguoiKy) : "";
    var soTrang = ocrData.soTrang ? String(ocrData.soTrang) : "";

    var firestorePayload = {
        "fields": {
            "id": { "stringValue": newDocId },
            "trangThaiDuLieu": { "stringValue": "REVIEWING" },
            "fileNameOriginal": { "stringValue": fileName },
            "driveFileId_Original": { "stringValue": driveId },
            "webViewLink": { "stringValue": driveUrl },
            "soKyHieu": { "stringValue": soKyHieu },
            "ngayBanHanh": { "stringValue": ngayBanHanh },
            "coQuanBanHanh": { "stringValue": coQuanBanHanh },
            "loaiVanBan": { "stringValue": loaiVanBan },
            "trichYeu": { "stringValue": trichYeu },
            "nguoiKy": { "stringValue": nguoiKy },
            "soTrang": { "stringValue": soTrang },
            "createdAt": { "stringValue": timestamp },
            "source": { "stringValue": "GOOGLE_SHEET_OCR" }
        }
    };

    var options = {
        method: 'post',
        contentType: 'application/json',
        headers: { 'Authorization': 'Bearer ' + token },
        payload: JSON.stringify(firestorePayload),
        muteHttpExceptions: true
    };

    // Nạp Document vào Firestore
    var requestUrl = url + "?documentId=" + newDocId;
    var response = UrlFetchApp.fetch(requestUrl, options);

    if (response.getResponseCode() === 200 || response.getResponseCode() === 201) {
        Logger.log("Chèn Firebase thành công Document ID: " + newDocId);
        return true;
    } else {
        Logger.log("Chèn Firebase thất bại: " + response.getContentText());
        return false;
    }
}

// ==============================================================================
// PHẦN TỰ ĐỘNG CHẠY MỖI PHÚT: KIỂM TRA DRIVE CÓ FILE MỚI KHÔNG (CHẠY 1 LẦN)
// ==============================================================================
function setupRealtimeTrigger() {
    // 1. Xóa các trigger cũ nếu có để tránh chạy đúp
    var triggers = ScriptApp.getProjectTriggers();
    for (var i = 0; i < triggers.length; i++) {
        if (triggers[i].getHandlerFunction() === "autoProcessNewDocuments") {
            ScriptApp.deleteTrigger(triggers[i]);
        }
    }

    // 2. Cài đặt Hẹn giờ theo dõi Google Drive
    // Do Google Drive không có Trigger "Nhận diện ngay khi có file" trong GAS thông thường
    // Nên giải pháp tốt nhất là cài đặt Trigger Hẹn giờ (Mỗi phút quét 1 lượt)
    var trigger = ScriptApp.newTrigger("autoProcessNewDocuments")
        .timeBased()
        .everyMinutes(1)
        .create();

    Logger.log("TUYỆT VỜI! ĐÃ CÀI ĐẶT THÀNH CÔNG TRIGGER THỜI GIAN THEO DÕI DRIVE!");
    Logger.log("-> Từ giờ cứ SAU MỖI 1 PHÚT, hệ thống sẽ tự động quét Drive và nếu có PDF mới, hàm OCR sẽ xử lý ngay lập tức.");
}

// ==============================================================================
// CÔNG CỤ DIỆT BỌ: KIỂM TRA XEM TÀI KHOẢN NÀY ĐƯỢC DÙNG NHỮNG MODEL NÀO
// ==============================================================================
function checkGeminiModels() {
    if (!GEMINI_API_KEY) {
        Logger.log("LỖI: Chưa cấu hình GEMINI_API_KEY");
        return;
    }

    var url = "https://generativelanguage.googleapis.com/v1beta/models?key=" + GEMINI_API_KEY;
    var options = {
        "method": "GET",
        "muteHttpExceptions": true
    };

    var response = UrlFetchApp.fetch(url, options);
    Logger.log("CHÚ Ý! KẾT QUẢ DANH SÁCH AI CỦA BẠN LÀ:");
    Logger.log(response.getContentText());
}
