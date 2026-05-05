# AGENTS.md

This file provides guidance to ai agents when working with code in this repository.

## Project Architecture

This is a SaaS application for managing a personal collection of AI agents. It's a bun repo, built on Cloudflare Workers with a React frontend.

### Core Application

- **personal agents application** (port 7676): Main backend API with React frontend, handles authentication and showing information on user's agents.
  - `app/` contains the frontend React App (similar to what is usually in `src/` for a frontend)
  - `worker/` contains the api code
  - For more information, read the file `README.md`

### Key Technologies

- **Runtime**: Cloudflare Workers (workerd serverless environment)
- **Database**: D1 (SQLite) with Drizzle ORM
- **Frontend**: React 19 with shadcn components
- **Real-time**: Durable Objects for WebSocket events

## Development Commands

Package manager: **bun** (uses workspaces as defined in package.json)

### Essential Commands
```bash
# Development
bun install             # Install all dependencies
pnpm format             # Format code with Biome
pnpm typecheck          # Type check all apps

# App commands
bun run dev             # Start dev server
bun run cf-typegen      # Generate types for the api
bun run build           # Build for production
bun run db:generate     # Generate database migration files
bun run db:migrate      # Run database migrations
```

## Code Architecture Patterns

1. **Full-Stack**: Frontend (app) and backend (worker) are co-located, with separate ts configs.

## Database & Storage

- **Database**: D1 with Drizzle ORM, migrations in `drizzle/migrations/`
- **Storage**: Cloudflare R2 buckets for static assets
- **Configuration**: The app has `wrangler.jsonc` for Cloudflare Worker config
- **Environment**: `.dev.vars` files for local development (copy from `.dev.vars.example`)

## Development Workflow

1. Run `bun install`
2. Main frontend runs at localhost:7676

## Important Notes

- Uses TypeScript project references for type sharing across apps
- Real-time features use Durable Objects for persistent WebSocket connections
- NEVER try to deploy the app. We only do that in CI.

## Coding Guidance

- Refrain from trying to read the entirety of `worker-configuration.d.ts`. These files are large and blow up your context window. Instead grep them or read them piece by piece

- To run tests use "bun run test run" with the run suffix added as the "vitest run" command which will run test once and exit

- In vitest if you need to check if something is defined and you're then planning to check any further things there - use assert() call from vitest as opposed to expect(<thing>).toBeDefined(). This will prevent any type errors

- You should almost never add Cloudflare Bindings directly as a type. First see if they can be generated from the .dev.vars or the wrangler configuration file (`bun run cf-typegen`)

- Avoid spinning up the dev server yourself. Assume the user has it running on localhost:7676 

### Path aliases 

`@/` aliases to `<project-root>/`, so both the frontend and backend can use similar aliases.

To import from the frontend: 

```ts
import { FrontendComponent } from "@/app";
```

To import from the worker: 

```ts
import { BackendService } from "@/worker";
```

### Installing shadcn ui components

You *should* have access to the shadcn MCP server with tools to help you install components.

However, if you don't, this is how you install a new shadcn ui component:

```sh
bunx --bun shadcn@latest add button
```

Read `components.json` to understand where various components get installed.

### Using Playwright MCP for UI/E2E Testing

When Playwright MCP is available, use it for UI and end-to-end testing of the authenticated web application.

By default, you will be logged in as a test user, so certain elements like your GitHub avatar will not be present, but you should be able to interact with the web application.

If the web app is not running, remind the user to start it. (It should run at http://localhost:7676)

## Development Patterns

### **1. Type Safety Over Convenience**
Always choose explicit type checking over shortcuts like `any` types or non-null assertions (`!`). Type safety prevents runtime errors and makes code more maintainable.

**Strictly avoid `any` types** - they are prohibited by the Biome linter configuration:

```typescript
// ❌ Bad: Using any types
function processData(data: any): any {
  return data.someProperty;
}

const error = someError as any;
if (error.details) { /* ... */ }

// ✅ Good: Proper type definitions and type guards
type DataInput = {
  someProperty: string;
}

function processData(data: DataInput): string {
  return data.someProperty;
}

// Use type guards instead of any casts
if ("details" in error && typeof error.details === "string") {
  const details = JSON.parse(error.details);
}
```

### **2. Modern JavaScript Performance Patterns**
Use `for...of` loops instead of `forEach` for better performance, and template literals instead of string concatenation for cleaner code. These patterns are both more readable and more efficient.

### **3. Defensive Programming with Database Validation**
Always validate data exists in the database before processing, especially for user-facing operations. This prevents race conditions and ensures data integrity across distributed systems.

### **4. Dependency Injection Over Prop Drilling**
Use framework-provided context systems (like Hono's Context Storage) instead of passing dependencies through multiple function parameters. This creates cleaner interfaces and better separation of concerns.

Example:
```typescript
// ❌ Bad: Prop drilling
function routeSlackEvent(agentName: string, request: Request, ctx: ExecutionContext, env: Bindings, db: Database) {
  return getAgentHandler(agentName, env, db);
}

// ✅ Good: Context Storage
import { getContext } from "hono/context-storage";

function routeSlackEvent(agentName: string, request: Request, ctx: ExecutionContext, env: Bindings) {
  return getAgentHandler(agentName, env);
}

function getAgentHandler(agentName: string, env: Bindings) {
  const db = getContext().get("db"); // Access context directly
  // ...
}
```

See: https://hono.dev/docs/middleware/builtin/context-storage

### **5. Else blocks and early returns**

* prefer early return (over nesting in if statements)
* add a newline to blocks with return statement
* don't use needless else blocks

``` typescript
// ❌ Bad: Useless else statements
function getSpanStatusComponent(spanStatus: string | undefined) {
  if (spanStatus === "error") {
    return ErrorStatusComponent
  } else if (spanStatus === "ok") {
    return OkStatusComponent;
  } else if (spanStatus === undefined) {
    throw new Error("Encountered an unknown status")
  } else {
    return SpecialStatusComponent;
  }
}

// ✅ Good: return errors early, use clear code blocks and no needless else statements
function getSpanStatusComponent(spanStatus: string | undefined) {
  if (spanStatus === undefined) {
    throw new Error("Encountered an unknown status")
  }

  if (spanStatus === "error") {
    return ErrorStatusComponent
  } 
  
  if (spanStatus === "ok") {
    return OkStatusComponent;
  } 

  return SpecialStatusComponent
}
```

### **6. Consistent Code Structure**
Always use block statements (`{}`) and consistent formatting to maintain code readability and reduce cognitive load. Consistency trumps brevity for maintainable codebases.

**Always use curly braces for control flow statements** - required by Biome linter:

```typescript
// ❌ Bad: Missing curly braces
if (status === "connected") return;

for (const item of items) processItem(item);

if (user.isAdmin) 
  handleAdminAction();

// ✅ Good: Always use curly braces
if (status === "connected") {
  return;
}

for (const item of items) {
  processItem(item);
}

if (user.isAdmin) {
  handleAdminAction();
}
```

### **7. Additional formatting rules:**
- Use consistent indentation (2 spaces)
- Always include trailing commas in multiline structures
- Prefer explicit return statements with proper spacing
- Group related code with blank lines for better readability

## Color Usage Guidelines

### Semantic Color System

The application uses a comprehensive semantic color system based on CSS custom properties that support both light and dark themes. **Always prefer semantic colors over hardcoded Tailwind color classes** to ensure theme consistency and accessibility.

#### Available Semantic Colors

**Primary Semantic Colors** (use these first):
- `text-foreground` / `bg-background` - Main text/background
- `text-muted-foreground` / `bg-muted` - Secondary text/subtle backgrounds  
- `text-primary` / `bg-primary` - Brand/accent elements
- `text-secondary` / `bg-secondary` - Secondary elements
- `text-destructive` / `bg-destructive` - Errors and dangerous actions
- `border` - Default borders

#### Problematic Patterns to Avoid

**Never use hardcoded Tailwind color classes** like:
- `text-red-500`, `bg-green-600`, `border-blue-200` 
- `from-green-500 to-green-600` (gradient colors)
- Light-mode specific colors without dark mode variants

**Common problematic areas identified in the codebase:**
- Trace timeline components using hardcoded gradients
- Error states with `text-red-600` instead of `text-destructive`
- Status indicators with raw color values
- Interactive highlights using hardcoded blue colors


## Linting and Code Quality

This project uses **Biome** as the primary linter and formatter. Biome enforces strict code quality rules that must be followed:

### **Biome Configuration**
- **No `any` types**: Biome prohibits the use of `any` types to maintain type safety
- **Mandatory curly braces**: All control flow statements (if, for, while, etc.) must use curly braces
- **Consistent formatting**: Automatic code formatting with 2-space indentation
- **Import organization**: Automatic import sorting and cleanup

### **Running Biome**
```bash
# lint code
bun lint

# format code (fixes auto-fixable issues)
bun format
```

## CLI/Development Guidelines

- Never run commands with npx in this workspace (always try to use package.json listed ones)

@FP_AGENTS.md
