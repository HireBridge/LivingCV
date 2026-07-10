import { getDb } from '../apps/web/src/lib/db';
import { getAllSettings } from '../apps/web/src/lib/settings';
import { verifyAdminPassword } from '../apps/web/src/lib/auth';

async function main() {
  const db = getDb();
  const allSettings = getAllSettings(db);
  const expectedEmail = allSettings['admin.email'];
  const email = "admin@test.com";
  const password = "password123";

  const emailMatch = expectedEmail
    ? email.toLowerCase().trim() === expectedEmail.toLowerCase().trim()
    : true;
  
  const ok = await verifyAdminPassword(db, password);

  console.log({
    expectedEmail,
    emailMatch,
    ok
  });
}
main().catch(console.error);
