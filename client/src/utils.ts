import type { ScheduleEntry } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

export function fmt(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${pad(m)}:${pad(sec)}`;
  return `${pad(m)}:${pad(sec)}`;
}

// Like fmt, but keeps the sign — used for the film clock, which runs
// negative before the screening time.
export function fmtSigned(secs: number): string {
  const neg = secs < 0;
  return `${neg ? '−' : ''}${fmt(Math.abs(secs))}`;
}

export function fmtHms(secs: number): string {
  const neg = secs < 0;
  const s = Math.floor(Math.abs(secs));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${neg ? '-' : ''}${h}:${pad(m)}:${pad(sec)}`;
}

export function secsToHms(total: number): { h: number; m: number; s: number } {
  const s = Math.max(0, Math.floor(total));
  return { h: Math.floor(s / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}

export function hmsToSecs(h: number, m: number, s: number): number {
  return h * 3600 + m * 60 + s;
}

export function fmtDuration(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const parts: string[] = [];
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (s || parts.length === 0) parts.push(`${s}s`);
  return parts.join(' ');
}

export interface TimelineEntry {
  time_secs: number;
  note: string;
  recipe: string;
}

// Flatten a movie menu's schedule into absolute film-timeline entries.
// A step fires at `ready_at - (sum of durations of it and all later steps)`.
// Fire times can be negative: cooking that must begin before the film starts.
export function buildTimeline(schedule: ScheduleEntry[]): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  for (const s of schedule) {
    // total cook time = how long before ready the first step fires
    let before = s.recipe.steps.reduce((sum, st) => sum + st.duration_secs, 0);
    for (const st of s.recipe.steps) {
      entries.push({
        time_secs: s.ready_at_secs - before,
        note: st.note,
        recipe: s.recipe.name,
      });
      before -= st.duration_secs; // each later step fires closer to ready
    }
  }
  return entries.sort((a, b) => a.time_secs - b.time_secs);
}
