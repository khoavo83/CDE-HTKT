const fs = require('fs');
let code = fs.readFileSync('functions/index.js', 'utf8');

// Remove existing 'const debugLogs = [];' from line 1590
code = code.replace(/const debugLogs = \[\];(\r?\n)/g, '');

// Insert it right at the beginning of the function
code = code.replace(/exports\.syncDriveStructure = onCall\(\{ timeoutSeconds: 540 \}, async \(request\) => \{(\r?\n)/, "exports.syncDriveStructure = onCall({ timeoutSeconds: 540 }, async (request) => {\n    const debugLogs = [];\n");

fs.writeFileSync('functions/index.js', code);
console.log("Fixed debugLogs reference error!");
