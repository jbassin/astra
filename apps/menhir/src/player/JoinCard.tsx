/**
 * The player join card (spec §3) — code prefilled from `?code=` (D31-12,
 * `codeFromQuery`), name field, 16px+ inputs (tokens.css) so iOS Safari never
 * zooms the viewport on focus.
 */
import { useState } from "react";

export interface JoinCardProps {
  initialCode: string;
  pending: boolean;
  error: string | null;
  onJoin: (code: string, name: string) => void;
}

export function JoinCard({ initialCode, pending, error, onJoin }: JoinCardProps) {
  const [code, setCode] = useState(initialCode);
  const [name, setName] = useState("");

  const canSubmit = !pending && code.trim().length > 0 && name.trim().length > 0;

  return (
    <form
      className="join-card"
      onSubmit={(event) => {
        event.preventDefault();
        if (!canSubmit) return;
        onJoin(code.trim().toUpperCase(), name.trim());
      }}
    >
      <h1 className="menhir-wordmark">menhir</h1>
      <div>
        <label htmlFor="join-code">Game code</label>
        <input
          id="join-code"
          name="code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="ABCD"
          maxLength={4}
          autoCapitalize="characters"
          autoComplete="off"
          inputMode="text"
        />
      </div>
      <div>
        <label htmlFor="join-name">Your name</label>
        <input
          id="join-name"
          name="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Ozzie"
          maxLength={24}
          autoComplete="off"
        />
      </div>
      {error && (
        <p className="join-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn-block" disabled={!canSubmit}>
        {pending ? "Joining…" : "Join game"}
      </button>
    </form>
  );
}
