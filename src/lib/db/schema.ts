import {
  pgTable,
  pgEnum,
  uuid,
  text,
  numeric,
  date,
  timestamp,
  integer,
} from "drizzle-orm/pg-core";

export const planEnum = pgEnum("plan", ["free", "premium"]);

export const jobSiteStatusEnum = pgEnum("job_site_status", [
  "planned",
  "in_progress",
  "completed",
]);

export const quoteStatusEnum = pgEnum("quote_status", [
  "draft",
  "sent",
  "accepted",
  "declined",
  "invoiced",
]);

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  trade: text("trade").notNull(),
  businessName: text("business_name"),
  phone: text("phone"),
  currency: text("currency").notNull().default("USD"),
  taxRate: numeric("tax_rate", { precision: 5, scale: 2 }).notNull().default("0"),
  plan: planEnum("plan").notNull().default("free"),
});

export const clients = pgTable("clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  name: text("name").notNull(),
  company: text("company"),
  phone: text("phone").notNull(),
  email: text("email").notNull(),
  address: text("address"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const jobSites = pgTable("job_sites", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  clientId: uuid("client_id").notNull(),
  title: text("title").notNull(),
  address: text("address"),
  startDate: date("start_date"),
  endDate: date("end_date"),
  status: jobSiteStatusEnum("status").notNull().default("planned"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const quotes = pgTable("quotes", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  clientId: uuid("client_id").notNull(),
  jobSiteId: uuid("job_site_id").notNull(),
  number: integer("number").notNull(),
  currency: text("currency").notNull().default("USD"),
  status: quoteStatusEnum("status").notNull().default("draft"),
  issueDate: date("issue_date").notNull(),
  expiryDate: date("expiry_date"),
  taxRate: numeric("tax_rate", { precision: 5, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const quoteItems = pgTable("quote_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  quoteId: uuid("quote_id").notNull(),
  description: text("description").notNull(),
  quantity: numeric("quantity", { precision: 10, scale: 2 }).notNull().default("1"),
  unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).notNull().default("0"),
});
