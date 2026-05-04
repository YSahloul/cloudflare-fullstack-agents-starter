import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";

const searchSchema = z.object({
  redirect: z.string().optional(),
});

export const Route = createFileRoute("/")({
  validateSearch: searchSchema,
  component: Index,
});

function Index() {
  const { auth } = Route.useRouteContext();
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const { user, authClient } = auth;

  if (user) {
    navigate({ to: redirect || "/whatsapp" });
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (mode === "signup") {
        const res = await authClient.signUp.email({
          email,
          password,
          name,
        });
        if (res.error) {
          setError(res.error.message || "Sign up failed");
        } else {
          window.location.reload();
        }
      } else {
        const res = await authClient.signIn.email({
          email,
          password,
        });
        if (res.error) {
          setError(res.error.message || "Sign in failed");
        } else {
          window.location.reload();
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleSocial = async (provider: "github" | "google") => {
    setLoading(true);
    try {
      await authClient.signIn.social({
        provider,
        callbackURL: redirect || "/",
      });
    } catch (_) {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="space-y-2 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground">WhatsApp Agents</h2>
          <p className="text-base text-muted-foreground">
            {mode === "signin"
              ? "Sign in to manage your WhatsApp AI agents"
              : "Create your account"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "signup" && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                required
                className="w-full rounded-lg border bg-background px-4 py-3 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              className="w-full rounded-lg border bg-background px-4 py-3 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 6 characters"
              required
              minLength={6}
              className="w-full rounded-lg border bg-background px-4 py-3 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-primary px-4 py-3 text-primary-foreground font-medium transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {loading ? "Please wait..." : mode === "signin" ? "Sign In" : "Create Account"}
          </button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="bg-background px-2 text-muted-foreground">or</span>
          </div>
        </div>

        <div className="space-y-2">
          <button
            type="button"
            onClick={() => handleSocial("github")}
            disabled={loading}
            className="w-full rounded-lg bg-[#1f2937] px-4 py-3 text-white font-medium transition-all hover:bg-[#111827] disabled:opacity-60"
          >
            Sign in with GitHub
          </button>
          <button
            type="button"
            onClick={() => handleSocial("google")}
            disabled={loading}
            className="w-full rounded-lg border bg-white px-4 py-3 text-gray-700 font-medium transition-all hover:bg-gray-50 disabled:opacity-60"
          >
            Sign in with Google
          </button>
        </div>

        <p className="text-center text-sm text-muted-foreground">
          {mode === "signin" ? (
            <>
              Don't have an account?{" "}
              <button
                type="button"
                onClick={() => {
                  setMode("signup");
                  setError("");
                }}
                className="text-primary hover:underline"
              >
                Sign up
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => {
                  setMode("signin");
                  setError("");
                }}
                className="text-primary hover:underline"
              >
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
