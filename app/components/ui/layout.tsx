import type { ReactNode } from "react";
import { cn } from "@/app/lib/utils";

interface LayoutProps {
  children: ReactNode;
  className?: string;
}

/**
 * Root container that fills the viewport height.
 * Use as the outer wrapper for page layouts.
 */
export function LayoutRoot({ children, className }: LayoutProps) {
  return <div className={cn("flex min-h-screen flex-col", className)}>{children}</div>;
}

/**
 * Header bar that spans the full width at the top.
 * Use for navigation, branding, and global actions.
 */
export function LayoutHeader({ children, className }: LayoutProps) {
  return (
    <header className={cn("flex h-14 items-center border-b px-4", className)}>{children}</header>
  );
}

/**
 * Main content area that expands to fill available space.
 * Use for the primary page content.
 */
export function LayoutMain({ children, className }: LayoutProps) {
  return <main className={cn("flex-1 overflow-y-auto", className)}>{children}</main>;
}

/**
 * Content wrapper with standard padding and max-width.
 * Use inside LayoutMain for consistent content spacing.
 */
export function LayoutContent({ children, className }: LayoutProps) {
  return <div className={cn("mx-auto max-w-7xl p-4 md:p-6 lg:p-8", className)}>{children}</div>;
}

/**
 * Narrow content wrapper for forms, settings, and focused content.
 * Use instead of LayoutContent for narrower layouts.
 */
export function LayoutContentNarrow({ children, className }: LayoutProps) {
  return <div className={cn("mx-auto max-w-2xl p-4 md:p-6 lg:p-8", className)}>{children}</div>;
}

/**
 * Page header with title and optional actions.
 * Use at the top of page content for consistent headings.
 */
export function PageHeader({ children, className }: LayoutProps) {
  return (
    <div className={cn("mb-6 flex items-center justify-between gap-4", className)}>{children}</div>
  );
}

/**
 * Page title component with consistent styling.
 */
export function PageTitle({ children, className }: LayoutProps) {
  return (
    <h1 className={cn("text-2xl font-bold text-foreground md:text-3xl", className)}>{children}</h1>
  );
}

/**
 * Page description for supplementary text below the title.
 */
export function PageDescription({ children, className }: LayoutProps) {
  return <p className={cn("text-muted-foreground", className)}>{children}</p>;
}

/**
 * Container for page actions (buttons, links) in the header.
 */
export function PageActions({ children, className }: LayoutProps) {
  return <div className={cn("flex items-center gap-2", className)}>{children}</div>;
}

/**
 * Section wrapper for grouping related content.
 * Use to create visual separation between content areas.
 */
export function Section({ children, className }: LayoutProps) {
  return <section className={cn("space-y-4", className)}>{children}</section>;
}

/**
 * Section header with title and optional description.
 */
export function SectionHeader({ children, className }: LayoutProps) {
  return <div className={cn("space-y-1", className)}>{children}</div>;
}

/**
 * Section title component.
 */
export function SectionTitle({ children, className }: LayoutProps) {
  return <h2 className={cn("text-lg font-semibold", className)}>{children}</h2>;
}

/**
 * Section description component.
 */
export function SectionDescription({ children, className }: LayoutProps) {
  return <p className={cn("text-sm text-muted-foreground", className)}>{children}</p>;
}
