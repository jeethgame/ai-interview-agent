import React, { Suspense, lazy } from 'react';
import { useAuth } from '@/contexts/AuthContext';

const AdminDashboard = lazy(() => import('@/components/AdminDashboard'));

const DashboardPage: React.FC = () => {
  const { user, getToken } = useAuth();
  const orgId = (user as any)?.org_id || 'demo-org-id';

  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F9FAFB] flex flex-col items-center justify-center text-xs text-gray-400 gap-3">
          <div className="w-8 h-8 border-2 border-[#dc2626]/20 border-t-[#dc2626] rounded-full animate-spin" />
          <span>Loading Administrator Command Center…</span>
        </div>
      }
    >
      <AdminDashboard orgId={orgId} token={getToken() || undefined} />
    </Suspense>
  );
};

export default DashboardPage;
