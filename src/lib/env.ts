// Server-side configuration. Every integration is optional so the app runs out of the box;
// `mode` tells the UI which parts are live and which are simulated.

const read = (name: string) => {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
};

export const env = {
  appUrl: (read("APP_URL") ?? "http://localhost:3000").replace(/\/$/, ""),
  paypal: {
    clientId: read("PAYPAL_CLIENT_ID"),
    clientSecret: read("PAYPAL_CLIENT_SECRET"),
    // PAYPAL_API_BASE points the client at a stand-in server in contract tests (scripts/mock-services.mjs).
    base:
      read("PAYPAL_API_BASE") ??
      (read("PAYPAL_ENV") === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com"),
    webhookId: read("PAYPAL_WEBHOOK_ID"),
    merchantEmail: read("PAYPAL_MERCHANT_EMAIL"),
  },
  anthropicKey: read("ANTHROPIC_API_KEY"),
  databaseUrl: read("DATABASE_URL"),
  channel3Key: read("CHANNEL3_API_KEY"),
  agStudioKey: read("AG_STUDIO"),
  platformFeeBp: Number(read("PLATFORM_FEE_BP") ?? 1000),
  aiDailyLimit: Number(read("AI_DAILY_LIMIT") ?? 500),
};

export const mode = {
  paypal: Boolean(env.paypal.clientId && env.paypal.clientSecret),
  ai: Boolean(env.anthropicKey),
  postgres: Boolean(env.databaseUrl),
};
