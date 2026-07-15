import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { issueLinkSchema } from "@/modules/integration/schemas";
import * as integration from "@/modules/integration/service";
export async function GET(req: Request, ctx: { params: Promise<{ workspaceId: string }> }) { try { const user = await requireUser(); const { workspaceId } = await ctx.params; const issueId = new URL(req.url).searchParams.get("issueId"); if (!issueId) return Response.json({ error: { code: "VALIDATION", message: "issueId required" } }, { status: 400 }); return Response.json(await integration.listIssueLinks(user.id, workspaceId, issueId)); } catch (e) { return errorResponse(e); } }
export async function POST(req: Request, ctx: { params: Promise<{ workspaceId: string }> }) { try { const user = await requireUser(); const { workspaceId } = await ctx.params; return Response.json(await integration.createIssueLink(user.id, workspaceId, issueLinkSchema.parse(await req.json()))); } catch (e) { return errorResponse(e); } }
