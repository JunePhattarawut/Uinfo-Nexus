import { cookies } from "next/headers";
import * as workspaceService from "@/modules/workspace/service";

const COOKIE = "wh_workspace";

/** Resolve the active workspace for the signed-in user (cookie -> first membership). */
export async function getActiveWorkspace(userId: string) {
  const workspaces = await workspaceService.listMyWorkspaces(userId);
  if (workspaces.length === 0) return { active: null, workspaces };

  const cookieStore = await cookies();
  const preferred = cookieStore.get(COOKIE)?.value;
  const active = workspaces.find((w) => w.id === preferred) ?? workspaces[0];
  return { active, workspaces };
}

export const WORKSPACE_COOKIE = COOKIE;
