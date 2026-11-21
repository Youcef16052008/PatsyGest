"use client";

// Revue Phase 4 : limite d'erreur par segment. Le message ne montre ni la pile
// ni le détail technique ; l'utilisateur peut réessayer sans recharger l'espace.
export default function ErreurSegment({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="pg-card pg-card-pad">
      <h2>Une erreur est survenue</h2>
      <p>Cette page n’a pas pu être affichée. Vos données n’ont pas été modifiées par cette action.</p>
      <button type="button" className="pg-button" onClick={() => reset()}>Réessayer</button>
    </div>
  );
}
