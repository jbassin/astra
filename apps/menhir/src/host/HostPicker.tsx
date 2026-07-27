/**
 * `/host` — quiz picker (spec §3): lists `GET /api/quizzes`, creates a game
 * on selection, then `history.replaceState`s to `/host/:code` (D31-9). Bare
 * `/host` with a live stored game (`menhir:host`) offers "resume" instead of
 * forcing a fresh create.
 */
import { useEffect, useState } from "react";

import { createGame, listQuizzes, type QuizListItem } from "../api";
import { MenhirMark } from "../marks";
import { navigate } from "../router";
import { loadStoredHost, saveStoredHost, type StoredHost } from "../storage";

export function HostPicker() {
  const [quizzes, setQuizzes] = useState<QuizListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const [resumable] = useState<StoredHost | null>(() => loadStoredHost());

  useEffect(() => {
    void listQuizzes().then((res) => {
      if (res.ok) setQuizzes(res.data);
      else setError(res.error);
    });
  }, []);

  function handleCreate(quizId: string) {
    setCreatingId(quizId);
    setError(null);
    void createGame(quizId).then((res) => {
      setCreatingId(null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      saveStoredHost({ code: res.data.code, hostToken: res.data.hostToken });
      navigate(`/host/${res.data.code}`, { replace: true });
    });
  }

  return (
    <div className="host-shell host-picker">
      <header className="picker-head">
        <MenhirMark className="picker-stone" />
        <h1 className="menhir-wordmark">menhir</h1>
        <p className="picker-lede">Pick a quiz. The room opens the moment you do.</p>
      </header>
      {resumable && (
        <p className="picker-resume">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => navigate(`/host/${resumable.code}`)}
          >
            Resume game {resumable.code}
          </button>
        </p>
      )}
      {error && (
        <p className="host-error" role="alert">
          {error}
        </p>
      )}
      {!quizzes && <p className="picker-status">Loading quizzes…</p>}
      {quizzes && quizzes.length === 0 && <p className="picker-status">No quizzes found.</p>}
      <ul className="quiz-list">
        {quizzes?.map((quiz) => (
          <li key={quiz.id}>
            <button
              type="button"
              onClick={() => handleCreate(quiz.id)}
              disabled={creatingId !== null}
            >
              <span className="quiz-title">{quiz.title}</span>
              <span className="quiz-meta">{quiz.questionCount} questions</span>
              {creatingId === quiz.id && <span className="quiz-creating">Creating…</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
