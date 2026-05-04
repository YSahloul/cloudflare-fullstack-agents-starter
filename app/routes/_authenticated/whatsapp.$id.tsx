import { createFileRoute, Outlet } from "@tanstack/react-router";
import { PageErrorState } from "@/app/components/PageErrorState";
import { PageLoadingState } from "@/app/components/PageLoadingState";
import { useGetWhatsAppSessionQuery } from "@/app/lib/queries/whatsapp";

export const Route = createFileRoute("/_authenticated/whatsapp/$id")({
  component: WhatsAppSessionLayout,
  pendingComponent: () => <PageLoadingState message="Loading WhatsApp session..." />,
  errorComponent: ({ error, reset }) => (
    <PageErrorState
      title="Error Loading WhatsApp Session"
      message={error instanceof Error ? error.message : "Failed to load WhatsApp session"}
      onRetry={reset}
      backTo="/whatsapp"
      backLabel="Back to WhatsApp"
    />
  ),
});

function WhatsAppSessionLayout() {
  const { id } = Route.useParams();
  useGetWhatsAppSessionQuery(id);

  return <Outlet />;
}
