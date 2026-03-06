<script lang="ts">
  import { generationState, switchRun } from '../../stores/generation.svelte.ts'
  import type { Run, SizePreset } from '../../types'

  function getFirstSuccessImage(run: Run): string | null {
    const img = run.images.find((i) => i.status === 'success');
    return img?.imageDataUrl ?? null;
  }

  function aspectRatioValue(sizePreset: SizePreset): string {
    if (sizePreset === '1:1') {
      return '1 / 1';
    }
    if (sizePreset === '9:16') {
      return '9 / 16';
    }
    return '16 / 9';
  }

</script>

{#if generationState.sessionRuns?.length > 1}
  <div data-testid="run-strip" class="border-t border-slate-200 bg-white px-4 py-2">
    <div class="flex gap-2 overflow-x-auto">
      {#each generationState.sessionRuns as run, index (run.id)}
        {@const thumbnail = getFirstSuccessImage(run)}
        <button
          data-testid="run-thumbnail-{index}"
          class="flex-shrink-0 flex flex-col items-center gap-1 cursor-pointer group"
          onclick={() => switchRun(index)}
        >
          <div
            data-testid="run-thumbnail-frame-{index}"
            class="h-8 shrink-0 rounded border-2 {generationState.activeRunIndex === index ? 'border-indigo-500' : 'border-slate-200'}"
            style={`aspect-ratio: ${aspectRatioValue(run.sizePreset)};`}
          >
            <div class="flex h-full w-full items-center justify-center overflow-hidden rounded-[4px] bg-slate-100">
              {#if thumbnail}
                <img src={thumbnail} alt="Run {index + 1}" class="block h-full w-full object-contain" />
              {:else}
                <div class="w-full h-full flex items-center justify-center text-slate-400 text-xs">
                  ?
                </div>
              {/if}
            </div>
          </div>
          <span class="text-[10px] text-slate-500 group-hover:text-slate-700">Run {index + 1}</span>
        </button>
      {/each}
    </div>
  </div>
{/if}
