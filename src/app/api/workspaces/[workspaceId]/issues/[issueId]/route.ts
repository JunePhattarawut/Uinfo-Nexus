import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { updateIssueSchema } from "@/modules/issue/schemas";
import * as issueService from "@/modules/issue/service";

export async function PATCH(req: Request, { params }: { params: Promise<{ workspaceId: string; issueId: string }> }) {
  try {
    const user = await requireUser();
    const { workspaceId, issueId } = await params;
    const input = updateIssueSchema.parse(await req.json());
    const issue = await issueService.updateIssue(user.id, workspaceId, issueId, input);
    return Response.json({ issue });
  } catch (err) {
    return errorResponse(err);
  }
}
