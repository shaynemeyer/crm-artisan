import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const PROJECT_REF = "rllkfmcfdewpephpazqe";
const API_URL = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;

const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.error("SUPABASE_ACCESS_TOKEN is not set");
  process.exit(1);
}

async function query(sql) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }
  return res.json();
}

async function main() {
  const journal = JSON.parse(
    readFileSync(resolve("drizzle/meta/_journal.json"), "utf8")
  );

  // Ensure tracking table exists
  await query(`
    CREATE SCHEMA IF NOT EXISTS drizzle;
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id serial PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    );
  `);

  // Fetch applied migrations
  const applied = await query(
    "SELECT hash FROM drizzle.__drizzle_migrations ORDER BY id"
  );
  const appliedHashes = new Set(applied.map((r) => r.hash));

  // Load local migrations with their hashes
  const { createHash } = await import("node:crypto");
  const pending = [];
  for (const entry of journal.entries) {
    const sqlPath = resolve(`drizzle/${entry.tag}.sql`);
    const sql = readFileSync(sqlPath, "utf8");
    const hash = createHash("sha256").update(sql).digest("hex");
    if (!appliedHashes.has(hash)) {
      pending.push({ tag: entry.tag, sql, hash, when: entry.when });
    }
  }

  if (pending.length === 0) {
    console.log("No pending migrations.");
    return;
  }

  for (const migration of pending) {
    console.log(`Applying ${migration.tag}...`);
    // Strip drizzle-kit breakpoint markers before executing
    const cleanSql = migration.sql.replace(/--> statement-breakpoint/g, "");
    await query(cleanSql);
    await query(
      `INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('${migration.hash}', ${migration.when})`
    );
    console.log(`  done.`);
  }

  console.log(`${pending.length} migration(s) applied.`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
