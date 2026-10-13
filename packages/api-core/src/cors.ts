export interface CorsOptions {
  allowedOrigins: string[];
  environment: "production" | "development";
}

export function isOriginAllowed(origin: string | null, options: CorsOptions): boolean {
  if (!origin) return true;
  if (options.allowedOrigins.includes(origin)) return true;
  if (options.environment === "development") {
    try {
      const url = new URL(origin);
      return url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
    } catch {
      return false;
    }
  }
  return false;
}

export function corsHeaders(origin: string | null, options: CorsOptions): Headers {
  const headers = new Headers({ Vary: "Origin" });
  if (origin && isOriginAllowed(origin, options)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "content-type");
  }
  return headers;
}
