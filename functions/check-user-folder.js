const { google } = require('googleapis');
const path = require('path');
const SERVICE_ACCOUNT_PATH = path.resolve(__dirname, 'credentials.json');
const credentials = require(SERVICE_ACCOUNT_PATH);

const jwtClient = new google.auth.JWT(
    credentials.client_email,
    null,
    credentials.private_key,
    ['https://www.googleapis.com/auth/drive']
);

async function checkUserFolder() {
    await jwtClient.authorize();
    const drive = google.drive({ version: 'v3', auth: jwtClient });

    const id = "1NA3CwZ1E-GgeI7GNRo_mDtw1bWqV9KgS";
    console.log(`Checking metadata for folder: ${id}...`);
    try {
        const meta = await drive.files.get({
            fileId: id,
            fields: "id, name, driveId, shared, ownedByMe, owners, capabilities",
            supportsAllDrives: true
        });
        console.log(JSON.stringify(meta.data, null, 2));
    } catch (e) {
        console.error(`Error checking ${id}:`, e.message);
    }
}

checkUserFolder();
