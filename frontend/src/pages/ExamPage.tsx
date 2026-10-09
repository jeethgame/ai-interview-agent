import React, { useState, lazy, Suspense } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSEBGuard } from '@/hooks/useSEBGuard';
import { useAuth } from '@/contexts/AuthContext';
import { SEBGate } from '@/components/SEBGate';
import {
  Shield, Clock, AlertTriangle, Maximize2, CheckCircle2,
  Monitor, Wifi, Eye, ArrowRight, X, Code2
} from 'lucide-react';

const MonacoEditor = lazy(() => import('@/components/team_a/MonacoEditor').then(m => ({ default: m.default ?? m.MonacoEditor })));

type Phase = 'instructions' | 'preflight' | 'exam' | 'disqualified' | 'submitted';

const API =
  (import.meta as any).env?.VITE_API_BASE_URL !== undefined && (import.meta as any).env.VITE_API_BASE_URL !== ""
    ? (import.meta as any).env.VITE_API_BASE_URL
    : typeof window !== "undefined" && (window.location.port === "5173" || window.location.port === "3000")
    ? ""
    : "http://localhost:8000";

// Mock problem for now — will come from /api/exams/:id
const MOCK_PROBLEM = {
  title: 'TCS Digital — DSA Round 1',
  company: 'TCS',
  duration_minutes: 60,
  max_infractions: 3,
  problems: [
    {
      id: 'p1', title: 'Two Sum', difficulty: 'Easy',
      description: `Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.

You may assume that each input would have exactly one solution, and you may not use the same element twice.

Example 1:
  Input: nums = [2,7,11,15], target = 9
  Output: [0,1]
  Explanation: nums[0] + nums[1] = 9

Example 2:
  Input: nums = [3,2,4], target = 6
  Output: [1,2]

Constraints:
  2 ≤ nums.length ≤ 10⁴
  -10⁹ ≤ nums[i] ≤ 10⁹`,
    },
    {
      id: 'p2', title: 'Reverse a Linked List', difficulty: 'Easy',
      description: `Given the head of a singly linked list, reverse the list, and return the reversed list.

Example:
  Input: head = [1,2,3,4,5]
  Output: [5,4,3,2,1]`,
    },
    {
      id: 'p3', title: 'Merge Intervals', difficulty: 'Medium',
      description: `Given an array of intervals where intervals[i] = [starti, endi], merge all overlapping intervals, and return an array of the non-overlapping intervals.

Example:
  Input: [[1,3],[2,6],[8,10],[15,18]]
  Output: [[1,6],[8,10],[15,18]]`,
    },
  ],
};

// ── Instructions Screen ───────────────────────────────────────────────────
const InstructionsScreen: React.FC<{ exam: typeof MOCK_PROBLEM; onNext: () => void; onBack: () => void }> = ({ exam, onNext, onBack }) => (
  <div className="min-h-screen bg-white flex flex-col">
    <div className="max-w-2xl mx-auto px-4 py-12 flex-1 flex flex-col justify-center">
      <div className="mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-50 border border-red-200 mb-4">
          <Shield size={14} className="text-[#DC2626]" />
          <span className="text-xs font-bold text-[#DC2626] uppercase tracking-wider">Formal Assessment</span>
        </div>
        <h1 className="text-2xl font-black text-[#111827] mb-1">{exam.title}</h1>
        {exam.company && <p className="text-sm text-[#6B7280]">{exam.company} · {exam.problems.length} Problems · {exam.duration_minutes} minutes</p>}
      </div>

      <div className="bg-[#FAFAFA] rounded-2xl border border-gray-200 p-6 space-y-5 mb-8">
        <h2 className="text-sm font-black text-[#111827] mb-4">Before you begin — read carefully</h2>

        {[
          { icon: <Maximize2 size={16} />, title: 'Fullscreen required', desc: 'The test runs in fullscreen mode. Exiting fullscreen counts as an infraction.', color: '#DC2626' },
          { icon: <Eye size={16} />, title: 'Tab monitoring active', desc: `Switching tabs or windows is detected. You get ${exam.max_infractions} infractions maximum before auto-disqualification.`, color: '#F97316' },
          { icon: <Clock size={16} />, title: `${exam.duration_minutes} minute time limit`, desc: 'The timer starts when you enter the exam. It cannot be paused.', color: '#8B5CF6' },
          { icon: <Monitor size={16} />, title: 'Use only this window', desc: 'Do not open documentation, IDE, or any other window. Copy-paste from external sources is considered malpractice.', color: '#6B7280' },
        ].map(({ icon, title, desc, color }) => (
          <div key={title} className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5" style={{ backgroundColor: `${color}15`, color }}>
              {icon}
            </div>
            <div>
              <p className="text-xs font-bold text-[#111827]">{title}</p>
              <p className="text-xs text-[#6B7280] leading-relaxed mt-0.5">{desc}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button onClick={onBack} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-[#6B7280] hover:bg-gray-50 font-semibold transition-all">
          <X size={14} /> Cancel
        </button>
        <button onClick={onNext}
          className="flex-1 flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white font-bold text-sm shadow-md hover:shadow-[0_4px_16px_rgba(220,38,38,0.3)] transition-all">
          I understand — Continue <ArrowRight size={15} />
        </button>
      </div>
    </div>
  </div>
);

// ── Preflight Check ───────────────────────────────────────────────────────
const PreflightScreen: React.FC<{ onStart: () => void; onBack: () => void }> = ({ onStart, onBack }) => {
  const [checks] = useState([
    { label: 'Browser compatible', ok: true },
    { label: 'Stable internet connection', ok: true },
    { label: 'Camera not required', ok: true },
    { label: 'Fullscreen supported', ok: !!document.documentElement.requestFullscreen },
  ]);

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-green-50 border border-green-200 flex items-center justify-center mx-auto mb-4">
            <Wifi size={22} className="text-green-600" />
          </div>
          <h2 className="text-xl font-black text-[#111827]">System Check</h2>
          <p className="text-sm text-[#6B7280] mt-1">Verifying your environment before the exam</p>
        </div>

        <div className="bg-[#FAFAFA] rounded-2xl border border-gray-200 p-5 space-y-3 mb-6">
          {checks.map(c => (
            <div key={c.label} className="flex items-center justify-between">
              <span className="text-sm text-[#374151]">{c.label}</span>
              {c.ok
                ? <CheckCircle2 size={16} className="text-green-500" />
                : <AlertTriangle size={16} className="text-amber-500" />}
            </div>
          ))}
        </div>

        <div className="bg-[#FEF3C7] border border-[#EAB308]/40 rounded-xl p-4 mb-6 flex items-start gap-2">
          <AlertTriangle size={15} className="text-[#92400E] shrink-0 mt-0.5" />
          <p className="text-xs text-[#92400E] leading-relaxed">
            Clicking "Enter Exam" will request fullscreen. <strong>Do not exit fullscreen</strong> during the test or it will count as an infraction.
          </p>
        </div>

        <div className="flex gap-3">
          <button onClick={onBack} className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-[#6B7280] hover:bg-gray-50 font-semibold transition-all">
            Back
          </button>
          <button onClick={onStart}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white font-bold text-sm shadow-md transition-all">
            <Maximize2 size={14} /> Enter Exam — Start Fullscreen
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Disqualified Screen ───────────────────────────────────────────────────
const DisqualifiedScreen: React.FC<{ onLeave: () => void }> = ({ onLeave }) => (
  <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center px-4">
    <div className="max-w-md w-full text-center space-y-4 bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
      <div className="w-16 h-16 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-center mx-auto">
        <AlertTriangle size={26} className="text-[#DC2626]" />
      </div>
      <h2 className="text-xl font-black text-slate-900">Examination Terminated</h2>
      <p className="text-sm text-slate-600 leading-relaxed">
        You have accumulated security infractions (window blur / tab switch / fullscreen exit).
        Your attempt has been automatically submitted.
      </p>
      <p className="text-xs text-slate-400">This incident has been recorded and reported to your faculty.</p>
      <button onClick={onLeave}
        className="mt-4 px-6 py-2.5 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white text-sm font-bold transition-all shadow-sm">
        Return to Dashboard
      </button>
    </div>
  </div>
);

// ── Submitted Screen ──────────────────────────────────────────────────────
const SubmittedScreen: React.FC<{ onLeave: () => void }> = ({ onLeave }) => (
  <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center px-4">
    <div className="max-w-md w-full text-center space-y-4 bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
      <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center mx-auto">
        <CheckCircle2 size={26} className="text-emerald-600" />
      </div>
      <h2 className="text-xl font-black text-slate-900">Exam Submitted!</h2>
      <p className="text-sm text-slate-600 leading-relaxed">
        Your answers have been submitted successfully. Results will be available after evaluation.
      </p>
      <button onClick={onLeave}
        className="mt-4 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold transition-all shadow-sm">
        Return to Dashboard
      </button>
    </div>
  </div>
);

const LiveExam: React.FC<{
  exam: typeof MOCK_PROBLEM;
  examId: string;
  userId: string;
  token?: string;
  infractionCount: number;
  onSubmit: () => void;
}> = ({ exam, examId, userId, token, infractionCount, onSubmit }) => {
  const [selectedProblem, setSelectedProblem] = useState(exam.problems[0]);
  const [code, setCode] = useState('# Write your solution here\n\ndef solution():\n    pass\n');
  const [language, setLanguage] = useState('python');
  const [timeLeft, setTimeLeft] = useState(exam.duration_minutes * 60);
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState<{ status: string; stdout: string; stderr: string } | null>(null);

  React.useEffect(() => {
    if (exam.problems && exam.problems.length > 0) {
      setSelectedProblem(exam.problems[0]);
    }
  }, [exam.problems]);

  React.useEffect(() => {
    const t = setInterval(() => setTimeLeft(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, []);

  const fmt = (s: number) => `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  const urgentTime = timeLeft < 300;

  const runCode = async () => {
    setRunning(true);
    setOutput(null);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const r = await fetch(`${API}/execution/run`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ source_code: code, language, stdin: '' }),
      });
      const d = await r.json();
      setOutput({ status: d.status, stdout: d.stdout || '', stderr: d.stderr || '' });
    } catch {
      setOutput({ status: 'NETWORK_ERROR', stdout: '', stderr: 'Could not reach execution service.' });
    } finally { setRunning(false); }
  };

  const diffColor = (d: string) => {
    switch ((d || '').toLowerCase()) {
      case 'easy':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'medium':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'hard':
        return 'bg-red-50 text-red-700 border-red-200';
      default:
        return 'bg-slate-50 text-slate-600 border-slate-200';
    }
  };

  return (
    <div className="h-screen flex flex-col bg-[#f8fafc] text-slate-800 overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 py-2.5 bg-white border-b border-slate-200 shrink-0 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#DC2626] flex items-center justify-center text-white">
              <Shield size={14} />
            </div>
            <span className="text-sm font-bold text-slate-900">{exam.title}</span>
          </div>
          {exam.company && (
            <>
              <div className="w-px h-4 bg-slate-200" />
              <span className="text-xs text-slate-500 font-medium">{exam.company}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          {/* Infraction counter */}
          <div className={`flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-lg border ${
            infractionCount > 0 ? 'text-amber-700 bg-amber-50 border-amber-200' : 'text-slate-500 bg-slate-50 border-slate-200'
          }`}>
            <AlertTriangle size={12} className={infractionCount > 0 ? 'text-amber-600' : 'text-slate-400'} />
            {infractionCount}/{exam.max_infractions} strikes
          </div>
          {/* Timer */}
          <div className={`font-mono text-sm font-bold px-3 py-1 rounded-lg border flex items-center gap-1.5 ${
            urgentTime ? 'text-red-700 bg-red-50 border-red-200 animate-pulse' : 'text-slate-700 bg-slate-50 border-slate-200'
          }`}>
            <Clock size={13} />{fmt(timeLeft)}
          </div>
          <button onClick={onSubmit}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-bold transition-all shadow-xs">
            <CheckCircle2 size={13} /> Submit All
          </button>
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* Problem sidebar */}
        <div className="w-56 shrink-0 bg-white border-r border-slate-200 flex flex-col">
          <div className="px-4 py-3 border-b border-slate-100">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Problems ({exam.problems.length})</span>
          </div>
          <div className="flex-1 overflow-y-auto py-1">
            {exam.problems.map((p, i) => (
              <button key={p.id} onClick={() => setSelectedProblem(p)}
                className={`w-full flex flex-col items-start gap-1 px-4 py-3 text-left transition-all border-l-4 ${
                  selectedProblem.id === p.id ? 'border-[#DC2626] bg-red-50/50' : 'border-transparent hover:bg-slate-50'
                }`}>
                <span className="text-[10px] font-bold text-slate-400 uppercase">Problem {i + 1}</span>
                <span className={`text-xs font-bold leading-tight ${selectedProblem.id === p.id ? 'text-slate-900' : 'text-slate-700'}`}>{p.title}</span>
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${diffColor(p.difficulty)}`}>{p.difficulty}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Problem + Editor */}
        <div className="flex-1 flex flex-col min-w-0 border-r border-slate-200 bg-white">
          <div className="h-[220px] shrink-0 overflow-y-auto bg-white border-b border-slate-200 p-5">
            <div className="flex items-center gap-2.5 mb-2">
              <h2 className="text-base font-black text-slate-900">{selectedProblem.title}</h2>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${diffColor(selectedProblem.difficulty)}`}>
                {selectedProblem.difficulty}
              </span>
            </div>
            <pre className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap font-sans">{selectedProblem.description}</pre>
          </div>
          <div className="flex-1 min-h-0 bg-[#1e1e1e]">
            <Suspense fallback={<div className="h-full bg-[#1e1e1e] flex items-center justify-center text-xs text-slate-500">Loading code editor…</div>}>
              <MonacoEditor userId={userId} sessionId={examId} questionId={selectedProblem.id} onCodeChange={(c, l) => { setCode(c); setLanguage(l); }} />
            </Suspense>
          </div>
        </div>

        {/* Console panel */}
        <div className="w-72 shrink-0 flex flex-col bg-slate-50">
          <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-slate-200">
            <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Test Console</span>
            <button onClick={runCode} disabled={running}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-xs font-bold transition-all shadow-xs">
              {running ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Code2 size={12} />}
              {running ? 'Running…' : 'Run Code'}
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 text-xs">
            {output ? (
              <div className="space-y-3">
                <div className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border ${
                  output.status === 'ACCEPTED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'
                }`}>{output.status}</div>
                {output.stdout && (
                  <div className="bg-white p-3 rounded-lg border border-slate-200">
                    <span className="text-[10px] font-bold text-slate-400 block mb-1">Standard Output</span>
                    <pre className="text-slate-800 whitespace-pre-wrap font-mono text-[11px]">{output.stdout}</pre>
                  </div>
                )}
                {output.stderr && (
                  <div className="bg-red-50 p-3 rounded-lg border border-red-200">
                    <span className="text-[10px] font-bold text-red-500 block mb-1">Standard Error</span>
                    <pre className="text-red-700 whitespace-pre-wrap font-mono text-[11px]">{output.stderr}</pre>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-10 text-slate-400">
                <Code2 size={24} className="mx-auto mb-2 opacity-40 text-slate-400" />
                <p className="text-xs">Click Run Code to execute and test against sample inputs</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Main ExamPage ─────────────────────────────────────────────────────────

const ExamPage: React.FC = () => {
  const { examId = 'exam-001' } = useParams();
  const { user, getToken } = useAuth();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('exam');
  const [examData, setExamData] = useState(() => {
    try {
      const cached = typeof window !== "undefined" ? localStorage.getItem(`cached_exam_${examId}`) : null;
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed.questions) && parsed.questions.length > 0) {
          return {
            ...MOCK_PROBLEM,
            title: parsed.title || MOCK_PROBLEM.title,
            duration_minutes: parsed.duration_minutes || MOCK_PROBLEM.duration_minutes,
            max_infractions: parsed.max_infractions || MOCK_PROBLEM.max_infractions,
            problems: parsed.questions.map((q: any) => ({
              id: q.question_id || q.id,
              title: q.title,
              difficulty: q.difficulty ? (q.difficulty.charAt(0).toUpperCase() + q.difficulty.slice(1).toLowerCase()) : 'Medium',
              description: `${q.description || ''}\n\nConstraints:\n${q.constraints || 'N/A'}\n\nExamples:\n${q.examples || 'N/A'}`,
            })),
          };
        }
      }
    } catch {}
    return MOCK_PROBLEM;
  });

  React.useEffect(() => {
    const fetchExam = async () => {
      try {
        const token = getToken();
        const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

        // Fetch exam config and assigned questions in a single fast call
        const r = await fetch(`${API}/exams/${examId}`, { headers });
        let examMeta: any = {};
        if (r.ok) {
          examMeta = await r.json();
          try {
            localStorage.setItem(`cached_exam_${examId}`, JSON.stringify(examMeta));
          } catch {}
        }

        let dynamicProblems = MOCK_PROBLEM.problems;
        if (Array.isArray(examMeta.questions) && examMeta.questions.length > 0) {
          dynamicProblems = examMeta.questions.map((q: any) => ({
            id: q.question_id || q.id,
            title: q.title,
            difficulty: q.difficulty ? (q.difficulty.charAt(0).toUpperCase() + q.difficulty.slice(1).toLowerCase()) : 'Medium',
            description: `${q.description || ''}\n\nConstraints:\n${q.constraints || 'N/A'}\n\nExamples:\n${q.examples || 'N/A'}`,
          }));
        }

        setExamData(prev => ({
          ...prev,
          title: examMeta.title || prev.title,
          duration_minutes: examMeta.duration_minutes || prev.duration_minutes,
          max_infractions: examMeta.max_infractions || prev.max_infractions,
          problems: dynamicProblems,
        }));
      } catch { }
    };

    fetchExam();
  }, [examId]);

  const { isSEB, launchSebUrl, downloadConfigUrl, infractionCount, requestFullscreen } = useSEBGuard({
    examId,
    candidateId: user?.id || "candidate",
    maxInfractions: examData.max_infractions,
    onDisqualified: () => setPhase('disqualified'),
    onInfraction: () => {}, // count shown in live exam header
  });

  const handleStart = async () => {
    await requestFullscreen();
    setPhase('exam');
  };

  const handleSubmitExam = async () => {
    try {
      const token = getToken();
      await fetch(`${API}/exams/${examId}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify({
          candidate_id: user?.id || 'candidate',
          answers: {},
        }),
      });
    } catch (e) {
      console.error('Failed to submit exam attempt:', e);
    } finally {
      setPhase('submitted');
    }
  };

  if (!isSEB) {
    return (
      <SEBGate
        title={examData.title || "Formal Coding Examination"}
        launchUrl={launchSebUrl}
        downloadUrl={downloadConfigUrl}
      />
    );
  }

  if (phase === 'instructions') return <InstructionsScreen exam={examData} onNext={() => setPhase('preflight')} onBack={() => navigate('/home')} />;
  if (phase === 'preflight') return <PreflightScreen onStart={handleStart} onBack={() => setPhase('instructions')} />;
  if (phase === 'disqualified') return <DisqualifiedScreen onLeave={() => navigate('/home')} />;
  if (phase === 'submitted') return <SubmittedScreen onLeave={() => navigate('/home')} />;

  return (
    <LiveExam
      exam={examData}
      examId={examId}
      userId={user?.id || 'candidate'}
      token={getToken() || undefined}
      infractionCount={infractionCount}
      onSubmit={handleSubmitExam}
    />
  );
};

export default ExamPage;
