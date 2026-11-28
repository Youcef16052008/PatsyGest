import { NextResponse } from "next/server";
import { canWrite, getSessionContext } from "@/lib/auth";
import { recognizeInvoiceImage, validerImageOcr } from "@/lib/ocr-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const ENTETE_NO_STORE = { "Cache-Control": "no-store" };

function erreur(code: string, message: string, status: number) {
  return NextResponse.json(
    { ok: false, code, erreur: message },
    { status, headers: ENTETE_NO_STORE },
  );
}

/**
 * Lecture optique d'un bon fournisseur. La photo reste en mémoire : aucun
 * objet Storage, aucune table, aucun journal applicatif ne conserve l'image ou
 * le texte reconnu. La validation humaine et l'entrée en stock restent deux
 * actions explicites du composant.
 */
export async function POST(request: Request) {
  const ctx = await getSessionContext();
  if (!ctx) return erreur("unauthorized", "Session requise.", 401);
  if (!canWrite(ctx.role)) return erreur("unauthorized", "Lecture non autorisée.", 403);

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return erreur("bad-format", "Photo illisible.", 400);
  }

  const fichier = formData.get("image");
  if (!(fichier instanceof File)) return erreur("missing", "Photo manquante.", 400);
  const validation = validerImageOcr({ type: fichier.type, size: fichier.size });
  if (!validation.ok) {
    return erreur(validation.code, validation.erreur, validation.status);
  }

  try {
    const image = Buffer.from(await fichier.arrayBuffer());
    const resultat = await recognizeInvoiceImage(image);
    return NextResponse.json(
      {
        ok: true,
        text: resultat.text,
        confidence: resultat.confidence,
        engine: resultat.engine,
        languages: resultat.languages,
        offline: resultat.offline,
      },
      { status: 200, headers: ENTETE_NO_STORE },
    );
  } catch {
    // Aucun détail Tesseract, aucun chemin de fichier, aucune valeur d'env.
    return erreur("ocr-error", "Lecture de la photo impossible.", 500);
  }
}
