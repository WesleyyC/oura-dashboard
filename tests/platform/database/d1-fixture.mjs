import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";

// Exercise production prepared SQL against SQLite, never a hosted database.
export async function createD1Fixture(t) {
  const sqlite = new DatabaseSync(":memory:");
  t.after(() => sqlite.close());
  sqlite.exec("PRAGMA foreign_keys = ON");
  const journal = JSON.parse(await readFile(new URL("../../../drizzle/meta/_journal.json", import.meta.url), "utf8"));
  for (const { tag } of journal.entries) {
    sqlite.exec((await readFile(new URL(`../../../drizzle/${tag}.sql`, import.meta.url), "utf8")).replaceAll("--> statement-breakpoint", ""));
  }
  const prepare = (query, values = []) => ({
    bind(...bound) {
      if (bound.length > 100) throw new Error("D1 statement exceeds 100 bound parameters");
      return prepare(query, bound);
    },
    async run() {
      const result = sqlite.prepare(query).run(...values);
      return { success: true, results: [], meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
    },
    async all() {
      return { success: true, results: sqlite.prepare(query).all(...values), meta: { changes: 0 } };
    },
    async raw() { return sqlite.prepare(query).all(...values).map((row) => Object.values(row)); },
  });
  const binding = {
    prepare,
    async batch(statements) {
      sqlite.exec("BEGIN");
      try {
        const result = [];
        for (const statement of statements) result.push(await statement.all());
        sqlite.exec("COMMIT");
        return result;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
  return { sqlite, binding };
}
