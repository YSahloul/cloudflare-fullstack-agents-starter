import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { Loader2, MessageSquareText } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PageErrorState } from "@/app/components/PageErrorState";
import { PageLoadingState } from "@/app/components/PageLoadingState";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import {
  usePersonalAgentQuery,
  useUpdatePersonalAgentMutation,
} from "@/app/lib/queries/personal-agents";
import {
  useListWhatsAppSessionsQuery,
  useUpdateWhatsAppSessionMutation,
} from "@/app/lib/queries/whatsapp";

export const Route = createFileRoute("/_authenticated/agents/$id/whatsapp")({
  validateSearch: z.object({
    sessionId: z.string().optional(),
  }),
  component: AgentWhatsAppPage,
  pendingComponent: () => <PageLoadingState message="Loading WhatsApp config..." />,
  errorComponent: ({ error, reset }) => (
    <PageErrorState
      title="Error Loading WhatsApp Config"
      message={error instanceof Error ? error.message : "Failed to load WhatsApp config"}
      onRetry={reset}
      backTo="/agents"
      backLabel="Back to Agents"
    />
  ),
});

function AgentWhatsAppPage() {
  const { id } = Route.useParams();
  const { sessionId: requestedSessionId } = Route.useSearch();
  const agentQuery = usePersonalAgentQuery(id);
  const sessionsQuery = useListWhatsAppSessionsQuery();
  const updateAgent = useUpdatePersonalAgentMutation();
  const updateSession = useUpdateWhatsAppSessionMutation();
  const agent = agentQuery.data;
  const sessions = sessionsQuery.data ?? [];
  const assignedSession = useMemo(
    () => sessions.find((session) => session.agentId === id) ?? null,
    [id, sessions],
  );

  const [message, setMessage] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [channelRules, setChannelRules] = useState({
    autoReply: true,
    dmPolicy: "always",
    groupPolicy: "mention",
  });
  const [agentConfig, setAgentConfig] = useState({
    agentName: "",
    systemPrompt: "",
    model: "gpt-4.1-mini",
    temperature: "20",
    maxTokens: "900",
  });

  useEffect(() => {
    if (!agent) {
      return;
    }

    setAgentConfig({
      agentName: agent.agentName,
      systemPrompt: agent.systemPrompt ?? "",
      model: agent.model ?? "gpt-4.1-mini",
      temperature: String(agent.temperature ?? 20),
      maxTokens: String(agent.maxTokens ?? 900),
    });
  }, [agent]);

  useEffect(() => {
    const preferredSession = sessions.find((session) => session.id === requestedSessionId) ?? assignedSession;
    setSessionId(preferredSession?.id ?? "");
    setChannelRules({
      autoReply: preferredSession?.autoReply ?? true,
      dmPolicy: preferredSession?.dmPolicy ?? "always",
      groupPolicy: preferredSession?.groupPolicy ?? "mention",
    });
    setMessage("");
  }, [assignedSession, requestedSessionId, sessions]);

  async function handleSave() {
    if (!agent) {
      return;
    }

    setMessage("");

    try {
      await updateAgent.mutateAsync({
        id: agent.id,
        agentName: agentConfig.agentName,
        systemPrompt: agentConfig.systemPrompt || null,
        model: agentConfig.model,
        temperature: Number(agentConfig.temperature),
        maxTokens: Number(agentConfig.maxTokens),
      });

      const currentlyAssigned = sessions.filter((session) => session.agentId === agent.id);
      for (const session of currentlyAssigned) {
        if (session.id === sessionId) {
          continue;
        }

        await updateSession.mutateAsync({
          id: session.id,
          data: { agentId: null },
        });
      }

      if (sessionId) {
        await updateSession.mutateAsync({
          id: sessionId,
          data: {
            agentId: agent.id,
            autoReply: channelRules.autoReply,
            dmPolicy: channelRules.dmPolicy,
            groupPolicy: channelRules.groupPolicy,
          },
        });
      }

      setMessage("Saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  if (agentQuery.isLoading || sessionsQuery.isLoading) {
    return <PageLoadingState message="Loading WhatsApp config..." />;
  }

  if (!agent) {
    return (
      <PageErrorState
        title="Agent Not Found"
        message="The agent could not be found."
        backTo="/agents"
        backLabel="Back to Agents"
      />
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <MessageSquareText className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-semibold">WhatsApp config</h1>
            <p className="text-sm text-muted-foreground">Agent: {agent.agentName}</p>
          </div>
        </div>
        <Button variant="outline" asChild>
          <Link to="/agents/$id" params={{ id: agent.id }}>
            Back to Agent
          </Link>
        </Button>
      </div>

      <div className="space-y-5 rounded-xl border bg-card p-5 shadow-sm">
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="sessionId">
            WhatsApp session
          </label>
          <select
            id="sessionId"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            value={sessionId}
            onChange={(event) => setSessionId(event.target.value)}
          >
            <option value="">No WhatsApp session assigned</option>
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.displayName} ({session.status})
              </option>
            ))}
          </select>
          <p className="text-sm text-muted-foreground">
            Connect WhatsApp accounts on the WhatsApp page. Configure which one this agent should
            use here.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={channelRules.autoReply}
              onChange={(event) =>
                setChannelRules((current) => ({ ...current, autoReply: event.target.checked }))
              }
            />
            Auto-reply
          </label>

          <div className="text-sm text-muted-foreground">
            These WhatsApp channel rules live on the session assignment, not in the container.
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="dmPolicy">
              DM policy
            </label>
            <select
              id="dmPolicy"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={channelRules.dmPolicy}
              onChange={(event) =>
                setChannelRules((current) => ({ ...current, dmPolicy: event.target.value }))
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
              value={channelRules.groupPolicy}
              onChange={(event) =>
                setChannelRules((current) => ({ ...current, groupPolicy: event.target.value }))
              }
            >
              <option value="mention">Reply when mentioned or commanded</option>
              <option value="always">Reply to all group messages</option>
              <option value="disabled">Do not reply in groups</option>
            </select>
          </div>
        </div>

        <div className="space-y-2 border-t pt-5">
          <label className="text-sm font-medium" htmlFor="agentName">
            Agent name
          </label>
          <Input
            id="agentName"
            value={agentConfig.agentName}
            onChange={(event) =>
              setAgentConfig((current) => ({ ...current, agentName: event.target.value }))
            }
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="systemPrompt">
            System prompt
          </label>
          <textarea
            id="systemPrompt"
            className="min-h-36 w-full rounded-md border bg-background px-3 py-2 text-sm"
            value={agentConfig.systemPrompt}
            onChange={(event) =>
              setAgentConfig((current) => ({ ...current, systemPrompt: event.target.value }))
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
              value={agentConfig.model}
              onChange={(event) =>
                setAgentConfig((current) => ({ ...current, model: event.target.value }))
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
              value={agentConfig.temperature}
              onChange={(event) =>
                setAgentConfig((current) => ({ ...current, temperature: event.target.value }))
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
              value={agentConfig.maxTokens}
              onChange={(event) =>
                setAgentConfig((current) => ({ ...current, maxTokens: event.target.value }))
              }
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            onClick={() => void handleSave()}
            disabled={updateAgent.isPending || updateSession.isPending}
          >
            {updateAgent.isPending || updateSession.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Save
          </Button>
          {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
        </div>
      </div>
    </div>
  );
}
