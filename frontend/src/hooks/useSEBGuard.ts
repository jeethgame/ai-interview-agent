import { useEffect, useRef, useCallback, useState } from "react";

const API_BASE =
  (import.meta as any).env?.VITE_API_BASE_URL || "http://localhost:8000";

export interface SEBConfig {
  examId: string;
  candidateId: string;
  maxInfractions?: number;
  onDisqualified?: () => void;
  onInfraction?: (reason: string, count: number) => void;
}

export function useSEBGuard({
  examId,
  candidateId,
  maxInfractions = 3,
  onDisqualified,
  onInfraction,
}: SEBConfig) {
  const [infractionCount, setInfractionCount] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

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

  useEffect(() => {
    const handleFullscreenChange = () => {
      const full = !!document.fullscreenElement;

      setIsFullscreen(full);

      if (!full && infractionRef.current < maxInfractions) {
        reportInfraction("FULLSCREEN_EXIT");
      }
    };

    const handleBlur = () => {
      if (document.hidden) {
        return;
      }

      if (infractionRef.current < maxInfractions) {
        reportInfraction("WINDOW_BLUR");
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden && infractionRef.current < maxInfractions) {
        reportInfraction("TAB_SWITCH");
      }
    };

    document.addEventListener(
      "fullscreenchange",
      handleFullscreenChange
    );

    window.addEventListener("blur", handleBlur);

    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange
    );

    return () => {
      document.removeEventListener(
        "fullscreenchange",
        handleFullscreenChange
      );

      window.removeEventListener("blur", handleBlur);

      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange
      );
    };
  }, [reportInfraction, maxInfractions]);

  return {
    infractionCount,
    isFullscreen,
    requestFullscreen,
  };
}