import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { issuePageLinkSchema } from "@/modules/integration/schemas";
import * as integration from "@/modules/integration/service";
export async function GET(req: Request, ctx: { params: Promise<{ workspaceId: string }> }) { try { const user = await requireUser(); const { workspaceId } = await ctx.params; const url = new URL(req.url); return Response.json(await integration.listIssuePageLinks(user.id, workspaceId, url.searchParams.get("issueId") ?? undefined, url.searchParams.get("pageId") ?? undefined)); } catch (e) { return errorResponse(e); } }
export async function POST(req: Request, ctx: { params: Promise<{ workspaceId: string }> }) { try { const user = await requireUser(); const { workspaceId } = await ctx.params; return Response.json(await integration.linkIssuePage(user.id, workspaceId, issuePageLinkSchema.parse(await req.json()))); } catch (e) { return errorResponse(e); } }
export async function DELETE(req: Request, ctx: { params: Promise<{ workspaceId: string }> }) { try { const user = await requireUser(); const { workspaceId } = await ctx.params; await integration.unlinkIssuePage(user.id, workspaceId, issuePageLinkSchema.parse(await req.json())); return Response.json({ ok: true }); } catch (e) { return errorResponse(e); } }
