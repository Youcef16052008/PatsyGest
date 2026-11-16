import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const ctx = await getSessionContext();
  redirect(ctx ? "/tableau-de-bord" : "/connexion");
}
