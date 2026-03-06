<script lang="ts">
  import { onMount } from 'svelte'
  import { settingsState } from './lib/stores/settings.svelte.ts'
  import { loadSettings } from './lib/stores/settings.svelte.ts'
  import { loadProjects } from './lib/stores/projects.svelte.ts'
  import ApiKeySetup from './lib/components/ApiKeySetup.svelte'
  import Sidebar from './lib/components/sidebar/Sidebar.svelte'
  import Canvas from './lib/components/canvas/Canvas.svelte'
  import Drawer from './lib/components/drawer/Drawer.svelte'
  import ModelSettingsModal from './lib/components/settings/ModelSettingsModal.svelte'
  import ProjectSettingsModal from './lib/components/settings/ProjectSettingsModal.svelte'

  let settingsOpen = $state(false)
  let modelSettingsOpen = $state(false)
  let loadError = $state<string | null>(null)

  function openSettings() {
    settingsOpen = true
  }

  function closeSettings() {
    settingsOpen = false
  }

  function openModelSettings() {
    modelSettingsOpen = true
  }

  function closeModelSettings() {
    modelSettingsOpen = false
  }

  onMount(async () => {
    try {
      await loadSettings()
      await loadProjects()
      loadError = null
    } catch (error) {
      loadError = error instanceof Error ? error.message : 'Failed to load app'
    }
  })
</script>

{#if !settingsState.ready || settingsState.loading}
  <div class="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">
    Loading Image Sprout...
  </div>
{:else if loadError || settingsState.loadError}
  <div class="flex min-h-screen items-center justify-center bg-slate-50 px-6">
    <div class="rounded-xl bg-white p-6 text-sm text-red-600 shadow-lg">
      {loadError ?? settingsState.loadError}
    </div>
  </div>
{:else if !settingsState.apiKeyConfigured}
  <ApiKeySetup />
{:else}
  <div
    data-testid="layout"
    class="grid h-screen"
    style="grid-template-columns: 300px 1fr"
  >
    <Sidebar onOpenSettings={openSettings} />

    <div data-testid="canvas-column" class="flex flex-col min-h-0 overflow-hidden">
      <Canvas />
      <Drawer onOpenSettings={openSettings} onOpenModelSettings={openModelSettings} />
    </div>
  </div>

  <ProjectSettingsModal open={settingsOpen} onClose={closeSettings} />
  <ModelSettingsModal open={modelSettingsOpen} onClose={closeModelSettings} />
{/if}
