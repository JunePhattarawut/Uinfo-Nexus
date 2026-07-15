import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import * as agile from "@/modules/agile/service";

export async function POST(_req: Request, { params }: { params: Promise<{ workspaceId: string; sprintId: string }> }) {
  try {
    const user = await requireUser();
    const { workspaceId, sprintId } = await params;
    const sprint = await agile.startSprint(user.id, workspaceId, sprintId);
    return Response.json({ sprint });
  } catch (err) { return errorResponse(err); }
}
