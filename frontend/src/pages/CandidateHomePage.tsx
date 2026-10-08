import React, { useState, useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { CandidateLayout } from '@/components/CandidateLayout';
import { Mic, Code2, Play, ChevronRight, Loader2 } from 'lucide-react';

const API =
  (import.meta as any).env?.VITE_API_BASE_URL !== undefined && (import.meta as any).env.VITE_API_BASE_URL !== ""
    ? (import.meta as any).env.VITE_API_BASE_URL
    : typeof window !== "undefined" && (window.location.port === "5173" || window.location.port === "3000")
    ? ""
    : "http://localhost:8000";

interface AssignedTest {
  id: string;
  exam_id?: string;
  title: string;
  company?: string;
  topic: string;
  duration_minutes: number;
  status: 'pending' | 'in_progress' | 'completed' | 'expired' | 'disqualified';
  difficulty: string;
  score?: number | null;
}

interface AssignedInterview {
  id: string;
  drive_id?: string;
  role: string;
  company?: string;
  style: string;
  duration_minutes: number;
  status: 'pending' | 'completed';
  score?: number | null;
}

const CandidateHomePage: React.FC = () => {
  const isSEB = typeof window !== 'undefined' && (/SEB|SafeExamBrowser/i.test(navigator.userAgent || '') || !!(window as any).SafeExamBrowser);
  if (isSEB) {
    return <Navigate to="/coding" replace />;
  }

  const { user, getToken } = useAuth();
  const navigate = useNavigate();

  const [tests, setTests] = useState<AssignedTest[]>([]);
  const [interviews, setInterviews] = useState<AssignedInterview[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAssignments = async () => {
      try {
        const token = getToken();
        const r = await fetch(`${API}/me/assignments`, {
          headers: { Authorization: token ? `Bearer ${token}` : '' },
        });
        if (r.ok) {
          const data = await r.json();
          const mappedTests: AssignedTest[] = (data.exams || []).map((e: any) => ({
            id: e.id,
            exam_id: e.exam_id,
            title: e.title || 'Coding Assessment',
            company: 'Institutional Assessment',
            topic: e.description || 'Algorithms & Data Structures',
            duration_minutes: e.duration_minutes || 60,
            status: e.status || 'pending',
            difficulty: e.difficulty || 'Medium',
            score: e.score,
          }));

          const mappedInterviews: AssignedInterview[] = (data.interviews || []).map((i: any) => ({
            id: i.id,
            drive_id: i.drive_id,
            role: i.target_role || i.title || 'Software Engineer',
            company: i.company || 'Campus Placement',
            style: i.interview_style || 'Technical',
            duration_minutes: i.duration_minutes || 30,
            status: i.status || 'pending',
            score: i.score,
          }));

          setTests(mappedTests);
          setInterviews(mappedInterviews);
        }
      } catch (err) {
        console.error('Failed to load candidate assignments:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchAssignments();
  }, [getToken]);

  const firstName = user?.name?.split(' ')[0] || 'candidate';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const pendingTests = tests.filter(t => t.status === 'pending').length;
  const pendingInterviews = interviews.filter(i => i.status === 'pending').length;

  return (
    <CandidateLayout>
      {/* Top Welcome Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-gray-100">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
            {greeting},{' '}
            <span className="text-[#dc2626] font-black">{firstName}</span>
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {pendingTests > 0
              ? `You have ${pendingTests} pending placement assessment${pendingTests > 1 ? 's' : ''} scheduled.`
              : 'All scheduled assessments completed. Review your scores or practice below.'}
          </p>
        </div>

        <div>
          <button
            onClick={() => navigate('/interview?autoStart=true&role=Software%20Engineer')}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#dc2626] hover:bg-[#b91c1c] text-white text-xs font-bold transition-all shadow-sm hover:shadow-[0_4px_12px_rgba(220,38,38,0.25)] cursor-pointer"
          >
            <Mic className="w-4 h-4" />
            <span>Practice Voice Interview</span>
          </button>
        </div>
      </div>

      {/* Main 2-Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
        {/* Left Column: Assigned Coding Tests */}
        <section className="space-y-4">
          <div className="flex items-center gap-2.5">
            <Code2 className="w-4 h-4 text-[#dc2626]" />
            <h2 className="text-sm font-bold text-gray-900">Assigned Coding Tests</h2>
            <span className="text-[10px] font-bold text-[#dc2626] bg-red-50 border border-red-100 px-2 py-0.5 rounded-full">
              {pendingTests} pending
            </span>
          </div>

          <div className="space-y-3.5">
            {loading ? (
              <div className="p-12 text-center text-gray-400 bg-white rounded-2xl border border-gray-100 flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-[#dc2626]" />
                <span className="text-xs">Loading assessments…</span>
              </div>
            ) : tests.length === 0 ? (
              <div className="p-10 text-center text-gray-400 bg-white rounded-2xl border border-gray-100">
                <p className="text-xs font-semibold text-gray-600">No coding tests assigned yet</p>
                <p className="text-[11px] text-gray-400 mt-1">Scheduled tests will appear here.</p>
              </div>
            ) : (
              tests.map(test => {
                const isDone = test.status === 'completed';
                return (
                  <div
                    key={test.id}
                    className="bg-white rounded-2xl border border-gray-100/90 p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
                  >
                    <div>
                      {/* Top Badges */}
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className="text-[10px] font-bold text-[#dc2626] bg-red-50 border border-red-100/60 px-2.5 py-0.5 rounded-full">
                          {test.company || 'Institutional Assessment'}
                        </span>
                        <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full">
                          {test.difficulty || 'Medium'}
                        </span>
                        <span className="text-[10px] font-semibold text-amber-700 bg-amber-50/60 border border-amber-200/60 px-2 py-0.5 rounded-full capitalize">
                          {test.status}
                        </span>
                      </div>

                      {/* Title & Description */}
                      <h3 className="text-base font-bold text-gray-900 leading-tight">
                        {test.title}
                      </h3>
                      <p className="text-xs text-gray-500 mt-1">
                        {test.topic} • {test.duration_minutes} min
                      </p>
                    </div>

                    {/* Action Button */}
                    <div className="mt-4 flex justify-end">
                      {isDone ? (
                        <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-lg">
                          Completed
                        </span>
                      ) : (
                        <button
                          onClick={() => navigate(`/coding?exam_id=${test.exam_id || test.id}`)}
                          className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-[#dc2626] hover:bg-[#b91c1c] text-white text-xs font-bold transition-all shadow-xs hover:shadow-sm cursor-pointer"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>Attempt</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* Right Column: Assigned AI Interviews */}
        <section className="space-y-4">
          <div className="flex items-center gap-2.5">
            <Mic className="w-4 h-4 text-[#dc2626]" />
            <h2 className="text-sm font-bold text-gray-900">Assigned AI Interviews</h2>
            <span className="text-[10px] font-bold text-[#dc2626] bg-red-50 border border-red-100 px-2 py-0.5 rounded-full">
              {pendingInterviews} pending
            </span>
          </div>

          <div className="space-y-3.5">
            {loading ? (
              <div className="p-12 text-center text-gray-400 bg-white rounded-2xl border border-gray-100 flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-[#dc2626]" />
                <span className="text-xs">Loading interviews…</span>
              </div>
            ) : interviews.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-100 p-10 flex flex-col items-center justify-center text-center shadow-xs min-h-[220px]">
                <div className="w-14 h-14 rounded-full bg-gray-100/80 flex items-center justify-center text-gray-400 mb-3.5">
                  <Mic className="w-6 h-6 text-gray-400" />
                </div>
                <h3 className="text-sm font-bold text-gray-800">
                  No placement interviews assigned yet
                </h3>
                <p className="text-xs text-gray-400 mt-1 max-w-xs leading-relaxed">
                  Mock drives scheduled for your cohort will appear here.
                </p>
              </div>
            ) : (
              interviews.map(interview => (
                <div
                  key={interview.id}
                  className="bg-white rounded-2xl border border-gray-100/90 p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className="text-[10px] font-bold text-[#dc2626] bg-red-50 border border-red-100/60 px-2.5 py-0.5 rounded-full">
                        {interview.company || 'Campus Placement'}
                      </span>
                      <span className="text-[10px] font-semibold text-gray-600 bg-gray-100 px-2.5 py-0.5 rounded-full capitalize">
                        {interview.style}
                      </span>
                    </div>

                    <h3 className="text-base font-bold text-gray-900 leading-tight">
                      {interview.role}
                    </h3>
                    <p className="text-xs text-gray-500 mt-1">
                      {interview.duration_minutes} min • AI Voice Interview
                    </p>
                  </div>

                  <div className="mt-4 flex justify-end">
                    <button
                      onClick={() =>
                        navigate(
                          `/interview?autoStart=true&role=${encodeURIComponent(interview.role)}&style=${encodeURIComponent(interview.style)}&duration=${interview.duration_minutes}`
                        )
                      }
                      className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-[#dc2626] hover:bg-[#b91c1c] text-white text-xs font-bold transition-all shadow-xs hover:shadow-sm cursor-pointer"
                    >
                      <Mic className="w-3.5 h-3.5" />
                      <span>Start</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </CandidateLayout>
  );
};

export default CandidateHomePage;
