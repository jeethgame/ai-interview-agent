import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldAlert, ExternalLink, Lock, CheckCircle2, MonitorCheck, AlertCircle, Download, FileText, ArrowRight } from "lucide-react";

interface SEBGateProps {
  title?: string;
  launchUrl?: string;
  downloadUrl?: string;
  examId?: string;
  onBypass?: () => void;
}

const API_BASE =
  (import.meta as any).env?.VITE_API_BASE_URL !== undefined && (import.meta as any).env.VITE_API_BASE_URL !== ""
    ? (import.meta as any).env.VITE_API_BASE_URL
    : typeof window !== "undefined" && (window.location.port === "5173" || window.location.port === "3000")
    ? ""
    : "http://localhost:8000";

export const SEBGate: React.FC<SEBGateProps> = ({
  title = "Coding Assessment & Examination Portal",
  launchUrl = "",
  downloadUrl = "",
  examId = "",
  onBypass,
}) => {
  const navigate = useNavigate();
  const sebDownloadLink = "https://safeexambrowser.org/download_en.html";

  const [isCompleted, setIsCompleted] = useState(false);
  const [completedScore, setCompletedScore] = useState<number | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(true);

  // Check if candidate has already completed this assessment
  useEffect(() => {
    let isMounted = true;
    const checkCompletion = async () => {
      try {
        const token = localStorage.getItem("token") || localStorage.getItem("auth_token");
        const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

        // 1. Check candidate assignments
        const assignRes = await fetch(`${API_BASE}/me/assignments`, { headers });
        if (assignRes.ok) {
          const data = await assignRes.json();
          const target = (data.exams || []).find((e: any) =>
            e.exam_id === examId || e.id === examId || (examId === "coding-assessment" && e.status === "completed")
          );
          if (target && (target.status === "completed" || target.attempt_status === "SUBMITTED" || target.attempt_status === "completed")) {
            if (isMounted) {
              setIsCompleted(true);
              if (target.score !== undefined && target.score !== null) {
                setCompletedScore(Number(target.score));
              }
              setCheckingStatus(false);
              return;
            }
          }
        }

        // 2. Fallback check: recent scorecard history
        const histRes = await fetch(`${API_BASE}/interview/scorecard/history?limit=10`, { headers });
        if (histRes.ok) {
          const histData = await histRes.json();
          if (Array.isArray(histData) && histData.length > 0) {
            const match = histData.find((h: any) =>
              (examId && (h.role?.includes(examId) || h.session_id?.includes(examId))) ||
              (examId === "coding-assessment" && (h.role?.toLowerCase().includes("coding") || h.role?.toLowerCase().includes("assessment")))
            );
            if (match) {
              if (isMounted) {
                setIsCompleted(true);
                setCompletedScore(Number(match.overall_score ?? 0));
                setCheckingStatus(false);
                return;
              }
            }
          }
        }
      } catch (err) {
        console.warn("Could not check exam completion status:", err);
      } finally {
        if (isMounted) setCheckingStatus(false);
      }
    };

    checkCompletion();
    return () => {
      isMounted = false;
    };
  }, [examId]);

  // Prefetch questions immediately while candidate is viewing the SEB launch gate
  useEffect(() => {
    const prefetchQuestions = async () => {
      try {
        const url = examId && examId !== "coding-assessment"
          ? `${API_BASE}/exams/${examId}`
          : `${API_BASE}/api/questions?assessment=true`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          const qList = Array.isArray(data) ? data : (data.questions || []);
          if (qList.length > 0) {
            localStorage.setItem("cached_exam_questions", JSON.stringify(qList));
            if (examId) {
              localStorage.setItem(`cached_exam_${examId}`, JSON.stringify(data));
            }
          }
        }
      } catch {}
    };
    prefetchQuestions();
  }, [examId]);

  const handleLaunch = () => {
    // Eager cache store
    if (examId) {
      try {
        const url = examId !== "coding-assessment" ? `${API_BASE}/exams/${examId}` : `${API_BASE}/api/questions?assessment=true`;
        fetch(url).then(r => r.json()).then(data => {
          const qList = Array.isArray(data) ? data : (data.questions || []);
          if (qList.length > 0) {
            localStorage.setItem("cached_exam_questions", JSON.stringify(qList));
            localStorage.setItem(`cached_exam_${examId}`, JSON.stringify(data));
          }
        }).catch(() => {});
      } catch {}
    }

    if (launchUrl) {
      window.location.href = launchUrl;
    }
  };

  if (isCompleted) {
    return (
      <div className="min-h-screen bg-[#f8fafc] text-slate-900 flex flex-col items-center justify-center p-4 selection:bg-rose-500 selection:text-white">
        <div className="w-full max-w-xl bg-white border border-slate-200 rounded-3xl shadow-xl p-8 md:p-10 flex flex-col text-center items-center">
          {/* Header Icon */}
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shadow-sm mb-4">
            <CheckCircle2 className="w-8 h-8" />
          </div>

          {/* Badge */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700 mb-3">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Assessment Completed
          </div>

          <h1 className="text-2xl font-black text-slate-900 tracking-tight mb-2">
            {title}
          </h1>

          <p className="text-slate-600 text-sm leading-relaxed max-w-md mb-6">
            You have already taken and submitted this assessment. Your answers and code submissions have been recorded.
          </p>

          {/* Score display */}
          <div className="w-full mb-6 p-5 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between">
            <div className="text-left">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                Evaluated Score
              </span>
              <span className="text-3xl font-black text-slate-900">
                {completedScore !== null ? completedScore : 0} <span className="text-lg font-bold text-slate-400">/ 100</span>
              </span>
            </div>
            <span
              className={`px-3 py-1 rounded-full text-xs font-bold border ${
                (completedScore ?? 0) >= 70
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : (completedScore ?? 0) >= 40
                  ? "bg-amber-50 text-amber-700 border-amber-200"
                  : "bg-rose-50 text-rose-700 border-rose-200"
              }`}
            >
              {(completedScore ?? 0) >= 70
                ? "Ready for Placement"
                : (completedScore ?? 0) >= 40
                ? "Developing Competence"
                : "Needs Improvement"}
            </span>
          </div>

          {/* Direct Navigation to History & Reports */}
          <button
            onClick={() => navigate("/profile?tab=history")}
            className="w-full py-4 px-6 rounded-2xl bg-rose-600 hover:bg-rose-700 active:scale-[0.99] text-white font-black text-base shadow-lg shadow-rose-600/25 flex items-center justify-center gap-3 transition-all cursor-pointer mb-3"
          >
            <FileText className="w-5 h-5" />
            <span>View Test History & Scorecard</span>
            <ArrowRight className="w-4 h-4 ml-auto" />
          </button>

          <button
            onClick={() => navigate("/home")}
            className="w-full py-3 px-6 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold text-sm transition-all cursor-pointer"
          >
            Return to Candidate Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 flex flex-col items-center justify-center p-4 selection:bg-rose-500 selection:text-white">
      <div className="w-full max-w-xl bg-white border border-slate-200 rounded-3xl shadow-xl p-8 md:p-10 flex flex-col text-center items-center">
        {/* Header Icon */}
        <div className="w-16 h-16 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 shadow-sm mb-4">
          <Lock className="w-8 h-8" />
        </div>

        {/* Badge */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-rose-100 text-rose-700 mb-3">
          <ShieldAlert className="w-3.5 h-3.5" />
          Safe Exam Browser (SEB) Required
        </div>

        <h1 className="text-2xl font-black text-slate-900 tracking-tight mb-2">
          {title}
        </h1>

        <p className="text-slate-600 text-sm leading-relaxed max-w-md mb-8">
          This examination is protected with Safe Exam Browser to ensure exam security. You must launch the assessment inside SEB to continue.
        </p>

        {/* Prominent 1-Click Launch Button */}
        <button
          onClick={handleLaunch}
          className="w-full py-4 px-6 rounded-2xl bg-rose-600 hover:bg-rose-700 active:scale-[0.99] text-white font-black text-base shadow-lg shadow-rose-600/25 flex items-center justify-center gap-3 transition-all cursor-pointer mb-6"
        >
          <MonitorCheck className="w-5 h-5" />
          Launch Safe Exam Browser
        </button>

        {/* Clear Instructions Card */}
        <div className="w-full bg-slate-50 border border-slate-200/80 rounded-2xl p-5 text-left mb-6 space-y-3">
          <p className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2">
            Instructions for Candidates:
          </p>

          <div className="flex items-start gap-2.5 text-xs text-slate-600">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <span>
              <strong>1. Install SEB:</strong> Make sure Safe Exam Browser is installed on your computer.{" "}
              <a
                href={sebDownloadLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-rose-600 hover:underline font-semibold inline-flex items-center gap-0.5"
              >
                Download here <ExternalLink className="w-3 h-3" />
              </a>
            </span>
          </div>

          <div className="flex items-start gap-2.5 text-xs text-slate-600">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <span>
              <strong>2. Click Launch:</strong> The button above will automatically open SEB and lock into the test.
            </span>
          </div>

          <div className="flex items-start gap-2.5 text-xs text-slate-600">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <span>
              <strong>3. Lockdown Active:</strong> Alt+Tab, screenshots, multiple displays, and background apps are locked until submission.
            </span>
          </div>
        </div>

        {/* Footer options */}
        <div className="w-full pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
          {downloadUrl ? (
            <a
              href={downloadUrl}
              className="text-slate-500 hover:text-slate-800 hover:underline inline-flex items-center gap-1 font-medium"
            >
              <Download className="w-3 h-3" />
              Download .seb file
            </a>
          ) : <span />}

          <button
            onClick={() => {
              if (onBypass) {
                onBypass();
              } else {
                const url = new URL(window.location.href);
                url.searchParams.set("bypass_seb", "true");
                window.location.href = url.toString();
              }
            }}
            className="text-slate-400 hover:text-slate-700 underline font-medium cursor-pointer"
          >
            Developer Preview Mode
          </button>
        </div>
      </div>
    </div>
  );
};

