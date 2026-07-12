import { useState, useEffect } from "react";
import { updateMenu, createMenu, startScreening, exportMenuFile } from "../api";
import { fmt, fmtHms, fmtDuration } from "../utils";
import HmsInput from "./HmsInput";
import type { Menu, ScheduleEntry, ViewerSettings } from "../types";
import { DEFAULT_VIEWER } from "../types";

interface Draft {
  name: string;
  duration_secs: number;
  schedule: ScheduleEntry[];
  viewer: ViewerSettings;
}

interface Props {
  menu: Menu;
  setMenu: (p: Menu) => void;
  onBack: () => void;
  // Whoever starts the film is the chef — this grants them chef status.
  onStarted?: () => void;
}

// Local "now" rounded up to the next 5 minutes, as a datetime-local value.
function defaultScreeningTime(): string {
  const d = new Date(Math.ceil(Date.now() / 300_000) * 300_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

// Fire time (relative to film start) for each step of one scheduled recipe:
// a step fires at ready_at - (sum of durations of it and all later steps).
// Can be negative when cooking must begin before the film starts — we surface
// that rather than clamping, so the planner knows to start early.
function stepFireTimes(entry: ScheduleEntry): number[] {
  const times: number[] = [];
  let before = entry.recipe.steps.reduce(
    (sum, st) => sum + st.duration_secs,
    0,
  );
  for (const st of entry.recipe.steps) {
    times.push(entry.ready_at_secs - before);
    before -= st.duration_secs;
  }
  return times;
}

export default function EditView({ menu, setMenu, onBack, onStarted }: Props) {
  const [draft, setDraft] = useState<Draft>({
    name: menu.name,
    duration_secs: menu.duration_secs,
    schedule: menu.schedule.map((e) => ({
      ...e,
      recipe: { ...e.recipe, steps: e.recipe.steps.map((s) => ({ ...s })) },
    })),
    viewer: { ...(menu.viewer ?? DEFAULT_VIEWER) },
  });
  // A freshly created menu has no name yet — drop straight into naming it.
  const [editingField, setEditingField] = useState<"name" | "duration" | null>(
    menu.name === "" ? "name" : null,
  );
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Screening time (datetime-local string) — always visible, defaults to "now".
  const [screeningTime, setScreeningTime] = useState(defaultScreeningTime);
  // Coarse clock so the missed-prep warning stays honest while the page sits open.
  const [nowTick, setNowTick] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const id = setInterval(
      () => setNowTick(Math.floor(Date.now() / 1000)),
      30_000,
    );
    return () => clearInterval(id);
  }, []);
  // Text mirror of viewer.upcoming_count so the field can sit empty mid-edit
  // without snapping to 0 or accumulating digits ("02").
  const [countText, setCountText] = useState(() =>
    String(draft.viewer.upcoming_count),
  );
  // Which dishes are expanded (steps visible). Collapsed by default for a clean overview.
  const [expanded, setExpanded] = useState<boolean[]>(() =>
    menu.schedule.map(() => false),
  );

  const isLocal = menu.id === "";

  function toggleExpanded(ri: number) {
    setExpanded((prev) => prev.map((v, i) => (i === ri ? !v : v)));
  }

  function menuWith(data: Draft): Menu {
    return {
      ...menu,
      name: data.name,
      duration_secs: data.duration_secs,
      schedule: data.schedule,
      viewer: data.viewer,
    };
  }

  // Edits never touch the server — the menu lives in the browser (App mirrors
  // it to localStorage) and is only pushed up when a screening starts.
  function saveDraft() {
    setMenu(menuWith(draft));
  }

  // Apply a structural change and save it immediately (add/remove).
  function commit(next: Draft) {
    setDraft(next);
    setMenu(menuWith(next));
  }

  function handleFieldBlur(e: React.FocusEvent<HTMLElement>) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setEditingField(null);
      saveDraft();
    }
  }

  function handleScheduleBlur(e: React.FocusEvent<HTMLElement>) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) saveDraft();
  }

  // ── schedule / recipe mutations ──
  function updateEntry(ri: number, patch: Partial<ScheduleEntry>) {
    setDraft((prev) => ({
      ...prev,
      schedule: prev.schedule.map((e, i) =>
        i === ri ? { ...e, ...patch } : e,
      ),
    }));
  }

  function updateRecipe(ri: number, patch: Partial<ScheduleEntry["recipe"]>) {
    setDraft((prev) => ({
      ...prev,
      schedule: prev.schedule.map((e, i) =>
        i === ri ? { ...e, recipe: { ...e.recipe, ...patch } } : e,
      ),
    }));
  }

  function updateStep(
    ri: number,
    si: number,
    patch: Partial<ScheduleEntry["recipe"]["steps"][number]>,
  ) {
    setDraft((prev) => ({
      ...prev,
      schedule: prev.schedule.map((e, i) =>
        i === ri
          ? {
              ...e,
              recipe: {
                ...e.recipe,
                steps: e.recipe.steps.map((s, j) =>
                  j === si ? { ...s, ...patch } : s,
                ),
              },
            }
          : e,
      ),
    }));
  }

  function addStep(ri: number) {
    setDraft((prev) => ({
      ...prev,
      schedule: prev.schedule.map((e, i) =>
        i === ri
          ? {
              ...e,
              recipe: {
                ...e.recipe,
                steps: [...e.recipe.steps, { duration_secs: 0, note: "" }],
              },
            }
          : e,
      ),
    }));
  }

  function removeStep(ri: number, si: number) {
    const next: Draft = {
      ...draft,
      schedule: draft.schedule.map((e, i) =>
        i === ri
          ? {
              ...e,
              recipe: {
                ...e.recipe,
                steps: e.recipe.steps.filter((_, j) => j !== si),
              },
            }
          : e,
      ),
    };
    commit(next);
  }

  function addRecipe() {
    setDraft((prev) => ({
      ...prev,
      schedule: [
        ...prev.schedule,
        { ready_at_secs: 0, recipe: { name: "New dish", prep: "", steps: [] } },
      ],
    }));
    setExpanded((prev) => [...prev, true]); // new dish starts expanded for editing
  }

  function removeRecipe(ri: number) {
    commit({ ...draft, schedule: draft.schedule.filter((_, i) => i !== ri) });
    setExpanded((prev) => prev.filter((_, i) => i !== ri));
  }

  function moveRecipe(ri: number, dir: -1 | 1) {
    const rj = ri + dir;
    if (rj < 0 || rj >= draft.schedule.length) return;
    const schedule = [...draft.schedule];
    [schedule[ri], schedule[rj]] = [schedule[rj], schedule[ri]];
    commit({ ...draft, schedule });
    // the expanded flag travels with its dish
    setExpanded((prev) => {
      const next = [...prev];
      [next[ri], next[rj]] = [next[rj], next[ri]];
      return next;
    });
  }

  function updateViewer(patch: Partial<ViewerSettings>) {
    setDraft((prev) => ({ ...prev, viewer: { ...prev.viewer, ...patch } }));
  }

  // startAt: screening time in unix seconds. The only moment the server
  // learns about the menu: create (or refresh) it there, then start.
  async function handleStart(startAt: number) {
    setError(null);
    setStarting(true);
    try {
      let id = menu.id;
      if (isLocal) {
        const created = await createMenu(
          draft.name,
          draft.duration_secs,
          draft.schedule,
          draft.viewer,
        );
        setMenu(created);
        id = created.id;
      } else {
        await updateMenu(id, draft);
      }
      setMenu(await startScreening(id, startAt));
      onStarted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Start failed");
    } finally {
      setStarting(false);
    }
  }

  const screeningTimeSecs = (() => {
    const t = new Date(screeningTime).getTime();
    return Number.isNaN(t) ? null : Math.floor(t / 1000);
  })();

  // Earliest moment (in film time) anything must happen: for each dish, the
  // first step fires at ready_at - total cook time. Negative = before the film.
  const earliestFire =
    draft.schedule.length > 0
      ? Math.min(
          ...draft.schedule.map(
            (e) =>
              e.ready_at_secs -
              e.recipe.steps.reduce((sum, st) => sum + st.duration_secs, 0),
          ),
        )
      : null;

  // Warn when the chosen screening time means the first prep moment has already passed.
  let prepWarning: string | null = null;
  if (screeningTimeSecs !== null && earliestFire !== null) {
    const prepStart = screeningTimeSecs + earliestFire;
    if (prepStart < nowTick) {
      const prepLocal = new Date(prepStart * 1000).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      });
      prepWarning = `⚠ First prep for this screening starts at ${prepLocal}, which has already passed — you'd be ${fmt(nowTick - prepStart)} behind from the start.`;
    }
  }

  return (
    <div className="edit-view">
      <button type="button" className="btn-back" onClick={onBack}>
        ← Back
      </button>

      {/* Menu header: name + duration */}
      <div className="menu-header">
        <div className="menu-meta-row">
          {/* Name */}
          <div
            className="menu-name-wrap"
            onBlur={handleFieldBlur}
            tabIndex={-1}
          >
            {editingField === "name" ? (
              <input
                autoFocus
                className="menu-name-input"
                type="text"
                placeholder="My film"
                value={draft.name}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, name: e.target.value }))
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setEditingField(null);
                    saveDraft();
                  }
                }}
              />
            ) : (
              <h2 className="menu-name" onClick={() => setEditingField("name")}>
                {draft.name || "Untitled menu"}
                <span className="edit-hint">✎</span>
              </h2>
            )}
          </div>

          {/* Right column: duration (the screening code stays hidden until the screening starts) */}
          <div className="menu-right-col">
            <div
              className="menu-duration-wrap"
              onBlur={handleFieldBlur}
              tabIndex={-1}
            >
              {editingField === "duration" ? (
                <HmsInput
                  value={draft.duration_secs}
                  onChange={(secs) =>
                    setDraft((prev) => ({ ...prev, duration_secs: secs }))
                  }
                />
              ) : (
                <span
                  className="menu-duration"
                  onClick={() => setEditingField("duration")}
                >
                  {fmtDuration(draft.duration_secs)}
                  <span className="edit-hint">✎</span>
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Schedule: recipes mapped onto the film timeline */}
      <div className="schedule-section" onBlur={handleScheduleBlur}>
        <span className="field-label">Recipes</span>

        {draft.schedule.length === 0 && (
          <p className="schedule-empty">
            No dishes yet — add one to get started.
          </p>
        )}

        {draft.schedule.map((entry, ri) => {
          const fireTimes = stepFireTimes(entry);
          const isOpen = expanded[ri] ?? false;
          return (
            <div
              key={ri}
              className={`recipe-card ${isOpen ? "" : "recipe-card--collapsed"}`}
            >
              <div className="recipe-head">
                <button
                  type="button"
                  className="btn-icon recipe-toggle"
                  onClick={() => toggleExpanded(ri)}
                  aria-expanded={isOpen}
                  aria-label={isOpen ? "Collapse dish" : "Expand dish"}
                >
                  {isOpen ? "▾" : "▸"}
                </button>
                <input
                  type="text"
                  className="recipe-name-input"
                  value={entry.recipe.name}
                  placeholder="Dish name"
                  onChange={(e) => updateRecipe(ri, { name: e.target.value })}
                />
                <label className="recipe-appears">
                  <span className="recipe-appears-label">Dish appears at</span>
                  <HmsInput
                    value={entry.ready_at_secs}
                    onChange={(secs) =>
                      updateEntry(ri, { ready_at_secs: secs })
                    }
                  />
                </label>
                <div className="recipe-move">
                  <button
                    type="button"
                    className="btn-icon"
                    onClick={() => moveRecipe(ri, -1)}
                    disabled={ri === 0}
                    aria-label="Move dish up"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn-icon"
                    onClick={() => moveRecipe(ri, 1)}
                    disabled={ri === draft.schedule.length - 1}
                    aria-label="Move dish down"
                  >
                    ↓
                  </button>
                </div>
                <button
                  type="button"
                  className="btn-icon"
                  onClick={() => removeRecipe(ri)}
                  aria-label="Remove recipe"
                >
                  ✕
                </button>
              </div>

              {isOpen && (
                <>
                  <label className="prep-row">
                    <span className="prep-label">Prep</span>
                    <input
                      type="text"
                      className="step-note-input"
                      value={entry.recipe.prep ?? ""}
                      placeholder="Before the first step (chop, marinate…)"
                      onChange={(e) =>
                        updateRecipe(ri, { prep: e.target.value })
                      }
                    />
                  </label>
                  <ol className="step-list">
                    {entry.recipe.steps.map((step, si) => (
                      <li key={si} className="step-row">
                        <span
                          className="step-fire"
                          title="Do this at (film time)"
                        >
                          {fmtHms(fireTimes[si])}
                        </span>
                        <span className="step-dur-label">takes</span>
                        <span className="step-dur">
                          <HmsInput
                            value={step.duration_secs}
                            onChange={(secs) =>
                              updateStep(ri, si, { duration_secs: secs })
                            }
                          />
                        </span>
                        <input
                          type="text"
                          className="step-note-input"
                          value={step.note}
                          placeholder="What to do"
                          onChange={(e) =>
                            updateStep(ri, si, { note: e.target.value })
                          }
                        />
                        <button
                          type="button"
                          className="btn-icon"
                          onClick={() => removeStep(ri, si)}
                          aria-label="Remove step"
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                    <li className="step-appears">
                      <span className="step-fire step-fire--final">
                        {fmtHms(entry.ready_at_secs)}
                      </span>
                      <span className="step-appears-note">
                        {entry.recipe.name || "Dish"} appears — ready to eat
                      </span>
                    </li>
                  </ol>

                  <button
                    type="button"
                    className="btn-add-step"
                    onClick={() => addStep(ri)}
                  >
                    + add step
                  </button>
                </>
              )}
            </div>
          );
        })}

        <div className="row-gap">
          <button type="button" className="btn-secondary" onClick={addRecipe}>
            + Add recipe
          </button>
        </div>
      </div>

      {/* What a joined viewer's screen reveals */}
      <div className="viewer-settings" onBlur={handleScheduleBlur}>
        <span className="field-label">Viewer screen</span>
        <div className="viewer-settings-row">
          <label className="viewer-setting">
            Shows the next
            <input
              type="text"
              inputMode="numeric"
              className="viewer-count-input"
              value={countText}
              onChange={(e) => {
                // Single digit 0–9: typing a digit replaces the current one.
                const digit = e.target.value.replace(/\D/g, "").slice(-1);
                setCountText(digit);
                if (digit !== "")
                  updateViewer({ upcoming_count: Number(digit) });
              }}
              onBlur={() => {
                if (countText === "")
                  setCountText(String(draft.viewer.upcoming_count));
              }}
            />
            {draft.viewer.upcoming_count === 1 ? "dish" : "dishes"}
          </label>
          <label className="viewer-setting">
            <input
              type="checkbox"
              checked={!draft.viewer.show_dish_names}
              onChange={(e) =>
                commit({
                  ...draft,
                  viewer: {
                    ...draft.viewer,
                    show_dish_names: !e.target.checked,
                  },
                })
              }
            />
            Hide dish names
          </label>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="start-section">
        <label className="start-section-time">
          <span className="field-label">Screening time</span>
          <input
            type="datetime-local"
            className="screening-input"
            value={screeningTime}
            onChange={(e) => setScreeningTime(e.target.value)}
          />
        </label>
        {prepWarning && <p className="prep-warning">{prepWarning}</p>}
        <div className="row-gap">
          <button
            className="btn-primary"
            onClick={() => handleStart(screeningTimeSecs!)}
            disabled={starting || screeningTimeSecs === null}
          >
            {starting ? "Starting…" : "Start film"}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => exportMenuFile(menuWith(draft))}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
