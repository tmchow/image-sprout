<script lang="ts">
  import ResultsGrid from './ResultsGrid.svelte';
  import RunStrip from './RunStrip.svelte';
  import ActionBar from './ActionBar.svelte';
</script>

<div data-testid="canvas" class="flex-1 flex flex-col bg-slate-50 overflow-auto">
  <div class="flex-1 flex justify-center p-6 overflow-auto">
    <ResultsGrid />
  </div>
  <RunStrip />
  <ActionBar />
</div>
