import React, { useState, useEffect, lazy, Suspense } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Header from '@/components/Header';
import { useAuth } from '@/contexts/AuthContext';
import { User, FileText, History, BarChart3, Settings, ChevronRight, UploadCloud, CheckCircle, Trophy, Calendar, Briefcase, Loader2 } from 'lucide-react';
import { api, getScorecardHistory, ScorecardHistoryItem } from '@/services/api';
import { useToast } from '@/hooks/use-toast';

const ResumeViewer = lazy(() => import('@/components/team_b/ResumeViewer').then(m => ({ default: m.default ?? m.ResumeViewer })));
const ScorecardView = lazy(() => import('@/components/team_b/ScorecardView').then(m => ({ default: m.default ?? m.ScorecardView })));

type Tab = 'account' | 'resume' | 'history' | 'scorecard';

const ProfilePage: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') as Tab | null;
  const [tab, setTab] = useState<Tab>(tabParam && ['account', 'resume', 'history', 'scorecard'].includes(tabParam) ? tabParam : 'account');

  useEffect(() => {
    if (tabParam && ['account', 'resume', 'history', 'scorecard'].includes(tabParam)) {
      setTab(tabParam);
    }
  }, [tabParam]);
  const [resumeUploading, setResumeUploading] = useState(false);
  const [resumeLoaded, setResumeLoaded] = useState(false);

  const [historyItems, setHistoryItems] = useState<ScorecardHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  useEffect(() => {
    if (tab !== 'history') return;
    setHistoryLoading(true);
    setHistoryError(null);
    getScorecardHistory(20)
      .then(setHistoryItems)
      .catch(() => setHistoryError('Failed to load interview history.'))
      .finally(() => setHistoryLoading(false));
  }, [tab]);

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'account',   label: 'Account',    icon: <User size={15} /> },
    { id: 'resume',    label: 'Resume',     icon: <FileText size={15} /> },
    { id: 'history',   label: 'History',    icon: <History size={15} /> },
    { id: 'scorecard', label: 'Scorecard',  icon: <BarChart3 size={15} /> },
  ];

  const getInitials = () => {
    if (user?.name) {
      const p = user.name.trim().split(' ');
      return p.length >= 2 ? `${p[0][0]}${p[1][0]}`.toUpperCase() : user.name.slice(0, 2).toUpperCase();
    }
    return user?.email?.slice(0, 2).toUpperCase() ?? 'U';
  };

  const handleResumeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setResumeUploading(true);
    try {
      await api.uploadResumeFile(file);
      setResumeLoaded(true);
      toast({ title: 'Resume uploaded', description: 'Skills and claims extracted successfully.' });
    } catch {
      toast({ title: 'Upload failed', variant: 'destructive' });
    } finally {
      setResumeUploading(false);
      e.target.value = '';
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      <Header />
      <div className="max-w-4xl mx-auto px-4 py-8">

        {/* Profile header card */}
        <div className="bg-white rounded-2xl border border-gray-200 border-b-[3px] border-b-[#EAB308] p-6 mb-6 flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-[#DC2626] text-white text-xl font-black flex items-center justify-center shadow">
            {getInitials()}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-black text-[#111827] truncate">{user?.name || 'User'}</h1>
            <p className="text-sm text-[#6B7280] truncate">{user?.email}</p>
            <span className="inline-block mt-1 px-2 py-0.5 rounded-full bg-[#FEF3C7] text-[#92400E] text-xs font-bold capitalize">
              {user?.role} account
            </span>
          </div>
          <Link to="/settings" className="flex items-center gap-1 text-xs text-[#6B7280] hover:text-[#DC2626] font-semibold transition-colors">
            <Settings size={13} /> Settings
          </Link>
        </div>

        <div className="flex gap-6">
          {/* Sidebar tabs */}
          <div className="w-44 shrink-0">
            <nav className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              {tabs.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`w-full flex items-center gap-2.5 px-4 py-3 text-sm font-semibold transition-colors border-b border-gray-50 last:border-0 ${
                    tab === t.id
                      ? 'text-[#DC2626] bg-red-50'
                      : 'text-[#6B7280] hover:text-[#111827] hover:bg-gray-50'
                  }`}>
                  {t.icon} {t.label}
                  {tab === t.id && <ChevronRight size={13} className="ml-auto" />}
                </button>
              ))}
            </nav>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">

            {/* Account */}
            {tab === 'account' && (
              <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5">
                <h2 className="text-base font-bold text-[#111827]">Account Information</h2>
                <div className="space-y-4">
                  {[
                    { label: 'Full name', value: user?.name || '—' },
                    { label: 'Email address', value: user?.email || '—' },
                    { label: 'Role', value: user?.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : '—' },
                    { label: 'Member since', value: user?.created_at ? new Date(user.created_at).toLocaleDateString() : '—' },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex items-center justify-between py-3 border-b border-gray-50 last:border-0">
                      <span className="text-sm text-[#6B7280] font-medium">{label}</span>
                      <span className="text-sm font-semibold text-[#111827]">{value}</span>
                    </div>
                  ))}
                </div>
                <div className="pt-2">
                  <button className="text-sm font-semibold text-[#DC2626] hover:underline">Change password →</button>
                </div>
              </div>
            )}

            {/* Resume */}
            {tab === 'resume' && (
              <div className="space-y-4">
                <div className="bg-white rounded-2xl border border-gray-200 p-6">
                  <h2 className="text-base font-bold text-[#111827] mb-1">Resume Intelligence</h2>
                  <p className="text-sm text-[#6B7280] mb-4">Upload your resume to extract skills, claims, and seniority for personalised interviews.</p>

                  {resumeLoaded ? (
                    <div className="flex items-center gap-2 text-green-700 bg-green-50 rounded-xl px-4 py-3 mb-4">
                      <CheckCircle size={16} />
                      <span className="text-sm font-semibold">Resume extracted successfully</span>
                      <button onClick={() => setResumeLoaded(false)} className="ml-auto text-xs text-[#6B7280] hover:text-[#DC2626]">Replace</button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center gap-3 border-2 border-dashed border-gray-200 rounded-xl p-8 cursor-pointer hover:border-[#DC2626]/40 hover:bg-red-50/20 transition-all">
                      {resumeUploading ? (
                        <div className="w-6 h-6 border-2 border-[#DC2626]/20 border-t-[#DC2626] rounded-full animate-spin" />
                      ) : (
                        <UploadCloud size={28} className="text-[#DC2626]" />
                      )}
                      <div className="text-center">
                        <p className="text-sm font-semibold text-[#111827]">Upload PDF, DOCX, or TXT</p>
                        <p className="text-xs text-[#6B7280] mt-0.5">Max 2MB · 3 pages</p>
                      </div>
                      <input type="file" accept=".pdf,.docx,.txt" onChange={handleResumeUpload} className="hidden" disabled={resumeUploading} />
                    </label>
                  )}
                </div>

                {resumeLoaded && (
                  <Suspense fallback={<div className="bg-white rounded-xl p-8 animate-pulse text-center text-sm text-gray-400">Loading claims…</div>}>
                    <ResumeViewer userId={user?.id || 'demo-user'} />
                  </Suspense>
                )}
              </div>
            )}

            {/* History */}
            {tab === 'history' && (
              <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <h2 className="text-base font-bold text-[#111827] mb-4">Interview History</h2>

                {historyLoading && (
                  <div className="flex items-center justify-center py-12 text-[#9CA3AF]">
                    <Loader2 size={24} className="animate-spin mr-2" />
                    <span className="text-sm">Loading history…</span>
                  </div>
                )}

                {historyError && !historyLoading && (
                  <div className="text-center py-12 text-[#9CA3AF]">
                    <p className="text-sm font-medium text-red-500">{historyError}</p>
                  </div>
                )}

                {!historyLoading && !historyError && historyItems.length === 0 && (
                  <div className="text-center py-12 text-[#9CA3AF]">
                    <History size={32} className="mx-auto mb-3 opacity-40" />
                    <p className="text-sm font-medium">No interviews yet</p>
                    <p className="text-xs mt-1">Start your first interview to see history here</p>
                    <Link to="/interview" className="inline-block mt-4 text-xs font-bold text-[#DC2626] hover:underline">
                      Start Interview →
                    </Link>
                  </div>
                )}

                {!historyLoading && !historyError && historyItems.length > 0 && (
                  <div className="space-y-3">
                    {historyItems.map((item) => {
                      const score = Math.round(item.overall_score ?? 0);
                      const scoreColor = score >= 80 ? 'text-green-600' : score >= 60 ? 'text-amber-600' : 'text-red-500';
                      const scoreBg = score >= 80 ? 'bg-green-50 border-green-200' : score >= 60 ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200';
                      const dateStr = item.date ? new Date(item.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

                      return (
                        <div key={item.session_id} className="flex items-center gap-4 p-4 rounded-xl border border-gray-100 bg-[#FAFAFA] hover:border-[#DC2626]/20 hover:bg-red-50/20 transition-all">
                          <div className={`w-12 h-12 rounded-xl border flex items-center justify-center shrink-0 ${scoreBg}`}>
                            <span className={`text-sm font-black ${scoreColor}`}>{score}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <Briefcase size={12} className="text-[#6B7280] shrink-0" />
                              <span className="text-sm font-semibold text-[#111827] truncate">{item.role || 'Interview Session'}</span>
                              {item.rubric_band && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#FEF3C7] text-[#92400E] border border-amber-200 shrink-0">
                                  {item.rubric_band}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-[11px] text-[#9CA3AF]">
                              <span className="flex items-center gap-1"><Calendar size={10} />{dateStr}</span>
                              {item.readiness_score != null && (
                                <span className="flex items-center gap-1"><Trophy size={10} />Readiness {Math.round(item.readiness_score)}%</span>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-2 shrink-0">
                            {Object.entries(item.dimension_scores ?? {}).slice(0, 3).map(([dim, val]) => (
                              <div key={dim} className="text-center hidden sm:block">
                                <div className="text-[10px] font-bold text-[#111827]">{Math.round(Number(val))}</div>
                                <div className="text-[9px] text-[#9CA3AF] capitalize">{dim.replace('_', ' ')}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Scorecard */}
            {tab === 'scorecard' && (
              <Suspense fallback={<div className="bg-white rounded-2xl border border-gray-200 p-8 animate-pulse text-center text-sm text-gray-400">Loading scorecard…</div>}>
                <ScorecardView />
              </Suspense>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
