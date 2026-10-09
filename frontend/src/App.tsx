import React, { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Toaster } from '@/components/ui/toaster';

// Eager-loaded (auth critical)
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ProtectedRoute from './components/ProtectedRoute';
import RoleRoute from './components/RoleRoute';

// Lazy-loaded pages (code-split)
const LandingPage         = lazy(() => import('./pages/LandingPage'));
const CandidateHomePage   = lazy(() => import('./pages/CandidateHomePage'));
const InterviewPage       = lazy(() => import('./pages/Index'));
const CodingPage          = lazy(() => import('./pages/CodingPage'));
const SebQuitPage         = lazy(() => import('./pages/SebQuitPage'));
const ProfilePage         = lazy(() => import('./pages/ProfilePage'));
const SettingsPage        = lazy(() => import('./pages/SettingsPage'));
const DashboardPage       = lazy(() => import('./pages/DashboardPage'));
const CreateExamPage      = lazy(() => import('./pages/CreateExamPage'));
const CreateDrivePage     = lazy(() => import('./pages/CreateDrivePage'));
const NotFound            = lazy(() => import('./pages/NotFound'));

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-white">
    <div className="w-8 h-8 border-2 border-[#DC2626]/20 border-t-[#DC2626] rounded-full animate-spin" />
  </div>
);

/** Root redirect: candidates → /home, staff → /dashboard, SEB → /coding, guests → / */
const RootRedirect: React.FC = () => {
  const { isAuthenticated, user, isLoading } = useAuth();
  if (isLoading) return <PageLoader />;
  const isSEB = typeof window !== 'undefined' && (/SEB|SafeExamBrowser/i.test(navigator.userAgent || '') || !!(window as any).SafeExamBrowser);
  if (isSEB) return <Navigate to="/coding" replace />;
  if (!isAuthenticated) return <LandingPage />;
  if (user?.role === 'candidate') return <Navigate to="/home" replace />;
  return <Navigate to="/dashboard" replace />;
};

/** Direct download redirect for SEB configuration URLs if hit via React Router */
const SebConfigRedirect: React.FC = () => {
  React.useEffect(() => {
    const search = window.location.search;
    const path = window.location.pathname;
    window.location.href = `${path}${search}`;
  }, []);
  return <PageLoader />;
};

function App() {
  return (
    <AuthProvider>
      <Router>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* Public */}
            <Route path="/"          element={<RootRedirect />} />
            <Route path="/login"     element={<LoginPage />} />
            <Route path="/register"  element={<RegisterPage />} />
            <Route path="/seb-quit"  element={<SebQuitPage />} />

            {/* Candidate-only */}
            <Route path="/home" element={
              <ProtectedRoute>
                <RoleRoute roles={['candidate']} fallback="/dashboard">
                  <CandidateHomePage />
                </RoleRoute>
              </ProtectedRoute>
            } />
            <Route path="/interview" element={
              <ProtectedRoute>
                <RoleRoute roles={['candidate', 'faculty', 'admin']} fallback="/login">
                  <InterviewPage />
                </RoleRoute>
              </ProtectedRoute>
            } />
            {/* Coding Arena */}
            <Route path="/coding" element={
              <ProtectedRoute>
                <RoleRoute roles={['candidate', 'faculty', 'admin']} fallback="/coding">
                  <CodingPage />
                </RoleRoute>
              </ProtectedRoute>
            } />
            {/* Exam — unified Coding Arena */}
            <Route path="/exams/:examId/seb-config" element={<SebConfigRedirect />} />
            <Route path="/exams/seb-config" element={<SebConfigRedirect />} />
            <Route path="/exam/:examId" element={
              <ProtectedRoute>
                <RoleRoute roles={['candidate', 'faculty', 'admin']} fallback="/coding">
                  <CodingPage />
                </RoleRoute>
              </ProtectedRoute>
            } />
            <Route path="/exams/:examId" element={
              <ProtectedRoute>
                <RoleRoute roles={['candidate', 'faculty', 'admin']} fallback="/coding">
                  <CodingPage />
                </RoleRoute>
              </ProtectedRoute>
            } />

            {/* All authenticated */}
            <Route path="/profile"  element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />

            {/* Faculty + Admin */}
            <Route path="/dashboard" element={
              <ProtectedRoute>
                <RoleRoute roles={['faculty', 'admin']} fallback="/interview">
                  <DashboardPage />
                </RoleRoute>
              </ProtectedRoute>
            } />
            <Route path="/exams/create" element={
              <ProtectedRoute>
                <RoleRoute roles={['faculty', 'admin']} fallback="/dashboard">
                  <CreateExamPage />
                </RoleRoute>
              </ProtectedRoute>
            } />
            <Route path="/admin/exams/create" element={<Navigate to="/exams/create" replace />} />
            <Route path="/drives/create" element={
              <ProtectedRoute>
                <RoleRoute roles={['faculty', 'admin']} fallback="/dashboard">
                  <CreateDrivePage />
                </RoleRoute>
              </ProtectedRoute>
            } />
            <Route path="/admin/drives/create" element={<Navigate to="/drives/create" replace />} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
        <Toaster />
      </Router>
    </AuthProvider>
  );
}

export default App;
