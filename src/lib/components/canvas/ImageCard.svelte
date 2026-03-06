<script lang="ts">
  import type { GenerationResult, SizePreset } from '../../types';
  import { toggleSelection } from '../../stores/generation.svelte';

  interface Props {
    result: GenerationResult;
    index: number;
    sizePreset?: SizePreset;
    onPreview?: (index: number) => void;
  }

  let { result, index, sizePreset = '16:9', onPreview }: Props = $props();

  let showCopied = $state(false);
  let copyError = $state('');

  function handleClick() {
    toggleSelection(index);
  }

  function handleCardKeydown(event: KeyboardEvent) {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleClick();
    }
  }

  function downloadImage(event: MouseEvent) {
    event.stopPropagation();
    if (result.status !== 'success') return;
    const link = document.createElement('a');
    link.href = result.imageDataUrl;
    link.download = `image-sprout-${index + 1}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  /**
   * Convert a data URL to a Blob without using fetch(), which may fail under
   * strict Content Security Policy (CSP) rules.
   */
  function dataUrlToBlob(dataUrl: string): Blob {
    const [header, base64] = dataUrl.split(',');
    const mimeMatch = header.match(/:(.*?);/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
    const bytes = atob(base64);
    const byteArray = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) {
      byteArray[i] = bytes.charCodeAt(i);
    }
    return new Blob([byteArray], { type: mimeType });
  }

  async function copyToClipboard(event: MouseEvent) {
    event.stopPropagation();
    if (result.status !== 'success') return;
    try {
      const blob = dataUrlToBlob(result.imageDataUrl);
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob })
      ]);
      showCopied = true;
      copyError = '';
      setTimeout(() => { showCopied = false; }, 2000);
    } catch {
      copyError = 'Copy not supported in this browser';
      showCopied = false;
    }
  }

  function handlePreview(event: MouseEvent) {
    event.stopPropagation();
    if (result.status !== 'success') return;
    onPreview?.(index);
  }

  function aspectRatioValue(preset: SizePreset): string {
    if (preset === '1:1') {
      return '1 / 1';
    }
    if (preset === '9:16') {
      return '9 / 16';
    }
    return '16 / 9';
  }
</script>

<div
  data-testid="image-card-{index}"
  class={`group relative block w-full self-start overflow-hidden rounded-lg transition-all ${result.selected ? 'ring-2 ring-indigo-600' : 'ring-1 ring-slate-200'} cursor-pointer`}
  style={result.status === 'success' ? '' : `aspect-ratio: ${aspectRatioValue(sizePreset)};`}
  role="button"
  tabindex="0"
  aria-pressed={result.selected}
  aria-label={`Select generated image ${index + 1}`}
  onclick={handleClick}
  onkeydown={handleCardKeydown}
>
  {#if result.status === 'success'}
    <div class="bg-slate-100">
      <img
        src={result.imageDataUrl}
        alt="Generated image {index + 1}"
        class="block h-auto w-full select-none pointer-events-none"
      />
    </div>
  {:else}
    <div class="absolute inset-0 flex items-center justify-center bg-slate-100 p-4">
      <p class="text-sm text-red-600 text-center">{result.error}</p>
    </div>
  {/if}

  <!-- Index number -->
  <span
    data-testid="image-index-{index}"
    class="absolute top-2 left-2 bg-black/50 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center"
  >
    {index + 1}
  </span>

  <!-- Selection checkmark overlay -->
  {#if result.selected}
    <div
      data-testid="checkmark-{index}"
      class="absolute top-2 right-2 bg-indigo-600 text-white rounded-full w-6 h-6 flex items-center justify-center"
    >
      <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
        <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    </div>
  {/if}

  <!-- Export toolbar (success results only) -->
  {#if result.status === 'success'}
    <div
      data-testid="export-toolbar-{index}"
      class="absolute bottom-0 left-0 right-0 z-10 flex items-center justify-center gap-2 bg-black/60 p-1.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
    >
      <button
        type="button"
        data-testid="preview-btn-{index}"
        class="inline-flex cursor-pointer rounded bg-white/20 p-1 text-white transition-colors hover:bg-white/40"
        title="View larger"
        onclick={handlePreview}
        aria-label={`View generated image ${index + 1} larger`}
      >
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
        </svg>
      </button>

      <button
        type="button"
        data-testid="download-btn-{index}"
        class="inline-flex cursor-pointer rounded bg-white/20 p-1 text-white transition-colors hover:bg-white/40"
        title="Download PNG"
        onclick={downloadImage}
        aria-label={`Download generated image ${index + 1} as PNG`}
      >
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V3" />
        </svg>
      </button>

      <!-- Copy to clipboard button -->
      <button
        type="button"
        data-testid="copy-btn-{index}"
        class="inline-flex cursor-pointer rounded bg-white/20 p-1 text-white transition-colors hover:bg-white/40"
        title="Copy to clipboard"
        onclick={copyToClipboard}
        aria-label={`Copy generated image ${index + 1} to clipboard`}
      >
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
        </svg>
      </button>

      <!-- Copy feedback -->
      {#if showCopied}
        <span data-testid="copy-feedback-{index}" class="text-xs text-green-300 font-medium">Copied!</span>
      {/if}
      {#if copyError}
        <span data-testid="copy-error-{index}" class="text-xs text-red-300 font-medium">{copyError}</span>
      {/if}
    </div>
  {/if}
</div>
