import type { MCPServer, MCPServersState } from "agents";

/**
 * Connection status for the WebSocket
 */
export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

/**
 * Core state for agent connection management
 */
export type AgentConnectionState = {
  connectionStatus: ConnectionStatus;
  mcpState: MCPServersState | null;
  selectedServerId: string | null;
  error: { message: string } | null;
  resetInFlight: boolean;
};

/**
 * Derived UI state for components
 */
export type AgentUiState = "initializing" | "noServer" | "needsAuth" | "failed" | "ready";

/**
 * Server info for display
 */
export type McpServerInfo = MCPServer;

/**
 * Tool info for display
 */
export type McpToolInfo = {
  name: string;
  description?: string;
  serverId: string;
};
