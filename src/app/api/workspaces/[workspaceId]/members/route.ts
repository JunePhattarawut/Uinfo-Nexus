import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { addMemberSchema } from "@/modules/workspace/schemas";
import * as workspaceService from "@/modules/workspace/service";

export async function GET(_req: Request, ctx: { params: Promise<{ workspaceId: string }> }) {
  try {
    const user = await requireUser();
    const { workspaceId } = await ctx.params;
    const members = await workspaceService.listMembers(user.id, workspaceId);
    return Response.json({ members });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ workspaceId: string }> }) {
  try {
    const user = await requireUser();
    const { workspaceId } = await ctx.params;
    const body = addMemberSchema.parse(await req.json());
    const member = await workspaceService.addMember(user.id, workspaceId, body);
    return Response.json({ member }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
