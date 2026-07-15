import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getActiveWorkspace } from "@/lib/active-workspace";
import * as codex from "@/modules/codex/service";
import { movePageSchema } from "@/modules/codex/schemas";

const moveRequestSchema = z.object({
  spaceKey: z.string().trim().min(1),
  pageId: z.string().min(1),
  parentId: z.string().min(1).nullable().optional(),
  beforePageId: z.string().min(1).nullable().optional(),
  afterPageId: z.string().min(1).nullable().optional(),
});

export async function POST(request: Request) {
  const user = await requireUser();
  const { active } = await getActiveWorkspace(user.id);
  if (!active) return NextResponse.json({ error: "No active workspace" }, { status: 404 });
  const input = moveRequestSchema.parse(await request.json());
  const moved = await codex.movePage(user.id, active.id, input.pageId, movePageSchema.parse({
    parentId: input.parentId ?? null,
    beforePageId: input.beforePageId ?? null,
    afterPageId: input.afterPageId ?? null,
  }));
  revalidatePath(`/s/${input.spaceKey}`);
  revalidatePath(`/s/${input.spaceKey}/pages/${input.pageId}`);
  return NextResponse.json({ ok: true, pageId: moved.id, parentId: moved.parentId, rank: moved.rank });
}
