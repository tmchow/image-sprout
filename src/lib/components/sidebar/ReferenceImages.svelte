<script lang="ts">
  import {
    referenceImages,
    addReferenceImage,
    removeReferenceImage,
    updateReferenceImageRole,
  } from '../../stores/projects.svelte.ts';
  import type { ReferenceImage, ReferenceRole } from '../../types';
  import { onDestroy } from 'svelte';

  interface Props {
    title: string;
    description: string;
    role: ReferenceRole;
    emptyLabel: string;
    allowRoleMove?: boolean;
    compact?: boolean;
    headerAction?: {
      label: string;
      checked: boolean;
      disabled?: boolean;
      onChange: (event: Event) => void | Promise<void>;
    };
  }

  let { title, description, role, emptyLabel, allowRoleMove = false, compact = false, headerAction }: Props = $props();

  const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
  const MAX_EDGE = 1024;

  let isDragOver = $state(false);
  let isRefDragOver = $state(false);
  let fileInput: HTMLInputElement | undefined = $state();
  let uploadError = $state<string | null>(null);
  let lightboxImage = $state<ReferenceImage | null>(null);

  const REF_DRAG_MIME = 'application/x-image-sprout-ref';
  const cardWidthClass = $derived(compact ? 'w-32' : 'w-44');
  const plusSizeClass = $derived(compact ? 'text-2xl' : 'text-3xl');

  const objectURLMap = new Map<string, string>();

  const sectionImages = $derived(referenceImages.filter((img) => img.role === role));

  function getObjectURL(img: ReferenceImage): string {
    let url = objectURLMap.get(img.id);
    if (!url) {
      if (!img.blob) {
        return '';
      }
      url = URL.createObjectURL(img.blob);
      objectURLMap.set(img.id, url);
    }
    return url;
  }

  function getImageSrc(img: ReferenceImage): string {
    return img.dataUrl ?? getObjectURL(img);
  }

  function cleanupAllURLs() {
    for (const [, url] of objectURLMap) {
      URL.revokeObjectURL(url);
    }
    objectURLMap.clear();
  }

  $effect(() => {
    const currentIds = new Set(referenceImages.map((img) => img.id));
    for (const [id, url] of objectURLMap) {
      if (!currentIds.has(id)) {
        URL.revokeObjectURL(url);
        objectURLMap.delete(id);
      }
    }
  });

  onDestroy(cleanupAllURLs);

  async function processImageFile(file: File): Promise<void> {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return;
    }

    let bitmap: ImageBitmap | null = null;
    try {
      bitmap = await createImageBitmap(file);
      let { width, height } = bitmap;
      let finalFile = file;

      if (width > MAX_EDGE || height > MAX_EDGE) {
        const scale = MAX_EDGE / Math.max(width, height);
        const newWidth = Math.round(width * scale);
        const newHeight = Math.round(height * scale);

        if (typeof OffscreenCanvas !== 'undefined') {
          const canvas = new OffscreenCanvas(newWidth, newHeight);
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(bitmap, 0, 0, newWidth, newHeight);
          const resizedBlob = await canvas.convertToBlob({ type: file.type });
          finalFile = new File([resizedBlob], file.name, { type: file.type });
          width = newWidth;
          height = newHeight;
        }
      }

      await addReferenceImage(finalFile, width, height, role);
    } finally {
      if (bitmap && typeof bitmap.close === 'function') {
        bitmap.close();
      }
    }
  }

  async function handleFiles(files: FileList | File[]): Promise<void> {
    const fileArray = Array.from(files);
    uploadError = null;
    for (const file of fileArray) {
      try {
        await processImageFile(file);
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Failed to process image';
        uploadError = `Failed to upload ${file.name}: ${message}`;
      }
    }
  }

  function handleFileInputChange(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      handleFiles(input.files);
      input.value = '';
    }
  }

  function handleUploadClick() {
    fileInput?.click();
  }

  function isRefTransfer(event: DragEvent): boolean {
    const types = event.dataTransfer?.types;
    return Array.isArray(types) ? types.includes(REF_DRAG_MIME) : !!types?.includes?.(REF_DRAG_MIME);
  }

  function isFileTransfer(event: DragEvent): boolean {
    const types = event.dataTransfer?.types;
    return Array.isArray(types) ? types.includes('Files') : !!types?.includes?.('Files');
  }

  function handleDragEnter(event: DragEvent) {
    event.preventDefault();
    if (allowRoleMove && isRefTransfer(event)) {
      isRefDragOver = true;
      return;
    }
    if (isFileTransfer(event)) {
      isDragOver = true;
    }
  }

  function handleDragOver(event: DragEvent) {
    if (allowRoleMove && isRefTransfer(event)) {
      event.preventDefault();
      isRefDragOver = true;
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'move';
      }
      return;
    }
    if (isFileTransfer(event)) {
      event.preventDefault();
      isDragOver = true;
    }
  }

  function handleDragLeave(event: DragEvent) {
    event.preventDefault();
    if (event.currentTarget === event.target) {
      isDragOver = false;
      isRefDragOver = false;
    }
  }

  async function handleDrop(event: DragEvent) {
    event.preventDefault();
    isDragOver = false;
    isRefDragOver = false;

    if (allowRoleMove && isRefTransfer(event)) {
      const raw = event.dataTransfer?.getData(REF_DRAG_MIME);
      if (!raw) return;
      try {
        const payload = JSON.parse(raw) as { id?: string; role?: ReferenceRole };
        if (!payload.id || payload.role === role) {
          return;
        }
        await updateReferenceImageRole(payload.id, role);
      } catch (e) {
        uploadError = e instanceof Error ? e.message : 'Failed to move reference';
      }
      return;
    }

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      await handleFiles(files);
    }
  }

  async function handleDelete(id: string) {
    try {
      await removeReferenceImage(id);
    } catch (e) {
      uploadError = e instanceof Error ? e.message : 'Failed to delete image';
    }
  }

  function openLightbox(img: ReferenceImage) {
    lightboxImage = img;
  }

  function closeLightbox() {
    lightboxImage = null;
  }

  function downloadImage(img: ReferenceImage) {
    const url = getImageSrc(img);
    const a = document.createElement('a');
    a.href = url;
    a.download = img.filename;
    a.click();
  }

  function handleRefDragStart(event: DragEvent, img: ReferenceImage) {
    if (!allowRoleMove || !event.dataTransfer) return;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(REF_DRAG_MIME, JSON.stringify({ id: img.id, role: img.role }));
  }

  function handleRefDragEnd() {
    isRefDragOver = false;
  }
</script>

<section class="rounded-xl border border-slate-200 bg-white">
  <div class="border-b border-slate-100 px-4 py-3">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div class="min-w-0">
        <h4 class="text-sm font-semibold text-slate-900">{title}</h4>
        <p class="mt-1 text-xs text-slate-500">{description}</p>
      </div>
      {#if headerAction}
        <label class="flex shrink-0 items-start gap-2 pt-0.5">
          <input
            type="checkbox"
            class="mt-0.5 h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
            checked={headerAction.checked}
            disabled={headerAction.disabled}
            onchange={(event) => void headerAction.onChange(event)}
          />
          <span class="text-sm text-slate-700">{headerAction.label}</span>
        </label>
      {/if}
    </div>
  </div>

  <div
    data-testid={`reference-images-dropzone-${role}`}
    class="px-4 py-4 transition-colors {isDragOver ? 'rounded-b-xl border-2 border-dashed border-amber-400 bg-amber-50' : ''} {isRefDragOver ? 'rounded-b-xl border-2 border-dashed border-sky-400 bg-sky-50/80' : ''}"
    ondragenter={handleDragEnter}
    ondragover={handleDragOver}
    ondragleave={handleDragLeave}
    ondrop={(event) => void handleDrop(event)}
    role="region"
    aria-label={title}
  >
    {#if uploadError}
      <p data-testid={`upload-error-${role}`} class="mb-2 text-xs text-red-600">{uploadError}</p>
    {/if}

    {#if sectionImages.length === 0}
      <div class="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5">
        <p class="text-sm text-slate-500">{emptyLabel}</p>
      </div>
    {/if}

    <div class="mt-3 flex gap-3 overflow-x-auto pb-1">
      {#each sectionImages as img (img.id)}
        <article
          data-testid={`reference-card-${role}-${img.id}`}
          class={`group ${cardWidthClass} shrink-0 rounded-xl border border-slate-200 bg-slate-50 p-2`}
          draggable={allowRoleMove}
          ondragstart={(event) => handleRefDragStart(event, img)}
          ondragend={handleRefDragEnd}
        >
          <div class="relative">
            <button
              class="block aspect-square w-full overflow-hidden rounded-lg bg-slate-100 cursor-pointer"
              onclick={() => openLightbox(img)}
              aria-label="View {img.filename}"
            >
              <img src={getImageSrc(img)} alt={img.filename} class="h-full w-full object-cover" />
            </button>
            <button
              class="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-slate-500 shadow-sm hover:bg-white hover:text-red-600 cursor-pointer"
              onclick={() => handleDelete(img.id)}
              aria-label="Delete {img.filename}"
            >
              <svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8">
                <path stroke-linecap="round" d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          </div>

          <div class="mt-2 flex items-start justify-between gap-2">
            <div class="min-w-0">
              <p class="truncate text-[11px] font-medium text-slate-700" title={img.filename}>
                {img.filename}
              </p>
              <p class="mt-1 text-[11px] text-slate-500">
                {img.role === 'both' ? 'Shared reference' : img.role === 'style' ? 'Style only' : 'Subject only'}
              </p>
            </div>
            {#if allowRoleMove}
              <div
                class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400"
                aria-label="Drag {img.filename} to another reference section"
                title="Drag to another section"
              >
                <svg class="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4">
                  <path stroke-linecap="round" d="M5 3h.01M5 6.5h.01M5 10h.01M5 13h.01M11 3h.01M11 6.5h.01M11 10h.01M11 13h.01" />
                </svg>
              </div>
            {/if}
          </div>
        </article>
      {/each}

      <button
        data-testid={`upload-tile-${role}`}
        class={`flex aspect-square ${cardWidthClass} shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-white text-slate-400 hover:border-amber-400 hover:text-amber-600 transition-colors cursor-pointer`}
        onclick={handleUploadClick}
      >
        <span class={plusSizeClass}>+</span>
      </button>
    </div>

    <input
      bind:this={fileInput}
      type="file"
      accept={ALLOWED_TYPES.join(',')}
      multiple
      class="hidden"
      onchange={handleFileInputChange}
    />
  </div>
</section>

{#if lightboxImage}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4"
    onclick={(event) => {
      if (event.target === event.currentTarget) closeLightbox();
    }}
    role="presentation"
  >
    <div class="max-h-[90vh] max-w-4xl overflow-hidden rounded-xl bg-white shadow-2xl">
      <div class="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div class="min-w-0">
          <h4 class="truncate text-sm font-medium text-slate-900">{lightboxImage.filename}</h4>
          <p class="text-xs text-slate-500">Role: {lightboxImage.role}</p>
        </div>
        <div class="flex items-center gap-2">
          <button
            class="rounded-md px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 cursor-pointer"
            onclick={() => lightboxImage && downloadImage(lightboxImage)}
          >
            Download
          </button>
          <button
            class="rounded-md px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 cursor-pointer"
            onclick={closeLightbox}
          >
            Close
          </button>
        </div>
      </div>
      <img src={getImageSrc(lightboxImage)} alt={lightboxImage.filename} class="max-h-[80vh] w-full object-contain bg-slate-100" />
    </div>
  </div>
{/if}
