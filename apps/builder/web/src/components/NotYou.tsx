// "Not <name>?" on the player page: the way back to the group list, shown only when this browser
// remembers a party phrase. It renders after mount, so the server and the first browser render
// agree (both show nothing).

import { useEffect, useState } from "react";

import { readRemembered, remember } from "@/domain/party";

export function NotYou({ id, name }: { id: string; name: string }) {
  const [word, setWord] = useState<string>();
  useEffect(() => {
    const remembered = readRemembered();
    setWord(remembered?.word);
    // A tap before the page's JavaScript loaded is not remembered, so the last player opened
    // is the one remembered.
    if (remembered && remembered.id !== id) remember({ id, word: remembered.word });
  }, [id]);
  if (!word) return null;
  return (
    <p className="not-you">
      <a href={`/p/${word}?switch=1`}>Not {name}?</a>
    </p>
  );
}
