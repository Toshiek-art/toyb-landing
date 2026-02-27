import assert from "node:assert/strict";
import test from "node:test";
import { GET } from "../src/pages/api/admin/stats.js";

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
