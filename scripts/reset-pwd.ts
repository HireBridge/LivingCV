import { getDb } from '../apps/web/src/lib/db';
import { setAdminPassword } from '../apps/web/src/lib/auth';

async function main() {
  const db = getDb();
  await setAdminPassword(db, 'password123');
  console.log('Password reset to password123 successfully.');
}
main().catch(console.error);
