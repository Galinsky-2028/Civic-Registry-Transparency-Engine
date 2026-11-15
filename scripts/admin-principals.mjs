import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

export function bootstrapPrincipals(env) {
  if (env.CIVIC_REGISTRY_ADMIN_PRINCIPALS?.trim()) return env.CIVIC_REGISTRY_ADMIN_PRINCIPALS;
  const editor = env.CIVIC_REGISTRY_EDITOR_TOKEN ?? "";
  const reviewer = env.CIVIC_REGISTRY_REVIEWER_TOKEN ?? "";
  const publisher = env.CIVIC_REGISTRY_PUBLISHER_TOKEN ?? "";
  if (!editor && !reviewer && !publisher) return "[]";
  if ([editor, reviewer, publisher].some(token => token.length < 32) ||
      new Set([editor, reviewer, publisher]).size !== 3) {
    throw new Error("Distinct editor, reviewer, and publisher credentials of at least 32 characters are required.");
  }
  const digest = token => createHash("sha256").update(token).digest("hex");
  return JSON.stringify([
    { actorId: "registry-editor", roles: ["editor"], tokenSha256: digest(editor) },
    { actorId: "registry-reviewer", roles: ["reviewer"], tokenSha256: digest(reviewer) },
    { actorId: "registry-publisher", roles: ["publisher"], tokenSha256: digest(publisher) },
  ]);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.stdout.write(bootstrapPrincipals(process.env)); }
  catch { console.error("Administrator bootstrap credentials are invalid."); process.exitCode = 1; }
}
