import { createFileRoute, Link } from "@tanstack/react-router";
import { FileQuestion } from "lucide-react";
import { Button } from "@/app/components/ui/button";

export const Route = createFileRoute("/_authenticated/$")({
  component: NotFoundPage,
});

function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6">
      <div className="space-y-6 text-center">
        <FileQuestion className="mx-auto h-16 w-16 text-muted-foreground" />
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold">Page Not Found</h1>
          <p className="text-muted-foreground max-w-md">
            The page you're looking for doesn't exist or may have been moved.
          </p>
        </div>
        <Button asChild>
          <Link to="/whatsapp">Back to WhatsApp</Link>
        </Button>
      </div>
    </div>
  );
}
