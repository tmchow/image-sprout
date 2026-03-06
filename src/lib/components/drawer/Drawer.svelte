<script lang="ts">
  import GenerationForm from './GenerationForm.svelte'
  import { settingsState } from '../../stores/settings.svelte.ts'
  import { generate, generationState } from '../../stores/generation.svelte.ts'

  interface Props {
    onOpenSettings?: () => void
    onOpenModelSettings?: () => void
  }

  let { onOpenSettings, onOpenModelSettings }: Props = $props()

  let expanded = $state(true)
  let prompt = $state('')
  let hadSessionContext = false

  let hasSessionContext = $derived(
    generationState.activeSessionId !== null || generationState.sessionRuns.length > 0
  )

  $effect(() => {
    if (hasSessionContext && !hadSessionContext) {
      expanded = false
    }
    if (!hasSessionContext && hadSessionContext) {
      prompt = generationState.prompt
      expanded = true
    }
    hadSessionContext = hasSessionContext
  })

  function toggle() {
    expanded = !expanded
  }

  async function handleGenerate() {
    try {
      await generate({ prompt: prompt.trim() })
    } catch (e) {
      console.error('handleGenerate: unexpected error', e)
    }
  }

  let summaryText = $derived(
    hasSessionContext
      ? 'Next iteration settings'
      : prompt.trim() || 'Describe what you want to generate...'
  )
</script>

<div
  data-testid="drawer"
  class="border-t border-slate-200 bg-white transition-all duration-200 ease-in-out {expanded ? 'expanded' : ''}"
>
  <button
    data-testid="drawer-collapsed-bar"
    class="flex items-center w-full px-4 h-[44px] text-left text-sm text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer gap-2"
    onclick={toggle}
  >
    <svg
      class="w-4 h-4 text-slate-400 transition-transform duration-200 {expanded ? 'rotate-180' : ''}"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      stroke-width="2"
    >
      <path stroke-linecap="round" stroke-linejoin="round" d="M5 15l7-7 7 7" />
    </svg>
    {#if !expanded}
      <span class="truncate text-slate-500">{summaryText}</span>
    {/if}
    <span class="ml-auto flex items-center gap-2 text-xs text-slate-400">
      <span>{settingsState.sizePreset}</span>
      <span class="text-slate-300">|</span>
      <span>{settingsState.imageCount} images</span>
    </span>
  </button>

  {#if expanded}
    <div data-testid="drawer-content" class="px-4 pb-4">
      <GenerationForm
        bind:prompt
        variant={hasSessionContext ? 'settings' : 'full'}
        onGenerate={handleGenerate}
        {onOpenSettings}
        {onOpenModelSettings}
      />
    </div>
  {/if}
</div>
