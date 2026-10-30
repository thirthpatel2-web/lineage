import {
  boolean,
  customType,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer | Uint8Array }>({
  dataType: () => "bytea",
  fromDriver: (value) => Buffer.from(value),
});

const created = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();

// A person who writes patterns. Paid by email through PayPal Payouts.
export const designers = pgTable("designers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  handle: text("handle").notNull().unique(),
  paypalEmail: text("paypal_email").notNull(),
  bio: text("bio"),
  consentAt: timestamp("consent_at", { withTimezone: true }),
  demo: boolean("demo").default(false).notNull(),
  createdAt: created(),
});

// A pattern. `parentId` makes it a remix; `parentShareBp` is the share of every royalty on this
// pattern that flows up to the parent's chain.
export const patterns = pgTable("patterns", {
  id: text("id").primaryKey(),
  designerId: text("designer_id").notNull().references(() => designers.id),
  title: text("title").notNull(),
  description: text("description"),
  craft: text("craft").default("crochet").notNull(),
  licenseText: text("license_text"),
  salesAllowed: boolean("sales_allowed").default(true).notNull(),
  creditRequired: boolean("credit_required").default(true).notNull(),
  rateBp: integer("rate_bp").default(800).notNull(),
  minCents: integer("min_cents").default(100).notNull(),
  batchLimit: integer("batch_limit"),
  parentId: text("parent_id"),
  parentShareBp: integer("parent_share_bp").default(0).notNull(),
  features: jsonb("features").$type<string[]>(),
  createdAt: created(),
});

export const images = pgTable("images", {
  id: text("id").primaryKey(),
  patternId: text("pattern_id"),
  kind: text("kind").$type<"pattern" | "match" | "listing" | "offer">().notNull(),
  mime: text("mime").notNull(),
  bytes: bytea("bytes").notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  embedding: real("embedding").array(),
  createdAt: created(),
});

export const makers = pgTable("makers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  shopName: text("shop_name").notNull(),
  paypalEmail: text("paypal_email").notNull(),
  demo: boolean("demo").default(false).notNull(),
  createdAt: created(),
});

export type MatchCandidate = {
  patternId: string;
  title: string;
  designer: string;
  recall: number; // CLIP cosine similarity
  score: number; // final 0-1 score after vision verification
  features: { name: string; score: number }[];
  explanation: string;
};

export const matches = pgTable("matches", {
  id: text("id").primaryKey(),
  makerId: text("maker_id"),
  imageId: text("image_id").notNull(),
  band: text("band").$type<"strong" | "possible" | "none" | "traditional">().notNull(),
  topPatternId: text("top_pattern_id"),
  candidates: jsonb("candidates").$type<MatchCandidate[]>().notNull(),
  traditionalReason: text("traditional_reason"),
  verifiedBy: text("verified_by").$type<"vision" | "embedding">().notNull(),
  confirmedPatternId: text("confirmed_pattern_id"),
  createdAt: created(),
});

export type OrderStatus = "created" | "captured" | "failed" | "refunded";

// A maker buying the right to sell `units` finished items made from a pattern.
export const licenses = pgTable("licenses", {
  id: text("id").primaryKey(),
  patternId: text("pattern_id").notNull(),
  makerId: text("maker_id").notNull(),
  matchId: text("match_id"),
  units: integer("units").notNull(),
  itemPriceCents: integer("item_price_cents").notNull(),
  rateBp: integer("rate_bp").notNull(),
  amountCents: integer("amount_cents").notNull(),
  source: text("source").$type<"maker" | "agent" | "offer">().notNull(),
  paypalOrderId: text("paypal_order_id"),
  captureId: text("capture_id"),
  status: text("status").$type<OrderStatus>().default("created").notNull(),
  createdAt: created(),
  capturedAt: timestamp("captured_at", { withTimezone: true }),
});

// A finished item for sale. Lineage checkout splits the royalty out of each sale.
export const listings = pgTable("listings", {
  id: text("id").primaryKey(),
  makerId: text("maker_id").notNull(),
  patternId: text("pattern_id").notNull(),
  imageId: text("image_id"),
  title: text("title").notNull(),
  priceCents: integer("price_cents").notNull(),
  stock: integer("stock").default(1).notNull(),
  createdAt: created(),
});

export const sales = pgTable("sales", {
  id: text("id").primaryKey(),
  listingId: text("listing_id").notNull(),
  buyerNote: text("buyer_note"),
  amountCents: integer("amount_cents").notNull(),
  source: text("source").$type<"web" | "agent">().notNull(),
  paypalOrderId: text("paypal_order_id"),
  captureId: text("capture_id"),
  status: text("status").$type<OrderStatus>().default("created").notNull(),
  createdAt: created(),
  capturedAt: timestamp("captured_at", { withTimezone: true }),
});

export type PayeeKind = "designer" | "maker" | "platform";
export type CreditStatus = "pending" | "in_batch" | "paid" | "unclaimed" | "returned" | "reversed" | "kept";

// The ledger: what Lineage owes each payee. Rows are written only after PayPal confirms a capture.
export const credits = pgTable("credits", {
  id: text("id").primaryKey(),
  sourceKind: text("source_kind").$type<"license" | "sale">().notNull(),
  sourceId: text("source_id").notNull(),
  payeeKind: text("payee_kind").$type<PayeeKind>().notNull(),
  payeeId: text("payee_id").notNull(),
  patternId: text("pattern_id"),
  amountCents: integer("amount_cents").notNull(),
  status: text("status").$type<CreditStatus>().default("pending").notNull(),
  payoutItemId: text("payout_item_id"),
  createdAt: created(),
});

export const payoutBatches = pgTable("payout_batches", {
  id: text("id").primaryKey(),
  senderBatchId: text("sender_batch_id").notNull().unique(),
  paypalBatchId: text("paypal_batch_id"),
  status: text("status").notNull(),
  totalCents: integer("total_cents").notNull(),
  createdAt: created(),
});

export const payoutItems = pgTable("payout_items", {
  id: text("id").primaryKey(),
  batchId: text("batch_id").notNull(),
  payeeKind: text("payee_kind").$type<PayeeKind>().notNull(),
  payeeId: text("payee_id").notNull(),
  receiver: text("receiver").notNull(),
  amountCents: integer("amount_cents").notNull(),
  senderItemId: text("sender_item_id").notNull().unique(),
  paypalItemId: text("paypal_item_id"),
  status: text("status").notNull(),
});

// A designer's license offer to an unlicensed listing, sent as a PayPal invoice once approved.
export const offers = pgTable("offers", {
  id: text("id").primaryKey(),
  patternId: text("pattern_id").notNull(),
  listingUrl: text("listing_url"),
  sellerName: text("seller_name").notNull(),
  sellerEmail: text("seller_email").notNull(),
  imageId: text("image_id"),
  matchScore: real("match_score"),
  units: integer("units").notNull(),
  amountCents: integer("amount_cents").notNull(),
  message: text("message").notNull(),
  invoiceId: text("invoice_id"),
  invoiceUrl: text("invoice_url"),
  status: text("status").$type<"draft" | "sent" | "paid" | "cancelled">().default("draft").notNull(),
  createdAt: created(),
});

export const webhookEvents = pgTable("webhook_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  payload: jsonb("payload").notNull(),
  verified: boolean("verified").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
});

// What each agent did, step by step, so people can see and audit agent activity.
export const agentRuns = pgTable("agent_runs", {
  id: text("id").primaryKey(),
  agent: text("agent").notNull(),
  prompt: text("prompt").notNull(),
  steps: jsonb("steps").$type<{ kind: string; name?: string; input?: unknown; output?: unknown; text?: string }[]>().notNull(),
  result: text("result"),
  createdAt: created(),
});
