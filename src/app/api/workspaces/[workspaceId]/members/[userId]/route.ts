import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { updateMemberRoleSchema } from "@/modules/workspace/schemas";
import * as workspaceService from "@/modules/workspace/service";

type Ctx = { params: Promise<{ workspaceId: string; userId: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    const { workspaceId, userId } = await ctx.params;
    const body = updateMemberRoleSchema.parse(await req.json());
    const member = await workspaceService.updateMemberRole(user.id, workspaceId, userId, body);
    return Response.json({ member });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    const { workspaceId, userId } = await ctx.params;
    await workspaceService.removeMember(user.id, workspaceId, userId);
    return new Response(null, { status: 204 });
  } catch (err) {
    return errorResponse(err);
  }
}
