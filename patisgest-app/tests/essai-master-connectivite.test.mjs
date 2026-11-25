import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { chaineDeploiement, cheminMigration } from "./migrations-historique.mjs";
import { createDemoWorkspace } from "../src/lib/demo-workspace.ts";
import { planningOverview, recipeCost, sellCart } from "../src/lib/patisgest-store.ts";
import {
  clampTrialDays,
  signTrialLicense,
  verifyTrialLicenseServer,
} from "../src/lib/trial-crypto.ts";
import {
  createInitialAnchor,
  evaluateTrialAnchor,
  mergeAnchorsStrictest,
  verifyTrialLicenseWebCrypto,
} from "../src/lib/trial-lock-client.ts";
import {
  buildOfflineAlertMessage,
  collectDisconnectAlertRecipients,
  normalizePhoneE164,
  sendSmsAndWhatsAppAlerts,
} from "../src/lib/notifications-alerte.ts";

test("Wave A : demo-workspace a un lot Labo demo-creme et sellCart refuse prix <= 0", () => {
  const ws = createDemoWorkspace("2026-11-24");
  const recTarte = ws.recipes.find((r) => r.productId === "demo-tarte");
  assert.ok(recTarte, "recette demo-tarte absente");
  const cost = recipeCost(ws, recTarte.id);
  assert.deepEqual(cost.missingPrices, [], "demo-tarte ne doit pas manquer de prix FEFO");

  // Prix nul refusé
  const zeroState = {
    ...ws,
    articles: ws.articles.map((a) => (a.id === "eclair" ? { ...a, prix: 0 } : a)),
  };
  assert.throws(() => sellCart(zeroState, [{ articleId: "eclair", qty: 1 }]), /Produit, prix ou quantité invalide/);

  // planningOverview applique unitFactor
  const plan = planningOverview(ws, "2026-11-24");
  assert.ok(plan.needs.length > 0);
  assert.ok(plan.needs.every((n) => Number.isFinite(n.required) && n.required >= 0));
});

test("Wave B : clampTrialDays borne 60..90 et signature ECDSA P-256 vérifiée par WebCrypto", async () => {
  assert.equal(clampTrialDays(undefined), 90);
  assert.equal(clampTrialDays(30), 60);
  assert.equal(clampTrialDays(75), 75);
  assert.equal(clampTrialDays(120), 90);

  const now = Date.now();
  const payload = {
    clientId: "11111111-1111-4111-8111-111111111111",
    clientNom: "Maison Amande",
    statut: "essai",
    trialDays: 90,
    startedAtMs: now,
    expiresAtMs: now + 90 * 86_400_000,
    issuedAtMs: now,
    licenseVersion: 1,
  };
  const { token, publicJwk } = signTrialLicense(payload);
  assert.equal(verifyTrialLicenseServer(token)?.clientId, payload.clientId);

  const verifiedClient = await verifyTrialLicenseWebCrypto(token, publicJwk);
  assert.equal(verifiedClient?.clientId, payload.clientId);
  assert.equal(verifiedClient?.trialDays, 90);

  // Altération du jeton rejetée
  const [body, sig] = token.split(".");
  const tamperedBody = Buffer.from(JSON.stringify({ ...payload, statut: "paye" }), "utf8").toString("base64url");
  assert.equal(verifyTrialLicenseServer(`${tamperedBody}.${sig}`), null);
  assert.equal(await verifyTrialLicenseWebCrypto(`${tamperedBody}.${sig}`, publicJwk), null);
});

test("Wave B : verrouillage permanent hors-ligne après expiration et sur recul d'horloge", () => {
  const t0 = Date.UTC(2026, 0, 1, 10, 0, 0);
  const anchor = createInitialAnchor("client-1", t0, 90, "Pâtisserie Test");

  // Jour 45 : actif
  const mid = evaluateTrialAnchor(anchor, t0 + 45 * 86_400_000);
  assert.equal(mid.locked, false);
  assert.equal(mid.daysRemaining, 45);

  // Recul d'horloge de 2 jours après jour 45 => verrouillage immédiat anti-fraude
  const rolled = evaluateTrialAnchor(mid.anchor, t0 + 43 * 86_400_000);
  assert.equal(rolled.locked, true);
  assert.equal(rolled.anchor.lockReason, "clock_rollback");

  // Jour 91 hors-ligne => verrouillage permanent
  const fresh = createInitialAnchor("client-2", t0, 90, "Pâtisserie Test 2");
  const expired = evaluateTrialAnchor(fresh, t0 + 91 * 86_400_000);
  assert.equal(expired.locked, true);
  assert.equal(expired.anchor.lockReason, "expired");

  // Même si l'horloge est remise en arrière après expiration, reste verrouillé
  const afterBack = evaluateTrialAnchor(expired.anchor, t0 + 5 * 86_400_000);
  assert.equal(afterBack.locked, true);

  // Multi-store : si un stockage est effacé, la copie verrouillée gagne ; seul paye (version sup.) débloque
  const wipedStore = createInitialAnchor("client-2", t0 + 92 * 86_400_000, 90, "Pâtisserie Test 2");
  const mergedLocked = mergeAnchorsStrictest([wipedStore, expired.anchor, null]);
  assert.equal(mergedLocked?.lockedPermanent, true);

  const paidAnchor = {
    ...expired.anchor,
    statut: "paye",
    licenseVersion: 2,
    lockedPermanent: false,
    lockReason: null,
  };
  const mergedPaid = mergeAnchorsStrictest([expired.anchor, paidAnchor]);
  assert.equal(mergedPaid?.statut, "paye");
  assert.equal(mergedPaid?.lockedPermanent, false);
});

test("Wave C : normalisation téléphone DZ, ciblage Master + labo + vendeur et adaptateurs Twilio/Webhook", async () => {
  assert.equal(normalizePhoneE164("0550 12 34 56"), "+213550123456");
  assert.equal(normalizePhoneE164("00213661998877"), "+213661998877");
  assert.equal(normalizePhoneE164("+33 6 12 34 56 78"), "+33612345678");

  const recipients = collectDisconnectAlertRecipients({
    masterPhone: "0550 00 00 01",
    teamUsers: [
      { role: "proprietaire", telephone: "0550 00 00 99" },
      { role: "labo", telephone: "0661 11 22 33" },
      { role: "vendeur", telephone: "0770 44 55 66" },
      { role: "vendeur", telephone: "0770 44 55 66" }, // doublon dédupliqué
    ],
  });
  assert.deepEqual(recipients, ["+213550000001", "+213661112233", "+213770445566"]);

  const msg = buildOfflineAlertMessage({
    clientNom: "Maison Amande",
    role: "proprietaire",
    userName: "Amina",
    disconnectedMinutes: 75,
  });
  assert.match(msg, /Internet coupé depuis plus d’1h/);
  assert.match(msg, /Propriétaire/);

  // Test adaptateur Webhook générique SMS + WhatsApp via mock fetch
  const prevSms = process.env.PATISGEST_SMS_WEBHOOK_URL;
  const prevWa = process.env.PATISGEST_WHATSAPP_WEBHOOK_URL;
  const prevSid = process.env.TWILIO_ACCOUNT_SID;
  process.env.TWILIO_ACCOUNT_SID = "";
  process.env.PATISGEST_SMS_WEBHOOK_URL = "https://hooks.example.test/sms";
  process.env.PATISGEST_WHATSAPP_WEBHOOK_URL = "https://hooks.example.test/wa";

  const calls = [];
  const fakeFetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
    return new Response("ok", { status: 200 });
  };

  try {
    const res = await sendSmsAndWhatsAppAlerts(
      { recipients: ["+213550000001", "+213661112233"], message: msg },
      fakeFetch,
    );
    assert.equal(res.statut, "envoye");
    assert.equal(calls.length, 4); // 2 destinataires × (SMS + WhatsApp)
    assert.ok(calls.some((c) => c.url.includes("/sms") && c.body.channel === "sms"));
    assert.ok(calls.some((c) => c.url.includes("/wa") && c.body.channel === "whatsapp"));
  } finally {
    process.env.PATISGEST_SMS_WEBHOOK_URL = prevSms ?? "";
    process.env.PATISGEST_WHATSAPP_WEBHOOK_URL = prevWa ?? "";
    process.env.TWILIO_ACCOUNT_SID = prevSid ?? "";
  }
});

test("Migration 51 SQL : bornes 60..90 jours à l'insertion et protection RLS contre l'utilisateur authentifié", async () => {
  const db = new PGlite();
  await db.exec(`
    create role authenticated; create role anon; create role service_role;
    create schema auth; grant usage on schema public,auth to authenticated,anon,service_role;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,deleted_at timestamptz);
    create function public.rls_auto_enable() returns event_trigger language plpgsql as $$begin end$$;
    alter default privileges in schema public grant all on tables to authenticated,service_role;
    alter default privileges in schema public grant execute on functions to authenticated,service_role;
    grant execute on function auth.uid() to authenticated,anon,service_role;
  `);

  for (const file of chaineDeploiement()) {
    let sql = await readFile(new URL(`../supabase/${cheminMigration(file)}`, import.meta.url), "utf8");
    sql = sql.replace("create extension if not exists pgcrypto;", "");
    if (file.startsWith("07-")) {
      await db.exec("create function public.creer_of(uuid,uuid,numeric,date) returns jsonb language sql as $$select '{}'::jsonb$$");
    }
    if (file.startsWith("09-")) {
      await db.exec("alter table public.clotures add column if not exists revision integer default 1;");
    }
    await db.exec(sql);
  }

  // Insertion client avec durée hors borne (30 -> borné à 60)
  const ins = await db.query(
    "insert into public.clients (nom, essai_duree_jours) values ('Test Patisserie', 30) returning id, statut_abonnement, essai_duree_jours",
  );
  assert.equal(ins.rows[0].statut_abonnement, "essai");
  assert.equal(ins.rows[0].essai_duree_jours, 60);

  // Un utilisateur authentifié ne peut pas passer son compte en 'paye'
  await db.exec("select set_config('request.jwt.claim.role', 'authenticated', false)");
  await assert.rejects(
    db.query("update public.clients set statut_abonnement = 'paye' where id = $1", [ins.rows[0].id]),
    /Modification de la licence réservée à l’espace Master/,
  );
});
