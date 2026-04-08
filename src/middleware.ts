import type { MiddlewareHandler } from "astro";

const CANONICAL_HOST = "toyb.space";

export const onRequest: MiddlewareHandler = async (context, next) => {
  const url = new URL(context.request.url);

  if (url.hostname === `www.${CANONICAL_HOST}`) {
    url.hostname = CANONICAL_HOST;
    return Response.redirect(url.toString(), 301);
  }

  return next();
};
