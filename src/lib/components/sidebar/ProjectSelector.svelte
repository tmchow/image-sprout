<script lang="ts">
  import {
    projects,
    activeProjectId,
    activeProject,
    createProject,
    switchProject,
  } from '../../stores/projects.svelte';

  let dropdownOpen = $state(false);
  let showNewProjectInput = $state(false);
  let newProjectName = $state('');
  let isCreating = $state(false);
  let error = $state<string | null>(null);

  const hasProjects = $derived(projects.length > 0);
  const currentProject = $derived(activeProject());

  async function handleCreateProject() {
    const trimmed = newProjectName.trim();
    if (!trimmed || isCreating) return;

    isCreating = true;
    error = null;
    try {
      await createProject(trimmed);
      newProjectName = '';
      showNewProjectInput = false;
      dropdownOpen = false;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to create project';
      console.error('Failed to create project:', e);
    } finally {
      isCreating = false;
    }
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      handleCreateProject();
    } else if (event.key === 'Escape') {
      newProjectName = '';
      showNewProjectInput = false;
    }
  }

  async function handleSwitchProject(id: string) {
    dropdownOpen = false;
    error = null;
    try {
      await switchProject(id);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to switch project';
      console.error('Failed to switch project:', e);
    }
  }

  function toggleDropdown() {
    dropdownOpen = !dropdownOpen;
    if (!dropdownOpen) {
      showNewProjectInput = false;
    }
  }

  function handleNewProjectClick() {
    showNewProjectInput = true;
  }
</script>

<div class="relative" data-testid="project-selector">
  {#if error}
    <p data-testid="project-selector-error" class="px-4 py-1 text-xs text-red-600">{error}</p>
  {/if}
  {#if !hasProjects && !currentProject}
    <!-- Empty state: no projects exist -->
    <div class="px-4 py-3">
      <p class="text-sm font-medium text-slate-700 mb-2">Create your first project</p>
      <input
        data-testid="new-project-input"
        type="text"
        placeholder="Project name..."
        class="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        bind:value={newProjectName}
        onkeydown={handleKeyDown}
      />
    </div>
  {:else}
    <!-- Project selector dropdown -->
    <button
      data-testid="project-selector-trigger"
      class="flex items-center justify-between w-full mt-2 px-2.5 py-1.5 text-left text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-md hover:bg-slate-100 transition-colors cursor-pointer"
      onclick={toggleDropdown}
    >
      <span class="truncate">{currentProject?.name ?? 'Select project'}</span>
      <svg
        class="w-3.5 h-3.5 text-slate-400 transition-transform duration-200 {dropdownOpen ? 'rotate-180' : ''}"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        stroke-width="2"
      >
        <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
      </svg>
    </button>

    {#if dropdownOpen}
      <div
        data-testid="project-dropdown-list"
        class="absolute left-0 right-0 z-10 mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-64 overflow-y-auto"
      >
        {#each projects as project (project.id)}
          <button
            data-testid="project-option-{project.id}"
            class="flex items-center w-full px-3 py-2 text-left text-sm transition-colors cursor-pointer {activeProjectId.value === project.id ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-slate-700 hover:bg-slate-50'}"
            onclick={() => handleSwitchProject(project.id)}
          >
            <span class="truncate">{project.name}</span>
            {#if activeProjectId.value === project.id}
              <svg class="ml-auto w-4 h-4 text-indigo-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            {/if}
          </button>
        {/each}

        <div class="border-t border-slate-100">
          {#if showNewProjectInput}
            <div class="px-3 py-2">
              <input
                data-testid="new-project-input"
                type="text"
                placeholder="Project name..."
                class="w-full px-2 py-1.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                bind:value={newProjectName}
                onkeydown={handleKeyDown}
              />
            </div>
          {:else}
            <button
              data-testid="new-project-button"
              class="flex items-center w-full px-3 py-2 text-left text-sm text-indigo-600 hover:bg-indigo-50 transition-colors cursor-pointer"
              onclick={handleNewProjectClick}
            >
              <svg class="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              New Project
            </button>
          {/if}
        </div>
      </div>
    {/if}
  {/if}
</div>
