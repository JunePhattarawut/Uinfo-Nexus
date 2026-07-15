import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getActiveWorkspace } from "@/lib/active-workspace";
import { prisma } from "@/lib/db";
import { getAttachmentObject } from "@/lib/object-storage";
import { requireMembership } from "@/lib/tenancy";

export async function GET(_: Request, { params }: { params: Promise<{ attachmentId: string }> }) {
  const user = await requireUser();
  const { active } = await getActiveWorkspace(user.id);
  if (!active) return NextResponse.json({ error: "No active workspace" }, { status: 404 });
  await requireMembership(user.id, active.id, "VIEWER");
  const { attachmentId } = await params;
  const attachment = await prisma.attachment.findFirst({ where: { id: attachmentId, workspaceId: active.id } });
  if (!attachment) return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
  const object = await getAttachmentObject(attachment.storageKey);
  return new Response(object.bytes, {
    headers: {
      "content-type": object.contentType || attachment.mimeType || "application/octet-stream",
      "content-length": String(object.bytes.length),
      "content-disposition": `attachment; filename="${attachment.filename.replace(/"/g, "")}"`,
      "cache-control": "private, max-age=60",
    },
  });
}
