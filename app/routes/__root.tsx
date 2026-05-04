import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Outlet, useMatches } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import type { createAuthClient } from "better-auth/client";
import { AppLayout } from "@/app/components/app-layout";
import { RootErrorBoundary } from "@/app/components/RootErrorBoundary";
import { Toaster } from "@/app/components/ui/sonner";

export interface User {
  id: string;
  email: string;
  name: string;
  image?: string | null;
  githubUsername?: string;
  createdAt?: Date | string;
}

export interface AuthContextType {
  user: User | null;
  authClient: ReturnType<typeof createAuthClient>;
}

export interface RouterContext {
  auth: AuthContextType;
  queryClient: QueryClient;
}

const RootLayout = () => {
  const { auth } = Route.useRouteContext();
  const matches = useMatches();

  // Check if we're on an OAuth callback page
  const isOAuthPage = matches.some(
    (match: { routeId: string }) => match.routeId === "/_oauthLayout",
  );

  // For authenticated users (except on OAuth pages), render the AppLayout which includes sidebar and header
  if (auth.user && !isOAuthPage) {
    return (
      <>
        <AppLayout />
        <Toaster />
        <TanStackRouterDevtools position="bottom-right" />
      </>
    );
  }

  // For unauthenticated users or OAuth pages, render just the outlet
  return (
    <>
      <Outlet />
      <Toaster />
      <TanStackRouterDevtools position="bottom-right" />
    </>
  );
};

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  errorComponent: ({ error, reset }) => <RootErrorBoundary error={error} reset={reset} />,
});
