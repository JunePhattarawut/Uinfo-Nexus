import { prisma } from "@/lib/db";

export async function listNotifications(userId: string, workspaceId: string) {
  return prisma.notification.findMany({
    where: { userId, workspaceId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
}

export async function unreadNotificationCount(userId: string, workspaceId: string) {
  return prisma.notification.count({ where: { userId, workspaceId, readAt: null } });
}
