// Explicit deployment-owner operations. Ordinary builds never change the database.
import { createDatabaseConnection } from '../src/database-connection.js';
import { migrateMySQL } from '../src/mysql-migrations.js';
import { checkHostedDatabase } from './check-hosted-database.js';
import { getDatabaseConfig } from '../src/database-config.js';

const action = process.env.RELEASE_ACTION;
if (action) {
  if (!['migrate', 'approve-test', 'verify-persistence', 'verify-database'].includes(action)) {
    throw new Error('Unsupported release action');
  }
  if (process.env.DB_CLIENT !== 'mysql2' || process.env.DB_SSL === 'false') {
    throw new Error('Release checks require hosted MySQL with verified TLS');
  }
  if (action === 'verify-database') {
    if (process.env.DB_NAME !== 'smarttutor' || process.env.DB_HOST !== 'gateway01.ap-northeast-1.prod.aws.tidbcloud.com') {
      throw new Error('Approved SmartTutor TiDB instance required');
    }
    const tls = getDatabaseConfig().connection.ssl;
    if (!tls?.rejectUnauthorized || !tls.verifyIdentity) throw new Error('Verified database TLS required');
  }
  const db = createDatabaseConnection();
  try {
    if (action === 'verify-database') {
      const results = await checkHostedDatabase(db);
      console.log('Hosted TiDB acceptance:', JSON.stringify(results));
    }
    if (action === 'migrate') {
      const applied = await migrateMySQL(db);
      console.log('Release schema check passed; migrations applied:', applied.length);
    } else {
      const username = process.env.RELEASE_TEST_USERNAME;
      const email = process.env.RELEASE_TEST_EMAIL;
      if (!username?.startsWith('release_') || !email) throw new Error('Synthetic test identity required');
      const user = await db('users').join('account_registration_details', 'users.id', 'account_registration_details.user_id')
        .where({ 'users.email': email, 'account_registration_details.username': username,
          'users.name': 'Synthetic Release Check' })
        .select('users.id', 'users.email_verified_at', 'users.approval_status').first();
      if (!user || !user.email_verified_at) throw new Error('Verified synthetic test account required');
      if (action === 'approve-test') {
        await db('users').where({ id: user.id }).update({ approval_status: 'approved' });
        console.log('Synthetic release test account explicitly approved');
      } else {
        const profile = await db('account_registration_details').where({ user_id: user.id }).first();
        const sessions = await db('sessions').where({ user_id: user.id }).count({ n: '*' }).first();
        if (!profile.terms_accepted_at || user.approval_status !== 'approved' || Number(sessions.n) < 1) {
          throw new Error('Release persistence acceptance failed');
        }
        console.log('Account, terms evidence and session records persisted across deployment');
      }
    }
  } catch {
    // Never expose raw database or provider exceptions to deployment logs.
    throw new Error('Release operation failed; inspect configuration and schema safely');
  } finally { await db.destroy(); }
}
