<script lang="ts">
  import {
    addModel,
    removeModel,
    restoreDefaultModels,
    setDefaultModel,
    settingsState,
    updateModel,
  } from '../../stores/settings.svelte.ts';

  interface Props {
    open: boolean;
    onClose: () => void;
  }

  let { open, onClose }: Props = $props();

  let newModelId = $state('');
  let newLabel = $state('');
  let busy = $state(false);
  let error = $state<string | null>(null);

  async function handleAddModel() {
    const id = newModelId.trim();
    if (!id || busy) return;

    busy = true;
    error = null;
    try {
      await addModel({
        id,
        label: newLabel.trim() || undefined,
      });
      newModelId = '';
      newLabel = '';
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to add model';
    } finally {
      busy = false;
    }
  }

  async function handleSetDefault(modelId: string) {
    busy = true;
    error = null;
    try {
      await setDefaultModel(modelId);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to set default model';
    } finally {
      busy = false;
    }
  }

  async function handleRemove(modelId: string) {
    busy = true;
    error = null;
    try {
      await removeModel(modelId);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to remove model';
    } finally {
      busy = false;
    }
  }

  async function handleRestoreDefaults() {
    busy = true;
    error = null;
    try {
      await restoreDefaultModels();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to restore defaults';
    } finally {
      busy = false;
    }
  }

  async function handleLabelChange(modelId: string, event: Event) {
    const label = (event.target as HTMLInputElement).value;
    try {
      await updateModel(modelId, { label });
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to update label';
    }
  }

</script>

{#if open}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 px-4"
    onclick={(event) => event.target === event.currentTarget && onClose()}
    onkeydown={(event) => event.key === 'Escape' && onClose()}
    role="dialog"
    aria-modal="true"
    aria-label="Manage models"
    tabindex="-1"
  >
    <div class="w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl">
      <div class="flex items-center justify-between border-b border-slate-200 px-6 py-4">
        <div>
          <h2 class="text-lg font-semibold text-slate-900">Manage Models</h2>
          <p class="mt-1 text-sm text-slate-500">These models are shared between the CLI and web app. Restore defaults anytime.</p>
        </div>
        <button
          class="rounded-md p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
          onclick={onClose}
          aria-label="Close"
        >
          <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div class="max-h-[80vh] overflow-y-auto px-6 py-5">
        <div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
          <h3 class="text-sm font-semibold text-slate-900">Add Model</h3>
          <div class="mt-3 grid gap-3 md:grid-cols-[1.8fr_1fr_auto]">
            <input
              type="text"
              class="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              placeholder="OpenRouter model id, e.g. provider/model-name"
              value={newModelId}
              oninput={(event) => (newModelId = (event.target as HTMLInputElement).value)}
            />
            <input
              type="text"
              class="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              placeholder="Friendly label (optional)"
              value={newLabel}
              oninput={(event) => (newLabel = (event.target as HTMLInputElement).value)}
            />
            <button
              class="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              disabled={busy || !newModelId.trim()}
              onclick={handleAddModel}
            >
              Add
            </button>
          </div>
          <p class="mt-2 text-xs text-slate-500">If the label is omitted, Image Sprout will use the OpenRouter model name when it can fetch it. Only OpenRouter models that accept image input and return image output can be added.</p>
        </div>

        {#if error}
          <p class="mt-4 text-sm text-red-600">{error}</p>
        {/if}

        <div class="mt-6 space-y-3">
          {#each settingsState.availableModels as model (model.id)}
            <div class="rounded-2xl border border-slate-200 bg-white px-4 py-4">
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <p class="truncate text-sm font-semibold text-slate-900">{model.label}</p>
                    {#if settingsState.defaultModelId === model.id}
                      <span class="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">Default</span>
                    {/if}
                    <span class="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">{model.source}</span>
                  </div>
                  <p class="mt-1 break-all font-mono text-xs text-slate-500">{model.id}</p>
                </div>

                <div class="flex items-center gap-2">
                  {#if settingsState.defaultModelId !== model.id}
                    <button
                      class="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                      onclick={() => handleSetDefault(model.id)}
                    >
                      Set Default
                    </button>
                  {/if}
                  {#if model.source === 'user'}
                    <button
                      class="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 cursor-pointer"
                      onclick={() => handleRemove(model.id)}
                    >
                      Remove
                    </button>
                  {/if}
                </div>
              </div>

              <div class="mt-3">
                <input
                  type="text"
                  class="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                  value={model.label}
                  onblur={(event) => handleLabelChange(model.id, event)}
                />
                <p class="mt-2 text-xs text-slate-500">
                  Image Sprout validates this model against OpenRouter and handles compatibility automatically.
                </p>
              </div>
            </div>
          {/each}
        </div>
      </div>

      <div class="flex items-center justify-between border-t border-slate-200 px-6 py-4">
        <button
          class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
          onclick={handleRestoreDefaults}
        >
          Restore Defaults
        </button>
        <button
          class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 cursor-pointer"
          onclick={onClose}
        >
          Done
        </button>
      </div>
    </div>
  </div>
{/if}
