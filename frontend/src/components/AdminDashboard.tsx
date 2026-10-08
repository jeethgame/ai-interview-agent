/**
 * AdminDashboard — V4 Institutional Layer.
 * Faculty/Admin command center:
 * - Left Navigation: Dashboard, Coding Exams, Question Bank, AI Interviews, Candidates, Reports
 * - Independent page view per left navigation item
 * - High-aesthetic institutional design matching St. Joseph's placement portal
 */

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  BarChart3, Users, Building2, Target, TrendingUp, Plus, RefreshCw,
  Code2, Mic, CheckCircle2, Clock, AlertTriangle, Send, FileSpreadsheet,
  X, Award, ExternalLink, ShieldCheck, FileText, ChevronRight,
  Home, Settings, Menu, LogOut, ChevronDown, Database, Layers, Search
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';

const API = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:8000';

async function apiFetch(path: string, token?: string, options?: RequestInit) {
  const headers: Record<string, string> = {
    ...(options?.headers as Record<string, string> || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const r = await fetch(`${API}${path}`, {
    ...options,
    headers,
  });
  if (!r.ok) {
    let errDetail = `${r.status}`;
    try {
      const errJson = await r.json();
      errDetail = errJson.detail || errDetail;
    } catch { }
    throw new Error(errDetail);
  }
  return r.json();
}

// ── Types ─────────────────────────────────────────────────────────────────

interface AnalyticsSummary {
  total_assigned: number;
  total_completed: number;
  completion_rate: number;
  exams?: {
    total_assigned_exams: number;
    total_completed_exams: number;
    avg_exam_score: number | null;
  };
  interviews?: {
    total_allocated_interviews: number;
    total_completed_interviews: number;
    avg_interview_readiness: number | null;
    avg_interview_score: number | null;
  };
}

interface CohortRow {
  cohort_name: string;
  total_students: number;
  interviews_allocated: number;
  interviews_completed: number;
  avg_overall_score: number | null;
  avg_readiness: number | null;
}

interface CandidateRow {
  user_id: string;
  name: string;
  email: string;
  total_interviews_assigned: number;
  total_interviews_done: number;
  avg_interview_score: number | null;
  avg_readiness: number | null;
  best_band: string | null;
  total_exams_assigned: number;
  total_exams_done: number;
  avg_exam_score: number | null;
  last_activity_at: string | null;
}

interface DriveRow {
  id: string;
  title: string;
  target_role: string;
  company: string | null;
  interview_style: string;
  difficulty: string;
  duration_minutes: number;
  status: string;
  allocated_count: number;
  completed_count: number;
}

interface DriveResultRow {
  user_id: string;
  name: string;
  email: string;
  overall_score: number | null;
  readiness_score: number | null;
  rubric_band: string | null;
  completed_at: string | null;
}

interface ExamRow {
  id: string;
  title: string;
  description?: string;
  difficulty: string;
  duration_minutes: number;
  max_infractions: number;
  status: string;
  assigned_count: number;
  completed_count: number;
  avg_score: number | null;
  created_at: string;
}

interface ExamAssignmentRow {
  assignment_id: string;
  user_id: string;
  name: string;
  email: string;
  status: string;
  score: number | null;
  passed_cases: number;
  total_cases: number;
  infractions_count: number;
  started_at: string | null;
  completed_at: string | null;
}

interface CohortItem {
  id: string;
  name: string;
  department?: string;
  batch_year?: number;
  student_count?: number;
}

export interface QuestionItem {
  id: string;
  question_id: string;
  title: string;
  description: string;
  topic: string;
  category: string;
  difficulty: string;
  difficulty_level: string;
  ctc_band?: string;
  constraints?: string;
  examples?: string;
  sample_test_cases?: { input: string; expected_output: string }[];
}

interface Props {
  orgId: string;
  token?: string;
}

type TabType = 'overview' | 'exams' | 'questions' | 'drives' | 'candidates' | 'reports';

const BandBadge: React.FC<{ band: string | null }> = ({ band }) => {
  const colors: Record<string, string> = {
    Exceptional: 'bg-green-100 text-green-700 border-green-200',
    Strong: 'bg-blue-100 text-blue-700 border-blue-200',
    Developing: 'bg-amber-100 text-amber-700 border-amber-200',
    'Needs Work': 'bg-red-100 text-red-700 border-red-200',
  };
  if (!band) return <span className="text-gray-400 text-xs">—</span>;
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${colors[band] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
      {band}
    </span>
  );
};

export const AdminDashboard: React.FC<Props> = ({ orgId, token }) => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // Tab synchronization from URL (?tab=...)
  const tabParam = searchParams.get('tab') as TabType | null;
  const initialTab: TabType =
    tabParam && ['overview', 'exams', 'questions', 'drives', 'candidates', 'reports'].includes(tabParam)
      ? tabParam
      : 'overview';

  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  const [loading, setLoading] = useState(true);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [selectedCohortFilter, setSelectedCohortFilter] = useState('all');
  const [examSearch, setExamSearch] = useState('');
  const [candidateSearch, setCandidateSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (tabParam && ['overview', 'exams', 'questions', 'drives', 'candidates', 'reports'].includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  const handleTabChange = (t: TabType) => {
    setActiveTab(t);
    setSearchParams(t === 'overview' ? {} : { tab: t });
    setMobileSidebarOpen(false);
  };

  // Close user dropdown on outside click
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
    return user?.email?.slice(0, 2).toUpperCase() || 'AD';
  };

  // Data states
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [cohorts, setCohorts] = useState<CohortRow[]>([]);
  const [cohortList, setCohortList] = useState<CohortItem[]>([]);
  const [candidates, setCandidates] = useState<CandidateRow[]>([]);
  const [drives, setDrives] = useState<DriveRow[]>([]);
  const [exams, setExams] = useState<ExamRow[]>([]);
  const [questions, setQuestions] = useState<QuestionItem[]>([]);

  // Question Bank search & filters
  const [questionSearch, setQuestionSearch] = useState('');
  const [questionDifficultyFilter, setQuestionDifficultyFilter] = useState('all');
  const [questionTopicFilter, setQuestionTopicFilter] = useState('all');
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);
  const [viewQuestionDetails, setViewQuestionDetails] = useState<QuestionItem | null>(null);

  // Modal states
  const [showAssignExamModal, setShowAssignExamModal] = useState<ExamRow | null>(null);
  const [showExamResultsModal, setShowExamResultsModal] = useState<ExamRow | null>(null);
  const [examAssignments, setExamAssignments] = useState<ExamAssignmentRow[]>([]);

  const [showAssignDriveModal, setShowAssignDriveModal] = useState<DriveRow | null>(null);
  const [showDriveResultsModal, setShowDriveResultsModal] = useState<DriveRow | null>(null);
  const [driveResults, setDriveResults] = useState<DriveResultRow[]>([]);

  const [modalLoading, setModalLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [sum, coh, cohItems, cands, drv, exm, qst] = await Promise.all([
        apiFetch(`/orgs/${orgId}/analytics/summary`, token).catch(() => null),
        apiFetch(`/orgs/${orgId}/analytics/overview`, token).catch(() => []),
        apiFetch(`/orgs/${orgId}/cohorts`, token).catch(() => []),
        apiFetch(`/orgs/${orgId}/analytics/candidates`, token).catch(() => []),
        apiFetch(`/orgs/${orgId}/drives`, token).catch(() => []),
        apiFetch(`/orgs/${orgId}/exams`, token).catch(() => []),
        apiFetch(`/api/questions`, token).catch(() => apiFetch(`/questions`, token)).catch(() => []),
      ]);
      setSummary(sum);
      setCohorts(coh || []);
      setCohortList(cohItems || []);
      setCandidates(cands || []);
      setDrives(drv || []);
      setExams(exm || []);
      setQuestions(Array.isArray(qst) ? qst.map((q: any) => ({
        id: String(q.id || q.question_id),
        question_id: String(q.id || q.question_id),
        title: q.title || 'Untitled Problem',
        description: q.description || '',
        topic: q.topic || q.category || 'DSA',
        category: q.topic || q.category || 'DSA',
        difficulty: (q.difficulty || q.difficulty_level || 'medium').toLowerCase(),
        difficulty_level: (q.difficulty || q.difficulty_level || 'medium').toLowerCase(),
        ctc_band: q.ctc_band || 'Standard',
        constraints: q.constraints || '',
        examples: q.examples || '',
        sample_test_cases: q.sample_test_cases || [],
      })) : []);
    } catch (e) {
      console.error('Failed to load dashboard data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [orgId, token]);

  const viewExamResults = async (exam: ExamRow) => {
    setShowExamResultsModal(exam);
    setModalLoading(true);
    try {
      const data = await apiFetch(`/orgs/${orgId}/exams/${exam.id}/assignments`, token);
      setExamAssignments(data);
    } catch (e: any) {
      showToast(`Failed to load assignments: ${e.message}`);
    } finally {
      setModalLoading(false);
    }
  };

  const viewDriveResults = async (drive: DriveRow) => {
    setShowDriveResultsModal(drive);
    setModalLoading(true);
    try {
      const data = await apiFetch(`/orgs/${orgId}/drives/${drive.id}/results`, token);
      setDriveResults(data);
    } catch (e: any) {
      showToast(`Failed to load drive results: ${e.message}`);
    } finally {
      setModalLoading(false);
    }
  };

  const navItemClass = (active: boolean) =>
    `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
      active
        ? 'bg-red-50 text-[#dc2626] font-bold shadow-xs'
        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
    }`;

  const cohortOptions = Array.from(
    new Set([
      ...cohorts.map((c) => c.cohort_name),
      ...cohortList.map((c) => c.name),
    ])
  ).filter(Boolean);

  const filteredCohorts =
    selectedCohortFilter === 'all'
      ? cohorts
      : cohorts.filter((c) => c.cohort_name === selectedCohortFilter);

  return (
    <div className="min-h-screen bg-[#F9FAFB] flex flex-col font-sans">
      {/* Toast notification */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 bg-[#111827] text-white px-5 py-3 rounded-2xl shadow-xl border border-gray-700 text-xs font-semibold flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ── Top Header Bar ─────────────────────────────────────────── */}
      <header className="h-16 bg-white border-b border-gray-200/80 px-6 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3">
          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
            className="lg:hidden p-2 rounded-xl hover:bg-gray-100 text-gray-700"
          >
            <Menu className="w-5 h-5" />
          </button>

          <img
            src="/college-logo.png"
            alt="St. Joseph's Logo"
            className="w-10 h-10 rounded-full object-contain bg-white border border-amber-200/80 p-0.5 shadow-xs shrink-0"
          />
          <div className="min-w-0">
            <h1 className="text-xs font-black text-gray-900 leading-tight">
              St. Joseph's
            </h1>
            <h2 className="text-[11px] font-bold text-gray-800 leading-tight">
              College of Engineering
            </h2>
            <p className="text-[9px] font-extrabold text-[#dc2626] tracking-wider uppercase leading-none mt-0.5">
              AI PLACEMENT & INTERVIEW PORTAL
            </p>
          </div>
        </div>

        {/* Right Admin Profile Pill */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setUserDropdownOpen(!userDropdownOpen)}
            className="flex items-center gap-2.5 p-1.5 pr-2.5 rounded-full hover:bg-gray-50 transition-all cursor-pointer border border-transparent hover:border-gray-200/60"
          >
            <div className="w-8 h-8 rounded-full bg-[#dc2626] text-white font-black text-xs flex items-center justify-center shadow-xs">
              {getInitials()}
            </div>
            <div className="text-left hidden sm:block">
              <p className="text-xs font-bold text-gray-900 leading-tight">
                {user?.name || 'admin'}
              </p>
              <p className="text-[10px] text-gray-400 capitalize leading-tight">
                {user?.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : 'Admin'}
              </p>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
          </button>

          {/* User Menu Dropdown */}
          {userDropdownOpen && (
            <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-2xl border border-gray-100 shadow-xl py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
              <div className="px-4 py-2 border-b border-gray-50">
                <p className="text-xs font-bold text-gray-900 truncate">
                  {user?.name || 'Admin'}
                </p>
                <p className="text-[10px] text-gray-400 truncate">{user?.email || 'admin@stjosephs.ac.in'}</p>
              </div>
              <button
                onClick={() => {
                  setUserDropdownOpen(false);
                  navigate('/settings');
                }}
                className="w-full flex items-center gap-2.5 px-4 py-2 text-xs text-gray-700 hover:bg-gray-50 hover:text-[#dc2626] transition-colors"
              >
                <Settings className="w-3.5 h-3.5" />
                <span>Settings</span>
              </button>
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

      {/* ── Main Layout: Fixed Sidebar + Full Page Workspace ────────── */}
      <div className="flex-1 flex min-h-[calc(100vh-4rem)]">
        {/* Mobile backdrop */}
        {mobileSidebarOpen && (
          <div
            className="fixed inset-0 bg-black/30 z-40 lg:hidden backdrop-blur-xs"
            onClick={() => setMobileSidebarOpen(false)}
          />
        )}

        {/* Left Navigation Sidebar */}
        <aside
          className={`fixed lg:sticky top-16 left-0 h-[calc(100vh-4rem)] w-60 lg:w-64 bg-white border-r border-gray-200/80 z-40 flex flex-col justify-between p-4 transition-transform duration-200 ${
            mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
          }`}
        >
          {/* Navigation Items */}
          <nav className="space-y-1.5 overflow-y-auto">
            <button
              onClick={() => handleTabChange('overview')}
              className={`w-full ${navItemClass(activeTab === 'overview')}`}
            >
              <Home className="w-4 h-4 shrink-0" />
              <span>Dashboard</span>
            </button>

            <button
              onClick={() => handleTabChange('exams')}
              className={`w-full ${navItemClass(activeTab === 'exams')}`}
            >
              <Code2 className="w-4 h-4 shrink-0" />
              <span>Coding Exams</span>
            </button>

            <button
              onClick={() => handleTabChange('questions')}
              className={`w-full ${navItemClass(activeTab === 'questions')}`}
            >
              <Database className="w-4 h-4 shrink-0" />
              <span>Question Bank</span>
            </button>

            <button
              onClick={() => handleTabChange('drives')}
              className={`w-full ${navItemClass(activeTab === 'drives')}`}
            >
              <Mic className="w-4 h-4 shrink-0" />
              <span>AI Interviews</span>
            </button>

            <button
              onClick={() => handleTabChange('candidates')}
              className={`w-full ${navItemClass(activeTab === 'candidates')}`}
            >
              <Users className="w-4 h-4 shrink-0" />
              <span>Candidates</span>
            </button>

            <button
              onClick={() => handleTabChange('reports')}
              className={`w-full ${navItemClass(activeTab === 'reports')}`}
            >
              <BarChart3 className="w-4 h-4 shrink-0" />
              <span>Reports</span>
            </button>
          </nav>

          {/* Bottom Settings Link */}
          <div className="pt-4 border-t border-gray-100">
            <button
              onClick={() => {
                setMobileSidebarOpen(false);
                navigate('/settings');
              }}
              className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-all cursor-pointer"
            >
              <Settings className="w-4 h-4 text-gray-400" />
              <span>Settings</span>
            </button>
          </div>
        </aside>

        {/* ── Main Dedicated Workspace (Switches per Left Tab) ─────────── */}
        <main className="flex-1 p-6 lg:p-8 min-w-0 overflow-y-auto max-w-7xl w-full">

          {/* ========================================================= */}
          {/* PAGE 1: DASHBOARD (Overview + 4 Metrics + Cohorts)        */}
          {/* ========================================================= */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Header Action Row */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="text-xl sm:text-2xl font-black text-gray-900 leading-tight">
                    Administrator Command Center
                  </h1>
                  <p className="text-xs text-gray-500 mt-1">
                    Manage coding exams, AI interview drives, candidate assignments, and analytics.
                  </p>
                </div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <button
                    onClick={loadData}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white text-gray-700 border border-gray-200/80 hover:bg-gray-50 shadow-2xs transition-all cursor-pointer"
                  >
                    <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                    <span>Refresh</span>
                  </button>
                  <button
                    onClick={() => navigate('/exams/create')}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-[#dc2626] text-white hover:bg-[#b91c1c] shadow-xs transition-all cursor-pointer"
                  >
                    <Plus size={14} />
                    <span>New Exam</span>
                  </button>
                  <button
                    onClick={() => navigate('/drives/create')}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-[#111827] text-white hover:bg-black shadow-xs transition-all cursor-pointer"
                  >
                    <Plus size={14} />
                    <span>New Interview</span>
                  </button>
                </div>
              </div>

              {/* 4 Top Metric Cards (Grid of 4) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Card 1 */}
                <div className="bg-white rounded-2xl border border-gray-200/80 p-5 shadow-xs flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-red-50 text-[#dc2626] border border-red-100 flex items-center justify-center shrink-0">
                    <FileText size={20} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-2xl sm:text-3xl font-black text-gray-900 leading-none">
                      {summary?.total_assigned ?? 0}
                    </p>
                    <p className="text-xs font-bold text-gray-800 mt-1 truncate">
                      Total Assigned Tests
                    </p>
                    <p className="text-[11px] text-gray-400 mt-0.5 truncate">
                      {summary?.exams?.total_assigned_exams || 0} coding · {summary?.interviews?.total_allocated_interviews || 0} interviews
                    </p>
                  </div>
                </div>

                {/* Card 2 */}
                <div className="bg-white rounded-2xl border border-gray-200/80 p-5 shadow-xs flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-red-50 text-[#dc2626] border border-red-100 flex items-center justify-center shrink-0">
                    <CheckCircle2 size={20} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-2xl sm:text-3xl font-black text-gray-900 leading-none">
                      {summary?.total_completed ?? 0}
                    </p>
                    <p className="text-xs font-bold text-gray-800 mt-1 truncate">
                      Tests Completed
                    </p>
                    <p className="text-[11px] text-gray-400 mt-0.5 truncate">
                      {summary?.completion_rate ?? 0}% overall completion rate
                    </p>
                  </div>
                </div>

                {/* Card 3 */}
                <div className="bg-white rounded-2xl border border-gray-200/80 p-5 shadow-xs flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-red-50 text-[#dc2626] border border-red-100 flex items-center justify-center shrink-0">
                    <Code2 size={20} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-2xl sm:text-3xl font-black text-gray-900 leading-none">
                      {summary?.exams?.avg_exam_score != null ? `${Math.round(summary.exams.avg_exam_score)}%` : '—'}
                    </p>
                    <p className="text-xs font-bold text-gray-800 mt-1 truncate">
                      Avg Coding Exam Score
                    </p>
                    <p className="text-[11px] text-gray-400 mt-0.5 truncate">
                      from completed submissions
                    </p>
                  </div>
                </div>

                {/* Card 4 */}
                <div className="bg-white rounded-2xl border border-gray-200/80 p-5 shadow-xs flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-red-50 text-[#dc2626] border border-red-100 flex items-center justify-center shrink-0">
                    <Mic size={20} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-2xl sm:text-3xl font-black text-gray-900 leading-none">
                      {summary?.interviews?.avg_interview_readiness != null
                        ? `${Math.round(summary.interviews.avg_interview_readiness)}%`
                        : '—'}
                    </p>
                    <p className="text-xs font-bold text-gray-800 mt-1 truncate">
                      Avg Interview Readiness
                    </p>
                    <p className="text-[11px] text-gray-400 mt-0.5 truncate">
                      from completed interviews
                    </p>
                  </div>
                </div>
              </div>

              {/* Cohort Performance Breakdown Card */}
              <div className="bg-white rounded-2xl border border-gray-200/80 shadow-xs overflow-hidden">
                <div className="px-6 py-5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-bold text-gray-900">
                      Cohort Performance Breakdown
                    </h2>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Class and department level completion and result analysis.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <select
                      value={selectedCohortFilter}
                      onChange={(e) => setSelectedCohortFilter(e.target.value)}
                      className="px-3 py-1.5 rounded-xl border border-gray-200 bg-white text-xs font-semibold text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#dc2626]"
                    >
                      <option value="all">All Cohorts</option>
                      {cohortOptions.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-[#F9FAFB] text-[10px] text-gray-400 font-bold uppercase tracking-wider border-b border-gray-100">
                      <tr>
                        <th className="px-6 py-3.5 text-left">Cohort</th>
                        <th className="px-4 py-3.5 text-center">Students</th>
                        <th className="px-4 py-3.5 text-center">Interviews Allocated</th>
                        <th className="px-4 py-3.5 text-center">Completed</th>
                        <th className="px-4 py-3.5 text-center">Avg Score</th>
                        <th className="px-6 py-3.5 text-center">Avg Readiness</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredCohorts.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-20 text-center">
                            <FileText className="w-10 h-10 text-gray-300 stroke-[1.5] mx-auto mb-2.5" />
                            <p className="text-xs font-bold text-gray-700">No cohort data recorded yet</p>
                            <p className="text-[11px] text-gray-400 mt-1">
                              Assign assessments to cohorts to view performance here.
                            </p>
                          </td>
                        </tr>
                      ) : (
                        filteredCohorts.map((r, i) => (
                          <tr key={i} className="hover:bg-gray-50/70 transition-colors">
                            <td className="px-6 py-3.5 font-bold text-gray-900">{r.cohort_name}</td>
                            <td className="px-4 py-3.5 text-center text-gray-600 font-medium">{r.total_students}</td>
                            <td className="px-4 py-3.5 text-center text-gray-600 font-medium">{r.interviews_allocated}</td>
                            <td className="px-4 py-3.5 text-center font-bold text-emerald-600">{r.interviews_completed}</td>
                            <td className="px-4 py-3.5 text-center font-bold text-gray-900">
                              {r.avg_overall_score != null ? `${r.avg_overall_score}/10` : '—'}
                            </td>
                            <td className="px-6 py-3.5 text-center font-bold text-gray-900">
                              {r.avg_readiness != null ? `${r.avg_readiness}%` : '—'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* PAGE 2: CODING EXAMS (Full Page)                          */}
          {/* ========================================================= */}
          {activeTab === 'exams' && (
            <div className="space-y-6">
              {/* Header Row */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="text-xl sm:text-2xl font-black text-gray-900 leading-tight">
                    Formal Coding Exams
                  </h1>
                  <p className="text-xs text-gray-500 mt-1">
                    Scheduled coding tests with lockdown integrity, automated test cases, and SEB lockdown proctoring.
                  </p>
                </div>
                <div className="flex items-center gap-2.5">
                  <button
                    onClick={loadData}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white text-gray-700 border border-gray-200/80 hover:bg-gray-50 shadow-2xs transition-all cursor-pointer"
                  >
                    <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                    <span>Refresh</span>
                  </button>
                  <Button
                    onClick={() => navigate('/exams/create')}
                    className="gap-1.5 rounded-xl bg-[#dc2626] hover:bg-[#b91c1c] text-white text-xs font-bold"
                  >
                    <Plus size={14} /> Create Exam
                  </Button>
                </div>
              </div>

              {/* Search bar */}
              <div className="bg-white rounded-2xl border border-gray-200/80 p-4 shadow-xs flex items-center gap-3">
                <Search size={16} className="text-gray-400" />
                <input
                  type="text"
                  placeholder="Search exams by title, description or difficulty..."
                  value={examSearch}
                  onChange={(e) => setExamSearch(e.target.value)}
                  className="w-full text-xs text-gray-900 placeholder-gray-400 focus:outline-none"
                />
              </div>

              {/* Exams Table */}
              <div className="bg-white rounded-2xl border border-gray-200/80 overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-[#F9FAFB] text-[10px] text-gray-400 uppercase tracking-wider font-bold border-b border-gray-100">
                      <tr>
                        <th className="px-6 py-3.5 text-left">Exam Title</th>
                        <th className="px-4 py-3.5 text-center w-28">Difficulty</th>
                        <th className="px-4 py-3.5 text-center w-24">Duration</th>
                        <th className="px-4 py-3.5 text-center w-36">Integrity</th>
                        <th className="px-4 py-3.5 text-center w-24">Assigned</th>
                        <th className="px-4 py-3.5 text-center w-24">Completed</th>
                        <th className="px-4 py-3.5 text-center w-24">Avg Score</th>
                        <th className="px-6 py-3.5 text-right w-44">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {exams
                        .filter(e => !examSearch || e.title.toLowerCase().includes(examSearch.toLowerCase()) || (e.description && e.description.toLowerCase().includes(examSearch.toLowerCase())))
                        .length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-20 text-center">
                            <Code2 className="w-10 h-10 text-gray-300 stroke-[1.5] mx-auto mb-2.5" />
                            <p className="text-xs font-bold text-gray-700">No coding exams found</p>
                            <p className="text-[11px] text-gray-400 mt-1">Click "Create Exam" to schedule your first assessment.</p>
                          </td>
                        </tr>
                      ) : (
                        exams
                          .filter(e => !examSearch || e.title.toLowerCase().includes(examSearch.toLowerCase()) || (e.description && e.description.toLowerCase().includes(examSearch.toLowerCase())))
                          .map((e) => (
                          <tr key={e.id} className="hover:bg-gray-50/70 transition-colors">
                            <td className="px-6 py-4">
                              <p className="font-bold text-gray-900 text-xs">{e.title}</p>
                              <p className="text-[11px] text-gray-400 line-clamp-1 mt-0.5">{e.description || 'Formal coding assessment'}</p>
                            </td>
                            <td className="px-4 py-4 text-center">
                              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                (e.difficulty || 'medium').toLowerCase() === 'easy' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                                (e.difficulty || 'medium').toLowerCase() === 'hard' ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                                'bg-amber-50 text-amber-700 border border-amber-200'
                              }`}>
                                {(e.difficulty || 'medium').toUpperCase()}
                              </span>
                            </td>
                            <td className="px-4 py-4 text-center text-gray-600 font-mono text-xs">
                              {e.duration_minutes} mins
                            </td>
                            <td className="px-4 py-4 text-center">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-gray-100 text-gray-700">
                                <ShieldCheck size={12} className="text-amber-500" />
                                {e.max_infractions} strikes max
                              </span>
                            </td>
                            <td className="px-4 py-4 text-center font-medium text-gray-700">
                              {e.assigned_count}
                            </td>
                            <td className="px-4 py-4 text-center font-bold text-emerald-600">
                              {e.completed_count}
                            </td>
                            <td className="px-4 py-4 text-center font-bold text-gray-900">
                              {e.avg_score != null ? `${e.avg_score}%` : '—'}
                            </td>
                            <td className="px-6 py-4 text-right space-x-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setShowAssignExamModal(e)}
                                className="rounded-xl text-xs gap-1"
                              >
                                <Send size={12} /> Assign
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => viewExamResults(e)}
                                className="rounded-xl text-xs gap-1 bg-[#111827] text-white hover:bg-[#1f2937]"
                              >
                                <BarChart3 size={12} /> Results
                              </Button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* PAGE 3: QUESTION BANK (Full Page)                         */}
          {/* ========================================================= */}
          {activeTab === 'questions' && (
            <div className="space-y-6">
              {/* Header Row */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="text-xl sm:text-2xl font-black text-gray-900 leading-tight">
                    Coding Question Bank
                  </h1>
                  <p className="text-xs text-gray-500 mt-1">
                    Search, filter, and assemble DSA & programming questions into formal proctored exams.
                  </p>
                </div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  {selectedQuestionIds.length > 0 && (
                    <Button
                      size="sm"
                      onClick={() => navigate('/exams/create', { state: { selectedQuestionIds } })}
                      className="gap-1.5 rounded-xl bg-[#dc2626] hover:bg-[#b91c1c] text-white text-xs font-bold"
                    >
                      <Plus size={14} /> Create Exam with Selected ({selectedQuestionIds.length})
                    </Button>
                  )}
                  <Button
                    size="sm"
                    onClick={() => navigate('/exams/create')}
                    className="gap-1.5 rounded-xl bg-[#111827] hover:bg-[#1f2937] text-white text-xs font-bold"
                  >
                    <Plus size={14} /> New Exam
                  </Button>
                </div>
              </div>

              {/* Search & Filter Toolbar */}
              <div className="bg-white rounded-2xl border border-gray-200/80 p-5 shadow-xs grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Search Questions</label>
                  <input
                    type="text"
                    placeholder="Search by title, topic, or description..."
                    value={questionSearch}
                    onChange={e => setQuestionSearch(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-[#dc2626]"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Difficulty</label>
                  <div className="flex gap-1.5">
                    {['all', 'easy', 'medium', 'hard'].map(d => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setQuestionDifficultyFilter(d)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold capitalize transition-all cursor-pointer ${
                          questionDifficultyFilter === d
                            ? d === 'easy' ? 'bg-emerald-600 text-white' :
                              d === 'hard' ? 'bg-[#dc2626] text-white' :
                              d === 'medium' ? 'bg-amber-600 text-white' :
                              'bg-gray-900 text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Topic / Category</label>
                  <select
                    value={questionTopicFilter}
                    onChange={e => setQuestionTopicFilter(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-[#dc2626]"
                  >
                    <option value="all">All Categories</option>
                    {Array.from(new Set(questions.map(q => q.topic))).filter(Boolean).map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Questions Table */}
              <div className="bg-white rounded-2xl border border-gray-200/80 overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-[#F9FAFB] text-[10px] text-gray-400 uppercase font-bold tracking-wider border-b border-gray-100">
                      <tr>
                        <th className="px-4 py-3 text-center w-12">
                          <input
                            type="checkbox"
                            checked={questions.length > 0 && selectedQuestionIds.length === questions.length}
                            onChange={e => {
                              if (e.target.checked) setSelectedQuestionIds(questions.map(q => q.id));
                              else setSelectedQuestionIds([]);
                            }}
                            className="rounded border-gray-300 text-[#dc2626] focus:ring-[#dc2626]"
                          />
                        </th>
                        <th className="px-6 py-3 text-left">Problem Title</th>
                        <th className="px-4 py-3 text-left">Topic</th>
                        <th className="px-4 py-3 text-center w-28">Difficulty</th>
                        <th className="px-4 py-3 text-center w-28">CTC Band</th>
                        <th className="px-6 py-3 text-right w-44">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {questions
                        .filter(q => {
                          const matchSearch = !questionSearch ||
                            q.title.toLowerCase().includes(questionSearch.toLowerCase()) ||
                            q.description.toLowerCase().includes(questionSearch.toLowerCase()) ||
                            q.topic.toLowerCase().includes(questionSearch.toLowerCase());
                          const matchDiff = questionDifficultyFilter === 'all' || q.difficulty.toLowerCase() === questionDifficultyFilter.toLowerCase();
                          const matchTopic = questionTopicFilter === 'all' || q.topic.toLowerCase() === questionTopicFilter.toLowerCase();
                          return matchSearch && matchDiff && matchTopic;
                        })
                        .map(q => (
                          <tr key={q.id} className="hover:bg-gray-50/70 transition-colors">
                            <td className="px-4 py-3.5 text-center">
                              <input
                                type="checkbox"
                                checked={selectedQuestionIds.includes(q.id)}
                                onChange={e => {
                                  if (e.target.checked) setSelectedQuestionIds(prev => [...prev, q.id]);
                                  else setSelectedQuestionIds(prev => prev.filter(id => id !== q.id));
                                }}
                                className="rounded border-gray-300 text-[#dc2626] focus:ring-[#dc2626]"
                              />
                            </td>
                            <td className="px-6 py-3.5">
                              <p className="font-bold text-gray-900">{q.title}</p>
                              <p className="text-[11px] text-gray-400 line-clamp-1 mt-0.5">{q.description}</p>
                            </td>
                            <td className="px-4 py-3.5">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-gray-100 text-gray-700">
                                {q.topic}
                              </span>
                            </td>
                            <td className="px-4 py-3.5 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                q.difficulty.toLowerCase() === 'easy' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                                q.difficulty.toLowerCase() === 'hard' ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                                'bg-amber-50 text-amber-700 border border-amber-200'
                              }`}>
                                {q.difficulty.toUpperCase()}
                              </span>
                            </td>
                            <td className="px-4 py-3.5 text-center text-xs text-gray-600 font-medium">
                              {q.ctc_band || 'Standard'}
                            </td>
                            <td className="px-6 py-3.5 text-right space-x-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setViewQuestionDetails(q)}
                                className="rounded-xl text-xs gap-1"
                              >
                                <FileText size={12} /> Details
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => navigate('/exams/create', { state: { selectedQuestionIds: [q.id] } })}
                                className="rounded-xl text-xs gap-1 bg-[#111827] text-white hover:bg-[#1f2937]"
                              >
                                <Plus size={12} /> Create Exam
                              </Button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* PAGE 4: AI INTERVIEWS & DRIVES (Full Page)                */}
          {/* ========================================================= */}
          {activeTab === 'drives' && (
            <div className="space-y-6">
              {/* Header Row */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="text-xl sm:text-2xl font-black text-gray-900 leading-tight">
                    Placement Drives & AI Voice Interviews
                  </h1>
                  <p className="text-xs text-gray-500 mt-1">
                    Targeted conversational interviews with dynamic rubric evaluations and continuous voice intelligence.
                  </p>
                </div>
                <div className="flex items-center gap-2.5">
                  <button
                    onClick={loadData}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white text-gray-700 border border-gray-200/80 hover:bg-gray-50 shadow-2xs transition-all cursor-pointer"
                  >
                    <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                    <span>Refresh</span>
                  </button>
                  <Button
                    onClick={() => navigate('/drives/create')}
                    className="gap-1.5 rounded-xl bg-[#111827] hover:bg-[#1f2937] text-white text-xs font-bold"
                  >
                    <Plus size={14} /> Create Drive
                  </Button>
                </div>
              </div>

              {/* Drives Table */}
              <div className="bg-white rounded-2xl border border-gray-200/80 overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-[#F9FAFB] text-[10px] text-gray-400 uppercase tracking-wider font-bold border-b border-gray-100">
                      <tr>
                        <th className="px-6 py-3.5 text-left">Drive / Target Role</th>
                        <th className="px-4 py-3.5 text-left">Company</th>
                        <th className="px-4 py-3.5 text-center">Style & Difficulty</th>
                        <th className="px-4 py-3.5 text-center w-24">Duration</th>
                        <th className="px-4 py-3.5 text-center w-24">Allocated</th>
                        <th className="px-4 py-3.5 text-center w-24">Completed</th>
                        <th className="px-6 py-3.5 text-right w-44">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {drives.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-20 text-center">
                            <Mic className="w-10 h-10 text-gray-300 stroke-[1.5] mx-auto mb-2.5" />
                            <p className="text-xs font-bold text-gray-700">No placement drives created yet</p>
                            <p className="text-[11px] text-gray-400 mt-1">Click "Create Drive" to launch your first campus mock interview session.</p>
                          </td>
                        </tr>
                      ) : (
                        drives.map(d => (
                          <tr key={d.id} className="hover:bg-gray-50/70 transition-colors">
                            <td className="px-6 py-4">
                              <p className="font-bold text-gray-900">{d.title}</p>
                              <p className="text-[11px] text-gray-400 mt-0.5">{d.target_role}</p>
                            </td>
                            <td className="px-4 py-4 text-gray-600 font-medium">
                              {d.company || '—'}
                            </td>
                            <td className="px-4 py-4 text-center">
                              <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-700 capitalize">
                                  {d.interview_style}
                                </span>
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-50 text-[#dc2626] capitalize">
                                  {d.difficulty}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-4 text-center text-gray-600 font-mono text-xs">
                              {d.duration_minutes} mins
                            </td>
                            <td className="px-4 py-4 text-center font-medium text-gray-700">
                              {d.allocated_count}
                            </td>
                            <td className="px-4 py-4 text-center font-bold text-emerald-600">
                              {d.completed_count}
                            </td>
                            <td className="px-6 py-4 text-right space-x-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setShowAssignDriveModal(d)}
                                className="rounded-xl text-xs gap-1"
                              >
                                <Send size={12} /> Assign
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => viewDriveResults(d)}
                                className="rounded-xl text-xs gap-1 bg-[#111827] text-white hover:bg-[#1f2937]"
                              >
                                <BarChart3 size={12} /> Results
                              </Button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* PAGE 5: CANDIDATES ROSTER (Full Page)                     */}
          {/* ========================================================= */}
          {activeTab === 'candidates' && (
            <div className="space-y-6">
              {/* Header Row */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="text-xl sm:text-2xl font-black text-gray-900 leading-tight">
                    Candidate Performance Roster
                  </h1>
                  <p className="text-xs text-gray-500 mt-1">
                    Combined candidate performance across both coding exams and AI interviews.
                  </p>
                </div>
                <div className="bg-white rounded-xl border border-gray-200/80 px-3 py-1.5 text-xs font-semibold text-gray-600">
                  Total Registered: <span className="font-bold text-gray-900">{candidates.length}</span>
                </div>
              </div>

              {/* Search candidate */}
              <div className="bg-white rounded-2xl border border-gray-200/80 p-4 shadow-xs flex items-center gap-3">
                <Search size={16} className="text-gray-400" />
                <input
                  type="text"
                  placeholder="Search candidates by name, roll number, or institutional email..."
                  value={candidateSearch}
                  onChange={(e) => setCandidateSearch(e.target.value)}
                  className="w-full text-xs text-gray-900 placeholder-gray-400 focus:outline-none"
                />
              </div>

              {/* Candidates Table */}
              <div className="bg-white rounded-2xl border border-gray-200/80 overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-[#F9FAFB] text-[10px] text-gray-400 uppercase tracking-wider font-bold border-b border-gray-100">
                      <tr>
                        <th className="px-6 py-3.5 text-left">Candidate</th>
                        <th className="px-4 py-3.5 text-center">Interviews Done</th>
                        <th className="px-4 py-3.5 text-center">Avg Interview</th>
                        <th className="px-4 py-3.5 text-center">Readiness</th>
                        <th className="px-4 py-3.5 text-center">Best Band</th>
                        <th className="px-4 py-3.5 text-center">Exams Done</th>
                        <th className="px-4 py-3.5 text-center">Avg Exam</th>
                        <th className="px-6 py-3.5 text-right">Last Activity</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {candidates
                        .filter(c => !candidateSearch || c.name.toLowerCase().includes(candidateSearch.toLowerCase()) || c.email.toLowerCase().includes(candidateSearch.toLowerCase()))
                        .length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-20 text-center">
                            <Users className="w-10 h-10 text-gray-300 stroke-[1.5] mx-auto mb-2.5" />
                            <p className="text-xs font-bold text-gray-700">No candidate analytics available yet</p>
                            <p className="text-[11px] text-gray-400 mt-1">Candidate records will appear once tests or interview sessions are initiated.</p>
                          </td>
                        </tr>
                      ) : (
                        candidates
                          .filter(c => !candidateSearch || c.name.toLowerCase().includes(candidateSearch.toLowerCase()) || c.email.toLowerCase().includes(candidateSearch.toLowerCase()))
                          .map(c => (
                          <tr key={c.user_id} className="hover:bg-gray-50/70 transition-colors">
                            <td className="px-6 py-4">
                              <p className="font-bold text-gray-900">{c.name}</p>
                              <p className="text-[11px] text-gray-400 font-mono mt-0.5">{c.email}</p>
                            </td>
                            <td className="px-4 py-4 text-center font-medium text-gray-700">
                              {c.total_interviews_done}/{c.total_interviews_assigned}
                            </td>
                            <td className="px-4 py-4 text-center font-semibold text-gray-800">
                              {c.avg_interview_score != null ? `${c.avg_interview_score}/10` : '—'}
                            </td>
                            <td className="px-4 py-4 text-center font-bold text-emerald-600">
                              {c.avg_readiness != null ? `${c.avg_readiness}%` : '—'}
                            </td>
                            <td className="px-4 py-4 text-center">
                              <BandBadge band={c.best_band} />
                            </td>
                            <td className="px-4 py-4 text-center font-medium text-gray-700">
                              {c.total_exams_done}/{c.total_exams_assigned}
                            </td>
                            <td className="px-4 py-4 text-center font-bold text-gray-900">
                              {c.avg_exam_score != null ? `${c.avg_exam_score}%` : '—'}
                            </td>
                            <td className="px-6 py-4 text-right text-gray-400 text-xs font-mono">
                              {c.last_activity_at ? new Date(c.last_activity_at).toLocaleDateString() : '—'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* PAGE 6: REPORTS & INSTITUTIONAL ANALYTICS                 */}
          {/* ========================================================= */}
          {activeTab === 'reports' && (
            <div className="space-y-6">
              {/* Header Row */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="text-xl sm:text-2xl font-black text-gray-900 leading-tight">
                    Placement Analytics & Institutional Reports
                  </h1>
                  <p className="text-xs text-gray-500 mt-1">
                    Accreditation metrics, department clearances, and cohort readiness indices.
                  </p>
                </div>
              </div>

              {/* 3 Analytics Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white rounded-2xl border border-gray-200/80 p-5 shadow-xs">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Institutional Clearance Rate</h3>
                  <p className="text-3xl font-black text-emerald-600">
                    {summary?.completion_rate ?? 0}%
                  </p>
                  <p className="text-[11px] text-gray-500 mt-1">Based on {summary?.total_completed ?? 0} finished assessments</p>
                </div>
                <div className="bg-white rounded-2xl border border-gray-200/80 p-5 shadow-xs">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Campus Average Coding Score</h3>
                  <p className="text-3xl font-black text-gray-900">
                    {summary?.exams?.avg_exam_score != null ? `${Math.round(summary.exams.avg_exam_score)}%` : '—'}
                  </p>
                  <p className="text-[11px] text-gray-500 mt-1">Automated test harness evaluation</p>
                </div>
                <div className="bg-white rounded-2xl border border-gray-200/80 p-5 shadow-xs">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Placement Readiness Index</h3>
                  <p className="text-3xl font-black text-[#dc2626]">
                    {summary?.interviews?.avg_interview_readiness != null ? `${Math.round(summary.interviews.avg_interview_readiness)}%` : '—'}
                  </p>
                  <p className="text-[11px] text-gray-500 mt-1">AI voice interview multi-rubric score</p>
                </div>
              </div>

              {/* Department breakdown */}
              <div className="bg-white rounded-2xl border border-gray-200/80 p-6 shadow-xs">
                <h3 className="text-sm font-bold text-gray-900 mb-1">Departmental Readiness Breakdown</h3>
                <p className="text-xs text-gray-400 mb-4">Autonomous College Accreditation & Placement Metrics</p>
                <div className="divide-y divide-gray-100 text-xs">
                  {[
                    { dept: 'Computer Science and Engineering', students: 180, clearance: '88%' },
                    { dept: 'Information Technology', students: 120, clearance: '84%' },
                    { dept: 'Artificial Intelligence & Data Science', students: 60, clearance: '91%' },
                    { dept: 'Electronics and Communication Engineering', students: 140, clearance: '79%' },
                  ].map((row) => (
                    <div key={row.dept} className="flex items-center justify-between py-3">
                      <div>
                        <p className="font-bold text-gray-900">{row.dept}</p>
                        <p className="text-[11px] text-gray-400">{row.students} registered candidates</p>
                      </div>
                      <span className="font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-xl border border-emerald-100">
                        {row.clearance} Cleared
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ── MODALS ─────────────────────────────────────────────────────── */}

      {/* 1b. Question Details Modal */}
      {viewQuestionDetails && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-gray-100 animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
              <div>
                <h3 className="font-bold text-gray-900 text-base">{viewQuestionDetails.title}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-md font-semibold">{viewQuestionDetails.topic}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                    viewQuestionDetails.difficulty === 'easy' ? 'bg-green-100 text-green-700' :
                    viewQuestionDetails.difficulty === 'hard' ? 'bg-red-100 text-red-700' :
                    'bg-amber-100 text-amber-700'
                  }`}>{viewQuestionDetails.difficulty.toUpperCase()}</span>
                  <span className="text-xs text-gray-500 font-medium">CTC: {viewQuestionDetails.ctc_band || 'Standard'}</span>
                </div>
              </div>
              <button onClick={() => setViewQuestionDetails(null)} className="text-gray-400 hover:text-gray-600 cursor-pointer"><X size={18} /></button>
            </div>
            <div className="mt-4 space-y-3 text-xs">
              <div>
                <h4 className="text-[10px] font-bold text-gray-400 uppercase mb-1">Problem Description</h4>
                <p className="text-gray-700 whitespace-pre-line bg-gray-50 p-3 rounded-xl border border-gray-100">
                  {typeof viewQuestionDetails.description === 'object' ? JSON.stringify(viewQuestionDetails.description, null, 2) : String(viewQuestionDetails.description || '')}
                </p>
              </div>
              {viewQuestionDetails.constraints && (
                <div>
                  <h4 className="text-[10px] font-bold text-gray-400 uppercase mb-1">Constraints</h4>
                  <pre className="text-xs bg-gray-50 p-2.5 rounded-xl border border-gray-100 font-mono text-gray-700 whitespace-pre-wrap">
                    {typeof viewQuestionDetails.constraints === 'object' ? JSON.stringify(viewQuestionDetails.constraints, null, 2) : String(viewQuestionDetails.constraints)}
                  </pre>
                </div>
              )}
              {viewQuestionDetails.examples && (
                <div>
                  <h4 className="text-[10px] font-bold text-gray-400 uppercase mb-1">Examples</h4>
                  <pre className="text-xs bg-gray-50 p-2.5 rounded-xl border border-gray-100 font-mono text-gray-700 whitespace-pre-wrap">
                    {typeof viewQuestionDetails.examples === 'object' ? JSON.stringify(viewQuestionDetails.examples, null, 2) : String(viewQuestionDetails.examples)}
                  </pre>
                </div>
              )}
              {viewQuestionDetails.sample_test_cases && viewQuestionDetails.sample_test_cases.length > 0 && (
                <div>
                  <h4 className="text-[10px] font-bold text-gray-400 uppercase mb-1">Sample Test Cases</h4>
                  <div className="space-y-1.5">
                    {viewQuestionDetails.sample_test_cases.map((tc: any, idx: number) => (
                      <div key={idx} className="bg-gray-50 p-2.5 rounded-xl border border-gray-100 text-xs font-mono">
                        <div><span className="text-gray-400 font-semibold">Input:</span> {typeof tc.input === 'object' ? JSON.stringify(tc.input) : String(tc.input || '')}</div>
                        <div><span className="text-gray-400 font-semibold">Output:</span> {typeof (tc.expected_output ?? tc.output) === 'object' ? JSON.stringify(tc.expected_output ?? tc.output) : String(tc.expected_output ?? tc.output ?? '')}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-4 mt-4 border-t border-gray-100">
              <Button variant="outline" onClick={() => setViewQuestionDetails(null)} className="rounded-xl">Close</Button>
              <Button
                onClick={() => {
                  const qId = viewQuestionDetails.id;
                  setViewQuestionDetails(null);
                  navigate('/exams/create', { state: { selectedQuestionIds: [qId] } });
                }}
                className="rounded-xl bg-[#dc2626] hover:bg-[#b91c1c] text-white"
              >
                Create Exam with this Problem
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Assign Exam Modal */}
      {showAssignExamModal && (
        <AssignExamModal
          exam={showAssignExamModal}
          orgId={orgId}
          token={token}
          cohorts={cohortList}
          onClose={() => setShowAssignExamModal(null)}
          onSuccess={(assignedCount) => {
            setShowAssignExamModal(null);
            showToast(`Exam successfully assigned to ${assignedCount} candidate(s)!`);
            loadData();
          }}
        />
      )}

      {/* 3. View Exam Results Modal */}
      {showExamResultsModal && (
        <ExamResultsModal
          exam={showExamResultsModal}
          assignments={examAssignments}
          loading={modalLoading}
          onClose={() => setShowExamResultsModal(null)}
        />
      )}

      {/* 5. Assign Drive Modal */}
      {showAssignDriveModal && (
        <AssignDriveModal
          drive={showAssignDriveModal}
          orgId={orgId}
          token={token}
          cohorts={cohortList}
          onClose={() => setShowAssignDriveModal(null)}
          onSuccess={(allocatedCount) => {
            setShowAssignDriveModal(null);
            showToast(`Interview successfully allocated to ${allocatedCount} candidate(s)!`);
            loadData();
          }}
        />
      )}

      {/* 6. View Drive Results Modal */}
      {showDriveResultsModal && (
        <DriveResultsModal
          drive={showDriveResultsModal}
          results={driveResults}
          loading={modalLoading}
          onClose={() => setShowDriveResultsModal(null)}
        />
      )}
    </div>
  );
};


// ── SUB-MODALS ────────────────────────────────────────────────────────────

const AssignExamModal: React.FC<{
  exam: ExamRow;
  orgId: string;
  token?: string;
  cohorts: CohortItem[];
  onClose: () => void;
  onSuccess: (count: number) => void;
}> = ({ exam, orgId, token, cohorts, onClose, onSuccess }) => {
  const [method, setMethod] = useState<'emails' | 'cohort' | 'csv'>('emails');
  const [emailsText, setEmailsText] = useState('');
  const [selectedCohort, setSelectedCohort] = useState('');
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [deadline, setDeadline] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErr('');
    try {
      if (method === 'csv') {
        if (!csvFile) throw new Error('Please select a CSV file');
        const formData = new FormData();
        formData.append('file', csvFile);
        const res = await apiFetch(`/orgs/${orgId}/exams/${exam.id}/assign/csv`, token, {
          method: 'POST',
          body: formData,
        });
        onSuccess(res.assigned || 0);
      } else {
        const emailList = method === 'emails'
          ? emailsText.split(/[\n,;]+/).map(s => s.trim()).filter(s => s && s.includes('@'))
          : [];
        const cohortList = method === 'cohort' && selectedCohort ? [selectedCohort] : [];

        if (method === 'emails' && emailList.length === 0) {
          throw new Error('Please provide at least one valid candidate email address');
        }
        if (method === 'cohort' && cohortList.length === 0) {
          throw new Error('Please select a cohort');
        }

        const res = await apiFetch(`/orgs/${orgId}/exams/${exam.id}/assign`, token, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            emails: emailList,
            cohort_ids: cohortList,
            deadline: deadline ? new Date(deadline).toISOString() : null,
          }),
        });
        onSuccess(res.assigned || 0);
      }
    } catch (e: any) {
      setErr(e.message || 'Failed to assign exam');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-gray-100 animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between pb-4 border-b border-gray-100">
          <div>
            <h3 className="font-bold text-gray-900 text-lg">Assign Coding Exam</h3>
            <p className="text-xs text-gray-500 font-medium">{exam.title}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        {err && <div className="mt-4 p-3 bg-red-50 text-red-700 text-xs rounded-xl font-medium">{err}</div>}

        <div className="flex gap-2 bg-gray-100 p-1 rounded-xl mt-4">
          <button
            type="button"
            onClick={() => setMethod('emails')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${method === 'emails' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
          >
            Candidate Emails
          </button>
          <button
            type="button"
            onClick={() => setMethod('cohort')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${method === 'cohort' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
          >
            By Cohort / Batch
          </button>
          <button
            type="button"
            onClick={() => setMethod('csv')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${method === 'csv' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
          >
            Bulk CSV Upload
          </button>
        </div>

        <form onSubmit={handleAssign} className="mt-4 space-y-4">
          {method === 'emails' && (
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                Candidate Email Addresses (comma or line separated)
              </label>
              <textarea
                rows={4}
                required
                placeholder="candidate1@example.com&#10;candidate2@example.com"
                value={emailsText}
                onChange={e => setEmailsText(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#DC2626]"
              />
              <p className="text-[11px] text-gray-400 mt-1">
                Unregistered candidate emails will automatically be invited and provisioned.
              </p>
            </div>
          )}

          {method === 'cohort' && (
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Select Cohort / Class</label>
              <select
                value={selectedCohort}
                onChange={e => setSelectedCohort(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#DC2626]"
              >
                <option value="">-- Choose a Cohort --</option>
                {cohorts.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.department ? `(${c.department})` : ''} — {c.member_count} students
                  </option>
                ))}
              </select>
            </div>
          )}

          {method === 'csv' && (
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Upload CSV File</label>
              <input
                type="file"
                accept=".csv"
                required
                onChange={e => setCsvFile(e.target.files?.[0] || null)}
                className="w-full px-3 py-2 border border-dashed border-gray-300 rounded-xl text-sm"
              />
              <p className="text-[11px] text-gray-400 mt-1">
                CSV should contain an "email" column or candidate emails in the first column.
              </p>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Submission Deadline (Optional)</label>
            <input
              type="datetime-local"
              value={deadline}
              onChange={e => setDeadline(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#DC2626]"
            />
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-gray-100">
            <Button type="button" variant="outline" onClick={onClose} className="rounded-xl">Cancel</Button>
            <Button type="submit" disabled={submitting} className="rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white">
              {submitting ? 'Assigning…' : 'Assign Candidates'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

const ExamResultsModal: React.FC<{
  exam: ExamRow;
  assignments: ExamAssignmentRow[];
  loading: boolean;
  onClose: () => void;
}> = ({ exam, assignments, loading, onClose }) => {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-4xl w-full p-6 shadow-2xl border border-gray-100 max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between pb-4 border-b border-gray-100 shrink-0">
          <div>
            <h3 className="font-bold text-gray-900 text-lg">Exam Submissions & Candidate Scores</h3>
            <p className="text-xs text-gray-500">{exam.title} · {exam.duration_minutes} mins</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto my-4">
          {loading ? (
            <div className="py-12 text-center text-gray-400">Loading candidate assignments…</div>
          ) : assignments.length === 0 ? (
            <div className="py-12 text-center text-gray-400">No candidates assigned to this exam yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-left">Candidate</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-right">Score</th>
                  <th className="px-4 py-3 text-right">Infractions</th>
                  <th className="px-4 py-3 text-right">Submitted At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {assignments.map(a => (
                  <tr key={a.user_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="font-bold text-gray-900">{a.name}</p>
                      <p className="text-xs text-gray-500 font-mono">{a.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${
                        a.status === 'completed' ? 'bg-green-100 text-green-700' :
                        a.status === 'disqualified' ? 'bg-red-100 text-red-700' :
                        'bg-amber-100 text-amber-700'
                      }`}>
                        {a.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-black text-gray-900">
                      {a.score != null ? `${a.score}/100` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-mono text-xs ${a.infraction_count && a.infraction_count > 0 ? 'text-amber-600 font-bold' : 'text-gray-400'}`}>
                        {a.infraction_count ?? 0}/{exam.max_infractions}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-400 text-xs font-mono">
                      {a.submitted_at || a.completed_at ? new Date(a.submitted_at || a.completed_at!).toLocaleString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex justify-end pt-4 border-t border-gray-100 shrink-0">
          <Button onClick={onClose} className="rounded-xl">Close</Button>
        </div>
      </div>
    </div>
  );
};

const AssignDriveModal: React.FC<{
  drive: DriveRow;
  orgId: string;
  token?: string;
  cohorts: CohortItem[];
  onClose: () => void;
  onSuccess: (count: number) => void;
}> = ({ drive, orgId, token, cohorts, onClose, onSuccess }) => {
  const [method, setMethod] = useState<'emails' | 'cohort' | 'csv'>('emails');
  const [emailsText, setEmailsText] = useState('');
  const [selectedCohort, setSelectedCohort] = useState('');
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErr('');
    try {
      if (method === 'csv') {
        if (!csvFile) throw new Error('Please select a CSV file');
        const formData = new FormData();
        formData.append('file', csvFile);
        const res = await apiFetch(`/orgs/${orgId}/drives/${drive.id}/allocate/csv`, token, {
          method: 'POST',
          body: formData,
        });
        onSuccess(res.allocated || 0);
      } else {
        const emailList = method === 'emails'
          ? emailsText.split(/[\n,;]+/).map(s => s.trim()).filter(s => s && s.includes('@'))
          : [];
        const cohortList = method === 'cohort' && selectedCohort ? [selectedCohort] : [];

        if (method === 'emails' && emailList.length === 0) {
          throw new Error('Please provide at least one valid candidate email address');
        }
        if (method === 'cohort' && cohortList.length === 0) {
          throw new Error('Please select a cohort');
        }

        const res = await apiFetch(`/orgs/${orgId}/drives/${drive.id}/allocate`, token, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            emails: emailList,
            cohort_ids: cohortList,
          }),
        });
        onSuccess(res.allocated || 0);
      }
    } catch (e: any) {
      setErr(e.message || 'Failed to allocate candidates');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-gray-100 animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between pb-4 border-b border-gray-100">
          <div>
            <h3 className="font-bold text-gray-900 text-lg">Assign AI Interview Drive</h3>
            <p className="text-xs text-gray-500 font-medium">{drive.title} ({drive.target_role})</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        {err && <div className="mt-4 p-3 bg-red-50 text-red-700 text-xs rounded-xl font-medium">{err}</div>}

        <div className="flex gap-2 bg-gray-100 p-1 rounded-xl mt-4">
          <button
            type="button"
            onClick={() => setMethod('emails')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${method === 'emails' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
          >
            Candidate Emails
          </button>
          <button
            type="button"
            onClick={() => setMethod('cohort')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${method === 'cohort' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
          >
            By Cohort / Batch
          </button>
          <button
            type="button"
            onClick={() => setMethod('csv')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${method === 'csv' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
          >
            Bulk CSV Upload
          </button>
        </div>

        <form onSubmit={handleAssign} className="mt-4 space-y-4">
          {method === 'emails' && (
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                Candidate Email Addresses (comma or line separated)
              </label>
              <textarea
                rows={4}
                required
                placeholder="candidate1@example.com&#10;candidate2@example.com"
                value={emailsText}
                onChange={e => setEmailsText(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#DC2626]"
              />
              <p className="text-[11px] text-gray-400 mt-1">
                Unregistered candidate emails will automatically be invited and provisioned.
              </p>
            </div>
          )}

          {method === 'cohort' && (
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Select Cohort / Class</label>
              <select
                value={selectedCohort}
                onChange={e => setSelectedCohort(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#DC2626]"
              >
                <option value="">-- Choose a Cohort --</option>
                {cohorts.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.department ? `(${c.department})` : ''} — {c.member_count} students
                  </option>
                ))}
              </select>
            </div>
          )}

          {method === 'csv' && (
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Upload CSV File</label>
              <input
                type="file"
                accept=".csv"
                required
                onChange={e => setCsvFile(e.target.files?.[0] || null)}
                className="w-full px-3 py-2 border border-dashed border-gray-300 rounded-xl text-sm"
              />
              <p className="text-[11px] text-gray-400 mt-1">
                CSV should contain an "email" column or candidate emails in the first column.
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4 border-t border-gray-100">
            <Button type="button" variant="outline" onClick={onClose} className="rounded-xl">Cancel</Button>
            <Button type="submit" disabled={submitting} className="rounded-xl bg-[#111827] hover:bg-[#1f2937] text-white">
              {submitting ? 'Allocating…' : 'Allocate Candidates'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

const DriveResultsModal: React.FC<{
  drive: DriveRow;
  results: DriveResultRow[];
  loading: boolean;
  onClose: () => void;
}> = ({ drive, results, loading, onClose }) => {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-4xl w-full p-6 shadow-2xl border border-gray-100 max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between pb-4 border-b border-gray-100 shrink-0">
          <div>
            <h3 className="font-bold text-gray-900 text-lg">Interview Drive Candidate Results</h3>
            <p className="text-xs text-gray-500">{drive.title} · {drive.target_role} ({drive.duration_minutes} mins)</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto my-4">
          {loading ? (
            <div className="py-12 text-center text-gray-400">Loading candidate results…</div>
          ) : results.length === 0 ? (
            <div className="py-12 text-center text-gray-400">No candidates allocated to this drive yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-left">Candidate</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-right">Readiness</th>
                  <th className="px-4 py-3 text-right">Overall Score</th>
                  <th className="px-4 py-3 text-left">Rubric Band</th>
                  <th className="px-4 py-3 text-right">Completed At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {results.map(r => (
                  <tr key={r.user_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="font-bold text-gray-900">{r.name}</p>
                      <p className="text-xs text-gray-500 font-mono">{r.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${
                        r.allocation_status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {r.allocation_status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-black text-green-600">
                      {r.readiness_score != null ? `${r.readiness_score}%` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-gray-900">
                      {r.overall_score != null ? `${r.overall_score}/10` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <BandBadge band={r.rubric_band} />
                    </td>
                    <td className="px-4 py-3 text-right text-gray-400 text-xs font-mono">
                      {r.completed_at ? new Date(r.completed_at).toLocaleString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex justify-end pt-4 border-t border-gray-100 shrink-0">
          <Button onClick={onClose} className="rounded-xl">Close</Button>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
