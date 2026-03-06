<script lang="ts">
  import type { SizePreset } from '../../types';
  import { generationState, reset } from '../../stores/generation.svelte';
  import { settingsState } from '../../stores/settings.svelte';
  import ImageCard from './ImageCard.svelte';

  let previewIndex = $state<number | null>(null);

  function currentSizePreset(): SizePreset {
    return generationState.sessionRuns[generationState.activeRunIndex]?.sizePreset ?? settingsState.sizePreset;
  }

  function gridClass(count: number, sizePreset: SizePreset): string {
    if (count >= 6) {
      if (sizePreset === '1:1') {
        return 'grid-cols-2 xl:grid-cols-3';
      }
      return 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3';
    }
    return 'grid-cols-1 lg:grid-cols-2';
  }

  function gridWidthClass(count: number, sizePreset: SizePreset): string {
    if (count >= 6) {
      if (sizePreset === '1:1') {
        return 'max-w-4xl';
      }
      if (sizePreset === '9:16') {
        return 'max-w-4xl';
      }
      return 'max-w-7xl';
    }
    if (count >= 4) {
      if (sizePreset === '1:1') {
        return 'max-w-4xl';
      }
      return 'max-w-6xl';
    }
    if (sizePreset === '1:1') {
      return 'max-w-4xl';
    }
    return 'max-w-5xl';
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

  function openPreview(index: number): void {
    previewIndex = index;
  }

  function closePreview(): void {
    previewIndex = null;
  }

  let previewResult = $derived(
    previewIndex === null ? null : generationState.results[previewIndex] ?? null
  );

  let hasCurrentResults = $derived(generationState.results.length > 0);
  let activeRun = $derived(generationState.sessionRuns[generationState.activeRunIndex] ?? null);
  let generationLabel = $derived(
    generationState.status === 'generating'
      ? activeRun
        ? `Generating a new variation from ${activeRun.sizePreset} · ${activeRun.imageCount} images...`
        : 'Generating images...'
      : null
  );

  function handlePreviewBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      closePreview();
    }
  }
</script>

{#if generationState.status === 'idle' && generationState.results.length === 0}
  <!-- Empty state -->
  <div class="flex-1 flex items-center justify-center">
    <div class="text-center">
      <p class="text-slate-500 text-sm">Generate images to see results here</p>
      <svg class="mx-auto mt-2 w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
      </svg>
    </div>
  </div>
{:else if generationState.status === 'generating' && !hasCurrentResults}
  <!-- Initial loading state with explicit progress messaging -->
  <div class="flex-1 flex items-center justify-center px-6">
    <div class="w-full max-w-5xl">
      <div class="mb-4 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-center">
        <p class="text-sm font-semibold text-indigo-700">Generating images</p>
        <p class="mt-1 text-sm text-indigo-600">This can take a few seconds depending on the model and image count.</p>
      </div>
      <div
        data-testid="results-grid"
        class={`grid self-start items-start ${gridClass(settingsState.imageCount, settingsState.sizePreset)} gap-4 p-4 w-full ${gridWidthClass(settingsState.imageCount, settingsState.sizePreset)} mx-auto`}
      >
        {#each Array(settingsState.imageCount) as _, i}
          <div
            data-testid="skeleton-{i}"
            class="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-200"
            style={`aspect-ratio: ${aspectRatioValue(settingsState.sizePreset)};`}
          >
            <div class="absolute inset-0 animate-pulse bg-gradient-to-br from-slate-200 via-slate-100 to-slate-200"></div>
          </div>
        {/each}
      </div>
    </div>
  </div>
{:else if generationState.status === 'generating' && hasCurrentResults}
  <!-- Iteration loading state keeps the current results visible -->
  <div class="relative w-full">
    <div
      data-testid="results-grid"
      class={`grid self-start items-start ${gridClass(generationState.results.length, currentSizePreset())} gap-4 p-4 w-full ${gridWidthClass(generationState.results.length, currentSizePreset())} mx-auto opacity-45 transition-opacity`}
    >
      {#each generationState.results as result, i}
        <ImageCard {result} index={i} onPreview={openPreview} sizePreset={currentSizePreset()} />
      {/each}
    </div>
    <div class="pointer-events-none absolute inset-0 flex items-start justify-center p-6">
      <div class="rounded-2xl border border-indigo-200 bg-white/96 px-4 py-3 text-center shadow-lg backdrop-blur-sm">
        <div class="mx-auto mb-2 h-5 w-5 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600"></div>
        <p class="text-sm font-semibold text-slate-800">Generating next run</p>
        <p class="mt-1 text-sm text-slate-600">{generationLabel}</p>
      </div>
    </div>
  </div>
{:else if generationState.status === 'error'}
  <!-- Error state -->
  <div class="flex-1 flex items-center justify-center">
    <div class="text-center space-y-3">
      <div class="mx-auto w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
        <svg class="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
      </div>
      <p class="text-sm text-red-600">{generationState.error}</p>
      <button
        data-testid="retry-button"
        class="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors cursor-pointer"
        onclick={reset}
      >
        Try Again
      </button>
      <p class="text-xs text-slate-400 mt-1">Returns to the generation form</p>
    </div>
  </div>
{:else if generationState.status === 'complete' && generationState.results.length > 0}
  <!-- Results grid -->
  <div
    data-testid="results-grid"
    class={`grid self-start items-start ${gridClass(generationState.results.length, currentSizePreset())} gap-4 p-4 w-full ${gridWidthClass(generationState.results.length, currentSizePreset())} mx-auto`}
  >
    {#each generationState.results as result, i}
      <ImageCard {result} index={i} onPreview={openPreview} sizePreset={currentSizePreset()} />
    {/each}
  </div>
{/if}

{#if previewResult?.status === 'success' && previewIndex !== null}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    data-testid="image-preview-backdrop"
    class="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/75 p-6"
    onclick={handlePreviewBackdrop}
    onkeydown={(event) => event.key === 'Escape' && closePreview()}
    role="dialog"
    aria-modal="true"
    aria-label="Image preview"
    tabindex="-1"
  >
    <div class="relative w-full max-w-7xl">
      <button
        type="button"
        data-testid="image-preview-close"
        class="absolute right-3 top-3 z-10 rounded-full bg-black/50 p-2 text-white hover:bg-black/70 cursor-pointer"
        onclick={closePreview}
        aria-label="Close preview"
      >
        <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      <img
        data-testid="image-preview"
        src={previewResult.imageDataUrl}
        alt={`Generated image ${previewIndex + 1} preview`}
        class="mx-auto max-h-[85vh] w-auto max-w-full rounded-2xl bg-slate-950 object-contain shadow-2xl"
      />
    </div>
  </div>
{/if}
