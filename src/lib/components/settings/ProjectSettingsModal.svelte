<script lang="ts">
  import ReferenceImages from '../sidebar/ReferenceImages.svelte';
  import {
    activeProject,
    activeProjectId,
    deriveProject,
    mergeSpecializedReferenceImagesToShared,
    projectStatus,
    referenceImages,
    updateProject,
  } from '../../stores/projects.svelte.ts';
  import { settingsState } from '../../stores/settings.svelte.ts';
  import type { DeriveTarget } from '../../types';

  interface Props {
    open: boolean;
    onClose: () => void;
  }

  let { open, onClose }: Props = $props();

  let subjectGuide = $state('');
  let visualStyle = $state('');
  let instructions = $state('');
  let savedSubjectGuide = $state('');
  let savedVisualStyle = $state('');
  let savedInstructions = $state('');

  let activeDeriveTarget = $state<DeriveTarget | null>(null);
  let deriveError = $state<string | null>(null);
  let deriveNotice = $state<string | null>(null);
  let separateReferenceSets = $state(false);
  let roleModeBusy = $state(false);
  let showSharedReferenceArea = $state(false);
  let showInstructions = $state(false);

  let specializedReferenceCount = $derived(referenceImages.filter((img) => img.role !== 'both').length);
  let sharedReferenceCount = $derived(referenceImages.filter((img) => img.role === 'both').length);
  let hasSeparateReferenceSets = $derived(specializedReferenceCount > 0);

  let initialized = false;
  $effect(() => {
    if (open && !initialized) {
      const project = activeProject();
      subjectGuide = project?.subjectGuide ?? '';
      visualStyle = project?.visualStyle ?? '';
      instructions = project?.instructions ?? '';
      savedSubjectGuide = subjectGuide;
      savedVisualStyle = visualStyle;
      savedInstructions = instructions;
      deriveError = null;
      deriveNotice = null;
      activeDeriveTarget = null;
      separateReferenceSets = referenceImages.some((img) => img.role !== 'both');
      roleModeBusy = false;
      showSharedReferenceArea = referenceImages.some((img) => img.role === 'both');
      showInstructions = (project?.instructions ?? '').trim().length > 0;
      initialized = true;
    }
    if (!open) {
      initialized = false;
    }
  });

  $effect(() => {
    if (open && hasSeparateReferenceSets) {
      separateReferenceSets = true;
    }
  });

  $effect(() => {
    if (sharedReferenceCount > 0) {
      showSharedReferenceArea = true;
    }
  });

  let hasChanges = $derived(
    subjectGuide !== savedSubjectGuide ||
      visualStyle !== savedVisualStyle ||
      instructions !== savedInstructions
  );

  async function triggerDerive(target: DeriveTarget) {
    const id = activeProjectId.value;
    if (!id || activeDeriveTarget) return;

    activeDeriveTarget = target;
    deriveError = null;
    deriveNotice = null;
    try {
      const result = await deriveProject(id, target, { persist: false });
      if (target === 'both' || target === 'style') {
        visualStyle = result.visualStyle ?? '';
      }
      if (target === 'both' || target === 'subject') {
        subjectGuide = result.subjectGuide ?? '';
      }
      deriveNotice =
        target === 'both'
          ? 'Style and subject guides were derived. Review them, then save to apply.'
          : target === 'style'
            ? 'Visual style was derived. Save to apply it.'
            : 'Subject guide was derived. Save to apply it.';
    } catch (e) {
      deriveError = e instanceof Error ? e.message : 'Derivation failed';
    } finally {
      activeDeriveTarget = null;
    }
  }

  async function handleSave() {
    const id = activeProjectId.value;
    if (!id) return;

    try {
      await updateProject(id, { subjectGuide, visualStyle, instructions });
      savedSubjectGuide = subjectGuide;
      savedVisualStyle = visualStyle;
      savedInstructions = instructions;
      deriveNotice = null;
      onClose();
    } catch (e) {
      deriveError = e instanceof Error ? e.message : 'Failed to save settings';
    }
  }

  function handleCancel() {
    subjectGuide = savedSubjectGuide;
    visualStyle = savedVisualStyle;
    instructions = savedInstructions;
    deriveError = null;
    deriveNotice = null;
    onClose();
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      handleCancel();
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      handleCancel();
    }
  }

  function handleSubjectInput(e: Event) {
    subjectGuide = (e.target as HTMLTextAreaElement).value;
    deriveNotice = null;
  }

  function handleStyleInput(e: Event) {
    visualStyle = (e.target as HTMLTextAreaElement).value;
    deriveNotice = null;
  }

  function handleInstructionsInput(e: Event) {
    instructions = (e.target as HTMLTextAreaElement).value;
    deriveNotice = null;
  }

  function deriveDescription(): string {
    if (separateReferenceSets) {
      return 'Derive visual style from style references and subject guide from subject references.';
    }
    return 'Derive both guides from the project references.';
  }

  async function handleSeparateReferenceToggle(event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    if (checked) {
      separateReferenceSets = true;
      return;
    }

    roleModeBusy = true;
    deriveError = null;
    try {
      await mergeSpecializedReferenceImagesToShared();
      separateReferenceSets = false;
    } catch (e) {
      deriveError = e instanceof Error ? e.message : 'Failed to merge references';
      separateReferenceSets = true;
    } finally {
      roleModeBusy = false;
    }
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    data-testid="settings-modal-backdrop"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
    onclick={handleBackdropClick}
    onkeydown={handleKeydown}
    role="dialog"
    aria-modal="true"
    aria-label="Project Settings"
    tabindex="-1"
  >
    <div
      data-testid="settings-modal-panel"
      class="mx-4 flex max-h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-[linear-gradient(180deg,#fffdf7_0%,#ffffff_18%,#f8fafc_100%)] shadow-xl"
    >
      <div class="flex items-center justify-between border-b border-slate-200 px-6 py-4">
        <div>
          <h2 class="text-lg font-semibold text-slate-900">Project Profile</h2>
          <p class="text-sm text-slate-500">Define shared, style-only, and subject-only references, then derive the guides the generator depends on.</p>
        </div>
        <button
          data-testid="settings-modal-close"
          class="p-1 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
          onclick={handleCancel}
          aria-label="Close"
        >
          <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div class="flex-1 overflow-y-auto px-6 py-5">
        <div class="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
          <div class="flex flex-wrap items-center gap-4">
            <div>
              <p class="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">Project Status</p>
              <p class="mt-1 text-sm text-slate-700">
                Mode: <span class="font-medium">{projectStatus.value?.mode ?? 'none'}</span>
              </p>
            </div>
            <div class="grid flex-1 gap-2 text-xs text-slate-700 sm:grid-cols-4">
              <div class="rounded-xl bg-white/80 px-3 py-2">Shared refs: <span class="font-medium">{projectStatus.value?.refs.both ?? 0}</span></div>
              <div class="rounded-xl bg-white/80 px-3 py-2">Style ready: <span class="font-medium">{projectStatus.value?.readiness.style ? 'yes' : 'no'}</span></div>
              <div class="rounded-xl bg-white/80 px-3 py-2">Subject ready: <span class="font-medium">{projectStatus.value?.readiness.subject ? 'yes' : 'no'}</span></div>
              <div class="rounded-xl bg-white/80 px-3 py-2">API key: <span class="font-medium">{settingsState.apiKeyConfigured ? 'configured' : 'missing'}</span></div>
            </div>
          </div>
        </div>

        <div class="mt-6 space-y-4">
          {#if separateReferenceSets}
            <div class="flex items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4">
              <div class="max-w-2xl">
                <h3 class="text-sm font-semibold text-slate-900">Split Reference Sets</h3>
                <p class="mt-1 text-xs text-slate-500">
                  Keep style and subject references separate when the same images should not drive both guides.
                </p>
              </div>
              <label class="flex shrink-0 items-start gap-2 pt-0.5">
                <input
                  type="checkbox"
                  class="mt-0.5 h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                  checked={separateReferenceSets}
                  disabled={roleModeBusy}
                  onchange={handleSeparateReferenceToggle}
                />
                <span class="text-sm text-slate-700">Enabled</span>
              </label>
            </div>

            <div class="grid gap-4 xl:grid-cols-2">
              <ReferenceImages
                title="Visual Style References"
                description="Moodboards, palettes, rendering examples, and composition cues."
                role="style"
                emptyLabel="Upload style-only references when the project's look should be separated from its subject."
                allowRoleMove={true}
                compact={true}
              />
              <ReferenceImages
                title="Subject References"
                description="Character sheets, product shots, or recurring subject references."
                role="subject"
                emptyLabel="Upload subject-only references when the project's subject should be separated from its look."
                allowRoleMove={true}
                compact={true}
              />
            </div>

            {#if sharedReferenceCount > 0 || showSharedReferenceArea}
              <ReferenceImages
                title="Shared References (Optional)"
                description="Keep only the references that should influence both guides. Drag cards here or out to style/subject when needed."
                role="both"
                emptyLabel="Drop shared references here only when an image should influence both style and subject."
                allowRoleMove={true}
                compact={true}
              />
            {:else}
              <div class="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4">
                <p class="text-xs text-slate-600">
                  Need a reference to influence both guides?
                </p>
                <button
                  type="button"
                  class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                  onclick={() => (showSharedReferenceArea = true)}
                >
                  Show Shared References
                </button>
              </div>
            {/if}
          {/if}

          {#if !separateReferenceSets}
            <ReferenceImages
              title="Project References"
              description="Used for both the visual style and subject guide. This is the default reference set for the project."
              role="both"
              emptyLabel="Upload the core references for this project. These will drive both the visual style and the subject guide."
              allowRoleMove={false}
              headerAction={{
                label: 'Split style and subject references',
                checked: separateReferenceSets,
                disabled: roleModeBusy,
                onChange: handleSeparateReferenceToggle,
              }}
            />
          {/if}
        </div>

        <div class="mt-6 rounded-2xl border border-slate-200 bg-white px-5 py-4">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 class="text-sm font-semibold text-slate-900">Derive Guides</h3>
              <p class="mt-1 text-xs text-slate-500">{deriveDescription()}</p>
            </div>
            <div class="flex flex-wrap gap-2">
              <button
                data-testid="derive-both-btn"
                class="rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                disabled={activeDeriveTarget !== null}
                onclick={() => triggerDerive('both')}
              >
                {activeDeriveTarget === 'both' ? 'Deriving style + subject...' : 'Derive Style + Subject'}
              </button>
              <button
                class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                disabled={activeDeriveTarget !== null}
                onclick={() => triggerDerive('style')}
              >
                {activeDeriveTarget === 'style' ? 'Deriving style...' : 'Derive Style'}
              </button>
              <button
                class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                disabled={activeDeriveTarget !== null}
                onclick={() => triggerDerive('subject')}
              >
                {activeDeriveTarget === 'subject' ? 'Deriving subject...' : 'Derive Subject'}
              </button>
            </div>
          </div>

          {#if deriveError}
            <p data-testid="derive-error" class="mt-3 text-xs text-red-600">{deriveError}</p>
          {:else if deriveNotice}
            <p class="mt-3 text-xs text-emerald-700">{deriveNotice}</p>
          {/if}
        </div>

        <div class="mt-6 grid gap-4 xl:grid-cols-2">
          {#if hasChanges}
            <div class="xl:col-span-2">
              <span class="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800">
                Unsaved project profile changes
              </span>
            </div>
          {/if}
          <div class="rounded-2xl border border-slate-200 bg-white">
            <div class="border-b border-slate-100 px-5 py-4">
              <h3 class="text-sm font-semibold text-slate-900">Visual Style</h3>
              <p class="mt-1 min-h-10 text-xs text-slate-500">Describe the rendering style, palette, composition tendencies, and overall art direction.</p>
            </div>
            <div class="px-5 py-4">
              <textarea
                data-testid="style-description-textarea"
                class="min-h-44 w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                placeholder="Describe the visual style for this project..."
                value={visualStyle}
                oninput={handleStyleInput}
              ></textarea>
            </div>
          </div>

          <div class="rounded-2xl border border-slate-200 bg-white">
            <div class="border-b border-slate-100 px-5 py-4">
              <h3 class="text-sm font-semibold text-slate-900">Subject Guide</h3>
              <p class="mt-1 min-h-10 text-xs text-slate-500">Describe the recurring character, product, or subject identity this project should preserve.</p>
            </div>
            <div class="px-5 py-4">
              <textarea
                data-testid="core-instruction-textarea"
                class="min-h-44 w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                placeholder="Describe the recurring subject identity for this project..."
                value={subjectGuide}
                oninput={handleSubjectInput}
              ></textarea>
            </div>
          </div>

          <div class="rounded-2xl border border-slate-200 bg-white xl:col-span-2">
            <button
              type="button"
              class="flex w-full items-start justify-between gap-4 px-5 py-4 text-left cursor-pointer"
              onclick={() => (showInstructions = !showInstructions)}
              aria-expanded={showInstructions}
            >
              <div>
                <h3 class="text-sm font-semibold text-slate-900">Instructions</h3>
                <p class="mt-1 text-xs text-slate-500">
                  Advanced project-level instructions that apply to every generation, such as watermark, framing, or branding requirements. Use Visual Style and Subject Guide first when those are enough.
                </p>
              </div>
              <span class="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                {showInstructions ? 'Hide' : 'Show'}
              </span>
            </button>

            {#if showInstructions}
              <div class="border-t border-slate-100 px-5 py-4">
                <textarea
                  data-testid="instructions-textarea"
                  class="min-h-28 w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  placeholder="Add instructions that should apply to every generation..."
                  value={instructions}
                  oninput={handleInstructionsInput}
                ></textarea>
              </div>
            {/if}
          </div>
        </div>
      </div>

      <div class="flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
        {#if !hasChanges && deriveNotice}
          <p class="mr-auto text-xs text-slate-500">
            Derived guides stay local until you save them.
          </p>
        {/if}
        {#if hasChanges}
          <button
            data-testid="settings-cancel-btn"
            class="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
            onclick={handleCancel}
          >
            Cancel
          </button>
          <button
            data-testid="settings-save-btn"
            class="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 transition-colors cursor-pointer"
            onclick={handleSave}
          >
            Save Edits
          </button>
        {:else}
          <button
            data-testid="settings-close-btn"
            class="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
            onclick={handleCancel}
          >
            Close
          </button>
        {/if}
      </div>
    </div>
  </div>
{/if}
