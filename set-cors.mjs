import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { join } from 'path';

const serviceAccount = JSON.parse(
  readFileSync('f:/My Drive - Khoa/Web App/Ban HTKT/cde-webapp/functions/credentials.json', 'utf8')
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: 'cde-htkt.firebasestorage.app'
});

const bucket = admin.storage().bucket();

const corsConfiguration = [
  {
    origin: ['*'],
    method: ['GET', 'POST', 'PUT', 'DELETE', 'HEAD'],
    responseHeader: ['Content-Type'],
    maxAgeSeconds: 3600
  }
];

try {
  await bucket.setCorsConfiguration(corsConfiguration);
  console.log('Successfully set CORS configuration for bucket cde-htkt.appspot.com');
  process.exit(0);
} catch (error) {
  console.error('Error setting CORS configuration:', error);
  process.exit(1);
}
