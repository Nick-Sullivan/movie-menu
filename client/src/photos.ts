// Dish photos, end to end: downscaled in the browser and kept as data URLs
// on the recipe (image_data) — so they survive refreshes via localStorage and
// travel inside export files — then uploaded to S3 when a screening starts,
// and served back to viewers through the server's image redirect.

import type { Menu, Recipe, ScheduleEntry } from "./types";
import { API, req } from "./api";

const MAX_DIMENSION = 1000;
// localStorage holds the whole menu in ~5MB, so keep each photo well under it.
const TARGET_BYTES = 300_000;
const QUALITIES = [0.8, 0.65, 0.5];

export async function downscaleImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("Couldn't read that image — try a JPEG or PNG.");
  });
  const scale = Math.min(
    1,
    MAX_DIMENSION / Math.max(bitmap.width, bitmap.height),
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't process the image.");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  let dataUrl = "";
  for (const quality of QUALITIES) {
    dataUrl = canvas.toDataURL("image/jpeg", quality);
    if (dataUrlBytes(dataUrl) <= TARGET_BYTES) break;
  }
  return dataUrl;
}

// Approximate decoded size of the base64 payload.
function dataUrlBytes(dataUrl: string): number {
  return Math.floor(((dataUrl.length - dataUrl.indexOf(",") - 1) * 3) / 4);
}

// "data:image/jpeg;base64,..." -> "image/jpeg"
function dataUrlContentType(dataUrl: string): string {
  return dataUrl.slice(5, dataUrl.indexOf(";"));
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return (await fetch(dataUrl)).blob();
}

// The server redirects this to a freshly presigned S3 URL, so it works as a
// plain <img> src for as long as the screening (and the image) lives.
export function imageUrl(key: string): string {
  return `${API}/images/${key}`;
}

// Where to load a recipe's photo from: the local data URL when we have it
// (chef's own browser), otherwise the server redirect (joined viewers).
export function recipeImageSrc(recipe: Recipe): string | undefined {
  if (recipe.image_data) return recipe.image_data;
  return recipe.image_key ? imageUrl(recipe.image_key) : undefined;
}

interface PresignedUpload {
  key: string;
  url: string;
}

async function presignImages(
  contentTypes: string[],
): Promise<PresignedUpload[]> {
  const res = await req<{ uploads: PresignedUpload[] }>("/images/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      images: contentTypes.map((ct) => ({ content_type: ct })),
    }),
  });
  return res.uploads;
}

// Upload every locally attached photo to S3 and return the schedule with
// image_key set (image_data stays put — it's the local source of truth).
// Photos are re-uploaded on every start: S3 objects expire after 7 days,
// and a fresh upload is always valid.
export async function uploadMenuImages(
  schedule: ScheduleEntry[],
): Promise<ScheduleEntry[]> {
  const pending = schedule
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.recipe.image_data);
  if (pending.length === 0) return schedule;

  const uploads = await presignImages(
    pending.map(({ entry }) => dataUrlContentType(entry.recipe.image_data!)),
  );

  await Promise.all(
    pending.map(async ({ entry }, i) => {
      const data = entry.recipe.image_data!;
      const res = await fetch(uploads[i].url, {
        method: "PUT",
        headers: { "Content-Type": dataUrlContentType(data) },
        body: await dataUrlToBlob(data),
      });
      if (!res.ok) throw new Error(`Photo upload failed (${res.status})`);
    }),
  );

  const next = [...schedule];
  pending.forEach(({ entry, index }, i) => {
    next[index] = {
      ...entry,
      recipe: { ...entry.recipe, image_key: uploads[i].key },
    };
  });
  return next;
}

// Server responses never carry image_data; re-attach the local copies so the
// chef's browser keeps the originals for future re-uploads and exports.
export function withLocalImageData(menu: Menu, local: ScheduleEntry[]): Menu {
  return {
    ...menu,
    schedule: menu.schedule.map((entry, i) => {
      const data = local[i]?.recipe.image_data;
      return data
        ? { ...entry, recipe: { ...entry.recipe, image_data: data } }
        : entry;
    }),
  };
}
