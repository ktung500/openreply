import { prisma } from "@/lib/db/client";

export async function canConnectInstagramAccount({
  workspaceId,
  instagramId,
}: {
  workspaceId: string;
  instagramId: string;
}) {
  const existingAccount = await prisma.instagramAccount.findUnique({
    where: { instagramId },
    select: { workspaceId: true },
  });

  if (existingAccount && existingAccount.workspaceId !== workspaceId) {
    return {
      allowed: false,
      reason: "already_connected" as const,
    };
  }

  return {
    allowed: true,
    reason: null,
  };
}

export async function getWorkspaceInstagramAccount(
  workspaceId: string,
  instagramAccountId?: string | null
) {
  if (instagramAccountId && instagramAccountId !== "all") {
    return prisma.instagramAccount.findFirst({
      where: { id: instagramAccountId, workspaceId },
    });
  }

  // Prefer a live account so a disconnected one does not shadow the others.
  return prisma.instagramAccount.findFirst({
    where: { workspaceId },
    orderBy: [
      { disconnectedAt: { sort: "asc", nulls: "first" } },
      { connectedAt: "desc" },
    ],
  });
}


export type ConnectionStatus =
  | "connected"
  | "disconnected"
  | "token_expired"
  | "refresh_failed";

export interface ConnectionHealth {
  status: ConnectionStatus;
  /** Human-readable reason when the status is not "connected". */
  detail: string | null;
}

/**
 * Why Settings should (or should not) prompt for a reconnect. Token refresh
 * only records failures, so an error counts only if it is newer than the
 * account row itself: a later successful refresh rewrites the token and
 * bumps updatedAt, which retires the error without anyone resolving it.
 */
export function describeConnection(
  account: {
    id: string;
    tokenExpiresAt: Date | null;
    disconnectedAt: Date | null;
    updatedAt: Date;
  },
  tokenRefreshErrors: Array<{
    createdAt: Date;
    message: string;
    payload: unknown;
  }>,
  now: Date = new Date()
): ConnectionHealth {
  if (account.disconnectedAt) {
    return {
      status: "disconnected",
      detail: "Campaigns are paused until you reconnect.",
    };
  }

  if (account.tokenExpiresAt && account.tokenExpiresAt <= now) {
    return {
      status: "token_expired",
      detail: "Instagram no longer accepts the stored token.",
    };
  }

  const latestError = tokenRefreshErrors.find((event) => {
    const payload = event.payload as { instagramAccountId?: unknown } | null;
    return (
      payload?.instagramAccountId === account.id &&
      event.createdAt > account.updatedAt
    );
  });
  if (latestError) {
    return { status: "refresh_failed", detail: latestError.message };
  }

  return { status: "connected", detail: null };
}
