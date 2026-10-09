import React, { lazy, Suspense, useEffect, useMemo, useState, useRef, useCallback } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Play,
  Send,
  X,
  Moon,
  Sun,
  Contrast,
  RotateCcw,
  Sparkles,
  Terminal,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Code2,
  FileCode2,
  HelpCircle,
  Copy,
  Layers,
  Loader2,
} from "lucide-react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useSEBGuard } from "@/hooks/useSEBGuard";
import { SEBGate } from "@/components/SEBGate";
import type { MonacoTheme } from "@/components/team_a/MonacoEditor";

const MonacoEditor = lazy(
  () =>
    import("@/components/team_a/MonacoEditor").then((m) => ({
      default: m.default ?? m.MonacoEditor,
    }))
);

const API =
  (import.meta as any).env?.VITE_API_BASE_URL !== undefined && (import.meta as any).env.VITE_API_BASE_URL !== ""
    ? (import.meta as any).env.VITE_API_BASE_URL
    : typeof window !== "undefined" && (window.location.port === "5173" || window.location.port === "3000")
    ? ""
    : "http://localhost:8000";

type ExampleItem = {
  input: string;
  output: string;
  explanation?: string;
};

type SampleTestCase = {
  input?: Record<string, unknown> | string;
  expected_output?: unknown;
};

type Question = {
  question_id: string;
  title: string;
  description?: string;
  topic?: string;
  ctc_band?: string;
  difficulty?: string;
  constraints?: string[] | string | Record<string, unknown> | null;
  examples?: unknown;
  sample_test_cases?: SampleTestCase[] | null;
};

const FALLBACK_QUESTIONS: Question[] = [
  {
    question_id: "Q001",
    title: "Two Sum",
    difficulty: "Easy",
    topic: "Arrays & Hashing",
    description: "Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.\n\nYou may assume that each input would have exactly one solution, and you may not use the same element twice.",
    constraints: "2 <= nums.length <= 10^4\n-10^9 <= nums[i] <= 10^9\n-10^9 <= target <= 10^9\nOnly one valid answer exists.",
    examples: "Input: nums = [2,7,11,15], target = 9\nOutput: [0,1]\nExplanation: Because nums[0] + nums[1] == 9, we return [0, 1].",
    sample_test_cases: [
      { input: "[2, 7, 11, 15]\n9", expected_output: "[0, 1]" },
      { input: "[3, 2, 4]\n6", expected_output: "[1, 2]" },
      { input: "[3, 3]\n6", expected_output: "[0, 1]" },
    ],
  },
  {
    question_id: "Q002",
    title: "Reverse a Linked List",
    difficulty: "Easy",
    topic: "Linked Lists",
    description: "Given the head of a singly linked list, reverse the list, and return the reversed list.",
    constraints: "The number of nodes in the list is the range [0, 5000].\n-5000 <= Node.val <= 5000",
    examples: "Input: head = [1,2,3,4,5]\nOutput: [5,4,3,2,1]",
    sample_test_cases: [
      { input: "[1, 2, 3, 4, 5]", expected_output: "[5, 4, 3, 2, 1]" },
      { input: "[1, 2]", expected_output: "[2, 1]" },
      { input: "[]", expected_output: "[]" },
    ],
  },
  {
    question_id: "Q003",
    title: "Merge Intervals",
    difficulty: "Medium",
    topic: "Arrays",
    description: "Given an array of intervals where intervals[i] = [starti, endi], merge all overlapping intervals, and return an array of the non-overlapping intervals.",
    constraints: "1 <= intervals.length <= 10^4\nintervals[i].length == 2",
    examples: "Input: intervals = [[1,3],[2,6],[8,10],[15,18]]\nOutput: [[1,6],[8,10],[15,18]]",
    sample_test_cases: [
      { input: "[[1,3],[2,6],[8,10],[15,18]]", expected_output: "[[1,6],[8,10],[15,18]]" },
      { input: "[[1,4],[4,5]]", expected_output: "[[1,5]]" },
    ],
  },
];

type ExecutionResult = {
  status?: string;
  passed?: boolean;
  total_test_cases?: number;
  passed_test_cases?: number;
  results?: Array<{
    status?: string;
    passed?: boolean;
    input?: string;
    expected_output?: string;
    actual_output?: string;
    stdout?: string;
    stderr?: string;
    execution_time?: number;
  }>;
  stdout?: string;
  stderr?: string;
  error?: string;
  time_ms?: number;
};

// --- Safe Format Utilities ---

const formatValue = (value: unknown): string => {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const formatInput = (input: unknown): string => {
  if (input === null || input === undefined) return "";
  if (typeof input === "string") return input;
  if (Array.isArray(input)) return JSON.stringify(input);
  if (typeof input !== "object") return String(input);

  try {
    const entries = Object.entries(input as Record<string, unknown>);
    return entries
      .map(([key, val]) => `${key} = ${typeof val === "object" ? JSON.stringify(val) : formatValue(val)}`)
      .join("\n");
  } catch {
    return JSON.stringify(input);
  }
};

const parseExamplesList = (raw: unknown): ExampleItem[] => {
  if (!raw) return [];

  if (Array.isArray(raw)) {
    return raw.map((item, idx) => {
      if (typeof item === "object" && item !== null) {
        return {
          input: formatInput(item.input || item.Input || ""),
          output: formatValue(item.output || item.Output || item.expected_output || ""),
          explanation: item.explanation || item.Explanation || undefined,
        };
      }
      return {
        input: `Sample ${idx + 1}`,
        output: String(item),
      };
    });
  }

  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parseExamplesList(parsed);
      }
    } catch {
      // Plain text parsing
      const chunks = raw.split(/Example \d+:/i).filter(Boolean);
      if (chunks.length > 0) {
        return chunks.map((c) => {
          const inMatch = c.match(/Input:\s*([\s\S]*?)(?=Output:|$)/i);
          const outMatch = c.match(/Output:\s*([\s\S]*?)(?=Explanation:|$)/i);
          const expMatch = c.match(/Explanation:\s*([\s\S]*)/i);
          return {
            input: inMatch ? inMatch[1].trim() : c.trim(),
            output: outMatch ? outMatch[1].trim() : "",
            explanation: expMatch ? expMatch[1].trim() : undefined,
          };
        });
      }
    }
    return [{ input: raw, output: "" }];
  }

  return [];
};

const parseConstraintsList = (raw: unknown): string[] => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((item) => String(item).trim());
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map((item) => String(item).trim());
    } catch {
      return raw
        .split(/\n|•|- /)
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  if (typeof raw === "object") {
    return Object.entries(raw as Record<string, unknown>).map(
      ([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`
    );
  }
  return [];
};

const getDifficultyBadge = (difficulty?: string) => {
  switch ((difficulty || "").toLowerCase()) {
    case "easy":
      return {
        label: "Easy",
        badge: "bg-emerald-50 text-emerald-700 border-emerald-200",
        dot: "bg-emerald-500",
      };
    case "hard":
      return {
        label: "Hard",
        badge: "bg-rose-50 text-rose-700 border-rose-200",
        dot: "bg-rose-500",
      };
    case "medium":
    default:
      return {
        label: "Medium",
        badge: "bg-amber-50 text-amber-700 border-amber-200",
        dot: "bg-amber-500",
      };
  }
};

const CodingPage: React.FC = () => {
  const { user, getToken } = useAuth();
  const { examId: routeExamId } = useParams();
  const navigate = useNavigate();
  const searchParams = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const activeExamId = routeExamId || searchParams.get("exam_id") || "coding-assessment";

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>(() => {
    try {
      if (typeof window !== "undefined") {
        const targetId = routeExamId || new URLSearchParams(window.location.search).get("exam_id") || "coding-assessment";
        const cachedSpecific = localStorage.getItem(`cached_exam_${targetId}`);
        if (cachedSpecific) {
          const parsed = JSON.parse(cachedSpecific);
          const qList = Array.isArray(parsed) ? parsed : (parsed.questions || []);
          if (qList.length > 0) return qList;
        }
        const cachedGeneral = localStorage.getItem("cached_exam_questions");
        if (cachedGeneral) {
          const parsed = JSON.parse(cachedGeneral);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      }
    } catch {}
    return FALLBACK_QUESTIONS;
  });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loadingQuestions, setLoadingQuestions] = useState(false);

  // SEB & Security State
  const [assessmentBlocked, setAssessmentBlocked] = useState(false);
  const [showFullscreenWarning, setShowFullscreenWarning] = useState(true);
  const [showEndAssessmentModal, setShowEndAssessmentModal] = useState(false);
  const [assessmentEnded, setAssessmentEnded] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(150 * 60);
  const [answersMap, setAnswersMap] = useState<Record<string, { source_code: string; language: string }>>({});
  const [finalScore, setFinalScore] = useState<number | null>(null);
  const [submittingAll, setSubmittingAll] = useState(false);

  // Helper for auth headers (SEB URL token, localStorage, or AuthContext)
  const getAuthHeaders = useCallback((): Record<string, string> => {
    const token =
      getToken() ||
      (typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("auth_token") ||
          new URLSearchParams(window.location.search).get("token") ||
          localStorage.getItem("aia_access_token") ||
          sessionStorage.getItem("aia_access_token") ||
          ""
        : "");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    return headers;
  }, [getToken]);

  // Editor State
  const [code, setCode] = useState("");
  const [language, setLanguage] = useState("cpp");
  const [editorTheme, setEditorTheme] = useState<MonacoTheme>("vs-dark");
  const [editorFontSize, setEditorFontSize] = useState<number>(14);
  const [isEditorMaximized, setIsEditorMaximized] = useState(false);

  // Resizable Split-Pane State
  const [leftWidthPercent, setLeftWidthPercent] = useState<number>(45);
  const [isDraggingSplitter, setIsDraggingSplitter] = useState<boolean>(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);

  // Test Console State
  const [consoleTab, setConsoleTab] = useState<"testcases" | "custom" | "results">("testcases");
  const [selectedTestCaseIdx, setSelectedTestCaseIdx] = useState<number>(0);
  const [customInput, setCustomInput] = useState<string>("");
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const selectedQuestion = questions[selectedIndex];

  const {
    isSEB,
    launchSebUrl,
    downloadConfigUrl,
    quitExam,
    infractionCount,
    isFullscreen,
    requestFullscreen,
  } = useSEBGuard({
    examId: activeExamId !== "coding-assessment" ? activeExamId : (sessionId || "coding-assessment"),
    candidateId: user?.id || "candidate",
    maxInfractions: 3,
    onInfraction: (reason, count) => {
      console.log(`[SEB] ${reason} — Strike ${count}/3`);
    },
    onDisqualified: () => {
      setAssessmentBlocked(true);
    },
  });

  // Fullscreen enforcement
  useEffect(() => {
    if (!sessionId || assessmentBlocked) return;
    if (isFullscreen || isSEB) {
      setShowFullscreenWarning(false);
    } else {
      setShowFullscreenWarning(true);
    }
  }, [sessionId, assessmentBlocked, isFullscreen, isSEB]);

  // Session Init
  useEffect(() => {
    if (!user?.id || sessionId) return;

    const createSession = async () => {
      try {
        const response = await fetch(`${API}/sessions/start`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            candidate_id: user.id,
            role_title: "Full Stack Software Engineer",
          }),
        });
        if (response.ok) {
          const data = await response.json();
          setSessionId(data.id);
        }
      } catch (err) {
        console.error("Failed to start session:", err);
      }
    };
    createSession();
  }, [user?.id, sessionId]);

  // Fetch Questions
  useEffect(() => {
    let mounted = true;

    const loadQuestions = async () => {
      try {
        setLoadingQuestions(true);
        const targetExamId = activeExamId !== "coding-assessment" ? activeExamId : null;

        if (targetExamId) {
          try {
            let res = await fetch(`${API}/exams/${targetExamId}`);
            if (!res.ok && API) {
              res = await fetch(`/exams/${targetExamId}`);
            }
            if (res.ok) {
              const examData = await res.json();
              const qList = Array.isArray(examData.questions)
                ? examData.questions
                : Array.isArray(examData)
                ? examData
                : [];
              if (qList.length > 0) {
                if (mounted) {
                  setQuestions(qList);
                  try {
                    localStorage.setItem(`cached_exam_${targetExamId}`, JSON.stringify(examData));
                  } catch {}
                  if (examData.duration_minutes) {
                    setRemainingSeconds(examData.duration_minutes * 60);
                  }
                }
                return;
              }
            }
          } catch (e) {
            console.warn("Direct exam fetch failed, trying fallback:", e);
          }
        }

        try {
          let response = await fetch(`${API}/api/questions?assessment=true`);
          if (!response.ok && API) {
            response = await fetch(`/api/questions?assessment=true`);
          }
          if (response.ok) {
            const data = await response.json();
            const qList = Array.isArray(data) ? data : data.questions || [];
            if (mounted && qList.length > 0) {
              setQuestions(qList);
              try {
                localStorage.setItem("cached_exam_questions", JSON.stringify(qList));
              } catch {}
              return;
            }
          }
        } catch (e) {
          console.warn("General questions fetch failed:", e);
        }

        if (mounted) {
          setQuestions((prev) => (prev.length > 0 ? prev : FALLBACK_QUESTIONS));
        }
      } catch (err) {
        console.error("Failed to load questions:", err);
        if (mounted) {
          setQuestions((prev) => (prev.length > 0 ? prev : FALLBACK_QUESTIONS));
        }
      } finally {
        if (mounted) setLoadingQuestions(false);
      }
    };

    loadQuestions();
    return () => {
      mounted = false;
    };
  }, [activeExamId]);

  // Timer countdown
  useEffect(() => {
    if (remainingSeconds <= 0) return;
    const timer = setInterval(() => {
      setRemainingSeconds((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [remainingSeconds]);

  const formattedTime = useMemo(() => {
    const hours = Math.floor(remainingSeconds / 3600);
    const minutes = Math.floor((remainingSeconds % 3600) / 60);
    const seconds = remainingSeconds % 60;
    return [
      String(hours).padStart(2, "0"),
      String(minutes).padStart(2, "0"),
      String(seconds).padStart(2, "0"),
    ].join(":");
  }, [remainingSeconds]);

  // Reset editor / result on question change
  useEffect(() => {
    if (!selectedQuestion) return;
    const existing = answersMap[selectedQuestion.question_id];
    setCode(existing?.source_code || "");
    if (existing?.language) setLanguage(existing.language);
    setExecutionResult(null);
    setConsoleTab("testcases");
    setSelectedTestCaseIdx(0);
  }, [selectedQuestion?.question_id]);

  const handleCodeChange = (newCode: string) => {
    setCode(newCode);
    if (selectedQuestion) {
      setAnswersMap((prev) => ({
        ...prev,
        [selectedQuestion.question_id]: { source_code: newCode, language },
      }));
    }
  };

  // Handle Splitter Dragging
  const handleSplitterMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingSplitter(true);
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingSplitter || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const newWidth = ((e.clientX - rect.left) / rect.width) * 100;
      if (newWidth >= 25 && newWidth <= 75) {
        setLeftWidthPercent(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsDraggingSplitter(false);
    };

    if (isDraggingSplitter) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDraggingSplitter]);

  // Execute Code
  const handleRun = async () => {
    if (!selectedQuestion || !code.trim()) return;

    setRunning(true);
    setConsoleTab("results");
    setExecutionResult(null);

    try {
      const sampleCases = (selectedQuestion.sample_test_cases || [])
        .slice(0, 3)
        .map((tc) => ({
          input: formatInput(tc.input),
          expected_output: formatValue(tc.expected_output),
        }));

      const payload = {
        question_id: selectedQuestion.question_id,
        language,
        source_code: code,
        stdin: customInput || undefined,
        test_cases: customInput ? undefined : sampleCases,
      };

      const response = await fetch(`${API}/api/code/run`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.detail || "Execution failed");
      }
      setExecutionResult(data);
    } catch (err) {
      setExecutionResult({
        status: "ERROR",
        passed: false,
        error: err instanceof Error ? err.message : "Execution failed.",
      });
    } finally {
      setRunning(false);
    }
  };

  // Submit Code
  const handleSubmit = async () => {
    if (!selectedQuestion || !code.trim()) return;

    setSubmitting(true);
    setConsoleTab("results");

    try {
      const response = await fetch(`${API}/api/code/submit`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          question_id: selectedQuestion.question_id,
          language,
          source_code: code,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.detail || "Submission failed");
      }
      setExecutionResult(data);
    } catch (err) {
      setExecutionResult({
        status: "SUBMISSION_ERROR",
        passed: false,
        error: err instanceof Error ? err.message : "Failed to submit solution.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Finalize & End Assessment
  const handleEndAssessment = async () => {
    setSubmittingAll(true);
    try {
      const finalAnswers: Record<string, { source_code: string; language: string }> = {
        ...answersMap,
      };
      if (selectedQuestion && code.trim()) {
        finalAnswers[selectedQuestion.question_id] = { source_code: code, language };
      }

      const candidateId =
        user?.id ||
        (typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("auth_user") || "candidate"
          : "candidate");

      const targetExamId = activeExamId || "coding-assessment";
      const res = await fetch(`${API}/exams/${targetExamId}/submit`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          candidate_id: candidateId,
          answers: finalAnswers,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setFinalScore(data.score != null ? data.score : 0);
      } else {
        setFinalScore(0);
      }
    } catch (err) {
      console.warn("End assessment submission error:", err);
      setFinalScore(0);
    } finally {
      setSubmittingAll(false);
      setShowEndAssessmentModal(false);
      setAssessmentEnded(true);
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  // SEB Enforcement Gate
  if (!isSEB) {
    return (
      <SEBGate
        title={selectedQuestion?.title ? `Assessment: ${selectedQuestion.title}` : "Live Coding Assessment"}
        launchUrl={launchSebUrl}
        downloadUrl={downloadConfigUrl}
        examId={activeExamId}
      />
    );
  }

  const parsedExamples = parseExamplesList(selectedQuestion?.examples);
  const parsedConstraints = parseConstraintsList(selectedQuestion?.constraints);
  const sampleTestCases = selectedQuestion?.sample_test_cases || [];

  return (
    <div className="h-screen w-screen flex flex-col bg-[#f8fafc] text-slate-900 overflow-hidden font-sans select-none">
      {/* ── Security Warnings / Modals ── */}
      {showFullscreenWarning && !isFullscreen && !isSEB && !assessmentBlocked && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl border border-slate-100 text-center">
            <div className="w-14 h-14 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 mx-auto mb-4">
              <AlertCircle className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-black text-slate-900 mb-2">Fullscreen Required</h2>
            <p className="text-sm text-slate-600 mb-6 leading-relaxed">
              This assessment must run in fullscreen mode. Exiting fullscreen or tab switching triggers an integrity strike.
            </p>
            <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 text-left font-medium">
              ⚠️ Allowed strikes: <strong>3 maximum</strong> before auto-disqualification.
            </div>
            <button
              onClick={requestFullscreen}
              className="w-full py-3.5 px-6 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold shadow-md shadow-rose-600/20 transition-all cursor-pointer"
            >
              Enter Fullscreen & Begin
            </button>
          </div>
        </div>
      )}

      {assessmentBlocked && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-2xl border border-slate-100">
            <div className="w-16 h-16 rounded-2xl bg-rose-100 flex items-center justify-center text-rose-600 mx-auto mb-4">
              <XCircle className="w-9 h-9" />
            </div>
            <h2 className="text-2xl font-black text-rose-700 mb-2">Assessment Disqualified</h2>
            <p className="text-sm text-slate-600 mb-4 leading-relaxed">
              The maximum threshold of 3 integrity violations was reached. Your assessment session has been locked.
            </p>
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700 mb-6">
              Integrity Strikes: {infractionCount} / 3
            </div>
            <button
              onClick={quitExam}
              className="w-full py-3.5 px-6 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold shadow-md cursor-pointer transition-all"
            >
              Exit Safe Exam Browser
            </button>
          </div>
        </div>
      )}

      {assessmentEnded && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-2xl bg-emerald-100 flex items-center justify-center text-emerald-600 mx-auto mb-4">
              <CheckCircle2 className="w-9 h-9" />
            </div>
            <h2 className="text-2xl font-black text-slate-900 mb-2">Assessment Submitted</h2>
            <p className="text-sm text-slate-600 mb-5 leading-relaxed">
              Your test solutions have been evaluated and recorded to the institutional score registry.
            </p>
            {finalScore !== null && (
              <div className="mb-6 p-4 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-between">
                <div className="text-left">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Evaluated Score</span>
                  <span className="text-2xl font-black text-slate-900">{finalScore} / 100</span>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                  finalScore >= 70
                    ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                    : finalScore >= 40
                    ? "bg-amber-100 text-amber-800 border border-amber-200"
                    : "bg-rose-100 text-rose-800 border border-rose-200"
                }`}>
                  {finalScore >= 70 ? "Ready for Placement" : finalScore >= 40 ? "Developing Competence" : "Needs Improvement"}
                </span>
              </div>
            )}
            <div className="flex flex-col gap-2.5">
              <button
                onClick={quitExam}
                className="w-full py-3.5 px-6 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold shadow-md cursor-pointer transition-all"
              >
                Exit Safe Exam Browser
              </button>
            </div>
          </div>
        </div>
      )}

      {showEndAssessmentModal && !assessmentEnded && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl border border-slate-100">
            <h2 className="text-xl font-black text-slate-900 mb-2">End Assessment?</h2>
            <p className="text-sm text-slate-600 mb-6 leading-relaxed">
              Are you sure you want to finalize and submit all your code solutions? You cannot re-enter once finished.
            </p>
            <div className="flex justify-end gap-3">
              <button
                disabled={submittingAll}
                onClick={() => setShowEndAssessmentModal(false)}
                className="px-5 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                disabled={submittingAll}
                onClick={handleEndAssessment}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-sm font-bold shadow-md cursor-pointer flex items-center gap-2"
              >
                {submittingAll ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Evaluating & Finalizing...</span>
                  </>
                ) : (
                  <span>End & Submit All</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── TOP STICKY NAVBAR ── */}
      <header className="h-[60px] bg-white border-b border-slate-200/90 px-5 flex items-center justify-between shrink-0 z-30 shadow-xs">
        {/* Left: Branding & Question Pills */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-rose-600 text-white font-black text-sm flex items-center justify-center shadow-xs">
              08
            </div>
            <div className="hidden sm:block">
              <span className="text-xs font-black text-slate-900 tracking-wider">PROJECT 08</span>
              <span className="text-[10px] text-slate-400 block -mt-0.5 uppercase tracking-widest font-bold">Arena</span>
            </div>
          </div>

          <div className="h-5 w-[1px] bg-slate-200 hidden md:block" />

          {/* Question Nav Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto py-1">
            {questions.map((q, idx) => {
              const diff = getDifficultyBadge(q.difficulty);
              const isActive = idx === selectedIndex;
              return (
                <button
                  key={q.question_id || idx}
                  onClick={() => setSelectedIndex(idx)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shrink-0 ${
                    isActive
                      ? "bg-slate-900 text-white shadow-xs"
                      : "bg-slate-100 hover:bg-slate-200/80 text-slate-700"
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${diff.dot}`} />
                  <span>Q{idx + 1}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Timer, Strikes & Actions */}
        <div className="flex items-center gap-4">
          {/* Countdown Timer */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs font-bold text-slate-700">
            <Clock3 className="w-4 h-4 text-slate-400" />
            <span className={`font-mono text-xs ${remainingSeconds < 600 ? "text-rose-600 animate-pulse font-extrabold" : "text-slate-800"}`}>
              {formattedTime}
            </span>
          </div>

          {/* Strikes Pill (hidden inside Safe Exam Browser) */}
          {!isSEB && (
            <div
              className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 ${
                infractionCount === 0
                  ? "border-slate-200 bg-slate-50 text-slate-600"
                  : infractionCount < 3
                  ? "border-amber-200 bg-amber-50 text-amber-700"
                  : "border-rose-200 bg-rose-50 text-rose-700"
              }`}
            >
              <span>⚠️</span>
              <span>{infractionCount} / 3 Strikes</span>
            </div>
          )}

          <div className="h-5 w-[1px] bg-slate-200" />

          {/* Run Code Button */}
          <button
            onClick={handleRun}
            disabled={running || !code.trim()}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 active:scale-95 text-slate-800 text-xs font-bold transition-all shadow-2xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Play className={`w-3.5 h-3.5 text-emerald-600 ${running ? "animate-spin" : ""}`} />
            <span>{running ? "Running..." : "Run"}</span>
          </button>

          {/* Submit Question Button */}
          <button
            onClick={handleSubmit}
            disabled={submitting || !code.trim()}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{submitting ? "Submitting..." : "Submit"}</span>
          </button>

          {/* End Exam Button */}
          <button
            onClick={() => setShowEndAssessmentModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-bold transition-all cursor-pointer"
          >
            End Test
          </button>
        </div>
      </header>

      {/* ── MAIN WORKSPACE (SPLIT PANE) ── */}
      <div ref={containerRef} className="flex-1 flex overflow-hidden relative">
        {/* ── LEFT PANE: PROBLEM STATEMENT ── */}
        {!isSidebarCollapsed && (
          <div
            style={{ width: `${leftWidthPercent}%` }}
            className="h-full bg-white border-r border-slate-200 flex flex-col overflow-hidden shrink-0"
          >
            {/* Left Top Sub-header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
                  Problem {selectedIndex + 1} of {questions.length}
                </span>
                {selectedQuestion?.topic && (
                  <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                    {selectedQuestion.topic}
                  </span>
                )}
                {selectedQuestion?.ctc_band && (
                  <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 text-slate-600">
                    {selectedQuestion.ctc_band}
                  </span>
                )}
              </div>

              {/* Prev / Next Question Navigation */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setSelectedIndex((prev) => Math.max(0, prev - 1))}
                  disabled={selectedIndex === 0}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 disabled:opacity-30 cursor-pointer"
                  title="Previous Question"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setSelectedIndex((prev) => Math.min(questions.length - 1, prev + 1))}
                  disabled={selectedIndex === questions.length - 1}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 disabled:opacity-30 cursor-pointer"
                  title="Next Question"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Scrollable Problem Content */}
            <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6">
              {loadingQuestions ? (
                <div className="flex flex-col items-center justify-center py-20 space-y-3">
                  <div className="w-8 h-8 border-3 border-rose-600/20 border-t-rose-600 rounded-full animate-spin" />
                  <p className="text-xs font-semibold text-slate-400">Loading problem details...</p>
                </div>
              ) : selectedQuestion ? (
                <>
                  {/* Big Title & Badges */}
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">
                        {selectedQuestion.title}
                      </h1>
                      {(() => {
                        const diff = getDifficultyBadge(selectedQuestion.difficulty);
                        return (
                          <span className={`px-2.5 py-1 rounded-full text-xs font-black border uppercase tracking-wider ${diff.badge}`}>
                            {diff.label}
                          </span>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Problem Description */}
                  <div className="prose prose-slate max-w-none text-[15px] leading-relaxed text-slate-700 font-normal whitespace-pre-line">
                    {selectedQuestion.description}
                  </div>

                  {/* Examples Section */}
                  {parsedExamples.length > 0 && (
                    <div className="space-y-4 pt-2">
                      <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                        <Code2 className="w-4 h-4 text-slate-500" />
                        Examples
                      </h3>

                      <div className="space-y-3">
                        {parsedExamples.map((ex, i) => (
                          <div
                            key={i}
                            className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 space-y-2.5 text-xs font-mono relative group"
                          >
                            <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 font-sans pb-1 border-b border-slate-200/60">
                              <span>Example {i + 1}</span>
                              <button
                                onClick={() => copyToClipboard(`Input: ${ex.input}\nOutput: ${ex.output}`, `ex-${i}`)}
                                className="inline-flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-700 cursor-pointer"
                              >
                                <Copy className="w-3 h-3" />
                                {copiedKey === `ex-${i}` ? "Copied!" : "Copy"}
                              </button>
                            </div>

                            <div>
                              <span className="text-slate-400 font-sans font-bold text-[11px] block mb-0.5">Input:</span>
                              <pre className="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-800 overflow-x-auto whitespace-pre-wrap">
                                {ex.input || "None"}
                              </pre>
                            </div>

                            <div>
                              <span className="text-slate-400 font-sans font-bold text-[11px] block mb-0.5">Output:</span>
                              <pre className="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-800 overflow-x-auto whitespace-pre-wrap">
                                {ex.output || "None"}
                              </pre>
                            </div>

                            {ex.explanation && (
                              <div className="font-sans text-slate-600 text-[11px] pt-1 leading-relaxed">
                                <strong className="text-slate-800">Explanation:</strong> {ex.explanation}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Constraints Section */}
                  {parsedConstraints.length > 0 && (
                    <div className="space-y-3 pt-2">
                      <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                        <Layers className="w-4 h-4 text-slate-500" />
                        Constraints
                      </h3>
                      <ul className="space-y-1.5">
                        {parsedConstraints.map((c, i) => (
                          <li key={i} className="flex items-start gap-2 text-xs font-mono text-slate-700">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0 mt-1.5" />
                            <span className="bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200/60 font-medium">
                              {c}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-20 text-slate-400 text-sm">No question selected.</div>
              )}
            </div>
          </div>
        )}

        {/* ── DRAGGABLE SPLITTER DIVIDER ── */}
        <div
          onMouseDown={handleSplitterMouseDown}
          className={`w-1.5 hover:w-2 bg-slate-200 hover:bg-rose-500 transition-colors cursor-col-resize flex items-center justify-center shrink-0 z-20 ${
            isDraggingSplitter ? "bg-rose-600 w-2" : ""
          }`}
          title="Drag to resize panels"
        >
          <div className="h-8 w-0.5 bg-slate-400 rounded-full" />
        </div>

        {/* ── RIGHT PANE: CODE EDITOR + TESTCASE CONSOLE ── */}
        <div className="flex-1 h-full flex flex-col bg-[#1e1e1e] overflow-hidden">
          {/* Editor Header Toolbar */}
          <div className="h-[46px] bg-[#181818] border-b border-white/10 px-4 flex items-center justify-between shrink-0 text-white z-10">
            {/* Left toolbar items */}
            <div className="flex items-center gap-3">
              {/* Sidebar toggle button */}
              <button
                onClick={() => setIsSidebarCollapsed((prev) => !prev)}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-colors cursor-pointer"
                title={isSidebarCollapsed ? "Show Problem Statement" : "Maximize Editor"}
              >
                {isSidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
              </button>

              <div className="flex items-center gap-2">
                <FileCode2 className="w-4 h-4 text-rose-500" />
                <span className="text-xs font-bold text-white/90">Solution Workspace</span>
              </div>

              {/* Language Selector */}
              <div className="ml-2">
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="bg-white/10 border border-white/10 rounded-lg px-2.5 py-1 text-xs font-bold text-white focus:outline-hidden focus:ring-1 focus:ring-rose-500 cursor-pointer"
                >
                  <option value="cpp" className="bg-[#181818] text-white">C++ (g++ 17)</option>
                  <option value="python" className="bg-[#181818] text-white">Python (3.11)</option>
                  <option value="java" className="bg-[#181818] text-white">Java (OpenJDK 17)</option>
                  <option value="c" className="bg-[#181818] text-white">C (gcc 11)</option>
                  <option value="javascript" className="bg-[#181818] text-white">JavaScript (Node 20)</option>
                </select>
              </div>
            </div>

            {/* Right toolbar controls: Theme, Font, Maximize */}
            <div className="flex items-center gap-2">
              {/* Theme Toggle Button */}
              <div className="flex items-center bg-white/5 rounded-lg p-0.5 border border-white/10">
                <button
                  onClick={() => setEditorTheme("vs-dark")}
                  className={`p-1 rounded-md text-xs font-medium cursor-pointer transition-colors ${
                    editorTheme === "vs-dark" ? "bg-white/20 text-white font-bold" : "text-white/50 hover:text-white"
                  }`}
                  title="VS Dark Theme"
                >
                  <Moon className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setEditorTheme("vs-light")}
                  className={`p-1 rounded-md text-xs font-medium cursor-pointer transition-colors ${
                    editorTheme === "vs-light" ? "bg-white/20 text-white font-bold" : "text-white/50 hover:text-white"
                  }`}
                  title="Light Theme"
                >
                  <Sun className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setEditorTheme("hc-black")}
                  className={`p-1 rounded-md text-xs font-medium cursor-pointer transition-colors ${
                    editorTheme === "hc-black" ? "bg-white/20 text-white font-bold" : "text-white/50 hover:text-white"
                  }`}
                  title="High Contrast Theme"
                >
                  <Contrast className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Font Size Selector */}
              <select
                value={editorFontSize}
                onChange={(e) => setEditorFontSize(Number(e.target.value))}
                className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[11px] font-bold text-white/80 focus:outline-hidden cursor-pointer"
                title="Font Size"
              >
                <option value={13} className="bg-[#181818] text-white">13px</option>
                <option value={14} className="bg-[#181818] text-white">14px</option>
                <option value={16} className="bg-[#181818] text-white">16px</option>
              </select>

              {/* Code Focus Toggle */}
              <button
                onClick={() => setIsEditorMaximized((prev) => !prev)}
                className="px-2.5 py-1 rounded-md bg-white/10 hover:bg-white/20 text-[11px] font-bold text-white transition-colors cursor-pointer"
                title={isEditorMaximized ? "Restore Test Console" : "Focus on Code Editor"}
              >
                {isEditorMaximized ? "Show Tests" : "Focus Code"}
              </button>
            </div>
          </div>

          {/* Monaco Editor Instance */}
          <div className={`w-full overflow-hidden transition-all ${isEditorMaximized ? "h-full" : "h-[62%]"}`}>
            <Suspense
              fallback={
                <div className="h-full w-full flex items-center justify-center bg-[#1e1e1e] text-white/40 text-xs">
                  Loading code editor...
                </div>
              }
            >
              <MonacoEditor
                userId={user?.id || "candidate"}
                sessionId={sessionId || "coding"}
                questionId={selectedQuestion?.question_id || "q1"}
                theme={editorTheme}
                fontSize={editorFontSize}
                selectedLanguage={language}
                onLanguageChange={(lang) => setLanguage(lang)}
                onCodeChange={(newCode) => handleCodeChange(newCode)}
              />
            </Suspense>
          </div>

          {/* ── BOTTOM CONSOLE: TEST CASES & EXECUTION RESULTS ── */}
          {!isEditorMaximized && (
            <div className="flex-1 bg-[#141414] border-t border-white/10 flex flex-col overflow-hidden">
              {/* Console Tabs Header */}
              <div className="h-10 bg-[#1a1a1a] border-b border-white/10 px-4 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setConsoleTab("testcases")}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                      consoleTab === "testcases"
                        ? "bg-white/15 text-white"
                        : "text-white/50 hover:text-white"
                    }`}
                  >
                    <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Sample Test Cases</span>
                  </button>

                  <button
                    onClick={() => setConsoleTab("custom")}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                      consoleTab === "custom"
                        ? "bg-white/15 text-white"
                        : "text-white/50 hover:text-white"
                    }`}
                  >
                    <Code2 className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Custom Input</span>
                  </button>

                  <button
                    onClick={() => setConsoleTab("results")}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                      consoleTab === "results"
                        ? "bg-white/15 text-white"
                        : "text-white/50 hover:text-white"
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>Test Results</span>
                    {executionResult && (
                      <span
                        className={`w-2 h-2 rounded-full ${
                          executionResult.passed ? "bg-emerald-500" : "bg-rose-500"
                        }`}
                      />
                    )}
                  </button>
                </div>
              </div>

              {/* Console Body */}
              <div className="flex-1 p-4 overflow-y-auto font-mono text-xs text-white/90">
                {consoleTab === "testcases" && (
                  <div className="space-y-3">
                    {/* Test Case Selectors */}
                    <div className="flex items-center gap-2">
                      {sampleTestCases.map((_, idx) => (
                        <button
                          key={idx}
                          onClick={() => setSelectedTestCaseIdx(idx)}
                          className={`px-3 py-1 rounded-lg text-xs font-bold font-sans cursor-pointer transition-colors ${
                            selectedTestCaseIdx === idx
                              ? "bg-white/20 text-white"
                              : "bg-white/5 text-white/50 hover:text-white"
                          }`}
                        >
                          Case {idx + 1}
                        </button>
                      ))}
                    </div>

                    {sampleTestCases[selectedTestCaseIdx] ? (
                      <div className="space-y-3 pt-1">
                        <div>
                          <span className="text-white/40 text-[11px] font-sans font-bold block mb-1">Input:</span>
                          <pre className="p-3 rounded-xl bg-white/5 border border-white/10 text-white/90 overflow-x-auto">
                            {formatInput(sampleTestCases[selectedTestCaseIdx].input)}
                          </pre>
                        </div>
                        <div>
                          <span className="text-white/40 text-[11px] font-sans font-bold block mb-1">Expected Output:</span>
                          <pre className="p-3 rounded-xl bg-white/5 border border-white/10 text-white/90 overflow-x-auto">
                            {formatValue(sampleTestCases[selectedTestCaseIdx].expected_output)}
                          </pre>
                        </div>
                      </div>
                    ) : (
                      <div className="text-white/40 py-4 font-sans text-xs">No sample test cases provided.</div>
                    )}
                  </div>
                )}

                {consoleTab === "custom" && (
                  <div className="h-full flex flex-col space-y-2">
                    <span className="text-white/40 text-[11px] font-sans font-bold">Standard Input (stdin):</span>
                    <textarea
                      value={customInput}
                      onChange={(e) => setCustomInput(e.target.value)}
                      placeholder="Enter custom input arguments here..."
                      className="flex-1 w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white font-mono text-xs focus:outline-hidden focus:border-rose-500 resize-none"
                    />
                  </div>
                )}

                {consoleTab === "results" && (
                  <div>
                    {running ? (
                      <div className="flex items-center gap-3 py-6 text-white/60 font-sans">
                        <div className="w-4 h-4 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
                        <span>Compiling and evaluating against Judge0 sandbox...</span>
                      </div>
                    ) : executionResult ? (
                      <div className="space-y-4">
                        {/* Overall Status Banner */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {executionResult.passed ? (
                              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 font-bold font-sans">
                                <CheckCircle2 className="w-4 h-4" />
                                <span>Accepted</span>
                              </div>
                            ) : (
                              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/20 border border-rose-500/30 text-rose-400 font-bold font-sans">
                                <XCircle className="w-4 h-4" />
                                <span>{executionResult.status || "Wrong Answer"}</span>
                              </div>
                            )}

                            {executionResult.total_test_cases !== undefined && (
                              <span className="text-white/60 font-sans text-xs">
                                Passed: {executionResult.passed_test_cases || 0} / {executionResult.total_test_cases}
                              </span>
                            )}
                          </div>

                          {executionResult.time_ms !== undefined && (
                            <span className="text-white/40 text-xs font-mono">
                              Runtime: {executionResult.time_ms} ms
                            </span>
                          )}
                        </div>

                        {/* Error Message */}
                        {executionResult.error && (
                          <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/40 text-rose-300 whitespace-pre-wrap">
                            {executionResult.error}
                          </div>
                        )}

                        {/* Standard Output */}
                        {executionResult.stdout && (
                          <div>
                            <span className="text-white/40 text-[11px] font-sans font-bold block mb-1">Standard Output:</span>
                            <pre className="p-3 rounded-xl bg-white/5 border border-white/10 text-emerald-300 overflow-x-auto whitespace-pre-wrap">
                              {executionResult.stdout}
                            </pre>
                          </div>
                        )}

                        {/* Standard Error */}
                        {executionResult.stderr && (
                          <div>
                            <span className="text-white/40 text-[11px] font-sans font-bold block mb-1">Standard Error:</span>
                            <pre className="p-3 rounded-xl bg-rose-950/30 border border-rose-900/40 text-rose-300 overflow-x-auto whitespace-pre-wrap">
                              {executionResult.stderr}
                            </pre>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-white/40 py-6 font-sans text-center">
                        Click <strong>"Run"</strong> to test your code against sample test cases or <strong>"Submit"</strong> to record evaluation.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CodingPage;
