import admin from 'firebase-admin';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(
  readFileSync('f:/My Drive - Khoa/Web App/Ban HTKT/cde-webapp/functions/credentials.json', 'utf8')
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const storage = admin.storage();
try {
  const [buckets] = await storage.getBuckets();
  console.log('Available buckets:');
  buckets.forEach(bucket => console.log(' - ' + bucket.name));
  process.exit(0);
} catch (error) {
  console.error('Error listing buckets:', error);
  process.exit(1);
}
