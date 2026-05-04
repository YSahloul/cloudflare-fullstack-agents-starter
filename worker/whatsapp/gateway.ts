export interface PairCodeRequest {
  phone: string;
}

export interface PairCodeResponse {
  code?: string;
  message?: string;
  status?: string;
  error?: string;
}

export interface QrResponse {
  qr?: string;
  raw?: string;
  error?: string;
  status?: string;
}

export interface GatewayActionResponse {
  id?: string;
  status?: string;
  deleted?: boolean;
  error?: string;
}

export interface GatewaySessionStatus {
  id: string;
  status: string;
  linked?: boolean;
  hasQr?: boolean;
  pairingCode?: string | null;
}

async function gatewayJson<T>(
  env: { WHATSAPP: Fetcher },
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const res = await env.WHATSAPP.fetch(`https://whatsapp.internal${path}`, {
    method: init?.method ?? "GET",
    headers: init?.body === undefined ? undefined : { "Content-Type": "application/json" },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });

  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(json.error ?? `WhatsApp gateway error: ${res.status}`);
  }
  return json;
}

export async function startGatewaySession(
  env: { WHATSAPP: Fetcher },
  sessionId: string,
): Promise<GatewaySessionStatus> {
  return gatewayJson<GatewaySessionStatus>(env, "/api/sessions", {
    method: "POST",
    body: { name: sessionId },
  });
}

export async function listGatewaySessions(env: {
  WHATSAPP: Fetcher;
}): Promise<GatewaySessionStatus[]> {
  return gatewayJson<GatewaySessionStatus[]>(env, "/api/sessions");
}

export async function getGatewaySessionStatus(
  env: { WHATSAPP: Fetcher },
  sessionId: string,
): Promise<GatewaySessionStatus> {
  return gatewayJson<GatewaySessionStatus>(env, `/api/sessions/${encodeURIComponent(sessionId)}`);
}

export async function getGatewaySessionQr(
  env: { WHATSAPP: Fetcher },
  sessionId: string,
): Promise<QrResponse> {
  return gatewayJson<QrResponse>(env, `/api/sessions/${encodeURIComponent(sessionId)}/qr`);
}

export async function requestGatewayPairCode(
  env: { WHATSAPP: Fetcher },
  sessionId: string,
  input: PairCodeRequest,
): Promise<PairCodeResponse> {
  return gatewayJson<PairCodeResponse>(
    env,
    `/api/sessions/${encodeURIComponent(sessionId)}/pair-code`,
    {
      method: "POST",
      body: input,
    },
  );
}

export async function stopGatewaySession(
  env: { WHATSAPP: Fetcher },
  sessionId: string,
): Promise<GatewayActionResponse> {
  return gatewayJson<GatewayActionResponse>(
    env,
    `/api/sessions/${encodeURIComponent(sessionId)}/stop`,
    {
      method: "POST",
    },
  );
}

export async function logoutGatewaySession(
  env: { WHATSAPP: Fetcher },
  sessionId: string,
): Promise<GatewayActionResponse> {
  return gatewayJson<GatewayActionResponse>(
    env,
    `/api/sessions/${encodeURIComponent(sessionId)}/logout`,
    {
      method: "POST",
    },
  );
}

export async function deleteGatewaySession(
  env: { WHATSAPP: Fetcher },
  sessionId: string,
): Promise<GatewayActionResponse> {
  return gatewayJson<GatewayActionResponse>(env, `/api/sessions/${encodeURIComponent(sessionId)}`, {
    method: "DELETE",
  });
}

export async function sendWhatsAppText(
  env: { WHATSAPP: Fetcher },
  session: string,
  chatId: string,
  text: string,
): Promise<void> {
  const res = await env.WHATSAPP.fetch("https://whatsapp.internal/api/sendText", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chatId, text, session }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`WhatsApp gateway error: ${res.status} ${err}`);
  }
}
