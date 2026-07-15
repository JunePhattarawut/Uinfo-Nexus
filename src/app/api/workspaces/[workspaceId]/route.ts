import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import * as workspaceService from "@/modules/workspace/service";

export async function GET(_req: Request, ctx: { params: Promise<{ workspaceId: string }> }) {
  try {
    const user = await requireUser();
    const { workspaceId } = await ctx.params;
    const workspace = await workspaceService.getWorkspace(user.id, workspaceId);
    return Response.json({ workspace });
  } catch (err) {
    return errorResponse(err);
  }
}
