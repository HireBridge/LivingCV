import { getDb } from '../apps/web/src/lib/db';
import { markSetupComplete } from '../apps/web/src/lib/settings';
import { setAdminPassword } from '../apps/web/src/lib/auth';

async function main() {
  const db = getDb();
  await setAdminPassword(db, 'password123');
  markSetupComplete(db);
  console.log('Setup marked complete. Password is "password123".');
}
main();
