import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2, MessageSquareText } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PageErrorState } from "@/app/components/PageErrorState";
import { PageLoadingState } from "@/app/components/PageLoadingState";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import {
  useCreatePersonalAgentMutation,
  useListPersonalAgentsQuery,
  useUpdatePersonalAgentMutation,
} from "@/app/lib/queries/personal-agents";
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
  const agentsQuery = useListPersonalAgentsQuery();
  const updateSession = useUpdateWhatsAppSessionMutation();
  const updateAgent = useUpdatePersonalAgentMutation();
  const createAgent = useCreatePersonalAgentMutation();
  const session = sessionQuery.data;
  const agents = agentsQuery.data ?? [];
  const [message, setMessage] = useState("");
  const [newAgentName, setNewAgentName] = useState("WhatsApp Assistant");
  const [rules, setRules] = useState({
    agentId: "",
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

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === rules.agentId) ?? null,
    [agents, rules.agentId],
  );

  useEffect(() => {
    if (!session) {
      return;
    }

    setRules({
      agentId: session.agentId ?? "",
      autoReply: session.autoReply ?? true,
      dmPolicy: session.dmPolicy ?? "always",
      groupPolicy: session.groupPolicy ?? "mention",
    });
    setMessage("");
  }, [session]);

  useEffect(() => {
    if (!selectedAgent) {
      setAgentConfig({
        agentName: "",
        systemPrompt: "",
        model: "gpt-4.1-mini",
        temperature: "20",
        maxTokens: "900",
      });
      return;
    }

    setAgentConfig({
      agentName: selectedAgent.agentName,
      systemPrompt: selectedAgent.systemPrompt ?? "",
      model: selectedAgent.model ?? "gpt-4.1-mini",
      temperature: String(selectedAgent.temperature ?? 20),
      maxTokens: String(selectedAgent.maxTokens ?? 900),
    });
  }, [selectedAgent]);

  async function handleCreateAgent() {
    const agentName = newAgentName.trim();
    if (!agentName) {
      setMessage("Agent name is required.");
      return;
    }

    setMessage("");

    try {
      const agent = await createAgent.mutateAsync({ agentName });
      setRules((current) => ({ ...current, agentId: agent.id }));
      setMessage("Agent created. Save to assign it to this WhatsApp session.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleSave() {
    if (!session) {
      return;
    }

    setMessage("");

    try {
      await updateSession.mutateAsync({
        id: session.id,
        data: {
          agentId: rules.agentId || null,
          autoReply: rules.autoReply,
          dmPolicy: rules.dmPolicy,
          groupPolicy: rules.groupPolicy,
        },
      });

      if (selectedAgent) {
        await updateAgent.mutateAsync({
          id: selectedAgent.id,
          agentName: agentConfig.agentName,
          systemPrompt: agentConfig.systemPrompt || null,
          model: agentConfig.model,
          temperature: Number(agentConfig.temperature),
          maxTokens: Number(agentConfig.maxTokens),
        });
      }

      setMessage("Saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  if (sessionQuery.isLoading || agentsQuery.isLoading) {
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
            <h1 className="text-2xl font-semibold">WhatsApp agent assignment</h1>
            <p className="text-sm text-muted-foreground">Session: {session.id}</p>
          </div>
        </div>
        <Button variant="outline" asChild>
          <Link to="/whatsapp">Back</Link>
        </Button>
      </div>

      <div className="space-y-5 rounded-xl border bg-card p-5 shadow-sm">
        <div className="space-y-3 rounded-lg border bg-background p-4">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="agentId">
              Assigned agent
            </label>
            <select
              id="agentId"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={rules.agentId}
              onChange={(event) =>
                setRules((current) => ({ ...current, agentId: event.target.value }))
              }
            >
              <option value="">No agent assigned - capture only</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.agentName}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={newAgentName}
              onChange={(event) => setNewAgentName(event.target.value)}
              placeholder="New agent name"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleCreateAgent()}
              disabled={createAgent.isPending}
            >
              {createAgent.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Create agent
            </Button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
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

          <div className="text-sm text-muted-foreground">
            No assigned agent means capture only, no replies.
          </div>

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

        {selectedAgent ? (
          <div className="space-y-4 border-t pt-5">
            <div className="space-y-2">
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
          </div>
        ) : null}

        <div className="flex items-center gap-3">
          <Button
            onClick={() => void handleSave()}
            disabled={updateSession.isPending || updateAgent.isPending || createAgent.isPending}
          >
            {updateSession.isPending || updateAgent.isPending ? (
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
