import { createFileRoute } from "@tanstack/react-router";
import {
  Loader2,
  LogOut,
  MessageSquare,
  Phone,
  Play,
  Plus,
  QrCode,
  RotateCcw,
  Smartphone,
  Square,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { PageErrorState } from "@/app/components/PageErrorState";
import { PageLoadingState } from "@/app/components/PageLoadingState";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Skeleton } from "@/app/components/ui/skeleton";
import {
  useCreateWhatsAppSessionMutation,
  useGetQrQuery,
  useListWhatsAppSessionsQuery,
  usePairCodeMutation,
  useStartSessionMutation,
  useStopSessionMutation,
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

/* ── Status helpers ──────────────────────────────────────────────────────── */

function getStatusMeta(status: string) {
  switch (status) {
    case "connected":
      return {
        label: "Connected",
        dot: "bg-green-500",
        bg: "bg-green-50 dark:bg-green-950/30",
        text: "text-green-700 dark:text-green-400",
        border: "border-green-200 dark:border-green-900",
      };
    case "connecting":
      return {
        label: "Starting",
        dot: "bg-yellow-400",
        bg: "bg-yellow-50 dark:bg-yellow-950/30",
        text: "text-yellow-700 dark:text-yellow-400",
        border: "border-yellow-200 dark:border-yellow-900",
      };
    case "qr":
      return {
        label: "Scan QR",
        dot: "bg-yellow-400",
        bg: "bg-yellow-50 dark:bg-yellow-950/30",
        text: "text-yellow-700 dark:text-yellow-400",
        border: "border-yellow-200 dark:border-yellow-900",
      };
    case "pairing":
      return {
        label: "Pairing",
        dot: "bg-blue-400",
        bg: "bg-blue-50 dark:bg-blue-950/30",
        text: "text-blue-700 dark:text-blue-400",
        border: "border-blue-200 dark:border-blue-900",
      };
    case "reconnecting":
      return {
        label: "Reconnecting",
        dot: "bg-yellow-400",
        bg: "bg-yellow-50 dark:bg-yellow-950/30",
        text: "text-yellow-700 dark:text-yellow-400",
        border: "border-yellow-200 dark:border-yellow-900",
      };
    case "stopped":
      return {
        label: "Stopped",
        dot: "bg-gray-400",
        bg: "bg-gray-50 dark:bg-gray-900/30",
        text: "text-gray-600 dark:text-gray-400",
        border: "border-gray-200 dark:border-gray-800",
      };
    case "logged_out":
      return {
        label: "Logged Out",
        dot: "bg-red-500",
        bg: "bg-red-50 dark:bg-red-950/30",
        text: "text-red-700 dark:text-red-400",
        border: "border-red-200 dark:border-red-900",
      };
    default:
      return {
        label: status || "Unknown",
        dot: "bg-gray-400",
        bg: "bg-gray-50 dark:bg-gray-900/30",
        text: "text-gray-600 dark:text-gray-400",
        border: "border-gray-200 dark:border-gray-800",
      };
  }
}

function StatusBadge({ status }: { status: string }) {
  const m = getStatusMeta(status);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${m.bg} ${m.text} ${m.border}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  );
}

/* ── Main page ───────────────────────────────────────────────────────────── */

function WhatsAppPage() {
  const { data: sessions, isLoading, isError } = useListWhatsAppSessionsQuery();
  const [newName, setNewName] = useState("");
  const create = useCreateWhatsAppSessionMutation();
  const start = useStartSessionMutation();

  const handleAdd = async () => {
    const name = newName.trim() || "WhatsApp";
    setNewName("");
    const session = await create.mutateAsync({ displayName: name });
    await start.mutateAsync(session.id);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <MessageSquare className="h-8 w-8 text-primary" />
          <h1 className="text-2xl font-bold text-foreground md:text-3xl">WhatsApp Sessions</h1>
        </div>
      </div>

      <p className="text-muted-foreground">
        Connect your WhatsApp accounts. Start a session and scan the QR code or use a pairing code.
      </p>

      {/* Add session */}
      <div className="rounded-lg border bg-card p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <Input
            type="text"
            placeholder="Session name (optional)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            className="max-w-xs"
          />
          <Button onClick={handleAdd} disabled={create.isPending || start.isPending}>
            {create.isPending || start.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            Add & Start
          </Button>
        </div>
      </div>

      {/* List */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="rounded-lg border bg-card p-5">
              <Skeleton className="mb-2 h-5 w-1/4" />
              <Skeleton className="h-4 w-1/3" />
            </div>
          ))}
        </div>
      )}

      {isError && (
        <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
          <p className="text-sm text-destructive">Failed to load sessions. Please try again.</p>
        </div>
      )}

      {!isLoading && !isError && sessions && sessions.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed bg-card p-12 text-center">
          <Smartphone className="mb-4 h-12 w-12 text-muted-foreground" />
          <h3 className="mb-2 text-lg font-semibold text-card-foreground">No Sessions</h3>
          <p className="text-sm text-muted-foreground">
            Add a session to connect your WhatsApp account.
          </p>
        </div>
      )}

      {!isLoading && !isError && sessions && sessions.length > 0 && (
        <div className="space-y-4">
          {sessions.map((s) => (
            <SessionCard key={s.id} session={s} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Session card ────────────────────────────────────────────────────────── */

function SessionCard({
  session,
}: {
  session: { id: string; displayName: string; status: string };
}) {
  const meta = getStatusMeta(session.status);
  const isRunning = ["connected", "connecting", "qr", "pairing", "reconnecting"].includes(
    session.status,
  );
  const [showQr, setShowQr] = useState(false);
  const [phone, setPhone] = useState("");
  const [pairCode, setPairCode] = useState<string | null>(null);
  const { data: qrData, isFetching: qrLoading } = useGetQrQuery(showQr ? session.id : "");
  const pair = usePairCodeMutation();
  const start = useStartSessionMutation();
  const stop = useStopSessionMutation();

  const needsStart = ["stopped", "logged_out", "disconnected"].includes(session.status);
  const canConnect = ["connecting", "qr", "pairing", "reconnecting"].includes(session.status);
  const isPairing = session.status === "pairing";

  return (
    <div className="rounded-lg border bg-card shadow-sm overflow-hidden">
      {/* Card header */}
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-lg border ${meta.bg} ${meta.border}`}
          >
            <Smartphone className={`h-5 w-5 ${meta.text}`} />
          </div>
          <div>
            <p className="font-medium">{session.displayName}</p>
            <p className="text-xs text-muted-foreground font-mono">{session.id}</p>
          </div>
        </div>
        <StatusBadge status={session.status} />
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2 px-5 pb-4">
        {!isRunning ? (
          <Button size="sm" onClick={() => start.mutate(session.id)} disabled={start.isPending}>
            <Play className="mr-1.5 h-3.5 w-3.5" />
            Start
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={() => stop.mutate(session.id)}
            disabled={stop.isPending}
          >
            <Square className="mr-1.5 h-3.5 w-3.5" />
            Stop
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={() => start.mutate(session.id)}
          disabled={start.isPending}
        >
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
          Restart
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={async () => {
            await fetch(`/api/whatsapp/sessions/${session.id}/logout`, { method: "POST" });
            window.location.reload();
          }}
        >
          <LogOut className="mr-1.5 h-3.5 w-3.5" />
          Logout
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={async () => {
            if (!confirm("Delete this session?")) {
              return;
            }
            await fetch(`/api/whatsapp/sessions/${session.id}`, { method: "DELETE" });
            window.location.reload();
          }}
        >
          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
          Delete
        </Button>
      </div>

      {/* QR / Pair section */}
      {(needsStart || canConnect) && (
        <div className="border-t bg-muted/30 px-5 py-5 space-y-5">
          {/* QR */}
          <div>
            <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
              <QrCode className="h-3.5 w-3.5" />
              QR Code
            </h4>
            <p className="text-xs text-muted-foreground mb-2">
              WhatsApp → Linked Devices → Link a Device
            </p>
            {!showQr ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowQr(true)}
                disabled={needsStart}
              >
                <QrCode className="mr-1.5 h-3.5 w-3.5" />
                {needsStart ? "Start session first" : "Show QR"}
              </Button>
            ) : (
              <div className="space-y-2">
                {qrLoading && !qrData?.qr && (
                  <div className="flex h-48 w-48 items-center justify-center rounded-lg border bg-background">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                )}
                {qrData?.qr && (
                  <img
                    src={qrData.qr}
                    alt="WhatsApp QR"
                    className="h-48 w-48 rounded-lg border bg-white p-2"
                  />
                )}
                {qrData?.error && !qrData.qr && (
                  <p className="text-sm text-muted-foreground">Waiting for QR code...</p>
                )}
                <Button size="sm" variant="outline" onClick={() => setShowQr(false)}>
                  Hide QR
                </Button>
              </div>
            )}
          </div>

          {/* Pair code */}
          <div>
            <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5" />
              Pair with Phone
            </h4>
            <div className="flex gap-2 max-w-sm">
              <Input
                type="tel"
                placeholder="12145551234"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              <Button
                size="sm"
                disabled={pair.isPending || !phone.trim()}
                onClick={async () => {
                  const result = await pair.mutateAsync({ id: session.id, phone: phone.trim() });
                  setPairCode(result.code ?? null);
                }}
              >
                {pair.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Get Code"}
              </Button>
            </div>
            {pairCode && (
              <div className="mt-3 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 p-3 text-center max-w-sm">
                <p className="text-xs text-green-700 dark:text-green-400 mb-1">Enter in WhatsApp</p>
                <p className="font-mono text-2xl font-bold tracking-[0.2em] text-green-700 dark:text-green-400">
                  {pairCode.match(/.{1,4}/g)?.join("-")}
                </p>
              </div>
            )}
            {isPairing && !pairCode && (
              <p className="mt-2 text-sm text-yellow-600 flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" />
                Waiting for pairing code...
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
