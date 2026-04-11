import type { Task } from "@/api/tasks";

// Colour hash for assignee chips - same algorithm as the HTML demo
const STAFF_COLORS = [
  "#FF6B35", "#4ADE80", "#60A5FA", "#FFB84D", "#F87171",
  "#A78BFA", "#34D399", "#FB923C", "#818CF8",
];

export function staffColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return STAFF_COLORS[Math.abs(hash) % STAFF_COLORS.length];
}

export function fmtIDR(n: number): string {
  return "Rp " + new Intl.NumberFormat("id-ID").format(Math.round(n));
}

export function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function getWeek(d: Date): number {
  const target = new Date(d.valueOf());
  const dayNr = (d.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const jan4 = new Date(target.getFullYear(), 0, 4);
  const dayDiff = (target.getTime() - jan4.getTime()) / 86400000;
  return 1 + Math.ceil(dayDiff / 7);
}

// ICS calendar file generation
function icsEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function icsDate(d: string): string {
  // YYYY-MM-DD -> YYYYMMDD
  return d.replace(/-/g, "");
}

export function generateICS(tasks: Task[]): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Sparmanik Farm//Cultivation OS//EN",
    "CALSCALE:GREGORIAN",
  ];

  const now = new Date();
  const stamp =
    now.getUTCFullYear().toString() +
    String(now.getUTCMonth() + 1).padStart(2, "0") +
    String(now.getUTCDate()).padStart(2, "0") +
    "T" +
    String(now.getUTCHours()).padStart(2, "0") +
    String(now.getUTCMinutes()).padStart(2, "0") +
    String(now.getUTCSeconds()).padStart(2, "0") +
    "Z";

  tasks.forEach((t) => {
    const d = icsDate(t.due_date);
    const summary = icsEscape(t.title);
    const description = icsEscape(
      `Assigned: ${t.assignees.join(", ")}\nPriority: ${t.priority}${t.category ? `\nCategory: ${t.category}` : ""}${t.notes ? `\n\n${t.notes}` : ""}`
    );
    lines.push(
      "BEGIN:VEVENT",
      `UID:sparmanik-task-${t.id}@sparmanik-farm`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${d}`,
      `DTEND;VALUE=DATE:${d}`,
      `SUMMARY:${summary}`,
      `DESCRIPTION:${description}`,
      "BEGIN:VALARM",
      "TRIGGER:-PT1H",
      "ACTION:DISPLAY",
      `DESCRIPTION:${summary}`,
      "END:VALARM",
      "END:VEVENT"
    );
  });

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

export function downloadICS(filename: string, tasks: Task[]): void {
  const content = generateICS(tasks);
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
