<script lang="ts">
  import SizePresets from './SizePresets.svelte'
  import { settingsState, setImageCount, setModel } from '../../stores/settings.svelte.ts'
  import { generationState } from '../../stores/generation.svelte.ts'
  import { projectStatus } from '../../stores/projects.svelte.ts'
  import { SUPPORTED_IMAGE_COUNTS, type ImageModel, type ProjectStatus } from '../../types'

  interface Props {
    prompt?: string
    onGenerate?: () => void
    onOpenSettings?: () => void
    onOpenModelSettings?: () => void
    variant?: 'full' | 'settings'
  }

  let { prompt = $bindable(''), onGenerate, onOpenSettings, onOpenModelSettings, variant = 'full' }: Props = $props()

  const imageCounts = SUPPORTED_IMAGE_COUNTS

  function handlePromptInput(event: Event) {
    const target = event.target as HTMLTextAreaElement
    prompt = target.value
  }

  function handleGenerate() {
    if (!generateDisabled) {
      onGenerate?.()
    }
  }

  function handleModelChange(event: Event) {
    const target = event.target as HTMLSelectElement
    setModel(target.value as ImageModel)
  }

  function readinessMessage(status: ProjectStatus | null): string | null {
    if (!status || status.readiness.generate) {
      return null
    }

    if (status.mode === 'none') {
      return 'Add shared, style, or subject references in Project Settings to get this project ready.'
    }

    const missing: string[] = []
    if ((status.mode === 'style' || status.mode === 'both') && !status.guides.stylePresent) {
      missing.push('visual style')
    }
    if ((status.mode === 'subject' || status.mode === 'both') && !status.guides.subjectPresent) {
      missing.push('subject guide')
    }

    if (missing.length === 2) {
      return 'Generate a visual style and subject guide from your references in Project Settings before generating.'
    }
    if (missing[0] === 'visual style') {
      return 'Generate a visual style from your references in Project Settings before generating.'
    }
    if (missing[0] === 'subject guide') {
      return 'Generate a subject guide from your references in Project Settings before generating.'
    }

    return 'Finish setting up this project in Project Settings before generating.'
  }

  let generateDisabled = $derived(
    !prompt.trim() ||
    !settingsState.apiKeyConfigured ||
    !projectStatus.value?.readiness.generate ||
    generationState.status === 'generating'
  )

  let blockedReason = $derived(readinessMessage(projectStatus.value))
  let showPromptComposer = $derived(variant === 'full')
  let showGenerateButton = $derived(variant === 'full')
</script>

<div data-testid="generation-form" class="space-y-3">
  {#if showPromptComposer}
    <textarea
      data-testid="prompt-textarea"
      class="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none resize-none"
      rows="2"
      placeholder="Describe what you want to generate..."
      value={prompt}
      oninput={handlePromptInput}
    ></textarea>
  {/if}

  <div class="flex items-start justify-between gap-4">
    <div class="flex items-center gap-6">
      <div class="flex flex-col gap-1">
        <span class="text-xs text-slate-500">Size</span>
        <SizePresets />
      </div>

      <div class="flex flex-col gap-1">
        <span class="text-xs text-slate-500">Images</span>
        <div class="flex items-center gap-1.5">
          {#each imageCounts as count (count)}
            <button
              data-testid="image-count-{count}"
              class="w-7 h-7 rounded-full text-xs font-medium transition-colors cursor-pointer {settingsState.imageCount === count
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-200 text-slate-700 hover:bg-slate-300'}"
              onclick={() => setImageCount(count)}
            >
              {count}
            </button>
          {/each}
        </div>
      </div>

      <div class="flex flex-col gap-1">
        <span class="text-xs text-slate-500">Model</span>
        <div class="flex items-center gap-1.5">
          <select
            data-testid="model-select"
            class="text-xs text-slate-700 bg-slate-200 rounded-full px-3 py-1 font-medium cursor-pointer hover:bg-slate-300 transition-colors focus:outline-none focus:ring-1 focus:ring-indigo-500 appearance-none pr-6 bg-no-repeat bg-[length:12px] bg-[right_8px_center] bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2364748b%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22M6%209l6%206%206-6%22%2F%3E%3C%2Fsvg%3E')]"
            value={settingsState.model}
            onchange={handleModelChange}
          >
            {#each settingsState.availableModels as m (m.id)}
              <option value={m.id}>{m.label}</option>
            {/each}
          </select>
          {#if onOpenModelSettings}
            <button
              type="button"
              data-testid="model-settings-button"
              class="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700 cursor-pointer"
              onclick={() => onOpenModelSettings?.()}
              aria-label="Manage models"
            >
              <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          {/if}
        </div>
      </div>
    </div>

    {#if showGenerateButton}
      <div class="flex max-w-64 flex-col items-end gap-1.5">
        <button
          data-testid="generate-button"
          class="px-4 py-1.5 rounded-lg text-sm font-medium transition-colors {generateDisabled
            ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
            : 'bg-indigo-600 text-white hover:bg-indigo-700 cursor-pointer'}"
          disabled={generateDisabled}
          onclick={handleGenerate}
        >
          {generationState.status === 'generating' ? 'Generating...' : 'Generate'}
        </button>

        {#if blockedReason}
          <p class="text-right text-xs text-amber-700">
            {blockedReason}
          </p>
          {#if onOpenSettings}
            <button
              type="button"
              class="text-xs font-medium text-amber-800 underline decoration-amber-300 underline-offset-2 hover:text-amber-900 cursor-pointer"
              onclick={() => onOpenSettings?.()}
            >
              Open Project Settings
            </button>
          {/if}
        {/if}
      </div>
    {/if}
  </div>
</div>
