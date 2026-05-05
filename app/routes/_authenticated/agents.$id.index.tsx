import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useAgentChat } from "agents/ai-react";
import {
  ArrowLeft,
  Bot,
  ExternalLink,
  Loader2,
  MessageSquareText,
  Pencil,
  Plug,
  Send,
  Trash2,
  Wrench,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Markdown } from "@/app/components/Markdown";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Skeleton } from "@/app/components/ui/skeleton";
import { useHandler } from "@/app/hooks/useHandler";
import { useAgentConnection } from "@/app/lib/agent-state";
import {
  useDeletePersonalAgentMutation,
  usePersonalAgentQuery,
  useUpdatePersonalAgentMutation,
} from "@/app/lib/queries/personal-agents";

export const Route = createFileRoute("/_authenticated/agents/$id/")({
  component: AgentDetails,
});

function AgentDetails() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { data: agent, isLoading, isError } = usePersonalAgentQuery(id);
  const deleteAgentMutation = useDeletePersonalAgentMutation();
  const updateAgentMutation = useUpdatePersonalAgentMutation();
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [mcpServerName, setMcpServerName] = useState("");
  const [mcpServerUrl, setMcpServerUrl] = useState("");
  const [mcpHeadersText, setMcpHeadersText] = useState("{}");
  const [mcpFeedback, setMcpFeedback] = useState<string | null>(null);
  const [isMcpSubmitting, setIsMcpSubmitting] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { agent: agentConnection, mcpState, servers, tools } = useAgentConnection({ agentId: id });
  const chat = useAgentChat({
    agent: agentConnection,
  });

  const toolsByServerId = useMemo(() => {
    const grouped = new Map<string, typeof tools>();

    for (const tool of tools) {
      const existingTools = grouped.get(tool.serverId) ?? [];
      existingTools.push(tool);
      grouped.set(tool.serverId, existingTools);
    }

    return grouped;
  }, [tools]);

  const scrollToBottom = useHandler(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: we want to scroll to the bottom of the messages when the messages change
  useEffect(() => {
    scrollToBottom();
  }, [chat.messages, scrollToBottom]);

  useEffect(() => {
    if (agent) {
      setEditName(agent.agentName);
    }
  }, [agent]);

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this agent?")) {
      return;
    }

    try {
      await deleteAgentMutation.mutateAsync(id);
      navigate({ to: "/agents" });
    } catch {
      // Error is already handled by the mutation state
    }
  };

  const handleRename = async () => {
    if (!editName.trim() || editName === agent?.agentName) {
      setIsEditingName(false);
      return;
    }

    try {
      await updateAgentMutation.mutateAsync({
        id,
        agentName: editName.trim(),
      });
      setIsEditingName(false);
    } catch {
      // Error is already handled by the mutation state
    }
  };

  const handleSendMessage = () => {
    if (!inputValue.trim() || chat.status === "streaming" || chat.status === "submitted") {
      return;
    }

    chat.sendMessage({
      role: "user",
      parts: [
        {
          type: "text",
          text: inputValue.trim(),
        },
      ],
    });

    setInputValue("");
  };

  function parseMcpHeaders(): Record<string, string> {
    const parsed = JSON.parse(mcpHeadersText) as unknown;

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Headers must be a JSON object.");
    }

    const headers: Record<string, string> = {};

    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value !== "string") {
        throw new Error(`Header "${key}" must have a string value.`);
      }

      headers[key] = value;
    }

    return headers;
  }

  async function handleAddMcpServer() {
    if (!mcpServerName.trim() || !mcpServerUrl.trim()) {
      setMcpFeedback("Server name and URL are required.");
      return;
    }

    setIsMcpSubmitting(true);
    setMcpFeedback(null);

    try {
      const headers = parseMcpHeaders();
      const result = await agentConnection.call<{
        state: string;
        serverId?: string;
        authUrl?: string;
      }>("addMcpServerCallable", [mcpServerName.trim(), mcpServerUrl.trim(), headers]);

      setMcpFeedback("MCP server saved.");
      setMcpServerName("");
      setMcpServerUrl("");
      setMcpHeadersText("{}");

      if (result.authUrl) {
        window.open(
          result.authUrl,
          "mcp-auth",
          "width=640,height=800,resizable=yes,scrollbars=yes",
        );
      }
    } catch (error) {
      setMcpFeedback(error instanceof Error ? error.message : "Failed to add MCP server.");
    } finally {
      setIsMcpSubmitting(false);
    }
  }

  async function handleRemoveMcpServer(serverId: string) {
    setIsMcpSubmitting(true);
    setMcpFeedback(null);

    try {
      await agentConnection.call("removeMcpServerCallable", [serverId]);
      setMcpFeedback("MCP server removed.");
    } catch (error) {
      setMcpFeedback(error instanceof Error ? error.message : "Failed to remove MCP server.");
    } finally {
      setIsMcpSubmitting(false);
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (isError || !agent) {
    return (
      <div className="space-y-6">
        <div className="rounded-lg border border-destructive bg-destructive/10 p-6">
          <p className="text-sm text-destructive">
            Failed to load agent. It may have been deleted or you don't have access to it.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-12rem)] flex-col gap-4">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" asChild>
            <Link to="/agents">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          {isEditingName ? (
            <div className="flex items-center gap-2">
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={handleRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleRename();
                  } else if (e.key === "Escape") {
                    setIsEditingName(false);
                    setEditName(agent.agentName);
                  }
                }}
                className="w-64"
                autoFocus
              />
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-foreground md:text-3xl">{agent.agentName}</h1>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setIsEditingName(true)}
                disabled={updateAgentMutation.isPending}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link to="/agents/$id/whatsapp" params={{ id }}>
              <MessageSquareText className="h-4 w-4" />
              WhatsApp
            </Link>
          </Button>
          <Button
            variant="destructive"
            size="icon"
            onClick={handleDelete}
            disabled={deleteAgentMutation.isPending}
          >
            {deleteAgentMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      <div className="shrink-0 rounded-lg border bg-card p-4 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Plug className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold text-card-foreground">MCP Servers & Tools</h2>
        </div>

        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="mcp-server-name">Server Name</Label>
              <Input
                id="mcp-server-name"
                value={mcpServerName}
                onChange={(e) => setMcpServerName(e.target.value)}
                placeholder="Research Tools"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mcp-server-url">Server URL</Label>
              <Input
                id="mcp-server-url"
                value={mcpServerUrl}
                onChange={(e) => setMcpServerUrl(e.target.value)}
                placeholder="https://example.com/mcp"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="mcp-server-headers">Optional Headers (JSON)</Label>
            <textarea
              id="mcp-server-headers"
              value={mcpHeadersText}
              onChange={(e) => setMcpHeadersText(e.target.value)}
              className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 min-h-24 w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
              placeholder='{"Authorization":"Bearer ..."}'
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => void handleAddMcpServer()} disabled={isMcpSubmitting}>
              {isMcpSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plug className="h-4 w-4" />
              )}
              Add MCP Server
            </Button>
            {mcpFeedback ? (
              <output className="text-sm text-muted-foreground">{mcpFeedback}</output>
            ) : null}
          </div>

          <div className="space-y-3">
            {servers.length === 0 ? (
              <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                No MCP servers configured yet.
              </div>
            ) : (
              servers.map(([serverId, mcpServer]) => {
                const serverTools = toolsByServerId.get(serverId) ?? [];
                const statusVariant =
                  mcpServer.state === "ready"
                    ? "default"
                    : mcpServer.state === "failed"
                      ? "destructive"
                      : "secondary";

                return (
                  <div key={serverId} className="rounded-md border p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-foreground">{mcpServer.name}</p>
                          <Badge variant={statusVariant}>{mcpServer.state}</Badge>
                          <Badge variant="outline">{serverTools.length} tools</Badge>
                        </div>
                        <p className="break-all text-sm text-muted-foreground">
                          {mcpServer.server_url}
                        </p>
                        {mcpServer.state === "failed" ? (
                          <p className="text-sm text-destructive">
                            This server failed to connect. Re-authorize it or verify the URL and
                            headers.
                          </p>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {mcpServer.auth_url ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              window.open(
                                mcpServer.auth_url ?? "",
                                "mcp-auth",
                                "width=640,height=800,resizable=yes,scrollbars=yes",
                              );
                            }}
                          >
                            <ExternalLink className="h-4 w-4" />
                            Authorize
                          </Button>
                        ) : null}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void handleRemoveMcpServer(serverId)}
                          disabled={isMcpSubmitting}
                        >
                          <Trash2 className="h-4 w-4" />
                          Remove
                        </Button>
                      </div>
                    </div>

                    <div className="mt-4 space-y-2">
                      <div className="flex items-center gap-2">
                        <Wrench className="h-4 w-4 text-muted-foreground" />
                        <p className="text-sm font-medium text-foreground">Tools</p>
                      </div>

                      {serverTools.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No tools discovered yet.</p>
                      ) : (
                        <div className="space-y-2">
                          {serverTools.map((tool) => (
                            <div
                              key={`${serverId}:${tool.name}`}
                              className="rounded-md bg-muted/40 p-3"
                            >
                              <p className="text-sm font-medium text-foreground">{tool.name}</p>
                              {tool.description ? (
                                <p className="mt-1 text-sm text-muted-foreground">
                                  {tool.description}
                                </p>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {mcpState?.resources && mcpState.resources.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              {mcpState.resources.length} MCP resources discovered.
            </p>
          ) : null}
        </div>
      </div>

      {/* Chat Interface */}
      <div className="flex min-h-0 flex-1 flex-col rounded-lg border bg-card">
        {/* Messages */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4 space-y-4">
          {chat.messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
              <Bot className="h-12 w-12 mb-4 opacity-50" />
              <p className="text-lg font-medium">Start a conversation</p>
              <p className="text-sm">Send a message to begin chatting with your agent.</p>
            </div>
          )}
          {chat.messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-lg p-4 ${
                  message.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
                }`}
              >
                {message.parts.map((part, idx) => {
                  if (part.type === "text") {
                    return (
                      <div key={idx} className="prose prose-sm dark:prose-invert max-w-none">
                        <Markdown>{part.text}</Markdown>
                      </div>
                    );
                  }
                  return null;
                })}
              </div>
            </div>
          ))}
          {(chat.status === "streaming" || chat.status === "submitted") && (
            <div className="flex gap-3 justify-start">
              <div className="max-w-[80%] rounded-lg p-4 bg-muted">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm text-muted-foreground">Thinking...</span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="shrink-0 border-t p-4">
          <div className="flex gap-2">
            <Input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your message..."
              disabled={chat.status === "streaming" || chat.status === "submitted"}
              className="flex-1"
            />
            <Button
              onClick={handleSendMessage}
              disabled={
                !inputValue.trim() || chat.status === "streaming" || chat.status === "submitted"
              }
            >
              {chat.status === "streaming" || chat.status === "submitted" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
          {chat.error && (
            <div className="mt-2 rounded-md border border-destructive bg-destructive/10 p-2">
              <p className="text-xs text-destructive">
                {chat.error instanceof Error ? chat.error.message : "An error occurred"}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
