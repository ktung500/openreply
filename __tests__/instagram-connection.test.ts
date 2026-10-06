import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({ prisma: {} }));

import { describeConnection } from "@/lib/instagram-accounts";

const now = new Date("2026-10-06T12:00:00Z");
const base = {
  id: "account_1",
  tokenExpiresAt: new Date("2026-12-01T00:00:00Z"),
  disconnectedAt: null,
  updatedAt: new Date("2026-10-01T00:00:00Z"),
};

describe("describeConnection", () => {
  it("is connected when the token is live and nothing failed", () => {
    expect(describeConnection(base, [], now)).toEqual({
      status: "connected",
      detail: null,
    });
  });

  it("reports a disconnected account before anything else", () => {
    expect(
      describeConnection(
        { ...base, disconnectedAt: now, tokenExpiresAt: new Date(0) },
        [],
        now
      ).status
    ).toBe("disconnected");
  });

  it("reports an expired token", () => {
    expect(
      describeConnection(
        { ...base, tokenExpiresAt: new Date("2026-10-05T00:00:00Z") },
        [],
        now
      ).status
    ).toBe("token_expired");
  });

  it("surfaces a refresh error newer than the account row", () => {
    const result = describeConnection(
      base,
      [
        {
          createdAt: new Date("2026-10-05T05:00:00Z"),
          message: "Token refresh failed for @kev: OAuthException",
          payload: { instagramAccountId: "account_1" },
        },
      ],
      now
    );
    expect(result).toEqual({
      status: "refresh_failed",
      detail: "Token refresh failed for @kev: OAuthException",
    });
  });

  it("ignores refresh errors that a later successful refresh superseded", () => {
    const result = describeConnection(
      { ...base, updatedAt: new Date("2026-10-05T06:00:00Z") },
      [
        {
          createdAt: new Date("2026-10-05T05:00:00Z"),
          message: "old failure",
          payload: { instagramAccountId: "account_1" },
        },
      ],
      now
    );
    expect(result.status).toBe("connected");
  });

  it("ignores refresh errors for other accounts", () => {
    const result = describeConnection(
      base,
      [
        {
          createdAt: now,
          message: "someone else",
          payload: { instagramAccountId: "account_2" },
        },
      ],
      now
    );
    expect(result.status).toBe("connected");
  });
});
