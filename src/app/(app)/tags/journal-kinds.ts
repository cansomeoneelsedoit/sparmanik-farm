/** Journal entry kinds shared by the server action + the client dialog. */
export const PLANT_NOTE_KINDS = ["SPRAY", "FEED", "ISSUE", "OBSERVATION", "RESULT", "OTHER"] as const;
export type PlantNoteKind = (typeof PLANT_NOTE_KINDS)[number];

export const PLANT_NOTE_KIND_LABEL: Record<PlantNoteKind, string> = {
  SPRAY: "Spray / treatment",
  FEED: "Feed / drench",
  ISSUE: "Issue / problem",
  OBSERVATION: "Observation",
  RESULT: "Result / outcome",
  OTHER: "Other",
};

/** Badge colours per kind (light + dark). */
export const PLANT_NOTE_KIND_CLASS: Record<PlantNoteKind, string> = {
  SPRAY: "bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300",
  FEED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  ISSUE: "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300",
  OBSERVATION: "bg-muted text-foreground",
  RESULT: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  OTHER: "bg-muted text-muted-foreground",
};
