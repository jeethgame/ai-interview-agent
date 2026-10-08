/**
 * AdminDashboard — V4 Institutional Layer.
 * Faculty/Admin command center:
 * - Coding Exams (Create, Assign by email/cohort/CSV, View Candidate Submissions & Scores)
 * - AI Interview Drives (Create, Assign by email/cohort/CSV, View Candidate Scorecards & Readiness)
 * - Analytics & Performance Overview (DPDPA safe aggregated metrics)
 */

import React, { useState, useEffect } from 'react';
import {
  BarChart3, Users, Building2, Target, TrendingUp, Plus, RefreshCw,
  Code2, Mic, CheckCircle2, Clock, AlertTriangle, Send, FileSpreadsheet,
  X, Award, ExternalLink, ShieldCheck, FileText, ChevronRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';

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
  allocation_status: string;
  overall_score: number | null;
  readiness_score: number | null;
  rubric_band: string | null;
  dimension_scores: any;
  allocated_at: string | null;
  completed_at: string | null;
}

interface ExamRow {
  id: string;
  title: string;
  description: string;
  duration_minutes: number;
  seb_required: boolean;
  max_infractions: number;
  is_active: boolean;
  created_at: string;
  assigned_count: number;
  completed_count: number;
  avg_score: number | null;
}

interface ExamAssignmentRow {
  user_id: string;
  name: string;
  email: string;
  status: string;
  deadline: string | null;
  assigned_at: string;
  completed_at: string | null;
  score: number | null;
  infraction_count: number | null;
  attempt_status: string | null;
  submitted_at: string | null;
}

interface CohortItem {
  id: string;
  name: string;
  academic_year: string | null;
  department: string | null;
  member_count: number;
}

interface Props {
  orgId: string;
  token?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────

const StatCard: React.FC<{ label: string; value: number | string; icon: React.ReactNode; sub?: string }> = ({ label, value, icon, sub }) => (
  <div className="bg-white rounded-2xl border border-gray-200 p-5 flex items-center gap-4 shadow-sm">
    <div className="w-12 h-12 rounded-xl bg-[#DC2626]/10 flex items-center justify-center text-[#DC2626] shrink-0">
      {icon}
    </div>
    <div>
      <p className="text-2xl font-black text-gray-900 leading-tight">{value}</p>
      <p className="text-xs text-gray-500 font-medium mt-0.5">{label}</p>
      {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  </div>
);

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
  const [activeTab, setActiveTab] = useState<'overview' | 'exams' | 'drives' | 'candidates'>('overview');
  const [loading, setLoading] = useState(true);

  // Data states
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [cohorts, setCohorts] = useState<CohortRow[]>([]);
  const [cohortList, setCohortList] = useState<CohortItem[]>([]);
  const [candidates, setCandidates] = useState<CandidateRow[]>([]);
  const [drives, setDrives] = useState<DriveRow[]>([]);
  const [exams, setExams] = useState<ExamRow[]>([]);

  // Modal states
  const [showCreateExamModal, setShowCreateExamModal] = useState(false);
  const [showAssignExamModal, setShowAssignExamModal] = useState<ExamRow | null>(null);
  const [showExamResultsModal, setShowExamResultsModal] = useState<ExamRow | null>(null);
  const [examAssignments, setExamAssignments] = useState<ExamAssignmentRow[]>([]);

  const [showCreateDriveModal, setShowCreateDriveModal] = useState(false);
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
      const [sum, coh, cohItems, cands, drv, exm] = await Promise.all([
        apiFetch(`/orgs/${orgId}/analytics/summary`, token).catch(() => null),
        apiFetch(`/orgs/${orgId}/analytics/overview`, token).catch(() => []),
        apiFetch(`/orgs/${orgId}/cohorts`, token).catch(() => []),
        apiFetch(`/orgs/${orgId}/analytics/candidates`, token).catch(() => []),
        apiFetch(`/orgs/${orgId}/drives`, token).catch(() => []),
        apiFetch(`/orgs/${orgId}/exams`, token).catch(() => []),
      ]);
      setSummary(sum);
      setCohorts(coh || []);
      setCohortList(cohItems || []);
      setCandidates(cands || []);
      setDrives(drv || []);
      setExams(exm || []);
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

  if (loading) {
    return (
      <div className="p-12 text-center text-gray-500 flex flex-col items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-2 border-[#DC2626]/20 border-t-[#DC2626] rounded-full animate-spin mb-3" />
        <p className="text-sm font-medium">Loading institutional dashboard…</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-[#FAFAFA] min-h-screen">
      {/* Toast notification */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 bg-[#111827] text-white px-5 py-3 rounded-xl shadow-lg border border-gray-700 text-sm font-semibold flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 size={16} className="text-green-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <Building2 size={24} className="text-[#DC2626]" /> Administrator Command Center
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Manage coding exams, AI interview drives, candidate assignments, and analytics
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadData} className="gap-1.5 rounded-xl">
            <RefreshCw size={14} /> Refresh
          </Button>
          <Button size="sm" onClick={() => setShowCreateExamModal(true)} className="gap-1.5 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white">
            <Plus size={14} /> New Exam
          </Button>
          <Button size="sm" onClick={() => setShowCreateDriveModal(true)} className="gap-1.5 rounded-xl bg-[#111827] hover:bg-[#1f2937] text-white">
            <Plus size={14} /> New Interview
          </Button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Assigned Tests"
          value={summary?.total_assigned ?? 0}
          icon={<Target size={20} />}
          sub={`${summary?.exams?.total_assigned_exams || 0} coding · ${summary?.interviews?.total_allocated_interviews || 0} interviews`}
        />
        <StatCard
          label="Tests Completed"
          value={summary?.total_completed ?? 0}
          icon={<CheckCircle2 size={20} />}
          sub={`${summary?.completion_rate || 0}% overall completion rate`}
        />
        <StatCard
          label="Avg Coding Exam Score"
          value={summary?.exams?.avg_exam_score ? `${summary.exams.avg_exam_score}/100` : '—'}
          icon={<Code2 size={20} />}
          sub="from completed submissions"
        />
        <StatCard
          label="Avg Interview Readiness"
          value={summary?.interviews?.avg_interview_readiness ? `${summary.interviews.avg_interview_readiness}%` : '—'}
          icon={<Mic size={20} />}
          sub="cross-candidate competency"
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {[
          { key: 'overview', label: 'Overview', icon: <BarChart3 size={15} /> },
          { key: 'exams', label: `Coding Exams (${exams.length})`, icon: <Code2 size={15} /> },
          { key: 'drives', label: `AI Interviews (${drives.length})`, icon: <Mic size={15} /> },
          { key: 'candidates', label: `Candidates (${candidates.length})`, icon: <Users size={15} /> },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeTab === tab.key ? 'bg-white text-[#DC2626] shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab 1: Overview ────────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="font-bold text-gray-800 text-base">Cohort Performance Breakdown</h2>
                <p className="text-xs text-gray-400">Class and department level completion and readiness</p>
              </div>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-6 py-3 text-left">Cohort</th>
                  <th className="px-4 py-3 text-right">Students</th>
                  <th className="px-4 py-3 text-right">Interviews Allocated</th>
                  <th className="px-4 py-3 text-right">Completed</th>
                  <th className="px-4 py-3 text-right">Avg Score</th>
                  <th className="px-4 py-3 text-right">Avg Readiness</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {cohorts.length === 0 ? (
                  <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-400">No cohort data recorded yet</td></tr>
                ) : cohorts.map((r, i) => (
                  <tr key={i} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-3 font-medium text-gray-800">{r.cohort_name}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{r.total_students}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{r.interviews_allocated}</td>
                    <td className="px-4 py-3 text-right font-semibold text-green-600">{r.interviews_completed}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-800">
                      {r.avg_overall_score != null ? `${r.avg_overall_score}/10` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-800">
                      {r.avg_readiness != null ? `${r.avg_readiness}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Tab 2: Formal Coding Exams ─────────────────────────────────── */}
      {activeTab === 'exams' && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="font-bold text-gray-800 text-base">Formal Coding Exams</h2>
              <p className="text-xs text-gray-400">Scheduled coding tests with lockdown integrity & automated test cases</p>
            </div>
            <Button size="sm" onClick={() => setShowCreateExamModal(true)} className="gap-1.5 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white">
              <Plus size={14} /> Create Exam
            </Button>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-6 py-3 text-left">Exam Title</th>
                <th className="px-4 py-3 text-left">Duration</th>
                <th className="px-4 py-3 text-left">Integrity</th>
                <th className="px-4 py-3 text-right">Assigned</th>
                <th className="px-4 py-3 text-right">Completed</th>
                <th className="px-4 py-3 text-right">Avg Score</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {exams.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-400">
                    No coding exams created yet. Click "Create Exam" to schedule your first assessment.
                  </td>
                </tr>
              ) : exams.map(e => (
                <tr key={e.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-3.5">
                    <p className="font-bold text-gray-900">{e.title}</p>
                    <p className="text-xs text-gray-500 line-clamp-1">{e.description || 'Formal coding assessment'}</p>
                  </td>
                  <td className="px-4 py-3.5 text-gray-600 font-mono text-xs">
                    {e.duration_minutes} mins
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-gray-100 text-gray-700">
                      <ShieldCheck size={12} className="text-amber-500" />
                      {e.max_infractions} strikes max
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-right font-medium text-gray-700">
                    {e.assigned_count}
                  </td>
                  <td className="px-4 py-3.5 text-right font-bold text-green-600">
                    {e.completed_count}
                  </td>
                  <td className="px-4 py-3.5 text-right font-bold text-gray-900">
                    {e.avg_score != null ? `${e.avg_score}/100` : '—'}
                  </td>
                  <td className="px-6 py-3.5 text-right space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowAssignExamModal(e)}
                      className="rounded-lg text-xs gap-1"
                    >
                      <Send size={12} /> Assign
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => viewExamResults(e)}
                      className="rounded-lg text-xs gap-1 bg-[#111827] text-white hover:bg-[#1f2937]"
                    >
                      <BarChart3 size={12} /> Results
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Tab 3: Placement Drives (AI Interviews) ────────────────────── */}
      {activeTab === 'drives' && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="font-bold text-gray-800 text-base">Placement Drives & AI Voice Interviews</h2>
              <p className="text-xs text-gray-400">Targeted conversational interviews with dynamic rubric evaluations</p>
            </div>
            <Button size="sm" onClick={() => setShowCreateDriveModal(true)} className="gap-1.5 rounded-xl bg-[#111827] hover:bg-[#1f2937] text-white">
              <Plus size={14} /> Create Drive
            </Button>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-6 py-3 text-left">Drive / Target Role</th>
                <th className="px-4 py-3 text-left">Company</th>
                <th className="px-4 py-3 text-left">Style & Difficulty</th>
                <th className="px-4 py-3 text-left">Duration</th>
                <th className="px-4 py-3 text-right">Allocated</th>
                <th className="px-4 py-3 text-right">Completed</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {drives.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-400">
                    No placement drives created yet. Click "Create Drive" to configure role-specific AI interviews.
                  </td>
                </tr>
              ) : drives.map(d => (
                <tr key={d.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-3.5">
                    <p className="font-bold text-gray-900">{d.title}</p>
                    <p className="text-xs text-gray-500">{d.target_role}</p>
                  </td>
                  <td className="px-4 py-3.5 text-gray-600 font-medium">
                    {d.company || '—'}
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-700 capitalize">
                        {d.interview_style}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-50 text-[#DC2626] capitalize">
                        {d.difficulty}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-gray-600 font-mono text-xs">
                    {d.duration_minutes} mins
                  </td>
                  <td className="px-4 py-3.5 text-right font-medium text-gray-700">
                    {d.allocated_count}
                  </td>
                  <td className="px-4 py-3.5 text-right font-bold text-green-600">
                    {d.completed_count}
                  </td>
                  <td className="px-6 py-3.5 text-right space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowAssignDriveModal(d)}
                      className="rounded-lg text-xs gap-1"
                    >
                      <Send size={12} /> Assign
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => viewDriveResults(d)}
                      className="rounded-lg text-xs gap-1 bg-[#111827] text-white hover:bg-[#1f2937]"
                    >
                      <BarChart3 size={12} /> Results
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Tab 4: Unified Candidate Analytics ─────────────────────────── */}
      {activeTab === 'candidates' && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="font-bold text-gray-800 text-base">Candidate Performance Roster</h2>
              <p className="text-xs text-gray-400">Combined candidate performance across both coding exams and AI interviews</p>
            </div>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-6 py-3 text-left">Candidate</th>
                <th className="px-4 py-3 text-right">Interviews Done</th>
                <th className="px-4 py-3 text-right">Avg Interview</th>
                <th className="px-4 py-3 text-right">Readiness</th>
                <th className="px-4 py-3 text-left">Best Band</th>
                <th className="px-4 py-3 text-right">Exams Done</th>
                <th className="px-4 py-3 text-right">Avg Exam</th>
                <th className="px-6 py-3 text-right">Last Activity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {candidates.length === 0 ? (
                <tr><td colSpan={8} className="px-6 py-8 text-center text-gray-400">No candidate analytics available yet</td></tr>
              ) : candidates.map(c => (
                <tr key={c.user_id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-3.5">
                    <p className="font-bold text-gray-900">{c.name}</p>
                    <p className="text-xs text-gray-500 font-mono">{c.email}</p>
                  </td>
                  <td className="px-4 py-3.5 text-right font-medium text-gray-700">
                    {c.total_interviews_done}/{c.total_interviews_assigned}
                  </td>
                  <td className="px-4 py-3.5 text-right font-semibold">
                    {c.avg_interview_score != null ? `${c.avg_interview_score}/10` : '—'}
                  </td>
                  <td className="px-4 py-3.5 text-right font-bold text-green-600">
                    {c.avg_readiness != null ? `${c.avg_readiness}%` : '—'}
                  </td>
                  <td className="px-4 py-3.5">
                    <BandBadge band={c.best_band} />
                  </td>
                  <td className="px-4 py-3.5 text-right font-medium text-gray-700">
                    {c.total_exams_done}/{c.total_exams_assigned}
                  </td>
                  <td className="px-4 py-3.5 text-right font-bold text-gray-900">
                    {c.avg_exam_score != null ? `${c.avg_exam_score}/100` : '—'}
                  </td>
                  <td className="px-6 py-3.5 text-right text-gray-400 text-xs font-mono">
                    {c.last_activity_at ? new Date(c.last_activity_at).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── MODALS ─────────────────────────────────────────────────────── */}

      {/* 1. Create Exam Modal */}
      {showCreateExamModal && (
        <CreateExamModal
          token={token}
          onClose={() => setShowCreateExamModal(false)}
          onSuccess={() => {
            setShowCreateExamModal(false);
            showToast('Formal coding exam created successfully!');
            loadData();
          }}
        />
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

      {/* 4. Create Drive Modal */}
      {showCreateDriveModal && (
        <CreateDriveModal
          orgId={orgId}
          token={token}
          onClose={() => setShowCreateDriveModal(false)}
          onSuccess={() => {
            setShowCreateDriveModal(false);
            showToast('AI interview placement drive created successfully!');
            loadData();
          }}
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

const CreateExamModal: React.FC<{
  token?: string;
  onClose: () => void;
  onSuccess: () => void;
}> = ({ token, onClose, onSuccess }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [duration, setDuration] = useState(60);
  const [difficulty, setDifficulty] = useState('medium');
  const [maxInfractions, setMaxInfractions] = useState(3);
  const [sebRequired, setSebRequired] = useState(true);
  const [questionBank, setQuestionBank] = useState<{ id: string; title: string; difficulty: string; category: string }[]>([]);
  const [selectedQIds, setSelectedQIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    apiFetch('/questions?limit=50', token).then(setQuestionBank).catch(() => setQuestionBank([]));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return setErr('Exam title is required');
    setSubmitting(true);
    setErr('');
    try {
      await apiFetch('/exams/create', token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          duration_minutes: duration,
          difficulty,
          max_infractions: maxInfractions,
          seb_required: sebRequired,
          question_ids: selectedQIds,
        }),
      });
      onSuccess();
    } catch (e: any) {
      setErr(e.message || 'Failed to create exam');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-gray-100 animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Code2 size={20} className="text-[#DC2626]" />
            <h3 className="font-bold text-gray-900 text-lg">Create Coding Exam</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        {err && <div className="mt-4 p-3 bg-red-50 text-red-700 text-xs rounded-xl font-medium">{err}</div>}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Exam Title *</label>
            <input
              type="text"
              required
              placeholder="e.g. TCS Digital — DSA Assessment"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#DC2626]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Description / Instructions</label>
            <textarea
              rows={2}
              placeholder="Instructions or problem scope..."
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#DC2626]"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Duration (min)</label>
              <input
                type="number"
                min={10}
                max={300}
                value={duration}
                onChange={e => setDuration(parseInt(e.target.value) || 60)}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#DC2626]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Difficulty</label>
              <select
                value={difficulty}
                onChange={e => setDifficulty(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#DC2626]"
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Max Strikes</label>
              <input
                type="number"
                min={1}
                max={10}
                value={maxInfractions}
                onChange={e => setMaxInfractions(parseInt(e.target.value) || 3)}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#DC2626]"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="seb"
              checked={sebRequired}
              onChange={e => setSebRequired(e.target.checked)}
              className="rounded text-[#DC2626] focus:ring-[#DC2626]"
            />
            <label htmlFor="seb" className="text-xs text-gray-700 font-medium">
              Enable Safe Exam Browser (SEB) & proctoring guard
            </label>
          </div>

          {/* Question picker */}
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
              Questions{questionBank.length > 0 ? ` (${selectedQIds.length} selected)` : ''}
            </label>
            {questionBank.length === 0 ? (
              <p className="text-xs text-gray-400 px-3 py-2 border border-dashed border-gray-200 rounded-xl">
                No questions in bank yet
              </p>
            ) : (
              <div className="border border-gray-200 rounded-xl p-2 max-h-40 overflow-y-auto space-y-1">
                {questionBank.map(q => (
                  <label key={q.id} className="flex items-center gap-2 px-2 py-1 hover:bg-gray-50 cursor-pointer rounded-lg">
                    <input
                      type="checkbox"
                      checked={selectedQIds.includes(q.id)}
                      onChange={e => setSelectedQIds(prev => e.target.checked ? [...prev, q.id] : prev.filter(i => i !== q.id))}
                      className="rounded border-gray-300 text-[#DC2626] focus:ring-[#DC2626]"
                    />
                    <span className="text-sm flex-1 truncate">{q.title}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full shrink-0 ${
                      q.difficulty?.toLowerCase() === 'easy' ? 'bg-green-100 text-green-700' :
                      q.difficulty?.toLowerCase() === 'hard' ? 'bg-red-100 text-red-700' :
                      'bg-amber-100 text-amber-700'
                    }`}>{q.difficulty}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-gray-100">
            <Button type="button" variant="outline" onClick={onClose} className="rounded-xl">Cancel</Button>
            <Button type="submit" disabled={submitting} className="rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white">
              {submitting ? 'Creating…' : 'Create Exam'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

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

const CreateDriveModal: React.FC<{
  orgId: string;
  token?: string;
  onClose: () => void;
  onSuccess: () => void;
}> = ({ orgId, token, onClose, onSuccess }) => {
  const [title, setTitle] = useState('');
  const [role, setRole] = useState('Full Stack Software Engineer');
  const [company, setCompany] = useState('');
  const [style, setStyle] = useState('formal');
  const [difficulty, setDifficulty] = useState('medium');
  const [duration, setDuration] = useState(30);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return setErr('Drive title is required');
    setSubmitting(true);
    setErr('');
    try {
      await apiFetch(`/orgs/${orgId}/drives`, token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          target_role: role,
          company: company.trim() || null,
          interview_style: style,
          difficulty,
          duration_minutes: duration,
        }),
      });
      onSuccess();
    } catch (e: any) {
      setErr(e.message || 'Failed to create drive');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-gray-100 animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between pb-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Mic size={20} className="text-[#DC2626]" />
            <h3 className="font-bold text-gray-900 text-lg">Create AI Interview Drive</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        {err && <div className="mt-4 p-3 bg-red-50 text-red-700 text-xs rounded-xl font-medium">{err}</div>}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Drive Title *</label>
            <input
              type="text"
              required
              placeholder="e.g. Campus Placement 2026 — Technical Interview"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#DC2626]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Target Job Role</label>
              <input
                type="text"
                required
                placeholder="Software Engineer"
                value={role}
                onChange={e => setRole(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#DC2626]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Company (Optional)</label>
              <input
                type="text"
                placeholder="Google / TCS / Zoho"
                value={company}
                onChange={e => setCompany(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#DC2626]"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Interview Style</label>
              <select
                value={style}
                onChange={e => setStyle(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm capitalize focus:outline-none focus:ring-2 focus:ring-[#DC2626]"
              >
                <option value="formal">Formal</option>
                <option value="technical">Technical</option>
                <option value="casual">Casual</option>
                <option value="aggressive">Aggressive</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Difficulty</label>
              <select
                value={difficulty}
                onChange={e => setDifficulty(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm capitalize focus:outline-none focus:ring-2 focus:ring-[#DC2626]"
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Duration (min)</label>
              <input
                type="number"
                min={10}
                max={120}
                value={duration}
                onChange={e => setDuration(parseInt(e.target.value) || 30)}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#DC2626]"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-gray-100">
            <Button type="button" variant="outline" onClick={onClose} className="rounded-xl">Cancel</Button>
            <Button type="submit" disabled={submitting} className="rounded-xl bg-[#111827] hover:bg-[#1f2937] text-white">
              {submitting ? 'Creating…' : 'Create Drive'}
            </Button>
          </div>
        </form>
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
