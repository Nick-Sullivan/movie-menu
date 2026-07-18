export interface RecipeStep {
  duration_secs: number; // how long this step takes
  note: string;
}

export interface Recipe {
  // standalone, portable; no film times
  name: string;
  prep?: string; // do-ahead note, shown before the first step
  steps: RecipeStep[]; // ordered; dish ready after the last step
  image_key?: string; // S3 key of the dish photo, set once uploaded at start time
  // Local source of truth for the photo: a downscaled data URL that lives in
  // localStorage and export files. Uploaded to S3 when a screening starts;
  // never sent to the server itself (the menu must fit in one DynamoDB item).
  image_data?: string;
}

export interface ScheduleEntry {
  // the recipe -> film mapping
  ready_at_secs: number; // film time (from start) the dish should be READY
  recipe: Recipe;
}

export interface ViewerSettings {
  upcoming_count: number; // how many upcoming dishes the viewer screen lists
  show_dish_names: boolean; // false = keep dish names a surprise
}

export const DEFAULT_VIEWER: ViewerSettings = {
  upcoming_count: 1,
  show_dish_names: true,
};

export interface Menu {
  id: string; // '' for a local, not-yet-saved (uploaded) menu
  name: string;
  duration_secs: number;
  schedule: ScheduleEntry[];
  started_at: number | null; // screening time (unix secs); may be in the future
  viewer: ViewerSettings;
}

// Blank local menu for the create flow; saved to the server on first start.
export function newLocalMenu(): Menu {
  return {
    id: "",
    name: "",
    duration_secs: 7200,
    schedule: [],
    started_at: null,
    viewer: { ...DEFAULT_VIEWER },
  };
}
