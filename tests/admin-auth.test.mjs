import assert from "node:assert/strict";
import test from "node:test";
import { GET } from "../src/pages/api/admin/stats.js";
import { requireAdminAuth } from "../src/lib/admin-auth.js";

test("admin stats rejects request without bearer token", async () => {
  const request = new Request("https://toyb.space/api/admin/stats", {
    method: "GET",
  });

  const response = await GET({
    request,
    locals: {
      runtime: {
        env: {
          WAITLIST_ADMIN_TOKEN: "test-admin-token",
          SUPABASE_URL: "https://example.supabase.co",
          SUPABASE_ANON_KEY: "anon-key",
        },
      },
    },
  });

  assert.equal(response.status, 401);
  const body = await response.json();
  assert.equal(body.status, "error");
  assert.equal(body.code, "unauthorized");
});

test("admin auth accepts exact allowed origin", () => {
  const request = new Request("https://toyb.space/api/admin/stats", {
    method: "GET",
    headers: {
      origin: "https://toyb.space",
      authorization: "Bearer test-admin-token",
    },
  });

  const result = requireAdminAuth(
    { request },
    {
      WAITLIST_ADMIN_TOKEN: "test-admin-token",
      ADMIN_ALLOWED_ORIGINS: "https://toyb.space,http://localhost:4321",
    },
  );

  assert.equal(result, null);
});

test("admin auth rejects disallowed origin", async () => {
  const request = new Request("https://toyb.space/api/admin/stats", {
    method: "GET",
    headers: {
      origin: "https://evil.example",
      authorization: "Bearer test-admin-token",
    },
  });

  const result = requireAdminAuth(
    { request },
    {
      WAITLIST_ADMIN_TOKEN: "test-admin-token",
      ADMIN_ALLOWED_ORIGINS: "https://toyb.space,http://localhost:4321",
    },
  );

  assert.notEqual(result, null);
  const body = await result.json();
  assert.equal(result.status, 403);
  assert.equal(body.code, "forbidden_origin");
});

test("admin auth accepts localhost in allowlist", () => {
  const request = new Request("http://localhost:4321/api/admin/stats", {
    method: "GET",
    headers: {
      origin: "http://localhost:4321",
      authorization: "Bearer test-admin-token",
    },
  });

  const result = requireAdminAuth(
    { request },
    {
      WAITLIST_ADMIN_TOKEN: "test-admin-token",
      ADMIN_ALLOWED_ORIGINS: "https://toyb.space,http://localhost:4321",
    },
  );

  assert.equal(result, null);
});
