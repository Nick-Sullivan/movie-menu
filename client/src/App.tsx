import { useEffect, useState } from 'react';
import type { Menu } from './types';
import { newLocalMenu } from './types';
import { getMenu } from './api';
import HomeScreen from './components/HomeScreen';
import JoinForm from './components/JoinForm';
import EditView from './components/EditView';
import RunningView from './components/RunningView';

type Mode = 'home' | 'join';

const MENU_KEY = 'tasting-shrek:menu';

function urlParam(name: string): string | null {
  return new URLSearchParams(window.location.search).get(name);
}

function loadLocalMenu(): Menu | null {
  try {
    const raw = localStorage.getItem(MENU_KEY);
    return raw ? (JSON.parse(raw) as Menu) : null;
  } catch {
    return null;
  }
}

export default function App() {
  const [mode, setMode] = useState<Mode>('home');
  // The menu being worked on lives in the browser (mirrored to localStorage);
  // the server only holds it while a screening is running. A ?code= in the
  // URL (an active screening) takes priority over the local copy.
  const [menu, setMenu] = useState<Menu | null>(() =>
    urlParam('code') ? null : loadLocalMenu(),
  );
  // Chef status unlocks the edit view and chef screen; granted by starting a
  // film and carried in the URL so it survives a refresh. Everyone else is a
  // viewer and only ever sees what the viewer settings allow.
  const [chef, setChef] = useState(() => urlParam('chef') === 'true');
  // True while re-fetching the menu named by ?code= after a refresh; render
  // nothing rather than flashing the home screen.
  const [restoring, setRestoring] = useState(() => urlParam('code') !== null);

  useEffect(() => {
    const code = urlParam('code');
    if (!code) return;
    getMenu(code)
      // a code only means something while its screening runs (chefs excepted:
      // they come back to a stopped menu to edit or restart it) — anything
      // else is a dead link, treated like a bad code
      .then(m => {
        if (m.started_at !== null || urlParam('chef') === 'true') setMenu(m);
      })
      .catch(() => {}) // bad code — fall through to home; the URL sync clears it
      .finally(() => setRestoring(false));
  }, []);

  // Local persistence: whatever menu is open survives a refresh. Photos ride
  // along as data URLs, so a menu can outgrow the localStorage quota — the
  // app keeps working from memory, the refresh-survival just degrades.
  useEffect(() => {
    if (restoring) return;
    try {
      if (menu) localStorage.setItem(MENU_KEY, JSON.stringify(menu));
      else localStorage.removeItem(MENU_KEY);
    } catch (err) {
      console.warn('menu too large to persist locally', err);
    }
  }, [menu, restoring]);

  // Mirror the open menu's code (and chef status) into the URL so a refresh
  // lands back in the same screening. Local menus have no code.
  useEffect(() => {
    if (restoring) return;
    const url = new URL(window.location.href);
    if (menu?.id) {
      url.searchParams.set('code', menu.id);
      if (chef) url.searchParams.set('chef', 'true');
      else url.searchParams.delete('chef');
    } else {
      url.searchParams.delete('code');
      url.searchParams.delete('chef');
    }
    window.history.replaceState(null, '', url);
  }, [menu?.id, chef, restoring]);

  function reset() {
    setMenu(null);
    setChef(false);
    setMode('home');
  }

  // Joining a code that isn't screening is "not found" — unless you're the
  // chef, who joins their own menu to edit or restart it.
  function handleFound(m: Menu): boolean {
    if (m.started_at === null && !chef) return false;
    setMenu(m);
    return true;
  }

  if (restoring) return null;

  // Either screening or editing: a started menu is always the screening page
  // (stopping the film is the way back to editing).
  return (
    <main className="page">
      {menu ? (
        menu.started_at !== null ? (
          <RunningView menu={menu} setMenu={setMenu} chef={chef} />
        ) : (
          // only chefs and local menus can hold a non-started menu — both
          // entry points treat a non-screening code as not found
          <EditView
            menu={menu}
            setMenu={setMenu}
            onBack={reset}
            onStarted={() => setChef(true)}
          />
        )
      ) : (
        <>
          {mode === 'home' && <HomeScreen onCreate={() => setMenu(newLocalMenu())} onJoin={() => setMode('join')} onUpload={setMenu} />}
          {mode === 'join' && <JoinForm onFound={handleFound} onBack={() => setMode('home')} />}
        </>
      )}
    </main>
  );
}
