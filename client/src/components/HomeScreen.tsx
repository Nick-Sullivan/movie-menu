import { useRef, useState } from "react";
import { parseMenuFile } from "../menuFile";
import type { Menu } from "../types";

interface Props {
  onCreate: () => void;
  onJoin: () => void;
  onUpload: (menu: Menu) => void;
}

export default function HomeScreen({ onCreate, onJoin, onUpload }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-uploading the same file
    if (!file) return;
    setError(null);
    try {
      onUpload(parseMenuFile(await file.text()));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that file");
    }
  }

  return (
    <div className="home">
      <div className="home-hero">
        <h1 className="home-title">The Movie Menu</h1>
        <p className="home-tagline">Serve meals as they appear on screen.</p>
      </div>
      <div className="home-actions">
        <button className="btn-primary btn-lg" onClick={onCreate}>
          Create a menu
        </button>
        <button className="btn-secondary" onClick={onJoin}>
          Join a screening
        </button>
        <button
          className="btn-secondary"
          onClick={() => fileRef.current?.click()}
        >
          Upload a menu
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        onChange={handleFile}
        hidden
      />
      {error && <p className="error">{error}</p>}
    </div>
  );
}
