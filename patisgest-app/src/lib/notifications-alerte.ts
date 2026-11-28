export interface DisconnectUserInfo {
  id: string;
  nom: string | null;
  email: string;
  role: "proprietaire" | "labo" | "vendeur";
  telephone: string | null;
  clientId: string;
  clientNom: string;
  lastSeenAt: string | null;
}

export interface AlertDeliveryResult {
  channel: "sms" | "whatsapp";
  provider: "twilio" | "webhook" | "simulation";
  to: string;
  ok: boolean;
  statusCode?: number;
  error?: string;
}

export interface AlertDispatchSummary {
  statut: "envoye" | "partiel" | "echec" | "simulation";
  canaux: ("sms" | "whatsapp")[];
  results: AlertDeliveryResult[];
}

/** Borne réseau explicite : un webhook lent ne doit pas bloquer le cron. */
export interface AlertNetworkOptions {
  timeoutMs?: number;
}

export const DELAI_ALERTE_RESEAU_MS = 10_000;

async function fetchAvecDelai(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const delai = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DELAI_ALERTE_RESEAU_MS;
  const controleur = new AbortController();
  let expire = false;
  let minuteur: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<never>((_, reject) => {
    minuteur = setTimeout(() => {
      expire = true;
      controleur.abort();
      reject(new Error(`Délai réseau dépassé (${delai} ms).`));
    }, delai);
  });
  const requete = Promise.resolve().then(() => fetchImpl(url, { ...init, signal: controleur.signal }));
  // Le fetch peut rejeter APRÈS l'expiration : on évite un rejet non traité.
  void requete.catch(() => {});
  try {
    return await Promise.race([requete, limite]);
  } catch (erreur) {
    if (expire) throw new Error(`Délai réseau dépassé (${delai} ms).`);
    throw erreur;
  } finally {
    if (minuteur !== undefined) clearTimeout(minuteur);
  }
}

/**
 * Normalise un numéro en E.164 (support natif Algérie +213 et international).
 */
export function normalizePhoneE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[\s().-]/g, "");
  if (!cleaned) return null;
  let normalized = cleaned;
  if (normalized.startsWith("00")) {
    normalized = `+${normalized.slice(2)}`;
  } else if (/^0[567]\d{8}$/.test(normalized) || /^0[234]\d{7,8}$/.test(normalized)) {
    normalized = `+213${normalized.slice(1)}`;
  } else if (/^213\d{8,9}$/.test(normalized)) {
    normalized = `+${normalized}`;
  } else if (/^[567]\d{8}$/.test(normalized)) {
    normalized = `+213${normalized}`;
  }
  if (!/^\+\d{8,15}$/.test(normalized)) return null;
  return normalized;
}

/**
 * Collecte les destinataires requis lors d'une coupure Internet > 1h sur
 * labo, vendeur ou propriétaire :
 *   - Master (PATISGEST_MASTER_PHONE)
 *   - Tous les utilisateurs `labo` de l'établissement
 *   - Tous les utilisateurs `vendeur` de l'établissement
 */
export function collectDisconnectAlertRecipients(params: {
  masterPhone?: string | null;
  teamUsers: Pick<DisconnectUserInfo, "role" | "telephone">[];
}): string[] {
  const seen = new Set<string>();
  const add = (raw: string | null | undefined) => {
    const norm = normalizePhoneE164(raw);
    if (norm) seen.add(norm);
  };
  add(params.masterPhone);
  for (const u of params.teamUsers) {
    if (u.role === "labo" || u.role === "vendeur") {
      add(u.telephone);
    }
  }
  return [...seen];
}

export function buildOfflineAlertMessage(params: {
  clientNom: string;
  role: "proprietaire" | "labo" | "vendeur";
  userName: string;
  disconnectedMinutes: number;
}): string {
  const roleLabel =
    params.role === "proprietaire"
      ? "Propriétaire"
      : params.role === "labo"
        ? "Laboratoire"
        : "Vendeur";
  const mins = Math.max(60, Math.round(params.disconnectedMinutes));
  return `[PâtisGest Alerte] Internet coupé depuis plus d’1h (${mins} min) pour ${roleLabel} (${params.userName}) — ${params.clientNom}. La connexion Internet doit être rétablie pour synchroniser l’activité.`;
}

async function sendTwilioMessage(params: {
  accountSid: string;
  authToken: string;
  from: string;
  to: string;
  body: string;
  channel: "sms" | "whatsapp";
  fetchImpl: typeof fetch;
  timeoutMs?: number;
}): Promise<AlertDeliveryResult> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(params.accountSid)}/Messages.json`;
  const fromAddr = params.channel === "whatsapp" && !params.from.startsWith("whatsapp:")
    ? `whatsapp:${params.from}`
    : params.from;
  const toAddr = params.channel === "whatsapp" ? `whatsapp:${params.to}` : params.to;
  const credentials = `${params.accountSid}:${params.authToken}`;
  const auth = Buffer.from(credentials).toString("base64");
  const body = new URLSearchParams({ From: fromAddr, To: toAddr, Body: params.body });

  try {
    const res = await fetchAvecDelai(params.fetchImpl, url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    }, params.timeoutMs ?? DELAI_ALERTE_RESEAU_MS);
    return {
      channel: params.channel,
      provider: "twilio",
      to: params.to,
      ok: res.ok,
      statusCode: res.status,
      ...(res.ok ? {} : { error: `Twilio HTTP ${res.status}` }),
    };
  } catch (err) {
    return {
      channel: params.channel,
      provider: "twilio",
      to: params.to,
      ok: false,
      error: err instanceof Error ? err.message : "Twilio network error",
    };
  }
}

async function sendWebhookMessage(params: {
  webhookUrl: string;
  secret?: string;
  channel: "sms" | "whatsapp";
  to: string;
  message: string;
  meta: Record<string, unknown>;
  fetchImpl: typeof fetch;
  timeoutMs?: number;
}): Promise<AlertDeliveryResult> {
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (params.secret) headers.Authorization = `Bearer ${params.secret}`;
    const res = await fetchAvecDelai(params.fetchImpl, params.webhookUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        channel: params.channel,
        to: params.to,
        message: params.message,
        meta: params.meta,
      }),
    }, params.timeoutMs ?? DELAI_ALERTE_RESEAU_MS);
    return {
      channel: params.channel,
      provider: "webhook",
      to: params.to,
      ok: res.ok,
      statusCode: res.status,
      ...(res.ok ? {} : { error: `Webhook HTTP ${res.status}` }),
    };
  } catch (err) {
    return {
      channel: params.channel,
      provider: "webhook",
      to: params.to,
      ok: false,
      error: err instanceof Error ? err.message : "Webhook network error",
    };
  }
}

/**
 * Adaptateur multi-fournisseur SMS + WhatsApp (Twilio ou Webhooks HTTP génériques).
 */
export async function sendSmsAndWhatsAppAlerts(
  params: {
    recipients: string[];
    message: string;
    meta?: Record<string, unknown>;
  },
  fetchImpl: typeof fetch = fetch,
  options: AlertNetworkOptions = {},
): Promise<AlertDispatchSummary> {
  const twilioSid = process.env.TWILIO_ACCOUNT_SID ?? "";
  const twilioToken = process.env.TWILIO_AUTH_TOKEN ?? "";
  const twilioSmsFrom = process.env.TWILIO_SMS_FROM ?? "";
  const twilioWaFrom = process.env.TWILIO_WHATSAPP_FROM ?? "";
  const smsWebhook = process.env.PATISGEST_SMS_WEBHOOK_URL ?? "";
  const waWebhook = process.env.PATISGEST_WHATSAPP_WEBHOOK_URL ?? "";
  const webhookSecret = process.env.PATISGEST_WEBHOOK_SECRET ?? "";

  const canTwilioSms = Boolean(twilioSid && twilioToken && twilioSmsFrom);
  const canTwilioWa = Boolean(twilioSid && twilioToken && twilioWaFrom);
  const canWebhookSms = Boolean(smsWebhook);
  const canWebhookWa = Boolean(waWebhook);

  const results: AlertDeliveryResult[] = [];
  const meta = params.meta ?? {};

  for (const to of params.recipients) {
    if (canTwilioSms) {
      results.push(
        await sendTwilioMessage({
          accountSid: twilioSid,
          authToken: twilioToken,
          from: twilioSmsFrom,
          to,
          body: params.message,
          channel: "sms",
          fetchImpl,
          timeoutMs: options.timeoutMs,
        }),
      );
    } else if (canWebhookSms) {
      results.push(
        await sendWebhookMessage({
          webhookUrl: smsWebhook,
          secret: webhookSecret || undefined,
          channel: "sms",
          to,
          message: params.message,
          meta,
          fetchImpl,
          timeoutMs: options.timeoutMs,
        }),
      );
    }

    if (canTwilioWa) {
      results.push(
        await sendTwilioMessage({
          accountSid: twilioSid,
          authToken: twilioToken,
          from: twilioWaFrom,
          to,
          body: params.message,
          channel: "whatsapp",
          fetchImpl,
          timeoutMs: options.timeoutMs,
        }),
      );
    } else if (canWebhookWa) {
      results.push(
        await sendWebhookMessage({
          webhookUrl: waWebhook,
          secret: webhookSecret || undefined,
          channel: "whatsapp",
          to,
          message: params.message,
          meta,
          fetchImpl,
          timeoutMs: options.timeoutMs,
        }),
      );
    }
  }

  if (results.length === 0) {
    // Aucun fournisseur externe configuré : tracer en simulation pour visibilité /master.
    for (const to of params.recipients) {
      results.push({ channel: "sms", provider: "simulation", to, ok: true });
      results.push({ channel: "whatsapp", provider: "simulation", to, ok: true });
    }
    return {
      statut: "simulation",
      canaux: ["sms", "whatsapp"],
      results,
    };
  }

  const okCount = results.filter((r) => r.ok).length;
  const canaux = [...new Set(results.map((r) => r.channel))];
  const statut =
    okCount === results.length ? "envoye" : okCount > 0 ? "partiel" : "echec";
  return { statut, canaux, results };
}
