<script lang="ts">
  import { setApiKey } from '../stores/settings.svelte.ts'

  let inputValue = $state('')
  let error = $state('')

  function handleInput(event: Event) {
    inputValue = (event.target as HTMLInputElement).value
  }

  function handleSave() {
    const trimmed = inputValue.trim()
    if (!trimmed) {
      error = 'Please enter an API key'
      return
    }
    error = ''
    setApiKey(trimmed)
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      handleSave()
    }
  }
</script>

<div
  data-testid="api-key-setup"
  class="flex items-center justify-center min-h-screen bg-slate-50"
>
  <div class="w-full max-w-md mx-4 bg-white rounded-xl shadow-lg p-8">
    <div class="text-center mb-6">
      <h1 class="text-2xl font-bold text-slate-900 mb-2">Image Sprout</h1>
      <p class="text-sm text-slate-600">
        To get started, you'll need an OpenRouter API key. This key is used to
        generate images via the OpenRouter API and is stored locally on your
        machine for this installation.
      </p>
    </div>

    <div class="space-y-4">
      <div>
        <label for="api-key-input" class="block text-sm font-medium text-slate-700 mb-1">
          API Key
        </label>
        <input
          id="api-key-input"
          type="password"
          value={inputValue}
          oninput={handleInput}
          onkeydown={handleKeydown}
          placeholder="sk-or-..."
          class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent"
        />
        {#if error}
          <p class="mt-1 text-xs text-red-600">{error}</p>
        {/if}
      </div>

      <button
        onclick={handleSave}
        class="w-full px-4 py-2.5 bg-accent-600 text-white text-sm font-semibold rounded-lg hover:bg-accent-700 transition-colors cursor-pointer"
      >
        Save
      </button>
    </div>

    <p class="mt-4 text-center text-xs text-slate-500">
      Don't have a key?
      <a
        href="https://openrouter.ai/keys"
        target="_blank"
        rel="noopener noreferrer"
        class="text-accent-600 hover:text-accent-700 underline"
      >
        Get one at OpenRouter
      </a>
    </p>
  </div>
</div>
