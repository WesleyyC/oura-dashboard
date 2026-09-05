import { link, lstat, mkdtemp, open, rmdir, unlink } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import { decryptTokenSet, encryptTokenSet, isValidEncryptionKeyText } from "../../features/oura-connection/server.ts";

// Offline only. No environment/config discovery, network access, or original writes.
export async function prepareRecoveryCopy({ sourcePath, outputPath, oldKey, newKey, apply = false }) {
  let source;
  let target;
  let temporaryDirectory;
  let temporaryFile;
  try {
    if (!path.isAbsolute(sourcePath) || !(await lstat(sourcePath)).isFile() ||
      !isValidEncryptionKeyText(oldKey) ||
      newKey !== undefined && (!isValidEncryptionKeyText(newKey) || Buffer.from(oldKey, "base64url").equals(Buffer.from(newKey, "base64url"))) ||
      apply && (!newKey || !outputPath || !path.isAbsolute(outputPath) || sourcePath === outputPath)) throw new Error();
    source = new DatabaseSync(sourcePath, { readOnly: true, allowExtension: false });
    if (apply) {
      temporaryDirectory = await mkdtemp(path.join(path.dirname(outputPath), ".oura-recovery-"));
      temporaryFile = path.join(temporaryDirectory, "database.sqlite");
      const file = await open(temporaryFile, "wx", 0o600);
      await file.close();
      // VACUUM INTO works on the supported Node 22.13 SQLite runtime. Take
      // one consistent snapshot before validating and rotating that copy.
      source.prepare("VACUUM INTO ?").run(temporaryFile);
      source.close();
      source = new DatabaseSync(temporaryFile, { readOnly: true, allowExtension: false });
    }
    source.exec("PRAGMA trusted_schema = OFF; BEGIN");
    verifyDatabase(source);
    const rows = source.prepare("SELECT owner_id, profile_id, ciphertext, nonce, encryption_version, expires_at, granted_scopes FROM oura_credentials").all();
    const profileCount = source.prepare("SELECT count(*) AS n FROM health_profiles").get().n;
    const rotated = [];
    for (const row of rows) {
      const context = { ownerId: row.owner_id, profileId: row.profile_id, version: row.encryption_version };
      const tokens = await decryptTokenSet({ ciphertext: row.ciphertext, nonce: row.nonce, encryptionVersion: row.encryption_version }, context, oldKey);
      if (tokens.expiresAt !== row.expires_at || JSON.stringify(tokens.grantedScopes) !== row.granted_scopes) throw new Error();
      if (newKey) {
        const encrypted = await encryptTokenSet(tokens, context, newKey);
        // Verify before publishing any copy. Plaintext never leaves this process.
        await decryptTokenSet(encrypted, context, newKey);
        rotated.push({ ...encrypted, ownerId: row.owner_id, profileId: row.profile_id });
      }
    }
    if (apply) {
      source.close();
      source = null;
      target = new DatabaseSync(temporaryFile, { allowExtension: false });
      target.exec("PRAGMA trusted_schema = OFF; PRAGMA foreign_keys = ON; BEGIN IMMEDIATE");
      const update = target.prepare("UPDATE oura_credentials SET ciphertext = ?, nonce = ?, encryption_version = ?, updated_at = ? WHERE owner_id = ? AND profile_id = ?");
      for (const row of rotated) {
        if (update.run(row.ciphertext, row.nonce, row.encryptionVersion, new Date().toISOString(), row.ownerId, row.profileId).changes !== 1) throw new Error();
      }
      // A restored snapshot must not resurrect one-use capabilities or live work.
      target.exec("DELETE FROM oura_oauth_states; DELETE FROM oura_connection_invites;");
      target.prepare("UPDATE health_sync_state_profile SET status = CASE WHEN status = 'refreshing' THEN 'failed' ELSE status END, safe_error_code = CASE WHEN status = 'refreshing' THEN 'refresh_interrupted' ELSE safe_error_code END, lease_id = NULL, lock_expires_at = NULL").run();
      verifyDatabase(target);
      target.exec("COMMIT");
      target.close();
      target = null;
      // Atomic publication that refuses existing files and symlinks.
      await link(temporaryFile, outputPath);
    }
    return { mode: apply ? "rotated-copy" : newKey ? "dry-run" : "verify", credentialCount: rows.length, profileCount, databaseVerified: true };
  } catch {
    throw new Error("Recovery validation failed; no source changes were made. Check paths, schema, keys, and output availability privately.");
  } finally {
    target?.close();
    source?.close();
    if (temporaryFile) await unlink(temporaryFile).catch(() => {});
    if (temporaryDirectory) await rmdir(temporaryDirectory).catch(() => {});
  }
}

function verifyDatabase(db) {
  const check = db.prepare("PRAGMA quick_check").all();
  if (check.length !== 1 || Object.values(check[0])[0] !== "ok" || db.prepare("PRAGMA foreign_key_check").all().length) throw new Error();
  // Reject pre-lease snapshots until migrated in a separate, private restore copy.
  db.prepare("SELECT lease_id FROM health_sync_state_profile LIMIT 0").all();
}

async function main() {
  const [mode, sourcePath, outputPath, ...extra] = process.argv.slice(2);
  if (!["verify", "dry-run", "rotate-copy"].includes(mode) || !sourcePath || extra.length ||
    mode === "rotate-copy" && !outputPath || mode !== "rotate-copy" && outputPath) {
    throw new Error("Usage: node --import tsx scripts/recovery/rotate-vault.mjs verify|dry-run|rotate-copy /absolute/source.sqlite [/absolute/new-copy.sqlite]");
  }
  const result = await prepareRecoveryCopy({
    sourcePath, outputPath, oldKey: process.env.OURA_RECOVERY_OLD_KEY,
    newKey: mode === "verify" ? undefined : process.env.OURA_RECOVERY_NEW_KEY,
    apply: mode === "rotate-copy",
  });
  if (mode === "dry-run" && !process.env.OURA_RECOVERY_NEW_KEY) throw new Error("Recovery key configuration is incomplete");
  console.log(JSON.stringify(result));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
