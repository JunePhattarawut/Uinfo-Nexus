import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { moveToSprintSchema } from "@/modules/agile/schemas";
import * as agile from "@/modules/agile/service";

export async function POST(req: Request, { params }: { params: Promise<{ workspaceId: string }> }) {
  try {
    const user = await requireUser();
    const { workspaceId } = await params;
    const issue = await agile.moveIssueToSprint(user.id, workspaceId, moveToSprintSchema.parse(await req.json()));
    return Response.json({ issue });
  } catch (err) { return errorResponse(err); }
}
