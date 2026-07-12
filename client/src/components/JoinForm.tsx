import { useState } from 'react';
import { getMenu } from '../api';
import type { Menu } from '../types';

interface Props {
  // Returns false when the code doesn't lead anywhere (e.g. its screening
  // isn't running) so the form can show "not found".
  onFound: (p: Menu) => boolean;
  onBack: () => void;
}

export default function JoinForm({ onFound, onBack }: Props) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function doLookup(value: string) {
    setError(null);
    setLoading(true);
    try {
      if (!onFound(await getMenu(value)))
        setError('No screening found with that code.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg.includes('404') ? 'No screening found with that code.' : msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    doLookup(code.toUpperCase());
  }

  return (
    <form className="join-form" onSubmit={handleSubmit}>
      <h2 className="form-title">Join with a code</h2>
      <p className="form-hint">Enter the 5-character code someone shared with you.</p>
      <div className="field">
        <label htmlFor="code">Screening code</label>
        <input
          id="code"
          type="text"
          value={code}
          onChange={e => {
            const next = e.target.value.toUpperCase().slice(0, 5);
            setCode(next);
            if (next.length === 5) doLookup(next);
          }}

          maxLength={5}
          pattern="[A-Z0-9]{5}"
          required
          className="code-input"
        />
      </div>
      {error && <p className="error">{error}</p>}
      <div className="row-gap">
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'Looking up…' : 'Join'}
        </button>
        <button type="button" className="btn-secondary" onClick={onBack}>Back</button>
      </div>
    </form>
  );
}
