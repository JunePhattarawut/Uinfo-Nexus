import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { createCommentSchema } from "@/modules/issue/schemas";
import * as issueService from "@/modules/issue/service";

export async function POST(req: Request, { params }: { params: Promise<{ workspaceId: string; issueId: string }> }) {
  try {
    const user = await requireUser();
    const { workspaceId, issueId } = await params;
    const input = createCommentSchema.parse(await req.json());
    const comment = await issueService.addComment(user.id, workspaceId, issueId, input);
    return Response.json({ comment }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
