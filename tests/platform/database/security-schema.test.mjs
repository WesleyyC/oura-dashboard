import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const migrationUrl = new URL(
  "../../../drizzle/0006_security_hardening.sql",
  import.meta.url,
);

test("every journaled migration applies in order to a fresh database", async () => {
  const journal = JSON.parse(
    await readFile(new URL("../../../drizzle/meta/_journal.json", import.meta.url), "utf8"),
  );
  assert.equal(journal.entries.length, 8);
  assert.deepEqual(
    journal.entries.map(({ idx }) => idx),
    journal.entries.map((_, index) => index),
  );

  const db = new DatabaseSync(":memory:");
  for (const { tag } of journal.entries) {
    const source = await readFile(
      new URL(`../../../drizzle/${tag}.sql`, import.meta.url),
      "utf8",
    );
    db.exec(source.replaceAll("--> statement-breakpoint", ""));
    if (tag === "0004_sites_hosted_oura") {
      assert.deepEqual(
        db.prepare("SELECT slug, display_name FROM health_profiles ORDER BY sort_order").all()
          .map(({ slug, display_name }) => ({ slug, display_name })),
        [
          { slug: "member-one", display_name: "Alex" },
          { slug: "member-two", display_name: "Blair" },
        ],
      );
    }
  }

  const tables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
  ).all().map(({ name }) => name);
  for (const table of [
    "health_accounts",
    "health_daily_profile",
    "health_profiles",
    "oura_connection_invites",
    "oura_credentials",
    "oura_oauth_states",
    "security_rate_limits",
  ]) {
    assert.equal(tables.includes(table), true, `missing final table: ${table}`);
  }
  assert.deepEqual(db.prepare("SELECT id FROM health_profiles").all(), []);
  assert.equal(
    db.prepare("SELECT name FROM pragma_table_info('health_profiles') WHERE name = 'color_key'").get().name,
    "color_key",
  );
});

test("legacy migrations use generic member fixtures", async () => {
  const sources = await Promise.all([
    readFile(new URL("../../../drizzle/0003_nice_pretty_boy.sql", import.meta.url), "utf8"),
    readFile(new URL("../../../drizzle/0004_sites_hosted_oura.sql", import.meta.url), "utf8"),
  ]);
  const combined = sources.join("\n");
  for (const required of ["member-one", "member-two", "Alex", "Blair"]) {
    assert.equal(
      new RegExp(`\\b${required}\\b`).test(combined),
      true,
      `missing generic fixture: ${required}`,
    );
  }
  for (const privateTerm of ["wes" + "ley", "car" + "rie"]) {
    assert.equal(
      new RegExp(`\\b${privateTerm}\\b`, "i").test(combined),
      false,
      "legacy migration still contains a private fixture",
    );
  }
});

test("security migration deletes only unclaimed legacy rows and caps profiles at eight", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE health_accounts (
      owner_id text PRIMARY KEY NOT NULL,
      created_at text NOT NULL,
      legacy_claimed_at text
    );
    CREATE TABLE health_profiles (
      id text PRIMARY KEY NOT NULL,
      owner_id text NOT NULL REFERENCES health_accounts(owner_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
      slug text NOT NULL,
      display_name text NOT NULL,
      sort_order integer NOT NULL,
      status text NOT NULL,
      created_at text NOT NULL,
      updated_at text NOT NULL
    );
    INSERT INTO health_accounts VALUES
      ('__legacy_unclaimed__', '2026-07-30T00:00:00.000Z', NULL),
      ('owner-a', '2026-08-01T00:00:00.000Z', NULL);
    INSERT INTO health_profiles VALUES
      ('legacy-profile', '__legacy_unclaimed__', 'member-one', 'Alex', 0,
       'connected', '2026-07-30T00:00:00.000Z', '2026-07-30T00:00:00.000Z');
  `);

  const migration = (await readFile(migrationUrl, "utf8"))
    .replaceAll("--> statement-breakpoint", "");
  db.exec(migration);

  assert.equal(
    db.prepare("SELECT count(*) AS count FROM health_accounts WHERE owner_id = ?")
      .get("__legacy_unclaimed__").count,
    0,
  );
  assert.equal(
    db.prepare("SELECT count(*) AS count FROM health_accounts WHERE owner_id = ?")
      .get("owner-a").count,
    1,
  );
  assert.equal(
    db.prepare("SELECT count(*) AS count FROM health_profiles WHERE id = ?")
      .get("legacy-profile").count,
    0,
  );

  const insert = db.prepare(`
    INSERT INTO health_profiles
      (id, owner_id, slug, display_name, sort_order, status, created_at, updated_at)
    VALUES (?, 'owner-a', ?, ?, ?, ?, ?, ?)
  `);
  for (let index = 0; index < 8; index += 1) {
    insert.run(
      `profile-${index}`,
      `person-${index}`,
      `Person ${index}`,
      index,
      index === 7 ? "disabled" : "pending",
      "2026-08-01T12:00:00.000Z",
      "2026-08-01T12:00:00.000Z",
    );
  }
  assert.throws(
    () => insert.run(
      "profile-8",
      "person-8",
      "Person 8",
      8,
      "pending",
      "2026-08-01T12:00:00.000Z",
      "2026-08-01T12:00:00.000Z",
    ),
    /health_profile_limit_reached/,
  );
  db.prepare("DELETE FROM health_profiles WHERE id = ?").run("profile-0");
  assert.doesNotThrow(() => insert.run(
    "profile-8",
    "person-8",
    "Person 8",
    8,
    "pending",
    "2026-08-01T12:00:00.000Z",
    "2026-08-01T12:00:00.000Z",
  ));
  db.close();
});
