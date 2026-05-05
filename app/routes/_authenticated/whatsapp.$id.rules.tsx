import { createFileRoute, Link } from "@tanstack/react-router";
import { PageErrorState } from "@/app/components/PageErrorState";
import { PageLoadingState } from "@/app/components/PageLoadingState";
import { Button } from "@/app/components/ui/button";
import { useGetWhatsAppSessionQuery } from "@/app/lib/queries/whatsapp";

export const Route = createFileRoute("/_authenticated/whatsapp/$id/rules")({
  component: LegacyWhatsAppRulesRoute,
  pendingComponent: () => <PageLoadingState message="Loading WhatsApp config..." />,
  errorComponent: ({ error, reset }) => (
    <PageErrorState
      title="Error Loading WhatsApp Config"
      message={error instanceof Error ? error.message : "Failed to load WhatsApp config"}
      onRetry={reset}
      backTo="/whatsapp"
      backLabel="Back to WhatsApp"
    />
  ),
});

function LegacyWhatsAppRulesRoute() {
  const { id } = Route.useParams();
  const sessionQuery = useGetWhatsAppSessionQuery(id);
  const session = sessionQuery.data;

  if (sessionQuery.isLoading) {
    return <PageLoadingState message="Loading WhatsApp config..." />;
  }

  if (!session) {
    return (
      <PageErrorState
        title="Session Not Found"
        message="This WhatsApp session could not be found."
        backTo="/whatsapp"
        backLabel="Back to WhatsApp"
      />
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="rounded-xl border bg-card p-5 shadow-sm space-y-3">
        <h1 className="text-2xl font-semibold">WhatsApp config moved</h1>
        <p className="text-sm text-muted-foreground">
          WhatsApp rules and prompts now live under the agent, not under the WhatsApp session.
        </p>
        {session.agentId ? (
          <Button asChild>
            <Link to="/agents/$id/whatsapp" params={{ id: session.agentId }}>
              Open assigned agent WhatsApp config
            </Link>
          </Button>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              This session does not have an assigned agent yet. Open an agent and configure its
              WhatsApp channel there.
            </p>
            <Button variant="outline" asChild>
              <Link to="/agents">Go to Agents</Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
