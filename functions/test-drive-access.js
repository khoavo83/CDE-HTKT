const { google } = require("googleapis");
const path = require("path");

const SERVICE_ACCOUNT_PATH = path.resolve(__dirname, "credentials.json");
const CREDENTIALS = require(SERVICE_ACCOUNT_PATH);

async function testAccess() {
    try {
        const jwtClient = new google.auth.JWT(
            CREDENTIALS.client_email,
            null,
            CREDENTIALS.private_key,
            ["https://www.googleapis.com/auth/drive"]
        );
        await jwtClient.authorize();
        const drive = google.drive({ version: "v3", auth: jwtClient });

        const folderId = "1furSuhinzZI9YXqSRcBrP5tWvKpqsoVx";
        const meta = await drive.files.get({ fileId: folderId, fields: "id, name, capabilities" });
        console.log("Truy cập thành công vào thư mục:", meta.data.name);
        console.log("Quyền (capabilities):", meta.data.capabilities);

        // Try creating a test folder
        const testFolder = await drive.files.create({
            resource: {
                name: "Test Folder Bằng Script",
                mimeType: "application/vnd.google-apps.folder",
                parents: [folderId]
            },
            fields: "id, name"
        });
        console.log("Tạo thư mục thử nghiệm thành công:", testFolder.data.id);

        // Trash the test folder
        await drive.files.update({ fileId: testFolder.data.id, resource: { trashed: true } });
        console.log("Đã đưa thư mục thử nghiệm vào thùng rác.");

    } catch (e) {
        console.error("Lỗi khi truy cập:", e.message);
    }
}
testAccess();
