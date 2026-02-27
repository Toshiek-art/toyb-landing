const TOKEN_KEY = "toyb_admin_token";

const cleanString = (value) => (typeof value === "string" ? value.trim() : "");

export const getAdminToken = () => {
  try {
    return cleanString(sessionStorage.getItem(TOKEN_KEY));
  } catch {
    return "";
  }
};

export const setAdminToken = (token) => {
  const normalized = cleanString(token);
  if (!normalized) return;
  sessionStorage.setItem(TOKEN_KEY, normalized);
};

export const clearAdminToken = () => {
  sessionStorage.removeItem(TOKEN_KEY);
};

export const adminFetch = async (url, options = {}) => {
  const token = getAdminToken();
  if (!token) {
    return {
      response: new Response(
        JSON.stringify({ status: "error", code: "unauthorized" }),
        {
          status: 401,
          headers: { "content-type": "application/json" },
        },
      ),
      body: { status: "error", code: "unauthorized" },
    };
  }

  const headers = new Headers(options.headers ?? {});
  headers.set("authorization", `Bearer ${token}`);

  const response = await fetch(url, {
    ...options,
    headers,
  });

  const body = await response.json().catch(() => null);
  return { response, body };
};
