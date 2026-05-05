import type { AgentConnectionState, AgentUiState } from "./types";

/**
 * Derives the UI state from the raw agent connection state.
 * This replaces the complex state machine transitions with simple derived logic.
 */
export function deriveUiState(state: AgentConnectionState): AgentUiState {
  const { connectionStatus, mcpState, selectedServerId } = state;

  if (connectionStatus === "connecting" || !mcpState) {
    return "initializing";
  }

  if (connectionStatus === "error") {
    return "failed";
  }

  const serverIds = Object.keys(mcpState.servers);

  if (serverIds.length === 0) {
    return "noServer";
  }

  const selectedServer = selectedServerId ? mcpState.servers[selectedServerId] : undefined;
  const servers = selectedServer ? [selectedServer] : Object.values(mcpState.servers);

  if (servers.some((server) => server.state === "ready")) {
    return "ready";
  }

  if (servers.some((server) => server.state === "authenticating")) {
    return "needsAuth";
  }

  if (servers.every((server) => server.state === "failed")) {
    return "failed";
  }

  return "initializing";
}

/**
 * Gets the disable reason for UI elements based on the current state
 */
export function getDisableReason(uiState: AgentUiState): string | undefined {
  switch (uiState) {
    case "initializing":
      return "Loading server info...";
    case "noServer":
      return "No server available";
    case "needsAuth":
      return "Server needs authentication";
    case "failed":
      return "Server not connected";
    case "ready":
      return undefined;
  }
}
