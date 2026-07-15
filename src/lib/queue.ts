type NotificationJob = {
  workspaceId: string;
  userId: string;
  type: string;
  payload: Record<string, unknown>;
};

const connection = { url: process.env.REDIS_URL ?? "redis://localhost:6379" };

let notificationQueuePromise: Promise<import("bullmq").Queue<NotificationJob>> | null = null;

async function getNotificationQueue() {
  notificationQueuePromise ??= import("bullmq").then(({ Queue }) =>
    new Queue<NotificationJob>("notifications", { connection }),
  );
  return notificationQueuePromise;
}

export async function enqueueNotification(job: NotificationJob) {
  try {
    const notificationQueue = await getNotificationQueue();
    await notificationQueue.add(job.type, job, { attempts: 3, backoff: { type: "exponential", delay: 500 } });
  } catch (err) {
    console.error("Failed to enqueue notification", err);
  }
}
