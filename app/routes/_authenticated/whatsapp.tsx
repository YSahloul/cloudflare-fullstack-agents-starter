import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, MessageSquare, RefreshCcw, Smartphone } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PageErrorState } from "@/app/components/PageErrorState";
import { PageLoadingState } from "@/app/components/PageLoadingState";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Skeleton } from "@/app/components/ui/skeleton";
import {
  listWhatsAppSessionsQueryOptions,
  useGetQrQuery,
  useGetWhatsAppSessionQuery,
  useListWhatsAppSessionsQuery,
  WHATSAPP_KEY,
} from "@/app/lib/queries/whatsapp";

export const Route = createFileRoute("/_authenticated/whatsapp")({
  component: WhatsAppPage,
  pendingComponent: () => <PageLoadingState message="Loading WhatsApp sessions..." />,
  errorComponent: ({ error, reset }) => (
    <PageErrorState
      title="Error Loading WhatsApp"
      message={error instanceof Error ? error.message : "Failed to load sessions"}
      onRetry={reset}
      backTo="/dashboard"
      backLabel="Go to Dashboard"
    />
  ),
});

function badgeClass(status: string) {
  if (status === "connected") {
    return "bg-green-500/10 text-green-700 border-green-500/20 dark:text-green-400";
  }

  if (
    status === "qr" ||
    status === "pairing" ||
    status === "connecting" ||
    status === "reconnecting"
  ) {
    return "bg-yellow-500/10 text-yellow-700 border-yellow-500/20 dark:text-yellow-400";
  }

  return "bg-muted text-muted-foreground border-border";
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${badgeClass(status)}`}
    >
      {status || "stopped"}
    </span>
  );
}

function formatPairCode(code: string) {
  if (code.length === 8) {
    return `${code.slice(0, 4)}-${code.slice(4)}`;
  }

  return code;
}

function WhatsAppPage() {
  const qc = useQueryClient();
  const { data: sessions, isLoading, isError } = useListWhatsAppSessionsQuery();

  const [sid, setSid] = useState("default");
  const [phone, setPhone] = useState("");
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [localPairCode, setLocalPairCode] = useState<string | null>(null);
  const [isStopping, setIsStopping] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  const activeSessionQuery = useGetWhatsAppSessionQuery(activeSessionId ?? "");
  const activeSession = activeSessionQuery.data;

  const showQr = activeSession?.status === "qr";
  const qrQuery = useGetQrQuery(showQr && activeSession ? activeSession.id : "");

  useEffect(() => {
    if (!activeSessionId) {
      setLocalPairCode(null);
      return;
    }

    if (activeSession?.pairingCode) {
      setLocalPairCode(activeSession.pairingCode);
      return;
    }

    if (activeSession?.status === "connected") {
      setLocalPairCode(null);
    }
  }, [activeSession?.pairingCode, activeSession?.status, activeSessionId]);

  useEffect(() => {
    if (!activeSessionId) {
      return;
    }

    if (activeSession?.status === "connected" || activeSession?.status === "stopped") {
      return;
    }

    const timer = window.setTimeout(() => {
      void qc.invalidateQueries({ queryKey: [WHATSAPP_KEY, "sessions"] });
      void qc.invalidateQueries({ queryKey: [WHATSAPP_KEY, "session", activeSessionId] });
      void qc.invalidateQueries({ queryKey: [WHATSAPP_KEY, "qr", activeSessionId] });
    }, 2000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [activeSession?.status, activeSessionId, qc]);

  const activeSessionPairCode = useMemo(() => {
    if (activeSession?.pairingCode) {
      return activeSession.pairingCode;
    }

    return localPairCode;
  }, [activeSession?.pairingCode, localPairCode]);

  const visibleSessions = useMemo(() => {
    if (!activeSessionId) {
      return sessions ?? [];
    }

    return sessions?.filter((session) => session.id !== activeSessionId) ?? [];
  }, [activeSessionId, sessions]);

  function setCachedSessionStatus(sessionId: string, status: string) {
    qc.setQueryData([WHATSAPP_KEY, "session", sessionId], (old: typeof activeSession) =>
      old ? { ...old, status } : old,
    );
    qc.setQueryData([WHATSAPP_KEY, "sessions"], (old: typeof sessions) =>
      old?.map((session) => (session.id === sessionId ? { ...session, status } : session)),
    );
  }

  async function refresh(sessionId = activeSessionId) {
    await qc.invalidateQueries({ queryKey: [WHATSAPP_KEY, "sessions"] });
    if (sessionId) {
      await qc.invalidateQueries({ queryKey: [WHATSAPP_KEY, "session", sessionId] });
      await qc.invalidateQueries({ queryKey: [WHATSAPP_KEY, "qr", sessionId] });
    }
  }

  async function refreshAndResolveSession(sessionName: string) {
    const refreshedSessions = await qc.fetchQuery(listWhatsAppSessionsQueryOptions());
    return refreshedSessions.find(
      (session) => session.id === sessionName || session.displayName === sessionName,
    );
  }

  async function handleStart(usePair: boolean) {
    const sessionName = sid.trim();
    const cleanPhone = phone.replace(/\D/g, "");
    setError("");
    setActionMessage("");

    if (!sessionName) {
      return;
    }

    if (usePair && !cleanPhone) {
      setError("Phone number required for pairing.");
      return;
    }

    try {
      setLocalPairCode(null);

      if (usePair) {
        setActionMessage("Requesting pair code...");
        const response = await fetch(
          `/api/tenants/${encodeURIComponent(sessionName)}/whatsapp/pair`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ phone: cleanPhone }),
          },
        );
        const result = (await response.json().catch(() => ({}))) as {
          code?: string;
          message?: string;
          status?: string;
          error?: string;
        };

        if (!response.ok) {
          throw new Error(result.error ?? "Failed to request pair code");
        }

        const session = await refreshAndResolveSession(sessionName);
        if (session) {
          setActiveSessionId(session.id);
          setCachedSessionStatus(session.id, result.status ?? "pairing");
        }

        if (result.code) {
          setLocalPairCode(result.code);
          setActionMessage("Pair code ready.");
        } else {
          setActionMessage(result.message ?? result.status ?? "Pair code requested.");
        }
      } else {
        setActionMessage("Starting connection...");
        const response = await fetch(
          `/api/tenants/${encodeURIComponent(sessionName)}/whatsapp/session`,
          {
            method: "POST",
          },
        );
        const result = (await response.json().catch(() => ({}))) as {
          id?: string;
          status?: string;
        };

        if (!response.ok) {
          throw new Error("Failed to start session");
        }

        const session = result.id
          ? await refreshAndResolveSession(result.id)
          : await refreshAndResolveSession(sessionName);

        if (session) {
          setActiveSessionId(session.id);
          setCachedSessionStatus(session.id, result.status ?? "connecting");
          await refresh(session.id);
        }
      }
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : String(caughtError);
      setError(message);
    }
  }

  async function handleStop(sessionId: string) {
    setIsStopping(true);
    setError("");
    setActionMessage("Stopping...");
    setCachedSessionStatus(sessionId, "stopped");
    try {
      const res = await fetch(`/api/whatsapp/sessions/${sessionId}/stop`, { method: "POST" });
      if (!res.ok) {
        throw new Error("Failed to stop session");
      }
      setActionMessage("Stopped.");
      await refresh(sessionId);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : String(caughtError));
    } finally {
      setIsStopping(false);
    }
  }

  async function handleLogout(sessionId: string) {
    setIsLoggingOut(true);
    setError("");
    setActionMessage("Logging out...");
    setCachedSessionStatus(sessionId, "logged_out");
    try {
      const res = await fetch(`/api/whatsapp/sessions/${sessionId}/logout`, { method: "POST" });
      if (!res.ok) {
        throw new Error("Failed to logout session");
      }
      setLocalPairCode(null);
      setActionMessage("Logged out.");
      await refresh(sessionId);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : String(caughtError));
    } finally {
      setIsLoggingOut(false);
    }
  }

  async function handleDelete(sessionId: string) {
    if (!confirm(`Delete ${sessionId}?`)) {
      return;
    }

    setIsDeleting(sessionId);
    setError("");
    setActionMessage("Deleting...");
    try {
      const res = await fetch(`/api/whatsapp/sessions/${sessionId}`, { method: "DELETE" });
      if (!res.ok) {
        throw new Error("Failed to delete session");
      }
      if (activeSessionId === sessionId) {
        setActiveSessionId(null);
        setLocalPairCode(null);
      }
      setActionMessage("Deleted.");
      await refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : String(caughtError));
    } finally {
      setIsDeleting(null);
    }
  }

  async function pickSession(sessionId: string) {
    setActiveSessionId(sessionId);
    setSid(sessionId);
    setError("");
    setLocalPairCode(null);
    await qc.invalidateQueries({ queryKey: [WHATSAPP_KEY, "session", sessionId] });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-6 w-6 text-primary" />
        <h1 className="text-xl font-semibold">WhatsApp Gateway</h1>
      </div>

      <div className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row">
          <Input
            placeholder="session id (e.g. tenant-slug)"
            value={sid}
            onChange={(event) => setSid(event.target.value)}
          />
          <Button
            onClick={() => void handleStart(false)}
          >
            Start / Connect
          </Button>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            placeholder="+12145551234 (optional, for pair code)"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
          <Button
            variant="outline"
            onClick={() => void handleStart(true)}
          >
            Pair by phone
          </Button>
        </div>

        {actionMessage ? (
          <p className="mt-3 text-sm text-muted-foreground">{actionMessage}</p>
        ) : null}
        {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
      </div>

      {activeSessionId ? (
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          {actionMessage ? (
            <p className="mb-3 text-sm text-muted-foreground">{actionMessage}</p>
          ) : null}
          {error ? <p className="mb-3 text-sm text-destructive">{error}</p> : null}
          {activeSessionQuery.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : activeSession ? (
            <div>
              <div className="mb-4 flex items-center gap-2">
                <strong>{activeSession.id}</strong>
                <StatusBadge status={activeSession.status} />
                <div className="flex-1" />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleLogout(activeSession.id)}
                  disabled={isLoggingOut}
                >
                  {isLoggingOut ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
                  Logout
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleStop(activeSession.id)}
                  disabled={isStopping}
                >
                  {isStopping ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
                  Stop
                </Button>
                <Button size="sm" asChild>
                  <a href={`/agents?whatsappSession=${encodeURIComponent(activeSession.id)}`}>
                    Configure in Agents
                  </a>
                </Button>
              </div>

              {activeSessionPairCode && activeSession.status !== "connected" ? (
                <div>
                  <div className="rounded-lg bg-background px-4 py-6 text-center font-mono text-3xl font-semibold tracking-[0.25em] text-green-600 dark:text-green-400">
                    {formatPairCode(activeSessionPairCode)}
                  </div>
                  <p className="mt-2 text-center text-sm text-muted-foreground">
                    WhatsApp → Linked Devices → Link with phone number → enter this code
                  </p>
                </div>
              ) : activeSession.status === "qr" ? (
                <div className="text-center">
                  {qrQuery.data?.qr ? (
                    <img
                      src={qrQuery.data.qr}
                      alt="WhatsApp QR"
                      className="mx-auto h-60 w-60 rounded-lg border bg-white p-2"
                    />
                  ) : (
                    <div className="mx-auto flex h-60 w-60 items-center justify-center rounded-lg border bg-background">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  )}
                  <p className="mt-2 text-sm text-muted-foreground">
                    Open WhatsApp → Linked Devices → Link a Device
                  </p>
                </div>
              ) : activeSession.status === "connected" ? (
                <p className="text-sm text-muted-foreground">✅ Linked and receiving messages.</p>
              ) : (
                <p className="text-sm text-muted-foreground">Status: {activeSession.status}…</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No active session selected.</p>
          )}
        </div>
      ) : null}

      <div className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <strong>{activeSessionId ? "Other sessions" : "All sessions"}</strong>
          <Button variant="outline" size="sm" onClick={() => void refresh()}>
            <RefreshCcw className="mr-2 h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : isError ? (
          <p className="text-sm text-destructive">Failed to load sessions.</p>
        ) : !sessions?.length ? (
          <p className="text-sm text-muted-foreground">No sessions yet.</p>
        ) : !visibleSessions.length ? (
          <p className="text-sm text-muted-foreground">No other sessions.</p>
        ) : (
          <div className="space-y-2">
            {visibleSessions.map((session) => (
              <div
                key={session.id}
                className="flex items-center justify-between border-t pt-2 first:border-t-0 first:pt-0"
              >
                <div className="flex items-center gap-2">
                  <Smartphone className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{session.id}</span>
                  <StatusBadge status={session.status} />
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => void pickSession(session.id)}>
                    Manage
                  </Button>
                  <Button size="sm" asChild>
                    <a href={`/agents?whatsappSession=${encodeURIComponent(session.id)}`}>
                      Configure in Agents
                    </a>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleDelete(session.id)}
                    disabled={isDeleting === session.id}
                  >
                    {isDeleting === session.id ? (
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    ) : null}
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
