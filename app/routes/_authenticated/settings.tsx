import { createFileRoute } from "@tanstack/react-router";
import { LogOut, Settings as SettingsIcon, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/app/components/ui/alert-dialog";
import { Button } from "@/app/components/ui/button";

export const Route = createFileRoute("/_authenticated/settings")({
  component: Settings,
});

function Settings() {
  const { auth } = Route.useRouteContext();
  const { user, authClient } = auth;
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleSignOut = async () => {
    if (!authClient) {
      return;
    }

    try {
      await authClient.signOut();
      window.location.reload();
    } catch (error) {
      console.error("Failed to sign out:", error);
    }
  };

  const handleDeleteAccount = async () => {
    if (!authClient) {
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);

    try {
      await authClient.deleteUser();
      window.location.href = "/";
    } catch (error) {
      console.error("Failed to delete account:", error);
      setDeleteError("Failed to delete account. Please try again.");
      setIsDeleting(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-8">
      <div className="flex items-center gap-3">
        <SettingsIcon className="h-8 w-8 text-primary" />
        <h1 className="text-2xl font-bold text-foreground md:text-3xl">Settings</h1>
      </div>

      <div className="space-y-6">
        <div>
          <h2 className="mb-4 text-xl font-semibold text-foreground">Account</h2>
          <div className="flex items-center gap-4">
            {user?.image && (
              <img
                src={user.image}
                alt={user.name}
                className="h-16 w-16 rounded-full border-2 border-primary"
              />
            )}
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">{user?.name}</p>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
              {user?.githubUsername && (
                <p className="text-sm text-muted-foreground">GitHub: @{user.githubUsername}</p>
              )}
              {user?.createdAt && (
                <p className="text-sm text-muted-foreground">
                  Joined{" "}
                  {new Date(user.createdAt).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="border-t border-border pt-6">
          <h2 className="mb-4 text-xl font-semibold text-foreground">Session</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Sign out of your account on this device.
          </p>
          <Button variant="outline" onClick={handleSignOut}>
            <LogOut className="h-4 w-4" />
            Sign Out
          </Button>
        </div>

        <div className="border-t border-border pt-6">
          <h2 className="mb-2 text-xl font-semibold text-destructive">Danger Zone</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Once you delete your account, there is no going back. Please be certain.
          </p>

          {deleteError && (
            <div className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {deleteError}
            </div>
          )}

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={isDeleting}>
                <Trash2 className="h-4 w-4" />
                Delete Account
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="duration-300 data-[state=closed]:slide-out-to-left-0 data-[state=closed]:slide-out-to-top-0 data-[state=open]:slide-in-from-left-0 data-[state=open]:slide-in-from-top-0 data-[state=closed]:slide-out-to-bottom-2 data-[state=open]:slide-in-from-bottom-2 data-[state=closed]:zoom-out-[100%] data-[state=open]:zoom-in-[100%]">
              <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This will permanently delete your account and remove
                  all your data from our servers.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDeleteAccount}
                  className="bg-destructive text-white hover:bg-destructive/90"
                  disabled={isDeleting}
                >
                  {isDeleting ? "Deleting..." : "Delete Account"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  );
}
