import type { APIContext } from "astro";

export interface AdminAuthEnv {
  WAITLIST_ADMIN_TOKEN?: string;
  ADMIN_ALLOWED_ORIGINS?: string;
}

export function getAdminRuntimeEnv<T extends object>(
  context: APIContext,
): T & AdminAuthEnv;

export function requireAdminAuth(
  context: APIContext,
  env: AdminAuthEnv,
): Response | null;

export function adminJson(body: Record<string, unknown>, status: number): Response;
