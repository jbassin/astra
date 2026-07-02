import { createFileRoute } from "@tanstack/react-router";

import { CardRow } from "@/domain/components/CardRow";
import { DECK } from "@/generated/cards";

// The gallery encyclopedia (harrow's GalleryView) — every card in the deck rendered as
// a CardRow. Fully static (no randomness/animation): SSRs straight from the generated
// DECK.
export const Route = createFileRoute("/gallery")({
  component: GalleryComponent,
});

function GalleryComponent() {
  return (
    <div className="gallery">
      <h1 className="gallery-title">The Cards</h1>
      <div className="space-y-6">
        {DECK.map((card) => (
          <CardRow key={card.id} card={card} />
        ))}
      </div>
    </div>
  );
}
