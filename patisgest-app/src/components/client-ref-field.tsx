"use client";

import { useState } from "react";
import { nouveauClientRef } from "@/lib/client-ref";

/**
 * Champ caché portant la clé d'idempotence d'un formulaire (B-007).
 *
 * La référence est tirée une fois au montage du composant : un double envoi
 * capture la même `FormData`, donc la même clé, et la base rejoue l'écriture
 * au lieu de la duplicater. Pour obtenir une nouvelle référence — par exemple
 * après un envoi réussi — changez la `key` du composant.
 */
export default function ClientRefField({ name = "clientRef" }: { name?: string }) {
  const [valeur] = useState(() => nouveauClientRef());
  return <input type="hidden" name={name} value={valeur} />;
}
