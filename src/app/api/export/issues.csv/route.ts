import { requireUser } from "@/lib/auth";
import { getActiveWorkspace } from "@/lib/active-workspace";
import { errorResponse } from "@/lib/errors";
import { exportIssuesCsv } from "@/modules/export/service";

export async function GET() { try { const user = await requireUser(); const { active } = await getActiveWorkspace(user.id); if (!active) return Response.json({ error: { code: "NOT_FOUND", message: "No active workspace" } }, { status: 404 }); const body = await exportIssuesCsv(user.id, active.id); return new Response(body, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": "attachment; filename=issues.csv" } }); } catch (e) { return errorResponse(e); } }
