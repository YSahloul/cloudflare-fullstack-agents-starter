import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type WhatsAppSession = {
  id: string;
  gatewaySessionId: string;
  userId: string;
  displayName: string;
  status: string;
  systemPrompt: string | null;
  model: string | null;
  temperature: number | null;
  maxTokens: number | null;
  groupPolicy: string | null;
  dmPolicy: string | null;
  autoReply: boolean | null;
  webhookUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

const API = "/api/whatsapp";
export const WHATSAPP_KEY = "whatsapp";

export const listWhatsAppSessionsQueryOptions = () =>
  queryOptions({
    queryKey: [WHATSAPP_KEY, "sessions"],
    queryFn: async (): Promise<WhatsAppSession[]> => {
      const res = await fetch(`${API}/sessions`);
      if (!res.ok) {
        throw new Error("Failed to fetch sessions");
      }
      const json = await res.json();
      return json.data;
    },
  });

export const useListWhatsAppSessionsQuery = () => useQuery(listWhatsAppSessionsQueryOptions());

export function useCreateWhatsAppSessionMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<WhatsAppSession>): Promise<WhatsAppSession> => {
      const res = await fetch(`${API}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        throw new Error("Failed to create session");
      }
      const json = await res.json();
      return json.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [WHATSAPP_KEY, "sessions"] }),
  });
}

export function useStartSessionMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${API}/sessions/${id}/start`, { method: "POST" });
      if (!res.ok) {
        throw new Error("Failed to start session");
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [WHATSAPP_KEY, "sessions"] }),
  });
}

export function useStopSessionMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${API}/sessions/${id}/stop`, { method: "POST" });
      if (!res.ok) {
        throw new Error("Failed to stop session");
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [WHATSAPP_KEY, "sessions"] }),
  });
}

export function useGetQrQuery(id: string) {
  return useQuery({
    queryKey: [WHATSAPP_KEY, "qr", id],
    queryFn: async (): Promise<{ qr?: string; raw?: string; error?: string; status?: string }> => {
      const res = await fetch(`${API}/sessions/${id}/qr`);
      if (!res.ok) {
        throw new Error("Failed to get QR");
      }
      const json = await res.json();
      return json.data ?? json;
    },
    enabled: !!id,
    refetchInterval: 3000,
  });
}

export function usePairCodeMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      phone,
    }: {
      id: string;
      phone: string;
    }): Promise<{ code?: string; message?: string; status?: string }> => {
      const res = await fetch(`${API}/sessions/${id}/pair-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      if (!res.ok) {
        throw new Error("Failed to request pair code");
      }
      const json = await res.json();
      return json.data ?? json;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [WHATSAPP_KEY, "sessions"] }),
  });
}
