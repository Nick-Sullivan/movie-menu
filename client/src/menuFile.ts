// Menus as portable .movie.json files: download the open menu, and parse an
// uploaded file back into a local menu without trusting anything volatile.

import type { Menu, Recipe, ScheduleEntry, ViewerSettings } from "./types";
import { DEFAULT_VIEWER } from "./types";

function slug(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "menu"
  );
}

function download(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function exportMenuFile(menu: Menu) {
  download(`${slug(menu.name)}.movie.json`, {
    version: 1,
    kind: "movie",
    name: menu.name,
    duration_secs: menu.duration_secs,
    schedule: menu.schedule,
    viewer: menu.viewer,
  });
}

function parseSteps(raw: unknown): Recipe["steps"] {
  if (!Array.isArray(raw)) throw new Error("recipe steps must be a list");
  return raw.map((s) => {
    if (typeof s !== "object" || s === null) throw new Error("invalid step");
    const step = s as Record<string, unknown>;
    return {
      duration_secs: Math.max(0, Math.floor(Number(step.duration_secs) || 0)),
      note: String(step.note ?? ""),
    };
  });
}

function parseRecipe(raw: unknown): Recipe {
  if (typeof raw !== "object" || raw === null)
    throw new Error("invalid recipe");
  const r = raw as Record<string, unknown>;
  // Photos come through as the local data URL only — an image_key from a file
  // is someone else's (likely expired) S3 object and is never trusted.
  const image_data =
    typeof r.image_data === "string" && r.image_data.startsWith("data:image/")
      ? r.image_data
      : undefined;
  return {
    name: String(r.name ?? "Untitled recipe"),
    prep: String(r.prep ?? ""),
    steps: parseSteps(r.steps),
    ...(image_data ? { image_data } : {}),
  };
}

// Parse a movie-menu file into a local Menu (no id, not started).
// Throws on malformed input / wrong kind. id/started_at are never trusted from a file.
export function parseMenuFile(text: string): Menu {
  const data = JSON.parse(text) as Record<string, unknown>;
  if (data.kind !== "movie") throw new Error("Not a menu file");
  if (!Array.isArray(data.schedule)) throw new Error("menu has no schedule");
  const schedule: ScheduleEntry[] = data.schedule.map((e) => {
    if (typeof e !== "object" || e === null)
      throw new Error("invalid schedule entry");
    const entry = e as Record<string, unknown>;
    return {
      ready_at_secs: Math.max(0, Math.floor(Number(entry.ready_at_secs) || 0)),
      recipe: parseRecipe(entry.recipe),
    };
  });
  const viewer = parseViewer(data.viewer);
  return {
    id: "",
    name: String(data.name ?? "Untitled movie"),
    duration_secs: Math.max(0, Math.floor(Number(data.duration_secs) || 0)),
    schedule,
    started_at: null,
    viewer,
  };
}

function parseViewer(raw: unknown): ViewerSettings {
  if (typeof raw !== "object" || raw === null) return { ...DEFAULT_VIEWER };
  const v = raw as Record<string, unknown>;
  return {
    upcoming_count: Math.max(
      0,
      Math.floor(
        Number(v.upcoming_count ?? DEFAULT_VIEWER.upcoming_count) || 0,
      ),
    ),
    show_dish_names: Boolean(
      v.show_dish_names ?? DEFAULT_VIEWER.show_dish_names,
    ),
  };
}
