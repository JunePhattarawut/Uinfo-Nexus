import { prisma } from "../src/lib/db";
import { rebuildWorkspaceSearchIndex } from "../src/modules/search/service";

async function main() {
  const workspaceSlug = process.argv[2];
  const workspace = workspaceSlug
    ? await prisma.workspace.findUnique({ where: { slug: workspaceSlug } })
    : await prisma.workspace.findFirst({ orderBy: { createdAt: "asc" } });

  if (!workspace) throw new Error(workspaceSlug ? `Workspace not found: ${workspaceSlug}` : "No workspace found");

  const adminMembership = await prisma.membership.findFirst({
    where: { workspaceId: workspace.id, role: { in: ["OWNER", "ADMIN"] } },
    orderBy: { createdAt: "asc" },
  });
  if (!adminMembership) throw new Error(`No OWNER/ADMIN membership found for workspace ${workspace.slug}`);

  const result = await rebuildWorkspaceSearchIndex(adminMembership.userId, workspace.id);
  console.log(`Indexed ${result.indexed} documents into ${process.env.WORKHUB_SEARCH_INDEX || "workhub_search"} for workspace ${workspace.slug}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
