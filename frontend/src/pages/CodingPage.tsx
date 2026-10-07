import React, { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Clock3, Play, Send, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useSEBGuard } from "@/hooks/useSEBGuard";
const MonacoEditor = lazy(
  () =>
    import("@/components/team_a/MonacoEditor").then((m) => ({
      default: m.default ?? m.MonacoEditor,
    }))
);
const API =
  (import.meta as any).env?.VITE_API_BASE_URL || "http://localhost:8000";

type Example = {
  input?: Record<string, unknown>;
  output?: unknown;
};

type SampleTestCase = {
  input?: Record<string, unknown>;
  expected_output?: unknown;
};

type Question = {
  question_id: string;
  title: string;
  description?: string;
  topic?: string;
  ctc_band?: string;
  difficulty?: string;
  constraints?: string[] | Record<string, unknown> | null;
  examples?: Example[] | null;
  sample_test_cases?: SampleTestCase[] | null;
};

type ExecutionResult = {
  status?: string;
  passed?: boolean;
  total_test_cases?: number;
  passed_test_cases?: number;
  results?: unknown[];
  error?: string;
};

const formatValue = (value: unknown): string => {
  if (value === undefined || value === null) return "";

  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value, null, 2);
};
const formatInput = (input: unknown): string => {
  if (input === null || input === undefined) {
    return "";
  }

  if (Array.isArray(input)) {
    return JSON.stringify(input);
  }

  if (typeof input !== "object") {
    return formatValue(input);
  }

  const entries = Object.entries(input as Record<string, unknown>);

  return entries
    .map(([key, value]) => {
      if (Array.isArray(value)) {
        return `${key}=${JSON.stringify(value)}`;
      }

      if (typeof value === "object" && value !== null) {
        return `${key}=${JSON.stringify(value)}`;
      }

      return `${key}=${formatValue(value)}`;
    })
    .join("\n");
};

const getDifficultyClass = (difficulty?: string) => {
  switch ((difficulty || "").toLowerCase()) {
    case "easy":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "medium":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "hard":
      return "bg-red-50 text-red-700 border-red-200";
    default:
      return "bg-slate-50 text-slate-600 border-slate-200";
  }
};

const getInitialSeconds = () => 150 * 60;

const CodingPage: React.FC = () => {
  const { user } = useAuth();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loadingQuestions, setLoadingQuestions] = useState(true);
  const [assessmentBlocked, setAssessmentBlocked] = useState(false);
  const [showFullscreenWarning, setShowFullscreenWarning] = useState(true);
  const [code, setCode] = useState("");
  const [language, setLanguage] = useState("cpp");
  const [showEndAssessmentModal, setShowEndAssessmentModal] = useState(false);
  const [assessmentEnded, setAssessmentEnded] = useState(false);
  const [remainingSeconds, setRemainingSeconds] =
    useState(getInitialSeconds);

    const handleEndAssessment = () => {
  if (assessmentBlocked || assessmentEnded) {
    return;
  }

  setShowEndAssessmentModal(true);
};
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [executionResult, setExecutionResult] =
    useState<ExecutionResult | null>(null);

  const [showSubmitDialog, setShowSubmitDialog] = useState(false);

  const selectedQuestion = questions[selectedIndex];
const {
  infractionCount,
  isFullscreen,
  requestFullscreen,
} = useSEBGuard({
  examId: sessionId || "coding-assessment",
  candidateId: user?.id || "",
  maxInfractions: 3,

  onInfraction: (reason, count) => {
    console.log(`[SEB] ${reason} — Strike ${count}/3`);
  },

  onDisqualified: () => {
    setAssessmentBlocked(true);
  },
});
  useEffect(() => {
  if (!sessionId || assessmentBlocked) {
    return;
  }

  if (isFullscreen) {
    setShowFullscreenWarning(false);
    return;
  }

  setShowFullscreenWarning(true);
  }, [sessionId, assessmentBlocked, isFullscreen]);
  useEffect(() => {
  if (!user?.id || sessionId) return;

  const createSession = async () => {
    try {
      const response = await fetch(`${API}/sessions/start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          candidate_id: user.id,
          role_title: "Full Stack Software Engineer",
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to create session: ${response.status}`);
      }

      const data = await response.json();
      setSessionId(data.id);
    } catch (error) {
      console.error("Failed to create coding session:", error);
    }
  };

  createSession();
}, [user?.id, sessionId]);
  useEffect(() => {
    let mounted = true;

    const loadQuestions = async () => {
      try {
        setLoadingQuestions(true);

        const response = await fetch(`${API}/api/questions`);

        if (!response.ok) {
          throw new Error(`Questions request failed: ${response.status}`);
        }

        const data = await response.json();

        if (mounted && Array.isArray(data)) {
          setQuestions(data);
        }
      } catch (error) {
        console.error("Failed to load questions:", error);
      } finally {
        if (mounted) {
          setLoadingQuestions(false);
        }
      }
    };

    loadQuestions();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedQuestion) return;

    setCode("");
    setExecutionResult(null);
  }, [selectedQuestion?.question_id]);

  useEffect(() => {
    if (remainingSeconds <= 0) return;

    const timer = window.setInterval(() => {
      setRemainingSeconds((previous) => {
        if (previous <= 1) {
          window.clearInterval(timer);
          return 0;
        }

        return previous - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
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

  const handleRun = async () => {
    if (!selectedQuestion || !code.trim()) return;

    setRunning(true);
    setExecutionResult(null);

    try {
      const testCases = (selectedQuestion.sample_test_cases || [])
        .slice(0, 3)
        .map((testCase) => ({
          input: formatInput(testCase.input),
          expected_output: formatValue(testCase.expected_output),
        }));

      const response = await fetch(`${API}/api/code/run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question_id: selectedQuestion.question_id,
          language,
          source_code: code,
          test_cases: testCases,
        }),
      });


      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.detail || `Execution request failed: ${response.status}`
        );
      }

      setExecutionResult(data);
    } catch (error) {
      setExecutionResult({
        status: "NETWORK_ERROR",
        passed: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to reach execution service.",
      });
    } finally {
      setRunning(false);
    }
  };

  const handleSubmit = async () => {
    if (!selectedQuestion || !code.trim()) return;

    setSubmitting(true);

    try {
      const response = await fetch(`${API}/api/code/submit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question_id: selectedQuestion.question_id,
          language,
          source_code: code,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.detail || `Submission failed: ${response.status}`
        );
      }

      setExecutionResult(data);
      setShowSubmitDialog(false);
    } catch (error) {
      setExecutionResult({
        status: "SUBMISSION_ERROR",
        passed: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to submit solution.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const goToPreviousQuestion = () => {
    setSelectedIndex((index) => Math.max(0, index - 1));
  };

  const goToNextQuestion = () => {
    setSelectedIndex((index) =>
      Math.min(questions.length - 1, index + 1)
    );
  };

  return (
    <div className="min-h-screen bg-[#f7f7f5] text-slate-900">
      {showFullscreenWarning &&
  !isFullscreen &&
  !assessmentBlocked && (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
          <span className="text-xl">⚠️</span>
        </div>

        <h2 className="mb-2 text-xl font-extrabold text-slate-900">
          Fullscreen Required
        </h2>

        <p className="mb-6 text-sm leading-6 text-slate-600">
          This assessment must be completed in fullscreen mode.
          Leaving fullscreen, switching tabs, or switching windows
          will count as an integrity violation.
        </p>

        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <strong>Warning:</strong> You are allowed a maximum of 3
          integrity violations. The assessment will be blocked after
          the third violation.
        </div>

        <button
          onClick={async () => {
            await requestFullscreen();
          }}
          className="w-full rounded-lg bg-[#DC2626] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#B91C1C]"
        >
          Enter Fullscreen & Continue
        </button>
      </div>
    </div>
  )}
  {assessmentBlocked && (
  <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm">
    <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-2xl">
      <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
        <span className="text-2xl">🚫</span>
      </div>

      <h2 className="mb-3 text-2xl font-extrabold text-red-700">
        Assessment Blocked
      </h2>

      <p className="mb-5 text-sm leading-6 text-slate-600">
        The maximum number of integrity violations has been reached.
        Your assessment has been blocked.
      </p>

      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
        Integrity violations: {infractionCount} / 3
      </div>
    </div>
  </div>
)}
{showEndAssessmentModal && !assessmentEnded && (
  <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-sm">
    <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
      <h2 className="mb-3 text-xl font-extrabold text-slate-900">
        End Assessment?
      </h2>

      <p className="mb-6 text-sm leading-6 text-slate-600">
        Are you sure you want to end the assessment?
        You will not be able to continue solving questions after
        the assessment is ended.
      </p>

      <div className="flex justify-end gap-3">
        <button
          onClick={() => setShowEndAssessmentModal(false)}
          className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
        >
          Cancel
        </button>

        <button
          onClick={() => {
            setShowEndAssessmentModal(false);
            setAssessmentEnded(true);
          }}
          className="rounded-lg bg-[#DC2626] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#B91C1C]"
        >
          End Assessment
        </button>
      </div>
    </div>
  </div>
)}
      {/* Header */}
      <header className="sticky top-0 z-40 h-[68px] border-b border-slate-200 bg-white">
        <div className="flex h-full items-center justify-between px-7">
          <div className="flex items-center gap-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#c62828] text-lg font-black text-white">
              08
            </div>

            <div>
              <div className="text-[13px] font-extrabold tracking-[0.08em] text-slate-900">
                PROJECT 08
              </div>
              <div className="text-[10px] font-semibold tracking-[0.16em] text-slate-400">
                CODING ASSESSMENT
              </div>
            </div>
          </div>

          <div className="flex items-center gap-7">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-500">
              <Clock3 size={16} />
              <span
                className={
                  remainingSeconds < 10 * 60
                    ? "font-mono text-red-600"
                    : "font-mono text-slate-700"
                }

              >
                {formattedTime}
              </span>
            </div>
            <div
  className={`rounded-lg border px-3 py-1.5 text-xs font-bold ${
    infractionCount === 0
      ? "border-slate-200 bg-slate-50 text-slate-500"
      : infractionCount < 3
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : "border-red-200 bg-red-50 text-red-700"
  }`}
>
  Integrity Strikes: {infractionCount} / 3
</div>
<button
  onClick={handleEndAssessment}
  disabled={assessmentBlocked || assessmentEnded}
>
  End Assessment
</button>
          </div>
        </div>
      </header>

      <div className="flex min-h-[calc(100vh-68px)]">
        {/* Question sidebar */}
        <aside className="w-[285px] shrink-0 border-r border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-6 py-5">
            <div className="text-[11px] font-extrabold tracking-[0.16em] text-slate-400">
              QUESTIONS
            </div>

            <div className="mt-1 text-xs text-slate-400">
              {questions.length} questions
            </div>
          </div>

          <div className="max-h-[calc(100vh-150px)] overflow-y-auto p-3">
            {loadingQuestions ? (
              <div className="space-y-2 p-2">
                {[1, 2, 3, 4, 5].map((item) => (
                  <div
                    key={item}
                    className="h-[58px] animate-pulse rounded-lg bg-slate-100"
                  />
                ))}
              </div>
            ) : (
              questions.map((question, index) => {
                const selected = index === selectedIndex;
                
                return (
                  <button
                    key={question.question_id}
                    type="button"
                    onClick={() => setSelectedIndex(index)}
                    disabled={assessmentBlocked}
                    className={`mb-1.5 w-full rounded-lg border px-3 py-3 text-left transition ${
                      selected
                        ? "border-red-200 bg-red-50"
                        : "border-transparent hover:border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                          selected
                            ? "bg-[#c62828] text-white"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {String(index + 1).padStart(2, "0")}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div
                          className={`line-clamp-2 text-xs font-bold ${
                            selected ? "text-slate-900" : "text-slate-700"
                          }`}
                        >
                          {question.title}
                        </div>

                        <div className="mt-1 flex items-center gap-2">
                          <span className="truncate text-[10px] text-slate-400">
                            {question.topic || "General"}
                          </span>

                          <span
                            className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${getDifficultyClass(
                              question.difficulty
                            )}`}
                          >
                            {question.difficulty || "Medium"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* Main assessment */}
        <main className="min-w-0 flex-1">
          {selectedQuestion ? (
            <div className="mx-auto max-w-[1250px] px-10 py-8"
              onCopy={(e) => e.preventDefault()}
                  onCut={(e) => e.preventDefault()}
                  onContextMenu={(e) => e.preventDefault()}>
              {/* Assessment heading */}
              <div className="mb-7">
                <div className="text-[10px] font-extrabold tracking-[0.18em] text-slate-400">
                  AS  SESSMENT
                </div>

                <div className="mt-2 flex items-start justify-between gap-6">
                  <div>
                    <h1 className="text-[27px] font-black tracking-tight text-slate-900">
                      {selectedQuestion.title}
                    </h1>

                    <div className="mt-3 flex items-center gap-2">
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold text-slate-500">
                        {selectedQuestion.topic || "General"}
                      </span>

                      <span
                        className={`rounded-full border px-3 py-1 text-[10px] font-bold ${getDifficultyClass(
                          selectedQuestion.difficulty
                        )}`}
                      >
                        {selectedQuestion.difficulty || "Medium"}
                      </span>

                      {selectedQuestion.ctc_band && (
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold text-slate-500">
                          {selectedQuestion.ctc_band}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Description */}
              <section className="mb-7 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="mb-3 text-sm font-extrabold text-slate-900">
                  Problem Description
                </h2>

                <p className="whitespace-pre-wrap text-sm leading-7 text-slate-600">
                  {selectedQuestion.description || "No description available."}
                </p>
              </section>


              {/* Constraints */}
              {selectedQuestion.constraints &&
                Array.isArray(selectedQuestion.constraints) &&
                selectedQuestion.constraints.length > 0 && (
                  <section className="mb-7 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                    <h2 className="mb-3 text-sm font-extrabold text-slate-900">
                      Constraints
                    </h2>

                    <ul className="space-y-2">
                      {selectedQuestion.constraints.map(
                        (constraint, index) => (
                          <li
                            key={index}
                            className="flex gap-2 text-sm text-slate-600"
                          >
                            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
                            <span>{constraint}</span>
                          </li>
                        )
                      )}
                    </ul>
                  </section>
                )}

              {/* Sample test cases */}
              {selectedQuestion.sample_test_cases &&
                selectedQuestion.sample_test_cases.length > 0 && (
                  <section className="mb-7">
                    <h2 className="mb-4 text-sm font-extrabold text-slate-900">
                      Sample Test Cases
                    </h2>

                    <div className="space-y-3">
                      {selectedQuestion.sample_test_cases.map(
                        (testCase, index) => (
                          <div
                            key={index}
                            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                          >
                            <div className="mb-3 grid gap-3 md:grid-cols-2">
                              <span className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-400">
                                Test Case {String(index + 1).padStart(2, "0")}
                              </span>

                              <div className="text-[10px] font-semibold text-slate-400">
                                Expected Output
                              </div>
                            </div>
                            <div className="grid gap-3 md:grid-cols-2">
                              <pre className="overflow-x-auto rounded-lg bg-slate-50 p-3 font-mono text-xs text-slate-700">
                                {formatInput(testCase.input)}
                              </pre>

                              <pre className="overflow-x-auto rounded-lg bg-slate-50 p-3 font-mono text-xs text-slate-700">
                                {formatValue(testCase.expected_output)}
                              </pre>
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  </section>
                )}

              {/* Editor */}
              <section className="overflow-visible rounded-xl border border-slate-800 bg-[#1e1e1e] shadow-lg">
                <div className="flex h-12 items-center justify-between border-b border-[#333] bg-[#181818] px-4">
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300">
                      Code Editor
                    </span>

                    <span className="rounded bg-[#2a2a2a] px-2 py-1 text-[9px] font-bold text-slate-400">
                      {language.toUpperCase()}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-[10px] font-semibold text-emerald-400">
                    <Check size={13} />
                    Draft
                  </div>
                </div>
                <div className="overflow-hidden">
                  <Suspense
                    fallback={
                      <div className="flex h-full items-center justify-center bg-[#1e1e1e] text-xs text-slate-500">
                        Loading editor...
                      </div>
                    }
                  >
<div
  className={
    assessmentBlocked
      ? "pointer-events-none opacity-40"
      : ""
  }
>
  <MonacoEditor
    userId={user?.id || ""}
    sessionId={sessionId || ""}
    questionId={selectedQuestion.question_id}
    onCodeChange={(newCode, newLanguage) => {
      if (assessmentBlocked) {
        return;
      }

      setCode(newCode);
      setLanguage(newLanguage);
    }}
  />
</div>
                  </Suspense>
                </div>

                {/* Editor actions */}
                <div className="flex items-center justify-between border-t border-[#333] bg-[#181818] px-4 py-3">
                  <div className="text-[10px] text-slate-500">
                    {selectedQuestion.title}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleRun}
                      disabled={assessmentBlocked || !code.trim()}
                      className={`flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-xs font-bold text-white transition ${
                        assessmentBlocked || !code.trim()
                          ? "cursor-not-allowed opacity-40"
                          : "hover:bg-slate-700"
                      }`}
                    >
                      Run
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowSubmitDialog(true)}
                      disabled={submitting || !code.trim() || assessmentBlocked}
                      className="flex items-center gap-2 rounded-lg bg-[#c62828] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#b71c1c] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Send size={13} />
                      Submit Solution
                    </button>
                  </div>
                </div>
              </section>

              {/* Execution result */}
              {executionResult && (
                <section className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-extrabold text-slate-900">
                      Execution Result
                    </h2>

                    <span
                      className={`rounded-full px-3 py-1 text-[10px] font-bold ${
                        executionResult.passed
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-red-50 text-red-700"
                      }`}
                    >
                      {executionResult.status || "Completed"}
                    </span>
                  </div>

                  {executionResult.error && (
                    <div className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-700">
                      {executionResult.error}
                    </div>
                  )}

                  {executionResult.total_test_cases !== undefined && (
                    <div className="mt-3 text-xs text-slate-500">
                      Passed{" "}
                      <strong className="text-slate-800">
                        {executionResult.passed_test_cases || 0}
                      </strong>{" "}
                      of{" "}
                      <strong className="text-slate-800">
                        {executionResult.total_test_cases}
                      </strong>{" "}
                      test cases.
                    </div>
                  )}
                </section>
              )}

              {/* Navigation */}
              <div className="mt-6 flex items-center justify-between">
                <button
                  type="button"
                  onClick={goToPreviousQuestion}
                  disabled={selectedIndex === 0}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 disabled:opacity-40"
                >
                  <ChevronLeft size={14} />
                  Previous
                </button>

                <div className="text-[10px] font-semibold text-slate-400">
                  Question {selectedIndex + 1} of {questions.length}
                </div>

                <button
                  type="button"
                  onClick={goToNextQuestion}
                  disabled={selectedIndex >= questions.length - 1}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 disabled:opacity-40"
                >
                  Next
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex min-h-[calc(100vh-68px)] items-center justify-center">
              <div className="text-center">
                <div className="text-sm font-bold text-slate-700">
                  {loadingQuestions
                    ? "Loading questions..."
                    : "No questions available"}
                </div>

                <div className="mt-1 text-xs text-slate-400">
                  {loadingQuestions
                    ? "Please wait while the question bank loads."
                    : "The question bank returned no questions."}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Submit confirmation */}
      {showSubmitDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-base font-black text-slate-900">
                  Submit Solution?
                </h2>

                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Your solution will be submitted for the current question.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowSubmitDialog(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowSubmitDialog(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600"
              >
                Cancel
              </button>

<button
  onClick={handleSubmit}
  disabled={assessmentBlocked}
  className={`... ${
    assessmentBlocked
      ? "cursor-not-allowed opacity-40"
      : ""
  }`}
>
  Submit Solution
</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CodingPage;