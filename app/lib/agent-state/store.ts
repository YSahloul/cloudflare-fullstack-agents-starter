import type { MCPServersState } from "agents";
import type { AgentConnectionState, ConnectionStatus } from "./types";

type Listener = () => void;

/**
 * Creates an agent connection store for a specific agent
 */
export function createAgentStore() {
  let state: AgentConnectionState = {
    connectionStatus: "connecting",
    mcpState: null,
    selectedServerId: null,
    error: null,
    resetInFlight: false,
  };

  const listeners = new Set<Listener>();

  function getState(): AgentConnectionState {
    return state;
  }

  function subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function notify() {
    for (const listener of listeners) {
      listener();
    }
  }

  function setConnectionStatus(status: ConnectionStatus) {
    state = { ...state, connectionStatus: status };
    notify();
  }

  function setMcpState(mcpState: MCPServersState) {
    const serverIds = Object.keys(mcpState.servers);
    const existingSelectedServerId = state.selectedServerId;

    const selectedServerId =
      existingSelectedServerId && mcpState.servers[existingSelectedServerId]
        ? existingSelectedServerId
        : (serverIds.find((serverId) => mcpState.servers[serverId]?.state === "ready") ??
          serverIds.find((serverId) => mcpState.servers[serverId]?.state === "authenticating") ??
          serverIds[0] ??
          null);

    state = {
      ...state,
      mcpState,
      selectedServerId,
      error: null,
    };
    notify();
  }

  function setError(error: { message: string } | null) {
    state = { ...state, error };
    notify();
  }

  function setResetInFlight(inFlight: boolean) {
    state = { ...state, resetInFlight: inFlight };
    notify();
  }

  function reset() {
    state = {
      connectionStatus: "connecting",
      mcpState: null,
      selectedServerId: null,
      error: null,
      resetInFlight: false,
    };
    notify();
  }

  return {
    getState,
    subscribe,
    setConnectionStatus,
    setMcpState,
    setError,
    setResetInFlight,
    reset,
  };
}

export type AgentStore = ReturnType<typeof createAgentStore>;
