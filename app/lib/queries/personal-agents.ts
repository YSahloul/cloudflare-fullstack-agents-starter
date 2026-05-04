import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type PersonalAgent = {
  id: string;
  userId: string;
  agentName: string;
  createdAt: number;
  updatedAt: number;
};

// Query key constants for consistency
export const PERSONAL_AGENTS_KEY = "personal-agents";

/**
 * Query options for fetching all personal agents.
 * Can be used in route loaders for prefetching:
 * `context.queryClient.prefetchQuery(listPersonalAgentsQueryOptions())`
 */
export const listPersonalAgentsQueryOptions = () =>
  queryOptions({
    queryKey: [PERSONAL_AGENTS_KEY],
    queryFn: async (): Promise<PersonalAgent[]> => {
      const response = await fetch("/api/v1/agents/personal-agents");
      if (!response.ok) {
        throw new Error("Failed to fetch personal agents");
      }

      return response.json();
    },
  });

/**
 * Query options for fetching a single personal agent by ID.
 * Can be used in route loaders for prefetching:
 * `context.queryClient.prefetchQuery(personalAgentQueryOptions(id))`
 */
export const personalAgentQueryOptions = (id: string) =>
  queryOptions({
    queryKey: [PERSONAL_AGENTS_KEY, id],
    queryFn: async (): Promise<PersonalAgent> => {
      const response = await fetch(`/api/v1/agents/personal-agents/${id}`);
      if (!response.ok) {
        throw new Error("Failed to fetch personal agent");
      }

      return response.json();
    },
    enabled: !!id,
  });

export function useListPersonalAgentsQuery() {
  return useQuery(listPersonalAgentsQueryOptions());
}

export function usePersonalAgentQuery(id: string) {
  return useQuery(personalAgentQueryOptions(id));
}

export function useCreatePersonalAgentMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { agentName: string }): Promise<PersonalAgent> => {
      const response = await fetch("/api/v1/agents/personal-agents", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({
          message: "Failed to create personal agent",
        }));
        throw new Error(error.message || "Failed to create personal agent");
      }

      return response.json();
    },

    // Optimistic update: add agent immediately
    onMutate: async (newAgentData) => {
      // Cancel outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: [PERSONAL_AGENTS_KEY] });

      // Snapshot previous value for rollback
      const previousAgents = queryClient.getQueryData<PersonalAgent[]>([PERSONAL_AGENTS_KEY]);

      // Create optimistic agent with temporary ID
      const optimisticAgent: PersonalAgent = {
        id: `temp-${Date.now()}`,
        userId: "",
        agentName: newAgentData.agentName,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      // Optimistically add to cache
      queryClient.setQueryData<PersonalAgent[]>([PERSONAL_AGENTS_KEY], (old = []) => [
        ...old,
        optimisticAgent,
      ]);

      return { previousAgents, optimisticAgent };
    },

    // Replace optimistic agent with real data from server
    onSuccess: (data, _variables, context) => {
      queryClient.setQueryData<PersonalAgent[]>([PERSONAL_AGENTS_KEY], (old = []) =>
        old.map((agent) => (agent.id === context?.optimisticAgent.id ? data : agent)),
      );
    },

    // Rollback on error
    onError: (_error, _variables, context) => {
      if (context?.previousAgents) {
        queryClient.setQueryData([PERSONAL_AGENTS_KEY], context.previousAgents);
      }
    },

    // Always refetch to ensure consistency with server
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [PERSONAL_AGENTS_KEY] });
    },
  });
}

export function useUpdatePersonalAgentMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { id: string; agentName: string }): Promise<PersonalAgent> => {
      const response = await fetch(`/api/v1/agents/personal-agents/${data.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          agentName: data.agentName,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({
          message: "Failed to update personal agent",
        }));
        throw new Error(error.message || "Failed to update personal agent");
      }

      return response.json();
    },

    // Optimistic update: update agent immediately
    onMutate: async (updatedData) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: [PERSONAL_AGENTS_KEY] });
      await queryClient.cancelQueries({ queryKey: [PERSONAL_AGENTS_KEY, updatedData.id] });

      // Snapshot previous values for rollback
      const previousAgents = queryClient.getQueryData<PersonalAgent[]>([PERSONAL_AGENTS_KEY]);
      const previousAgent = queryClient.getQueryData<PersonalAgent>([
        PERSONAL_AGENTS_KEY,
        updatedData.id,
      ]);

      // Optimistically update in list
      queryClient.setQueryData<PersonalAgent[]>([PERSONAL_AGENTS_KEY], (old = []) =>
        old.map((agent) =>
          agent.id === updatedData.id
            ? { ...agent, agentName: updatedData.agentName, updatedAt: Date.now() }
            : agent,
        ),
      );

      // Optimistically update single agent cache
      if (previousAgent) {
        queryClient.setQueryData<PersonalAgent>([PERSONAL_AGENTS_KEY, updatedData.id], {
          ...previousAgent,
          agentName: updatedData.agentName,
          updatedAt: Date.now(),
        });
      }

      return { previousAgents, previousAgent };
    },

    // Rollback on error
    onError: (_error, variables, context) => {
      if (context?.previousAgents) {
        queryClient.setQueryData([PERSONAL_AGENTS_KEY], context.previousAgents);
      }
      if (context?.previousAgent) {
        queryClient.setQueryData([PERSONAL_AGENTS_KEY, variables.id], context.previousAgent);
      }
    },

    // Always refetch to ensure consistency with server
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({ queryKey: [PERSONAL_AGENTS_KEY] });
      queryClient.invalidateQueries({ queryKey: [PERSONAL_AGENTS_KEY, variables.id] });
    },
  });
}

export function useDeletePersonalAgentMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<PersonalAgent> => {
      const response = await fetch(`/api/v1/agents/personal-agents/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({
          message: "Failed to delete personal agent",
        }));
        throw new Error(error.message || "Failed to delete personal agent");
      }

      return response.json();
    },

    // Optimistic update: remove agent immediately
    onMutate: async (deletedId) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: [PERSONAL_AGENTS_KEY] });

      // Snapshot previous value for rollback
      const previousAgents = queryClient.getQueryData<PersonalAgent[]>([PERSONAL_AGENTS_KEY]);

      // Optimistically remove from cache
      queryClient.setQueryData<PersonalAgent[]>([PERSONAL_AGENTS_KEY], (old = []) =>
        old.filter((agent) => agent.id !== deletedId),
      );

      // Remove single agent cache
      queryClient.removeQueries({ queryKey: [PERSONAL_AGENTS_KEY, deletedId] });

      return { previousAgents };
    },

    // Rollback on error
    onError: (_error, _variables, context) => {
      if (context?.previousAgents) {
        queryClient.setQueryData([PERSONAL_AGENTS_KEY], context.previousAgents);
      }
    },

    // Always refetch to ensure consistency with server
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [PERSONAL_AGENTS_KEY] });
    },
  });
}
