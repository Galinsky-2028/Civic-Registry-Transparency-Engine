import { getDatabasePool } from "../../../lib/database";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // A bounded, read-only query verifies connectivity and schema readiness.
    const query = {
      text: "SELECT id FROM civic_registry_schema_migrations WHERE id = '0013'",
      query_timeout: 3000,
    };
    const result = await getDatabasePool().query(query);
    if (result.rowCount !== 1) throw new Error("Schema is not ready");
    return Response.json({ status: "ready" }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json({ status: "unavailable" }, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
