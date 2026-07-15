import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { createWorkspaceSchema } from "@/modules/workspace/schemas";
import * as workspaceService from "@/modules/workspace/service";

export async function GET() {
  try {
    const user = await requireUser();
    const workspaces = await workspaceService.listMyWorkspaces(user.id);
    return Response.json({ workspaces });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = createWorkspaceSchema.parse(await req.json());
    const workspace = await workspaceService.createWorkspace(user.id, body);
    return Response.json({ workspace }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
