import { MessageSquare } from "lucide-react";
import DiscordLogo from "@/app/assets/brand-logos/Discord.svg?react";
import { SidebarTrigger } from "@/app/components/ui/sidebar";
import { DISCORD_INVITE_URL } from "@/app/constants";

export function AppHeader() {
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b bg-background px-4 md:h-16 md:px-6">
      <div className="flex items-center gap-4">
        <SidebarTrigger className="-ml-1" />
        <div className="flex md:hidden">
          <MessageSquare className="h-6 w-6" />
        </div>
      </div>
      <a
        href={DISCORD_INVITE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Join our Discord community"
      >
        <DiscordLogo className="h-5 w-5" />
      </a>
    </header>
  );
}
