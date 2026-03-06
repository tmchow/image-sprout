<script lang="ts">
  import { settingsState, setApiKey, clearApiKey } from '../../stores/settings.svelte.ts'
  import { activeProject } from '../../stores/projects.svelte.ts'
  import ProjectSelector from './ProjectSelector.svelte'
  import SessionHistory from './SessionHistory.svelte'

  interface Props {
    onOpenSettings?: () => void;
  }

  let { onOpenSettings }: Props = $props()

  const hasActiveProject = $derived(activeProject() !== undefined)

  let showKeyEditor = $state(false)
  let editingKey = $state(false)
  let newKeyValue = $state('')

  function toggleKeyEditor() {
    showKeyEditor = !showKeyEditor
    editingKey = false
    newKeyValue = ''
  }

  function startEditing() {
    editingKey = true
    newKeyValue = ''
  }

  function saveNewKey() {
    const trimmed = newKeyValue.trim()
    if (trimmed) {
      setApiKey(trimmed)
      editingKey = false
      newKeyValue = ''
    }
  }

  function removeKey() {
    clearApiKey()
    showKeyEditor = false
    editingKey = false
  }

</script>

<aside data-testid="sidebar" class="flex flex-col h-full overflow-y-auto bg-white border-r border-slate-200">
  <div class="px-4 py-3 border-b border-slate-200">
    <h1 class="text-lg font-bold text-slate-900">Image Sprout</h1>
    <ProjectSelector />
  </div>

  {#if hasActiveProject}
    <button
      data-testid="sidebar-settings-button"
      class="flex items-center gap-2 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer border-b border-slate-100"
      onclick={() => onOpenSettings?.()}
    >
      <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
      <span>Project Settings</span>
    </button>
  {/if}

  <div class="flex-1 overflow-y-auto">
    {#if hasActiveProject}
      <SessionHistory onOpenSettings={() => onOpenSettings?.()} />
    {/if}
  </div>

  <div class="border-t border-slate-200 px-4 py-2">
    <button
      data-testid="sidebar-api-key-button"
      class="text-xs text-slate-500 hover:text-accent-600 transition-colors cursor-pointer"
      onclick={toggleKeyEditor}
    >
      API Key
    </button>

    {#if showKeyEditor}
      <div data-testid="sidebar-api-key-editor" class="mt-2 p-2 bg-slate-50 rounded-lg text-xs">
        {#if editingKey}
          <input
            type="password"
            bind:value={newKeyValue}
            placeholder="Enter new API key"
            class="w-full px-2 py-1.5 border border-slate-300 rounded text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-accent-500 mb-2"
          />
          <div class="flex gap-2">
            <button
              data-testid="sidebar-api-key-save"
              onclick={saveNewKey}
              class="px-2 py-1 bg-accent-600 text-white rounded text-xs hover:bg-accent-700 transition-colors cursor-pointer"
            >
              Save
            </button>
            <button
              onclick={() => { editingKey = false; newKeyValue = '' }}
              class="px-2 py-1 text-slate-500 hover:text-slate-700 text-xs cursor-pointer"
            >
              Cancel
            </button>
          </div>
        {:else}
          <p class="text-slate-600 mb-2">
            Key: <span class="font-medium">{settingsState.apiKeyConfigured ? 'Configured' : 'Not set'}</span>
          </p>
          <div class="flex gap-2">
            <button
              data-testid="sidebar-api-key-change"
              onclick={startEditing}
              class="px-2 py-1 text-accent-600 hover:text-accent-700 text-xs cursor-pointer"
            >
              Change
            </button>
            <button
              data-testid="sidebar-api-key-remove"
              onclick={removeKey}
              class="px-2 py-1 text-red-600 hover:text-red-700 text-xs cursor-pointer"
            >
              Remove
            </button>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</aside>
