// Talking to the server about menus. It only ever holds a menu while a
// screening runs; everything else lives in the browser.

import type { Menu, ScheduleEntry, ViewerSettings } from "./types";
import { DEFAULT_VIEWER } from "./types";

export const API = (
  import.meta.env.VITE_API_URL ?? "http://localhost:3001"
).replace(/\/$/, "");

export async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, init);
  if (!res.ok) throw new Error(`Server error ${res.status}`);
  return res.json();
}

// Photo data URLs never go to the server: they can be hundreds of KB per dish
// and the whole menu must fit in one DynamoDB item. The server only ever sees
// the S3 key.
function stripImageData(schedule: ScheduleEntry[]): ScheduleEntry[] {
  return schedule.map((e) =>
    e.recipe.image_data
      ? { ...e, recipe: { ...e.recipe, image_data: undefined } }
      : e,
  );
}

export function createMenu(
  name: string,
  duration_secs: number,
  schedule: ScheduleEntry[] = [],
  viewer: ViewerSettings = DEFAULT_VIEWER,
): Promise<Menu> {
  return req("/menus", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      duration_secs,
      schedule: stripImageData(schedule),
      viewer,
    }),
  });
}

export function getMenu(id: string): Promise<Menu> {
  return req(`/menus/${id}`);
}

export function updateMenu(
  id: string,
  data: {
    name: string;
    duration_secs: number;
    schedule: ScheduleEntry[];
    viewer: ViewerSettings;
  },
): Promise<Menu> {
  return req(`/menus/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...data, schedule: stripImageData(data.schedule) }),
  });
}

// startAt: screening time in unix seconds (may be in the future); omit for "now".
export function startScreening(id: string, startAt?: number): Promise<Menu> {
  return req(`/menus/${id}/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ start_at: startAt ?? null }),
  });
}

export function stopScreening(id: string): Promise<Menu> {
  return req(`/menus/${id}/stop`, { method: "POST" });
}
