import { createFileRoute, Link } from "@tanstack/react-router";
import { Bot, Plus } from "lucide-react";
import { PageErrorState } from "@/app/components/PageErrorState";
import { PageLoadingState } from "@/app/components/PageLoadingState";
import { Button } from "@/app/components/ui/button";
import { Skeleton } from "@/app/components/ui/skeleton";
import {
  listPersonalAgentsQueryOptions,
  useListPersonalAgentsQuery,
} from "@/app/lib/queries/personal-agents";

export const Route = createFileRoute("/_authenticated/agents/")({
  loader: ({ context }) => {
    // Prefetch agents list for instant rendering
    context.queryClient.prefetchQuery(listPersonalAgentsQueryOptions());
  },
  pendingComponent: () => <PageLoadingState message="Loading agents..." />,
  errorComponent: ({ error, reset }) => (
    <PageErrorState
      title="Error Loading Agents"
      message={error instanceof Error ? error.message : "Failed to load agents"}
      onRetry={reset}
      backTo="/dashboard"
      backLabel="Go to Dashboard"
    />
  ),
  component: AgentsList,
});

function AgentsList() {
  const { data: agents, isLoading, isError } = useListPersonalAgentsQuery();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bot className="h-8 w-8 text-primary" />
          <h1 className="text-2xl font-bold text-foreground md:text-3xl">Personal Agents</h1>
        </div>
        <Button asChild>
          <Link to="/agents/new">
            <Plus className="h-4 w-4" />
            Create Agent
          </Link>
        </Button>
      </div>

      <div className="">
        <h2 className="mb-2 text-xl font-semibold text-card-foreground sr-only">
          Your Personal Agents
        </h2>
        <p className="text-muted-foreground">Create and manage your personal AI agents.</p>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-lg border bg-card p-4">
              <Skeleton className="mb-2 h-5 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ))}
        </div>
      )}

      {isError && (
        <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
          <p className="text-sm text-destructive">Failed to load agents. Please try again.</p>
        </div>
      )}

      {!isLoading && !isError && agents && agents.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed bg-card p-12 text-center">
          <Bot className="mb-4 h-12 w-12 text-muted-foreground" />
          <h3 className="mb-2 text-lg font-semibold text-card-foreground">No Agents Yet</h3>
          <p className="mb-4 text-sm text-muted-foreground">
            Create your first personal agent to get started.
          </p>
          <Button asChild>
            <Link to="/agents/new">
              <Plus className="h-4 w-4" />
              Create Agent
            </Link>
          </Button>
        </div>
      )}

      {!isLoading && !isError && agents && agents.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {agents.map((agent) => (
            <Link
              key={agent.id}
              to="/agents/$id"
              params={{ id: agent.id }}
              className="block rounded-lg border bg-card p-4 transition-colors hover:bg-accent h-full"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <h3 className="mb-1 truncate text-base font-medium text-card-foreground">
                    {agent.agentName}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Created {new Date(agent.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <Bot className="h-5 w-5 shrink-0 text-muted-foreground" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
