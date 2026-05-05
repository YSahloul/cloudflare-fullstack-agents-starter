import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useAgentChat } from "agents/ai-react";
import { ArrowLeft, Bot, Loader2, MessageSquareText, Pencil, Send, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Markdown } from "@/app/components/Markdown";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
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
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { agent: agentConnection } = useAgentConnection({ agentId: id });
  const chat = useAgentChat({
    agent: agentConnection,
  });

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
