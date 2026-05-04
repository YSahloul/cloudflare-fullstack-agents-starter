import { Link, useRouteContext, useRouterState } from "@tanstack/react-router";
import { LogOut, MessageSquare, Settings } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/app/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/app/components/ui/sidebar";
import type { RouterContext } from "@/app/routes/__root";

const navItems = [
  {
    title: "WhatsApp",
    icon: MessageSquare,
    to: "/whatsapp",
  },
  {
    title: "Settings",
    icon: Settings,
    to: "/settings",
  },
];

const NAME_MAX_LENGTH = 24;
const EMAIL_MAX_LENGTH = 28;

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  if (maxLength <= 1) {
    return "…";
  }

  return `${value.slice(0, maxLength - 1)}…`;
}

function truncateEmail(email: string, maxLength: number) {
  const [localPart, domain] = email.split("@");

  if (!domain) {
    return truncateText(email, maxLength);
  }

  const availableLocalLength = maxLength - domain.length - 1;

  if (availableLocalLength <= 1) {
    return truncateText(email, maxLength);
  }

  if (localPart.length <= availableLocalLength) {
    return email;
  }

  return `${localPart.slice(0, availableLocalLength - 1)}…@${domain}`;
}

export function AppSidebar() {
  const router = useRouterState();
  const currentPath = router.location.pathname;
  const { auth } = useRouteContext({ from: "__root__" }) as RouterContext;
  const { user, authClient } = auth;

  const handleSignOut = async () => {
    try {
      await authClient.signOut();
      window.location.reload();
    } catch (_) {
      // Sign out failed
    }
  };

  const userInitials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "U";

  // TODO - use css text truncation instead
  const displayName = user?.name ? truncateText(user.name, NAME_MAX_LENGTH) : undefined;
  const displayEmail = user?.email ? truncateEmail(user.email, EMAIL_MAX_LENGTH) : undefined;
  const isNameTruncated = Boolean(user?.name && displayName !== user.name);
  const isEmailTruncated = Boolean(user?.email && displayEmail !== user.email);

  return (
    <Sidebar>
      <SidebarHeader className="flex h-14 items-center border-b border-sidebar-border md:h-16">
        <div className="flex items-center gap-2 px-2 h-full mr-auto">
          <MessageSquare className="h-6 w-6" />
          <span className="text-lg font-semibold text-sidebar-foreground">WhatsApp Agents</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive = currentPath === item.to;
                return (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton asChild isActive={isActive}>
                      <Link to={item.to}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border p-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-md p-2 hover:bg-sidebar-accent focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <Avatar className="h-8 w-8">
                <AvatarImage src={user?.image || undefined} alt={user?.name} />
                <AvatarFallback>{userInitials}</AvatarFallback>
              </Avatar>
              <div className="flex flex-1 flex-col items-start text-left text-sm">
                <span
                  className="w-full truncate font-medium text-sidebar-foreground"
                  title={isNameTruncated ? user?.name : undefined}
                >
                  {displayName}
                </span>
                <span
                  className="w-full truncate text-xs text-sidebar-foreground/70"
                  title={isEmailTruncated ? user?.email : undefined}
                >
                  {displayEmail}
                </span>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">{user?.name}</p>
                <p className="text-xs leading-none text-muted-foreground">{user?.email}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut}>
              <LogOut className="mr-2 h-4 w-4" />
              <span>Sign out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
