<script lang="ts">
  import { generationState, selectedResults, setFeedback, clearSelection, generate } from '../../stores/generation.svelte';

  let localFeedback = $state('');

  let selected = $derived(selectedResults());
  let hasResults = $derived(generationState.results.length > 0);
  let isGenerating = $derived(generationState.status === 'generating');
  let showIterate = $derived(selected.length > 0 || localFeedback.length > 0);
  let activeRun = $derived(generationState.sessionRuns[generationState.activeRunIndex] ?? null);
  let selectionHint = $derived(
    selected.length > 0
      ? `Using ${selected.length} selected image${selected.length === 1 ? '' : 's'} as visual references for the next iteration.`
      : localFeedback.length > 0
        ? 'No images selected. This iteration will use the project references with your feedback.'
        : 'Tip: click one or more images above to carry them forward visually, then describe the changes you want.'
  );
  let runSummary = $derived(
    activeRun
      ? `${activeRun.sizePreset} · ${activeRun.imageCount} image${activeRun.imageCount === 1 ? '' : 's'} · ${activeRun.model}`
      : null
  );

  function handleFeedbackInput(event: Event) {
    const input = event.target as HTMLInputElement;
    localFeedback = input.value;
    setFeedback(input.value);
  }

  async function handleRunAgain() {
    clearSelection();
    setFeedback('');
    localFeedback = '';
    try {
      await generate({ prompt: generationState.prompt });
    } catch (e) {
      console.error('handleRegenerate: unexpected error', e);
    }
  }

  async function handleIterate() {
    try {
      await generate({ prompt: generationState.prompt });
    } catch (e) {
      console.error('handleIterate: unexpected error', e);
    }
    // Clear feedback and selections after generation reads them
    localFeedback = '';
    setFeedback('');
    clearSelection();
  }

</script>

{#if hasResults}
  <div data-testid="action-bar" class="border-t border-slate-200 bg-white px-4 py-2">
    <div class="mb-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0 flex-1">
          <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Prompt Used</p>
          <p class="mt-1 text-sm text-slate-700 whitespace-pre-wrap break-words">{generationState.prompt}</p>
          {#if runSummary}
            <p class="mt-1 text-xs text-slate-500">Run used: {runSummary}</p>
          {/if}
          <p class="mt-2 text-xs text-slate-500">{selectionHint}</p>
        </div>
        {#if selected.length > 0}
          <span data-testid="selected-count" class="shrink-0 text-sm text-slate-500">
            {selected.length} selected
          </span>
        {/if}
      </div>
    </div>

    <div class="flex items-center gap-3">
      <input
        type="text"
        data-testid="feedback-input"
        class="flex-1 px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
        placeholder="Describe changes you'd like..."
        value={localFeedback}
        oninput={handleFeedbackInput}
      />

      <div class="flex items-center gap-2">
        {#if showIterate}
          <button
            type="button"
            data-testid="iterate-button"
            class="px-4 py-1.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isGenerating}
            onclick={handleIterate}
          >
            Iterate
          </button>
        {/if}
        <button
          type="button"
          data-testid="run-again-button"
          class="px-4 py-1.5 text-sm font-medium text-slate-700 bg-slate-200 rounded-lg hover:bg-slate-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={isGenerating}
          onclick={handleRunAgain}
        >
          Run Again
        </button>
      </div>
    </div>
  </div>
{/if}
