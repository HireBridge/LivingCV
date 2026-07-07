import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import type { ReactNode } from 'react';
import { getDb } from '@/lib/db';
import { isSetupComplete } from '@/lib/settings';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Control Panel - LivingCV',
};

const ADMIN_CSS = `
*{box-sizing:border-box;}
.admin-shell{ 
  --paper: #F2F0EA;
  --paper-deep: #E7E3D6;
  --ink: #1B2430;
  --ink-soft: #4A5568;
  --rule: #C9C4B6;
  --signal: #2F6F5E;
  --rust: #9C5333;
  display:grid; grid-template-columns:220px 1fr; min-height:100vh; 
}
.admin-sidebar{ background:var(--paper-deep,#E7E3D6); border-right:1px solid var(--rule); padding:22px 18px; font-family:-apple-system,BlinkMacSystemFont,'Space Grotesk',sans-serif; }
.admin-sidebar h2{ font-size:0.9rem; margin:0 0 14px; color:var(--ink); letter-spacing:-0.01em; }
.admin-sidebar nav{ display:flex; flex-direction:column; gap:2px; margin-bottom:20px; }
.admin-sidebar nav a{ color:var(--ink-soft); text-decoration:none; padding:6px 10px; border-radius:4px; font-size:0.9rem; }
.admin-sidebar nav a:hover{ background:rgba(0,0,0,0.04); color:var(--signal); }
.admin-main{ padding:28px 36px 60px; max-width:none; }
.admin-shell .admin-main h1{ font-family:'Space Grotesk',sans-serif; margin:0 0 18px; }
.admin-shell .admin-main section{ margin:0 0 28px; }
.admin-card{ background:#fff; border:1px solid var(--rule); border-radius:6px; padding:18px 20px; margin:0 0 18px; }
.admin-card h3{ font-family:'Space Grotesk',sans-serif; margin:0 0 10px; font-size:1rem; }
.admin-card p{ margin:0 0 10px; color:var(--ink-soft); font-size:0.92rem; }
.admin-shell input:not([type="checkbox"]):not([type="radio"]), .admin-shell textarea, .admin-shell select{
  font:inherit; width:100%; padding:8px 10px; border:1px solid var(--rule); border-radius:5px; background:#fff; color:var(--ink);
}
.admin-shell textarea{ min-height:120px; font-family:inherit; }
.admin-shell label{ display:block; font-size:0.84rem; color:var(--ink-soft); margin:0 0 4px; font-weight:500; }
.admin-shell .row{ margin:0 0 14px; }
.admin-shell .actions{ display:flex; gap:10px; margin-top:12px; }
.admin-shell button{ font:inherit; padding:8px 14px; border:1px solid var(--ink); background:var(--ink); color:#fff; border-radius:5px; cursor:pointer; }
.admin-shell button.secondary{ background:transparent; color:var(--ink); }
.admin-shell button.danger{ background:var(--rust); border-color:var(--rust); }
.admin-table{ width:100%; border-collapse:collapse; font-size:0.9rem; }
.admin-table th, .admin-table td{ padding:8px 10px; border-bottom:1px solid var(--rule); text-align:left; }
.admin-table a{ color:var(--signal); }
.admin-shell .flash{ padding:10px 12px; border-radius:5px; margin:0 0 14px; font-size:0.9rem; }
.admin-shell .flash.success{ background:#E4ECE9; color:#2F6F5E; border:1px solid #2F6F5E; }
.admin-shell .flash.error{ background:#F4E2DD; color:#9C5333; border:1px solid #9C5333; }
.admin-shell code, .admin-shell pre{ font-family:'JetBrains Mono', monospace; font-size:0.86em; background:var(--paper-deep); }
.admin-shell pre{ padding:10px 12px; border-radius:5px; overflow-x:auto; }
.admin-shell .steps{ display:flex; gap:8px; margin:0 0 22px; font-size:0.86rem; color:var(--ink-soft); }
.admin-shell .steps span.active{ color:var(--ink); font-weight:600; }
.admin-shell .steps span.done{ color:var(--signal); }
.admin-shell input.mono{ font-family:'JetBrains Mono', monospace; font-size:0.88em; }
`;

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const h = await headers();
  const pathname = h.get('x-pathname') || '';
  const db = getDb();
  const setupDone = isSetupComplete(db);

  // Force the setup wizard until it's complete (everything except the wizard
  // itself gets redirected). Middleware already gates session; this adds the
  // "fresh install → wizard" gate that requires DB access.
  if (!setupDone && pathname !== '/admin/setup') {
    redirect('/admin/setup');
  }

  const isAuthPage = pathname === '/admin/login' || pathname === '/admin/setup';

  if (isAuthPage) {
    return (
      <div className="admin-shell admin-shell-auth">
        <style dangerouslySetInnerHTML={{ __html: ADMIN_CSS + '\n.admin-shell-auth{display:flex;align-items:center;justify-content:center;min-height:100vh;background:var(--paper-deep,#E7E3D6);flex-direction:column;}\n.admin-shell-auth .admin-main{padding:20px;max-width:440px;width:100%;}' }} />
        <main className="admin-main">{children}</main>
      </div>
    );
  }

  return (
    <div className="admin-shell">
      <style dangerouslySetInnerHTML={{ __html: ADMIN_CSS }} />
      <aside className="admin-sidebar">
        <h2>LivingCV Control Panel</h2>
        <nav>
          <a href="/admin">Dashboard</a>
          <a href="/admin/content">Portfolio Content</a>
          <a href="/admin/leads">Leads</a>
          <a href="/admin/packet">Career Data</a>
          <a href="/admin/vcs">VCS</a>
          <a href="/admin/blogs">Your Blogs</a>
          <a href="/admin/settings">Settings</a>
        </nav>
        <form action="/api/admin/logout" method="post" style={{ marginTop: 8 }}>
          <button type="submit" className="secondary" style={{ width: '100%' }}>Log out</button>
        </form>
      </aside>
      <main className="admin-main">{children}</main>
    </div>
  );
}
