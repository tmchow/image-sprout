<script lang="ts">
  import type { SizePreset } from '../../types'
  import { settingsState, setSizePreset } from '../../stores/settings.svelte.ts'

  const presets: { label: string; value: SizePreset }[] = [
    { label: 'Blog Header', value: '16:9' },
    { label: 'Square', value: '1:1' },
    { label: 'Story', value: '9:16' },
  ]
</script>

<div class="flex gap-2" data-testid="size-presets">
  {#each presets as preset (preset.value)}
    <button
      data-testid="size-preset-{preset.value}"
      class="px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer {settingsState.sizePreset === preset.value
        ? 'bg-indigo-600 text-white'
        : 'bg-slate-200 text-slate-700 hover:bg-slate-300'}"
      onclick={() => setSizePreset(preset.value)}
    >
      {preset.label}
    </button>
  {/each}
</div>
