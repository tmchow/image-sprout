import type { Session } from '../types';
import { deleteSessionRequest, listSessionsRequest } from '../api/local-bridge';
import { activeProjectId } from './projects.svelte';

let _sessions = $state<Session[]>([]);

export const sessions: Session[] = new Proxy([] as Session[], {
  get(_target, prop) {
    return Reflect.get(_sessions, prop);
  },
  has(_target, prop) {
    return Reflect.has(_sessions, prop);
  },
});

export async function loadSessions(projectId: string): Promise<void> {
  _sessions = await listSessionsRequest(projectId);
}

export async function refreshSessions(projectId: string): Promise<void> {
  _sessions = await listSessionsRequest(projectId);
}

export async function removeSession(id: string): Promise<void> {
  const projectId = activeProjectId.value;
  if (!projectId) return;
  await deleteSessionRequest(projectId, id);
  _sessions = _sessions.filter((s) => s.id !== id);
}

export function resetSessionsStore(): void {
  _sessions = [];
}
