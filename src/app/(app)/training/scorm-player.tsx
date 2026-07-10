"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { recordScormCompletion } from "@/app/(app)/training/scorm-actions";

/**
 * SCORM 1.2 player. Renders the SCO in an iframe and installs a SCORM 1.2
 * runtime adapter on window.API — where the SCO's standard API-discovery
 * algorithm looks (it walks window.parent / window.opener until it finds an
 * object named "API"). The adapter goes in via useLayoutEffect, which runs
 * in the same task as the DOM commit — strictly before the iframe's document
 * (fetched over the network from /api/scorm) can execute any script, so the
 * SCO can never look up the API before it exists.
 *
 * The adapter keeps the cmi data model in a ref, persists lesson_location +
 * suspend_data to localStorage (per module, so a half-finished SCO resumes),
 * and reports ONE ModuleAttempt through recordScormCompletion when the SCO
 * signals a terminal lesson_status ("completed" / "passed" / "failed") or
 * finishes with a score set.
 *
 * launchUrl is `/api/scorm/<moduleId>/<launchHref>` (auth-gated, org-checked
 * server side). onComplete fires after the attempt is saved — the surrounding
 * page uses it to refresh progress / unlock the next module.
 */

type ScormApi = {
  LMSInitialize: (arg: string) => string;
  LMSFinish: (arg: string) => string;
  LMSGetValue: (key: string) => string;
  LMSSetValue: (key: string, value: string) => string;
  LMSCommit: (arg: string) => string;
  LMSGetLastError: () => string;
  LMSGetErrorString: (code: string) => string;
  LMSGetDiagnostic: (code: string) => string;
};

type CmiState = {
  lessonStatus: string;
  lessonLocation: string;
  suspendData: string;
  scoreRaw: string;
  scoreMin: string;
  scoreMax: string;
  exit: string;
  sessionTime: string;
};

const TERMINAL_STATUSES = new Set(["completed", "passed", "failed"]);

export function ScormPlayer({
  courseId,
  moduleId,
  launchUrl,
  studentId = "",
  studentName = "",
  onComplete,
}: {
  courseId: string;
  moduleId: string;
  launchUrl: string;
  /** cmi.core.student_id — pass the signed-in user's id. */
  studentId?: string;
  /** cmi.core.student_name — pass the signed-in user's display name. */
  studentName?: string;
  onComplete?: (result: { score: number; passed: boolean }) => void;
}) {
  const t = useTranslations("training");
  const cmi = useRef<CmiState>({
    lessonStatus: "not attempted",
    lessonLocation: "",
    suspendData: "",
    scoreRaw: "",
    scoreMin: "",
    scoreMax: "",
    exit: "",
    sessionTime: "",
  });
  const reported = useRef(false);

  // Stable ref for values the adapter closures need (the adapter itself is
  // installed once per module and must not go stale). Updated in an effect —
  // refs must not be written during render.
  const propsRef = useRef({ courseId, moduleId, studentId, studentName, onComplete, t });
  useEffect(() => {
    propsRef.current = { courseId, moduleId, studentId, studentName, onComplete, t };
  });

  useLayoutEffect(() => {
    // Scope resume state to the SIGNED-IN user — on a shared tablet, learner B
    // must never resume learner A's half-finished SCO (their suspend_data can
    // carry answers/score). Fixed at adapter-install time from the prop.
    const storageKey = `scorm:${studentId || "anon"}:${moduleId}`;
    // Resume state from a previous session with this module, if any.
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<CmiState>;
        if (typeof parsed.lessonLocation === "string") cmi.current.lessonLocation = parsed.lessonLocation;
        if (typeof parsed.suspendData === "string") cmi.current.suspendData = parsed.suspendData;
      }
    } catch {
      // Corrupt/blocked storage — start fresh.
    }

    const persist = () => {
      try {
        window.localStorage.setItem(
          storageKey,
          JSON.stringify({
            lessonLocation: cmi.current.lessonLocation,
            suspendData: cmi.current.suspendData,
          }),
        );
      } catch {
        // Storage full/blocked — resume just won't work, playback still does.
      }
    };

    const report = () => {
      if (reported.current) return;
      reported.current = true;
      const { courseId: cId, moduleId: mId, onComplete: done, t: tr } = propsRef.current;
      const status = cmi.current.lessonStatus;
      const rawScore = Number.parseFloat(cmi.current.scoreRaw);
      // Only ASSERT pass/fail from an explicit terminal lesson_status. For a
      // score-only finish (no terminal status) leave `passed` undefined so the
      // server's `score >= passPct` fallback decides — otherwise a below-mark
      // score would be forced to a pass.
      const passed = TERMINAL_STATUSES.has(status) ? status !== "failed" : undefined;
      void recordScormCompletion({
        courseId: cId,
        moduleId: mId,
        score: Number.isFinite(rawScore) ? rawScore : undefined,
        passed,
        raw: {
          lesson_status: status,
          score_raw: cmi.current.scoreRaw,
          score_min: cmi.current.scoreMin,
          score_max: cmi.current.scoreMax,
          session_time: cmi.current.sessionTime,
        },
      })
        .then((r) => {
          if (r.ok && r.data) {
            toast.success(
              r.data.passed
                ? tr("scormComplete", { score: r.data.score })
                : tr("scormRecorded", { score: r.data.score }),
            );
            done?.(r.data);
            // A recorded FAIL must not latch the once-flag: if the learner
            // retries inside the SCO and then passes, that pass still needs to
            // record.
            if (!r.data.passed) reported.current = false;
          } else if (!r.ok) {
            // Let a transient failure be retried by the SCO's next commit.
            reported.current = false;
            toast.error(r.error);
          }
        })
        .catch(() => {
          // Network/serialization failure — unlatch so the SCO's next
          // LMSCommit/LMSFinish retries instead of silently losing the attempt.
          reported.current = false;
          toast.error(tr("scormSaveFailed"));
        });
    };

    const maybeReport = (finishing: boolean) => {
      const status = cmi.current.lessonStatus;
      if (status === "completed" || status === "passed") report();
      else if (finishing && (cmi.current.scoreRaw !== "" || TERMINAL_STATUSES.has(status))) {
        // Score set + finish counts even without a terminal status; a
        // "failed" status is only recorded once the SCO actually finishes.
        report();
      }
    };

    const api: ScormApi = {
      LMSInitialize: () => "true",
      LMSFinish: () => {
        persist();
        maybeReport(true);
        return "true";
      },
      LMSGetValue: (key: string) => {
        const p = propsRef.current;
        switch (key) {
          case "cmi.core.student_id":
            return p.studentId ?? "";
          case "cmi.core.student_name":
            return p.studentName ?? "";
          case "cmi.core.lesson_status":
            return cmi.current.lessonStatus;
          case "cmi.core.lesson_location":
            return cmi.current.lessonLocation;
          case "cmi.suspend_data":
            return cmi.current.suspendData;
          case "cmi.core.score.raw":
            return cmi.current.scoreRaw;
          case "cmi.core.score.min":
            return cmi.current.scoreMin;
          case "cmi.core.score.max":
            return cmi.current.scoreMax;
          case "cmi.core.score._children":
            return "raw,min,max";
          case "cmi.core._children":
            return "student_id,student_name,lesson_location,credit,lesson_status,entry,score,total_time,lesson_mode,exit,session_time";
          case "cmi.core.credit":
            return "credit";
          case "cmi.core.lesson_mode":
            return "normal";
          case "cmi.core.entry":
            return cmi.current.suspendData || cmi.current.lessonLocation ? "resume" : "ab-initio";
          case "cmi.core.total_time":
            return "0000:00:00.00";
          case "cmi._version":
            return "3.4";
          default:
            return "";
        }
      },
      LMSSetValue: (key: string, value: string) => {
        const v = String(value);
        switch (key) {
          case "cmi.core.lesson_status":
            cmi.current.lessonStatus = v.toLowerCase().trim();
            break;
          case "cmi.core.lesson_location":
            cmi.current.lessonLocation = v;
            break;
          case "cmi.suspend_data":
            cmi.current.suspendData = v;
            break;
          case "cmi.core.score.raw":
            cmi.current.scoreRaw = v;
            break;
          case "cmi.core.score.min":
            cmi.current.scoreMin = v;
            break;
          case "cmi.core.score.max":
            cmi.current.scoreMax = v;
            break;
          case "cmi.core.exit":
            cmi.current.exit = v;
            break;
          case "cmi.core.session_time":
            cmi.current.sessionTime = v;
            break;
          default:
            break;
        }
        return "true";
      },
      LMSCommit: () => {
        persist();
        maybeReport(false);
        return "true";
      },
      LMSGetLastError: () => "0",
      LMSGetErrorString: () => "",
      LMSGetDiagnostic: () => "",
    };

    const w = window as unknown as { API?: ScormApi };
    w.API = api;

    return () => {
      persist();
      if (w.API === api) delete w.API;
    };
    // studentId is in the storage key, so the adapter must reinstall if the
    // signed-in user changes.
  }, [moduleId, studentId]);

  return (
    <div className="aspect-video min-h-[480px] w-full overflow-hidden rounded border bg-background">
      <iframe
        src={launchUrl}
        title={t("scormFrameTitle")}
        className="h-full w-full"
        allow="autoplay; fullscreen"
      />
    </div>
  );
}
