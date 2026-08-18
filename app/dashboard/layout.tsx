import { requireSession } from '../../lib/auth';
import { query } from '../../lib/db';
import DashboardShell from './shell';
import { redirect } from 'next/navigation';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  let session;
  try {
    session = await requireSession();
  } catch {
    redirect('/login');
  }

  const sitesResult = await query(
    'SELECT id, domain, api_key, first_party_domain FROM sites WHERE user_id = $1 ORDER BY created_at DESC',
    [session.uid]
  );
  const sites = sitesResult.rows;

  return (
    <DashboardShell email={session.email} sites={sites}>
      {children}
    </DashboardShell>
  );
}
