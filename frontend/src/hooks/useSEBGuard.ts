import { useEffect, useRef, useCallback, useState, useMemo } from "react";

const API_BASE =
  (import.meta as any).env?.VITE_API_BASE_URL || "http://localhost:8000";

export interface SEBConfig {
  examId?: string;
  candidateId?: string;
  maxInfractions?: number;
  onDisqualified?: () => void;
  onInfraction?: (reason: string, count: number) => void;
}

export function useSEBGuard({
  examId = "coding-assessment",
  candidateId = "guest-candidate",
  maxInfractions = 3,
  onDisqualified,
  onInfraction,
}: SEBConfig = {}) {
  const [infractionCount, setInfractionCount] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Check if browser is running inside Safe Exam Browser
  const isSEB = useMemo(() => {
    if (typeof window === "undefined") return false;
    const win = window as any;
    const ua = navigator.userAgent || "";
    const hasSebHeader = /SEB|SafeExamBrowser/i.test(ua);
    const hasNativeApi = !!(win.SafeExamBrowser || win.seb || win.SafeExamBrowser?.security);
    const search = new URLSearchParams(window.location.search);
    const hasBypassParam = search.get("bypass_seb") === "true" || search.get("is_seb") === "true";
    return hasSebHeader || hasNativeApi || hasBypassParam;
  }, []);

  const launchSebUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    const protocol = window.location.protocol === "https:" ? "sebs://" : "seb://";
    const host = window.location.host;
    const origin = window.location.origin;
    const targetPath = window.location.pathname;
    const token = localStorage.getItem("aia_access_token") || "";
    const userStr = localStorage.getItem("aia_user") || "";
    const params = new URLSearchParams();
    params.set("target_path", targetPath && targetPath !== "/" ? targetPath : "/coding");
    params.set("frontend_origin", origin);
    if (examId && examId !== "coding-assessment") {
      params.set("exam_id", examId);
    }
    if (token) params.set("auth_token", token);
    if (userStr) params.set("auth_user", userStr);

    // SEB client expects seb:// to point directly to the .seb config file endpoint
    if (examId && examId !== "coding-assessment") {
      return `${protocol}${host}/exams/${examId}/seb-config?${params.toString()}`;
    }
    return `${protocol}${host}/exams/seb-config?${params.toString()}`;
  }, [examId]);

  const quitUrl = useMemo(() => {
    if (typeof window === "undefined") return "/seb-quit";
    const host = window.location.host;
    const protocol = window.location.protocol;
    return `${protocol}//${host}/seb-quit`;
  }, []);

  const downloadConfigUrl = useMemo(() => {
    const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
    const targetPath = typeof window !== "undefined" ? window.location.pathname : "/coding";
    const token = typeof window !== "undefined" ? localStorage.getItem("aia_access_token") : "";
    const userStr = typeof window !== "undefined" ? localStorage.getItem("aia_user") : "";
    const params = new URLSearchParams();
    params.set("target_path", targetPath && targetPath !== "/" ? targetPath : "/coding");
    params.set("frontend_origin", origin);
    if (examId && examId !== "coding-assessment") {
      params.set("exam_id", examId);
    }
    if (token) params.set("auth_token", token);
    if (userStr) params.set("auth_user", userStr || "");

    if (examId && examId !== "coding-assessment") {
      return `/exams/${examId}/seb-config?${params.toString()}`;
    }
    return `/exams/seb-config?${params.toString()}`;
  }, [examId]);

  const infractionRef = useRef(0);
  const lastInfractionTimeRef = useRef(0);

  const reportInfraction = useCallback(
    async (reason: string) => {
      const now = Date.now();

      // Prevent blur + visibilitychange from counting as two violations
      // for the same tab/window switch.
      if (now - lastInfractionTimeRef.current < 1000) {
        return;
      }

      lastInfractionTimeRef.current = now;

      infractionRef.current += 1;

      const count = infractionRef.current;

      setInfractionCount(count);

      onInfraction?.(reason, count);

      try {
        await fetch(`${API_BASE}/exams/${examId || "coding-assessment"}/infraction`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            candidate_id: candidateId || "guest-candidate",
            reason,
          }),
        });
      } catch (err) {
        console.warn("[SEB] Failed to report infraction to backend:", err);
      }

      if (count >= maxInfractions) {
        onDisqualified?.();
      }
    },
    [
      examId,
      candidateId,
      maxInfractions,
      onDisqualified,
      onInfraction
    ]
  );

  const requestFullscreen = useCallback(async () => {
    try {
      await document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } catch {
      // Browser may reject fullscreen if there is no user gesture.
    }
  }, []);

  const quitExam = useCallback(() => {
    if (typeof window !== "undefined") {
      window.location.href = quitUrl;
    }
  }, [quitUrl]);

  useEffect(() => {
    let hiddenTimer: ReturnType<typeof setTimeout> | null = null;

    // Visibility change check: debounced to prevent false alarms on micro-transitions
    // but still catches unauthorized external overlays or app minimizes
    const handleVisibilityChange = () => {
      if (document.hidden) {
        hiddenTimer = setTimeout(() => {
          if (document.hidden && infractionRef.current < maxInfractions) {
            reportInfraction("TAB_SWITCH");
          }
        }, 600);
      } else {
        if (hiddenTimer) {
          clearTimeout(hiddenTimer);
          hiddenTimer = null;
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    // DOM blur and Fullscreen change listeners are only applied for normal browsers.
    // In SEB, OS-level window management is already enforced by the SEB kiosk service.
    let handleFullscreenChange: (() => void) | null = null;
    let handleBlur: (() => void) | null = null;

    if (!isSEB) {
      handleFullscreenChange = () => {
        const full = !!document.fullscreenElement;
        setIsFullscreen(full);

        if (!full && infractionRef.current < maxInfractions) {
          reportInfraction("FULLSCREEN_EXIT");
        }
      };

      handleBlur = () => {
        if (document.hidden) {
          return;
        }

        if (infractionRef.current < maxInfractions) {
          reportInfraction("WINDOW_BLUR");
        }
      };

      document.addEventListener("fullscreenchange", handleFullscreenChange);
      window.addEventListener("blur", handleBlur);
    } else {
      setIsFullscreen(true);
    }

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (hiddenTimer) clearTimeout(hiddenTimer);
      if (handleFullscreenChange) {
        document.removeEventListener("fullscreenchange", handleFullscreenChange);
      }
      if (handleBlur) {
        window.removeEventListener("blur", handleBlur);
      }
    };
  }, [isSEB, reportInfraction, maxInfractions]);

  return {
    isSEB,
    launchSebUrl,
    downloadConfigUrl,
    quitUrl,
    quitExam,
    infractionCount,
    isFullscreen,
    requestFullscreen,
  };
}