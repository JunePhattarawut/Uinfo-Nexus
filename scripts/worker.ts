import { Worker } from "bullmq";
import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connection = { url: process.env.REDIS_URL ?? "redis://localhost:6379" };
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const worker = new Worker(
  "notifications",
  async (job) => {
    const { workspaceId, userId, type, payload } = job.data as {
      workspaceId: string;
      userId: string;
      type: string;
      payload: Record<string, unknown>;
    };
    const [workspace, user] = await Promise.all([
      prisma.workspace.findUnique({ where: { id: workspaceId }, select: { id: true } }),
      prisma.user.findUnique({ where: { id: userId }, select: { id: true } }),
    ]);
    if (!workspace || !user) {
      console.warn(`[worker] skipped stale notification job ${job.id}: workspace/user no longer exists (${workspaceId} -> ${userId})`);
      return "skipped-stale-target";
    }

    const notification = await prisma.notification.create({ data: { workspaceId, userId, type, payload: payload as Prisma.InputJsonValue } });
    console.log(`[worker] notification ${notification.id} ${type} -> ${userId}`);
    return notification.id;
  },
  { connection },
);

worker.on("failed", (job, err) => console.error(`[worker] job ${job?.id} failed`, err));
console.log("WorkHub worker ready: notifications queue");

process.on("SIGINT", async () => {
  await worker.close();
  await prisma.$disconnect();
  process.exit(0);
});
