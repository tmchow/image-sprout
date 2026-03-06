<script lang="ts">
  import { sessions, loadSessions } from '../../stores/sessions.svelte.ts'
  import { activeProjectId, projectStatus } from '../../stores/projects.svelte.ts'
  import { generationState, loadSession, deleteSessionFromGeneration, startNewSessionDraft } from '../../stores/generation.svelte.ts'

  interface Props {
    onOpenSettings?: () => void;
  }

  let { onOpenSettings }: Props = $props()

  // Load sessions when the active project changes
  $effect(() => {
    const projectId = activeProjectId.value;
    if (projectId) {
      loadSessions(projectId);
    }
  });

  function formatRelativeTime(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHour < 24) return `${diffHour}h ago`;
    if (diffDay < 7) return `${diffDay}d ago`;
    return date.toLocaleDateString();
  }

  async function handleSelectSession(sessionId: string) {
    await loadSession(sessionId);
  }

  async function handleDeleteSession(e: MouseEvent, sessionId: string) {
    e.stopPropagation();
    await deleteSessionFromGeneration(sessionId);
    // Also remove from the sessions list
    const projectId = activeProjectId.value;
    if (projectId) {
      await loadSessions(projectId);
    }
  }

  function handleNewSession() {
    startNewSessionDraft();
  }

  const canGenerate = $derived(projectStatus.value?.readiness.generate ?? false)
</script>

<div class="flex items-center justify-between px-4 py-2 border-b border-slate-100">
  <h2 class="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Sessions</h2>
  <button
    data-testid="new-session-button"
    class="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-800 transition-colors cursor-pointer"
    onclick={handleNewSession}
  >
    New Session
  </button>
</div>

{#if sessions.length === 0}
  <div data-testid="session-history-empty" class="px-4 py-6">
    <div class="bg-slate-50 rounded-lg p-4 text-center">
      {#if canGenerate}
        <p class="text-sm text-slate-500">Generate from the main canvas to create the first session for this project.</p>
      {:else}
        <p class="text-sm text-slate-500 mb-3">Set up references and guides before generating the first session for this project.</p>
        <button
          data-testid="empty-state-settings-link"
          class="text-sm font-medium text-accent-600 hover:text-accent-700 transition-colors cursor-pointer"
          onclick={() => onOpenSettings?.()}
        >
          Open Project Settings
        </button>
      {/if}
    </div>
  </div>
{:else}
  <div data-testid="session-history-list" class="py-1">
    {#each sessions as session (session.id)}
      <div
        data-testid="session-item-{session.id}"
        class="flex items-center w-full px-4 py-2.5 text-left hover:bg-slate-50 transition-colors cursor-pointer group {generationState.activeSessionId === session.id ? 'bg-accent-50 border-r-2 border-accent-500' : ''}"
        onclick={() => handleSelectSession(session.id)}
        onkeydown={(e) => e.key === 'Enter' && handleSelectSession(session.id)}
        role="button"
        tabindex="0"
      >
        <div class="flex-1 min-w-0">
          <p class="text-sm text-slate-700 truncate">{session.prompt}</p>
          <p class="text-xs text-slate-400">{formatRelativeTime(session.updatedAt)}</p>
        </div>
        <button
          data-testid="delete-session-{session.id}"
          class="ml-2 p-1 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
          onclick={(e) => handleDeleteSession(e, session.id)}
          aria-label="Delete session"
        >
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    {/each}
  </div>
{/if}
