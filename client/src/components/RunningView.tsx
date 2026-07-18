import { useState, useEffect, useRef } from "react";
import { fmt, fmtSigned, fmtHms, buildTimeline } from "../utils";
import { stopScreening } from "../api";
import { recipeImageSrc } from "../photos";
import type { Menu } from "../types";
import { DEFAULT_VIEWER } from "../types";

interface Props {
  menu: Menu;
  setMenu: (p: Menu) => void;
  // Chef status (App state, carried in the URL): unlocks the chef screen and
  // the stop control. Stopping the film is the way back to the edit page.
  chef: boolean;
}

// chef sees every step; viewer sees only what the menu's viewer settings
// allow (next N dishes, names optionally hidden).
type Role = "chef" | "viewer";
const ROLE_KEY = "tasting-shrek:role";

const MYSTERY = "Mystery dish";

// One row of the chef's list: a prep step, or a dish landing on the table.
interface ChefItem {
  time: number;
  recipe: string;
  note: string;
  appears: boolean;
}

export default function RunningView({ menu, setMenu, chef }: Props) {
  // Negative before the screening time: the film timer counts up from −H:MM:SS to 0.
  const [elapsed, setElapsed] = useState(
    () => Math.floor(Date.now() / 1000) - menu.started_at!,
  );
  const [stopping, setStopping] = useState(false);
  const [role, setRole] = useState<Role>(() =>
    localStorage.getItem(ROLE_KEY) === "viewer" ? "viewer" : "chef",
  );
  const view: Role = chef ? role : "viewer";
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = setInterval(() => {
      setElapsed(Math.floor(Date.now() / 1000) - menu.started_at!);
    }, 100);
    return () => clearInterval(id);
  }, [menu.started_at]);

  function pickRole(r: Role) {
    setRole(r);
    localStorage.setItem(ROLE_KEY, r);
  }

  async function handleStop() {
    setStopping(true);
    try {
      setMenu(await stopScreening(menu.id));
    } finally {
      setStopping(false);
    }
  }

  const viewerCfg = menu.viewer ?? DEFAULT_VIEWER;
  const preShow = elapsed < 0;
  const timeToEnd = menu.duration_secs - elapsed;

  // Viewer timeline: dishes appearing, not prep steps.
  const dishes = [...menu.schedule].sort(
    (a, b) => a.ready_at_secs - b.ready_at_secs,
  );
  const lastDish =
    [...dishes].reverse().find((d) => d.ready_at_secs <= elapsed) ?? null;
  const upcomingDishes = dishes
    .filter((d) => d.ready_at_secs > elapsed)
    .slice(0, viewerCfg.upcoming_count);
  const nextDish = upcomingDishes[0] ?? null;

  const dishName = (name: string) =>
    viewerCfg.show_dish_names ? name || "Dish" : MYSTERY;

  // Chef list: each dish's prep note (due when its first step fires — the
  // stable sort keeps it ahead of that step), every prep step, and each
  // dish's "ready to serve" moment, in film-time order (including negative
  // pre-show times).
  const chefList: ChefItem[] = [
    ...dishes
      .filter((d) => d.recipe.prep)
      .map((d) => ({
        time:
          d.ready_at_secs -
          d.recipe.steps.reduce((sum, st) => sum + st.duration_secs, 0),
        recipe: d.recipe.name,
        note: `Prep: ${d.recipe.prep}`,
        appears: false,
      })),
    ...buildTimeline(menu.schedule).map((t) => ({
      time: t.time_secs,
      recipe: t.recipe,
      note: t.note,
      appears: false,
    })),
    ...dishes.map((d) => ({
      time: d.ready_at_secs,
      recipe: d.recipe.name,
      note: "Ready to serve",
      appears: true,
    })),
  ].sort((a, b) => a.time - b.time);

  let currentIdx = -1;
  chefList.forEach((item, i) => {
    if (item.time <= elapsed) currentIdx = i;
  });
  const nextIdx = chefList.findIndex((item) => item.time > elapsed);

  // The list has no scrollbar of its own — the page scrolls. When a step
  // becomes current while off-screen, bring the page to it; if it's already
  // visible, leave the user's scroll position alone.
  useEffect(() => {
    if (view !== "chef") return;
    const row =
      listRef.current?.querySelector<HTMLElement>(".chef-row--current");
    if (!row) return;
    const r = row.getBoundingClientRect();
    if (r.top >= 0 && r.bottom <= window.innerHeight) return;
    row.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [currentIdx, view]);

  // Film-progress ring (viewer): fraction of the film elapsed (clamped 0–1).
  const progress =
    menu.duration_secs > 0
      ? Math.max(0, Math.min(1, elapsed / menu.duration_secs))
      : 0;
  const R = 118;
  const C = 2 * Math.PI * R;

  const screeningLocal = new Date(menu.started_at! * 1000).toLocaleTimeString(
    [],
    { hour: "numeric", minute: "2-digit" },
  );

  function renderViewerCenter() {
    if (preShow) {
      return (
        <>
          <span className="countdown-label">Film starts</span>
          <p className="countdown countdown--negative">{fmtSigned(elapsed)}</p>
          <span className="countdown-sub">Screening at {screeningLocal}</span>
        </>
      );
    }
    if (nextDish) {
      return (
        <>
          <span className="countdown-label">Next dish</span>
          <p className="countdown">{fmt(nextDish.ready_at_secs - elapsed)}</p>
          <span className="countdown-sub">
            {dishName(nextDish.recipe.name)}
          </span>
        </>
      );
    }
    if (timeToEnd > 0) {
      return (
        <>
          <span className="countdown-label">End of film</span>
          <p className="countdown">{fmt(timeToEnd)}</p>
        </>
      );
    }
    return <p className="countdown-done">Film complete</p>;
  }

  const filmClock = (
    <div className="film-clock">
      <span className="film-clock-label">Film time</span>
      <span
        className={`film-clock-value ${preShow ? "film-clock-value--negative" : ""}`}
      >
        {fmtSigned(elapsed)}
      </span>
      {preShow && (
        <span className="film-clock-screening">starts {screeningLocal}</span>
      )}
    </div>
  );

  return (
    <div className="running-view">
      <div className="running-header">
        <span className="running-title">{menu.name}</span>
        <div className="running-header-right">
          <div className="running-header-row">
            {chef && (
              <div className="role-toggle" role="group" aria-label="View as">
                <button
                  type="button"
                  className={view === "chef" ? "role-active" : ""}
                  onClick={() => pickRole("chef")}
                >
                  Chef
                </button>
                <button
                  type="button"
                  className={view === "viewer" ? "role-active" : ""}
                  onClick={() => pickRole("viewer")}
                >
                  Viewer
                </button>
              </div>
            )}
            {menu.id && (
              <div className="code-small">
                <code>{menu.id}</code>
              </div>
            )}
          </div>
          {view === "chef" && (
            <div className="running-header-row">
              {filmClock}
              <button
                className="btn-secondary"
                onClick={handleStop}
                disabled={stopping}
              >
                {stopping ? "Resetting…" : "Stop film"}
              </button>
            </div>
          )}
        </div>
      </div>

      {view === "chef" ? (
        <>
          {chefList.length > 0 ? (
            <div className="chef-list" ref={listRef}>
              {chefList.map((item, i) => (
                <div
                  key={i}
                  className={[
                    "chef-row",
                    i === currentIdx ? "chef-row--current" : "",
                    i < currentIdx ? "chef-row--past" : "",
                    item.appears ? "chef-row--appears" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <span className="chef-time">{fmtHms(item.time)}</span>
                  <span className="chef-recipe">{item.recipe}</span>
                  <span className="chef-note">{item.note}</span>
                  {i === currentIdx && (
                    <span className="chef-chip chef-chip--now">now</span>
                  )}
                  {i === nextIdx && (
                    <span className="chef-chip">
                      in {fmt(item.time - elapsed)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="schedule-empty">Nothing scheduled to cook.</p>
          )}
        </>
      ) : (
        <>
          {lastDish && (
            <div className="now-strip">
              <div className="now-strip-text">
                <span className="label">Now serving</span>
                {/* already on the table — no longer a surprise, never masked */}
                <p className="milestone-note">
                  {lastDish.recipe.name || "Dish"}
                </p>
              </div>
              {recipeImageSrc(lastDish.recipe) && (
                <img
                  className="now-photo"
                  src={recipeImageSrc(lastDish.recipe)}
                  alt={lastDish.recipe.name || "Dish"}
                />
              )}
            </div>
          )}

          <div className="countdown-hero">
            <svg
              className="progress-ring"
              viewBox="0 0 260 260"
              aria-hidden="true"
            >
              <circle className="progress-ring-track" cx="130" cy="130" r={R} />
              <circle
                className="progress-ring-fill"
                cx="130"
                cy="130"
                r={R}
                strokeDasharray={C}
                strokeDashoffset={C * (1 - progress)}
              />
            </svg>
            <div className="countdown-center">{renderViewerCenter()}</div>
          </div>

          {/* pre-show the ring already shows the (negative) film timer */}
          {!preShow && filmClock}

          {/* the ring already shows the next dish — a one-item list is redundant */}
          {upcomingDishes.length > 1 && (
            <div className="upcoming">
              <span className="field-label">
                Next {upcomingDishes.length} dishes
              </span>
              <ul className="upcoming-list">
                {upcomingDishes.map((d, i) => (
                  <li key={i} className="upcoming-row">
                    <span className="upcoming-time">
                      {fmtHms(d.ready_at_secs)}
                    </span>
                    <span className="upcoming-note">
                      {dishName(d.recipe.name)}
                    </span>
                    {/* a photo would spoil a masked dish just as much as its name */}
                    {viewerCfg.show_dish_names && recipeImageSrc(d.recipe) && (
                      <img
                        className="upcoming-thumb"
                        src={recipeImageSrc(d.recipe)}
                        alt=""
                      />
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
