<script lang="ts">
  import { SIZE_PRESETS, type SizePreset } from '../../types'
  import { settingsState, setSizePreset } from '../../stores/settings.svelte.ts'

  function handleChange(event: Event) {
    const target = event.target as HTMLSelectElement
    setSizePreset(target.value as SizePreset)
  }
</script>

<select
  data-testid="size-presets"
  class="text-xs text-slate-700 bg-slate-200 rounded-full px-3 py-1 font-medium cursor-pointer hover:bg-slate-300 transition-colors focus:outline-none focus:ring-1 focus:ring-indigo-500 appearance-none pr-6 bg-no-repeat bg-[length:12px] bg-[right_8px_center] bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2364748b%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22M6%209l6%206%206-6%22%2F%3E%3C%2Fsvg%3E')]"
  value={settingsState.sizePreset}
  onchange={handleChange}
>
  {#each SIZE_PRESETS as preset (preset)}
    <option value={preset}>{preset}</option>
  {/each}
</select>
