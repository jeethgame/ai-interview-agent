import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Home, User, FileText, ChevronDown, LogOut, Settings, Menu, X, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

interface CandidateLayoutProps {
  children: React.ReactNode;
}

export const CandidateLayout: React.FC<CandidateLayoutProps> = ({ children }) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setUserDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const getInitials = () => {
    if (user?.name) {
      const parts = user.name.trim().split(' ');
      return parts.length >= 2 ? `${parts[0][0]}${parts[1][0]}`.toUpperCase() : user.name.slice(0, 2).toUpperCase();
    }
    return user?.email?.slice(0, 2).toUpperCase() || 'CA';
  };

  const isHome = location.pathname === '/home' || location.pathname === '/';
  const isProfile = location.pathname.startsWith('/profile');
  const searchParams = new URLSearchParams(location.search);
  const currentTab = searchParams.get('tab');
  const isAccount = isProfile && (currentTab === 'account' || !currentTab);
  const isResume = isProfile && currentTab === 'resume';
  const isReport = isProfile && (currentTab === 'scorecard' || currentTab === 'history');

  const navItemClass = (active: boolean) =>
    `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
      active
        ? 'bg-red-50 text-[#dc2626] font-bold shadow-sm'
        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
    }`;


  return (
    <div className="min-h-screen bg-[#F9FAFB] flex font-sans">
      {/* Mobile backdrop */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-40 lg:hidden backdrop-blur-xs"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* Left Sidebar */}
      <aside
        className={`fixed lg:sticky top-0 left-0 h-screen w-64 bg-white border-r border-gray-200/80 z-50 flex flex-col transition-transform duration-200 ${
          mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Brand Header */}
        <div className="p-5 flex items-center gap-3 border-b border-gray-100">
          <img
            src="/college-logo.png"
            alt="St. Joseph's Logo"
            className="w-10 h-10 rounded-full object-contain bg-white border border-amber-200/80 p-0.5 shadow-xs shrink-0"
          />
          <div className="min-w-0">
            <h1 className="text-xs font-extrabold text-gray-900 leading-tight truncate">
              St. Joseph's
            </h1>
            <h2 className="text-[11px] font-bold text-gray-800 leading-tight truncate">
              College of Engineering
            </h2>
            <p className="text-[10px] text-gray-400 font-medium leading-none mt-0.5">
              Placement Portal
            </p>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
          {/* Home */}
          <Link
            to="/home"
            onClick={() => setMobileSidebarOpen(false)}
            className={navItemClass(isHome)}
          >
            <Home className="w-4 h-4 shrink-0" />
            <span>Home</span>
          </Link>

          {/* Profile direct link */}
          <Link
            to="/profile"
            onClick={() => setMobileSidebarOpen(false)}
            className={navItemClass(isProfile && !isReport)}
          >
            <User className="w-4 h-4 shrink-0" />
            <span>Profile</span>
          </Link>

          {/* Report */}
          <Link
            to="/profile?tab=history"
            onClick={() => setMobileSidebarOpen(false)}
            className={navItemClass(isReport)}
          >
            <FileText className="w-4 h-4 shrink-0" />
            <span>Report</span>
          </Link>
        </nav>

        {/* Institutional Badge Footer */}
        <div className="p-4 border-t border-gray-100">
          <div className="px-3 py-2 rounded-xl bg-gray-50 border border-gray-100 flex items-center gap-2 text-[10px] text-gray-500 font-medium">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span className="truncate">Autonomous Institution • Anna Univ</span>
          </div>
        </div>
      </aside>

      {/* Main Container */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header Bar */}
        <header className="h-16 px-6 lg:px-10 flex items-center justify-between lg:justify-end bg-white/80 backdrop-blur-md border-b border-gray-100 sticky top-0 z-30">
          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileSidebarOpen(true)}
            className="lg:hidden p-2 rounded-xl hover:bg-gray-100 text-gray-700"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* User Profile Pill in Top Right */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setUserDropdownOpen(!userDropdownOpen)}
              className="flex items-center gap-2.5 p-1.5 pr-2.5 rounded-full hover:bg-gray-50 border border-transparent hover:border-gray-200/60 transition-all cursor-pointer"
            >
              <div className="w-8 h-8 rounded-full bg-[#dc2626] text-white font-bold text-xs flex items-center justify-center shadow-xs">
                {getInitials()}
              </div>
              <div className="text-left hidden sm:block">
                <p className="text-xs font-bold text-gray-900 leading-tight">
                  {user?.name || 'candidate'}
                </p>
                <p className="text-[10px] text-gray-400 capitalize leading-tight">
                  {user?.role || 'Candidate'}
                </p>
              </div>
              <ChevronDown
                className={`w-3.5 h-3.5 text-gray-400 transition-transform ${
                  userDropdownOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {/* Dropdown Menu */}
            {userDropdownOpen && (
              <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-2xl border border-gray-100 shadow-xl py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
                <div className="px-4 py-2 border-b border-gray-50">
                  <p className="text-xs font-bold text-gray-900 truncate">
                    {user?.name || 'Candidate'}
                  </p>
                  <p className="text-[10px] text-gray-400 truncate">{user?.email}</p>
                </div>
                <Link
                  to="/profile?tab=account"
                  onClick={() => setUserDropdownOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2 text-xs text-gray-700 hover:bg-gray-50 hover:text-[#dc2626] transition-colors"
                >
                  <User className="w-3.5 h-3.5" />
                  <span>My Account</span>
                </Link>
                <Link
                  to="/settings"
                  onClick={() => setUserDropdownOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2 text-xs text-gray-700 hover:bg-gray-50 hover:text-[#dc2626] transition-colors"
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>Settings</span>
                </Link>
                <div className="border-t border-gray-100 my-1" />
                <button
                  onClick={() => {
                    setUserDropdownOpen(false);
                    logout();
                    navigate('/login');
                  }}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-xs text-[#dc2626] hover:bg-red-50 transition-colors font-medium"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign out</span>
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-6 lg:p-10 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
};
