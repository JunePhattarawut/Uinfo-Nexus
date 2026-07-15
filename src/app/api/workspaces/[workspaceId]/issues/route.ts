import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { createIssueSchema, issueFiltersSchema } from "@/modules/issue/schemas";
import * as issueService from "@/modules/issue/service";

export async function GET(req: Request, { params }: { params: Promise<{ workspaceId: string }> }) {
  try {
    const user = await requireUser();
    const { workspaceId } = await params;
    const url = new URL(req.url);
    const filters = issueFiltersSchema.parse(Object.fromEntries(url.searchParams.entries()));
    const issues = await issueService.listIssues(user.id, workspaceId, filters);
    return Response.json({ issues });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ workspaceId: string }> }) {
  try {
    const user = await requireUser();
    const { workspaceId } = await params;
    const input = createIssueSchema.parse(await req.json());
    const issue = await issueService.createIssue(user.id, workspaceId, input);
    return Response.json({ issue }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
