import { requireUser } from "@/lib/auth";
import { getActiveWorkspace } from "@/lib/active-workspace";
import { errorResponse } from "@/lib/errors";
import { exportPagesMarkdown } from "@/modules/export/service";
export async function GET() { try { const user = await requireUser(); const { active } = await getActiveWorkspace(user.id); if (!active) return Response.json({ error: { code: "NOT_FOUND", message: "No active workspace" } }, { status: 404 }); return new Response(await exportPagesMarkdown(user.id, active.id), { headers: { "content-type": "text/markdown; charset=utf-8" } }); } catch (e) { return errorResponse(e); } }
