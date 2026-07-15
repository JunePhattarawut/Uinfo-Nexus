import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { createSprintSchema } from "@/modules/agile/schemas";
import * as agile from "@/modules/agile/service";

export async function POST(req: Request, { params }: { params: Promise<{ workspaceId: string }> }) {
  try {
    const user = await requireUser();
    const { workspaceId } = await params;
    const sprint = await agile.createSprint(user.id, workspaceId, createSprintSchema.parse(await req.json()));
    return Response.json({ sprint }, { status: 201 });
  } catch (err) { return errorResponse(err); }
}
