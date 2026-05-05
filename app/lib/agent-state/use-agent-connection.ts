import type { MCPServersState } from "agents";
import { useAgent } from "agents/react";
import { useMemo, useRef, useSyncExternalStore } from "react";
import { deriveUiState, getDisableReason } from "./derive-ui-state";
import { type AgentStore, createAgentStore } from "./store";
import type { McpServerInfo, McpToolInfo } from "./types";

export type UseAgentConnectionOptions = {
  agentId: string;
  prefix?: string;
  agentType?: string;
};

export function useAgentConnection(options: UseAgentConnectionOptions) {
  const { agentId, prefix = "api/v1/agents", agentType = "personal-agent" } = options;

  // Create store once per component instance
  const storeRef = useRef<AgentStore | null>(null);
  if (!storeRef.current) {
    storeRef.current = createAgentStore();
  }
  const store = storeRef.current;

  // Subscribe to store changes with useSyncExternalStore
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);

  // Set up agent connection
  const agent = useAgent({
    prefix,
    agent: agentType,
    name: agentId,
    onOpen: () => {
      console.log("[Agent Connection] Connection established");
      store.setConnectionStatus("connected");
    },
    onClose: () => {
      console.log("[Agent Connection] Connection closed");
      store.setConnectionStatus("disconnected");
      store.setError({ message: "Connection closed unexpectedly" });
    },
    onError: (event) => {
      console.error("[Agent Connection] Connection error:", event);
      store.setConnectionStatus("error");
      store.setError({ message: "Connection error occurred" });
    },
    onMcpUpdate: (mcpState: MCPServersState) => {
      console.log("[Agent Connection] MCP state update:", mcpState);
      store.setMcpState(mcpState);
      store.setResetInFlight(false);
    },
  });

  // Derive UI state
  const uiState = useMemo(() => deriveUiState(state), [state]);
  const disableReason = useMemo(() => getDisableReason(uiState), [uiState]);
  const canStartReview = uiState === "ready";

  // Get server info
  const server: McpServerInfo | undefined = useMemo(() => {
    if (!state.selectedServerId || !state.mcpState) {
      return undefined;
    }
    return state.mcpState.servers[state.selectedServerId] as McpServerInfo | undefined;
  }, [state.selectedServerId, state.mcpState]);

  const servers: Array<[string, McpServerInfo]> = useMemo(() => {
    return Object.entries(state.mcpState?.servers ?? {}) as Array<[string, McpServerInfo]>;
  }, [state.mcpState]);

  const tools: McpToolInfo[] = useMemo(() => {
    return (state.mcpState?.tools || []) as McpToolInfo[];
  }, [state.mcpState]);

  return {
    agent,
    uiState,
    canStartReview,
    disableReason,
    server,
    servers,
    tools,
    mcpState: state.mcpState,
    error: state.error,
    connectionStatus: state.connectionStatus,
    resetInFlight: state.resetInFlight,
  };
}
