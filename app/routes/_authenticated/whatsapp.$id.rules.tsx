import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2, MessageSquareText } from "lucide-react";
import { useEffect, useState } from "react";
import { PageErrorState } from "@/app/components/PageErrorState";
import { PageLoadingState } from "@/app/components/PageLoadingState";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import {
  useGetWhatsAppSessionQuery,
  useUpdateWhatsAppSessionMutation,
} from "@/app/lib/queries/whatsapp";

export const Route = createFileRoute("/_authenticated/whatsapp/$id/rules")({
  component: WhatsAppRulesPage,
  pendingComponent: () => <PageLoadingState message="Loading WhatsApp rules..." />,
  errorComponent: ({ error, reset }) => (
    <PageErrorState
      title="Error Loading WhatsApp Rules"
      message={error instanceof Error ? error.message : "Failed to load WhatsApp rules"}
      onRetry={reset}
      backTo="/whatsapp"
      backLabel="Back to WhatsApp"
    />
  ),
});

function WhatsAppRulesPage() {
  const { id } = Route.useParams();
  const sessionQuery = useGetWhatsAppSessionQuery(id);
  const updateSession = useUpdateWhatsAppSessionMutation();
  const session = sessionQuery.data;
  const [message, setMessage] = useState("");
  const [rules, setRules] = useState({
    autoReply: true,
    dmPolicy: "always",
    groupPolicy: "mention",
    systemPrompt: "",
    model: "gpt-4.1-mini",
    temperature: "20",
    maxTokens: "900",
  });

  useEffect(() => {
    if (!session) {
      return;
    }

    setRules({
      autoReply: session.autoReply ?? true,
      dmPolicy: session.dmPolicy ?? "always",
      groupPolicy: session.groupPolicy ?? "mention",
      systemPrompt: session.systemPrompt ?? "",
      model: session.model ?? "gpt-4.1-mini",
      temperature: String(session.temperature ?? 20),
      maxTokens: String(session.maxTokens ?? 900),
    });
    setMessage("");
  }, [session]);

  async function handleSave() {
    if (!session) {
      return;
    }

    setMessage("");

    try {
      await updateSession.mutateAsync({
        id: session.id,
        data: {
          autoReply: rules.autoReply,
          dmPolicy: rules.dmPolicy,
          groupPolicy: rules.groupPolicy,
          systemPrompt: rules.systemPrompt || null,
          model: rules.model,
          temperature: Number(rules.temperature),
          maxTokens: Number(rules.maxTokens),
        },
      });
      setMessage("Saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  if (sessionQuery.isLoading) {
    return <PageLoadingState message="Loading WhatsApp rules..." />;
  }

  if (!session) {
    return (
      <PageErrorState
        title="Session Not Found"
        message="The WhatsApp session could not be found."
        backTo="/whatsapp"
        backLabel="Back to WhatsApp"
      />
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <MessageSquareText className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-semibold">WhatsApp bot rules</h1>
            <p className="text-sm text-muted-foreground">Session: {session.id}</p>
          </div>
        </div>
        <Button variant="outline" asChild>
          <Link to="/whatsapp">Back</Link>
        </Button>
      </div>

      <div className="rounded-xl border bg-card p-5 shadow-sm space-y-5">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={rules.autoReply}
            onChange={(event) =>
              setRules((current) => ({ ...current, autoReply: event.target.checked }))
            }
          />
          Auto-reply
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="dmPolicy">
              DM policy
            </label>
            <select
              id="dmPolicy"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={rules.dmPolicy}
              onChange={(event) =>
                setRules((current) => ({ ...current, dmPolicy: event.target.value }))
              }
            >
              <option value="always">Reply to DMs</option>
              <option value="disabled">Do not reply to DMs</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="groupPolicy">
              Group policy
            </label>
            <select
              id="groupPolicy"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={rules.groupPolicy}
              onChange={(event) =>
                setRules((current) => ({ ...current, groupPolicy: event.target.value }))
              }
            >
              <option value="mention">Reply when mentioned or commanded</option>
              <option value="always">Reply to all group messages</option>
              <option value="disabled">Do not reply in groups</option>
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="systemPrompt">
            System prompt
          </label>
          <textarea
            id="systemPrompt"
            className="min-h-36 w-full rounded-md border bg-background px-3 py-2 text-sm"
            value={rules.systemPrompt}
            onChange={(event) =>
              setRules((current) => ({ ...current, systemPrompt: event.target.value }))
            }
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="model">
              Model
            </label>
            <Input
              id="model"
              value={rules.model}
              onChange={(event) =>
                setRules((current) => ({ ...current, model: event.target.value }))
              }
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="temperature">
              Temperature
            </label>
            <Input
              id="temperature"
              type="number"
              min="0"
              max="100"
              value={rules.temperature}
              onChange={(event) =>
                setRules((current) => ({ ...current, temperature: event.target.value }))
              }
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="maxTokens">
              Max tokens
            </label>
            <Input
              id="maxTokens"
              type="number"
              min="1"
              value={rules.maxTokens}
              onChange={(event) =>
                setRules((current) => ({ ...current, maxTokens: event.target.value }))
              }
            />
          </div>
        </div>

        <div className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
          Webhooks are always captured into the conversation Durable Object first. These rules only
          decide whether the bot replies after capture.
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={() => void handleSave()} disabled={updateSession.isPending}>
            {updateSession.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save rules
          </Button>
          {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
        </div>
      </div>
    </div>
  );
}
