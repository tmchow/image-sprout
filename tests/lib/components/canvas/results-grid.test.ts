import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/svelte'

// Mock the settings store
vi.mock('../../../../src/lib/stores/settings.svelte.ts', () => {
  let _imageCount = 4
  let _sizePreset = '16:9'
  return {
    settingsState: {
      get apiKey() { return 'test-key' },
      get sizePreset() { return _sizePreset },
      get imageCount() { return _imageCount },
    },
    setApiKey: vi.fn(),
    clearApiKey: vi.fn(),
    setSizePreset: vi.fn((preset: string) => { _sizePreset = preset }),
    setImageCount: vi.fn((n: number) => { _imageCount = n }),
    _setSizePreset: (preset: string) => { _sizePreset = preset },
    _setImageCount: (n: number) => { _imageCount = n },
    _reset: () => { _imageCount = 4; _sizePreset = '16:9' },
  }
})

// Mock the generation store before importing components
vi.mock('../../../../src/lib/stores/generation.svelte.ts', () => {
  let _status = 'idle' as string
  let _results: any[] = []
  let _error: string | null = null
  let _sessionRuns: any[] = []
  let _activeRunIndex = 0
  return {
    generationState: {
      get status() { return _status },
      set status(val: string) { _status = val },
      get results() { return _results },
      set results(val: any[]) { _results = val },
      get error() { return _error },
      set error(val: string | null) { _error = val },
      get sessionRuns() { return _sessionRuns },
      set sessionRuns(val: any[]) { _sessionRuns = val },
      get activeRunIndex() { return _activeRunIndex },
      set activeRunIndex(val: number) { _activeRunIndex = val },
      prompt: '',
      feedback: '',
    },
    startGeneration: vi.fn(),
    setResults: vi.fn(),
    toggleSelection: vi.fn(),
    clearSelection: vi.fn(),
    setFeedback: vi.fn(),
    reset: vi.fn(),
    generate: vi.fn(),
    selectedResults: vi.fn(() => []),
    _reset: () => {
      _status = 'idle'
      _results = []
      _error = null
      _sessionRuns = []
      _activeRunIndex = 0
    },
    _setStatus: (s: string) => { _status = s },
    _setResults: (r: any[]) => { _results = r },
    _setError: (e: string | null) => { _error = e },
    _setSessionRuns: (runs: any[]) => { _sessionRuns = runs },
    _setActiveRunIndex: (index: number) => { _activeRunIndex = index },
  }
})

import ResultsGrid from '../../../../src/lib/components/canvas/ResultsGrid.svelte'
import Canvas from '../../../../src/lib/components/canvas/Canvas.svelte'

const generationMock = await vi.importMock<any>('../../../../src/lib/stores/generation.svelte.ts')
const settingsMock = await vi.importMock<any>('../../../../src/lib/stores/settings.svelte.ts')

beforeEach(() => {
  generationMock._reset()
  settingsMock._reset()
  vi.clearAllMocks()
})

describe('ResultsGrid', () => {
  describe('Empty state renders placeholder message', () => {
    it('shows placeholder message when status is idle and no results', () => {
      generationMock._setStatus('idle')
      generationMock._setResults([])

      const { container } = render(ResultsGrid)
      expect(container.textContent).toContain('Generate images to see results here')
    })
  })

  describe('Loading state shows skeleton placeholders', () => {
    it('shows skeleton placeholders when status is generating with no prior results', () => {
      generationMock._setStatus('generating')
      generationMock._setResults([])

      const { container } = render(ResultsGrid)
      const skeletons = container.querySelectorAll('[data-testid^="skeleton-"]')
      expect(skeletons.length).toBeGreaterThan(0)
      expect(container.textContent).toContain('Generating images')
    })

    it('keeps current results visible while generating a later iteration', () => {
      generationMock._setStatus('generating')
      generationMock._setResults([
        { status: 'success', imageDataUrl: 'data:image/png;base64,img1', selected: false },
        { status: 'success', imageDataUrl: 'data:image/png;base64,img2', selected: false },
      ])
      generationMock._setSessionRuns([
        {
          id: 'run-1',
          prompt: 'A bunny in a forest',
          feedback: null,
          model: 'google/gemini-3.1-flash-image-preview',
          sizePreset: '1:1',
          imageCount: 2,
          images: [],
        },
      ])
      generationMock._setActiveRunIndex(0)

      const { container } = render(ResultsGrid)
      const cards = container.querySelectorAll('[data-testid^="image-card-"]')
      expect(cards.length).toBe(2)
      expect(container.textContent).toContain('Generating next run')
    })
  })

  describe('Results state renders correct number of images', () => {
    it('renders 4 image cards for 4 success results', () => {
      generationMock._setStatus('complete')
      generationMock._setResults([
        { status: 'success', imageDataUrl: 'data:image/png;base64,img1', selected: false },
        { status: 'success', imageDataUrl: 'data:image/png;base64,img2', selected: false },
        { status: 'success', imageDataUrl: 'data:image/png;base64,img3', selected: false },
        { status: 'success', imageDataUrl: 'data:image/png;base64,img4', selected: false },
      ])

      const { container } = render(ResultsGrid)
      const cards = container.querySelectorAll('[data-testid^="image-card-"]')
      expect(cards.length).toBe(4)
    })

    it('renders 2 image cards for 2 results', () => {
      generationMock._setStatus('complete')
      generationMock._setResults([
        { status: 'success', imageDataUrl: 'data:image/png;base64,img1', selected: false },
        { status: 'success', imageDataUrl: 'data:image/png;base64,img2', selected: false },
      ])

      const { container } = render(ResultsGrid)
      const cards = container.querySelectorAll('[data-testid^="image-card-"]')
      expect(cards.length).toBe(2)
    })

    it('shows index numbers on each card', () => {
      generationMock._setStatus('complete')
      generationMock._setResults([
        { status: 'success', imageDataUrl: 'data:image/png;base64,img1', selected: false },
        { status: 'success', imageDataUrl: 'data:image/png;base64,img2', selected: false },
      ])

      const { container } = render(ResultsGrid)
      const indices = container.querySelectorAll('[data-testid^="image-index-"]')
      expect(indices.length).toBe(2)
      expect(indices[0].textContent).toBe('1')
      expect(indices[1].textContent).toBe('2')
    })
  })

  describe('Clicking image toggles selection', () => {
    it('calls toggleSelection with the correct index when image is clicked', async () => {
      generationMock._setStatus('complete')
      generationMock._setResults([
        { status: 'success', imageDataUrl: 'data:image/png;base64,img1', selected: false },
        { status: 'success', imageDataUrl: 'data:image/png;base64,img2', selected: false },
      ])

      const { container } = render(ResultsGrid)
      const card = container.querySelector('[data-testid="image-card-1"]')
      expect(card).not.toBeNull()
      await fireEvent.click(card!)

      expect(generationMock.toggleSelection).toHaveBeenCalledWith(1)
    })

    it('shows selected styling when result is selected', () => {
      generationMock._setStatus('complete')
      generationMock._setResults([
        { status: 'success', imageDataUrl: 'data:image/png;base64,img1', selected: true },
        { status: 'success', imageDataUrl: 'data:image/png;base64,img2', selected: false },
      ])

      const { container } = render(ResultsGrid)
      const selectedCard = container.querySelector('[data-testid="image-card-0"]')
      const unselectedCard = container.querySelector('[data-testid="image-card-1"]')

      // Selected card should have indigo ring
      expect(selectedCard!.className).toMatch(/ring-indigo/)
      // Unselected card should not
      expect(unselectedCard!.className).not.toMatch(/ring-indigo/)
    })

    it('shows checkmark overlay when result is selected', () => {
      generationMock._setStatus('complete')
      generationMock._setResults([
        { status: 'success', imageDataUrl: 'data:image/png;base64,img1', selected: true },
        { status: 'success', imageDataUrl: 'data:image/png;base64,img2', selected: false },
      ])

      const { container } = render(ResultsGrid)
      const checkmarks = container.querySelectorAll('[data-testid="checkmark-0"]')
      expect(checkmarks.length).toBe(1)

      // No checkmark on the unselected card
      const noCheckmark = container.querySelectorAll('[data-testid="checkmark-1"]')
      expect(noCheckmark.length).toBe(0)
    })
  })

  describe('Error state shows message and retry button', () => {
    it('shows error message when status is error', () => {
      generationMock._setStatus('error')
      generationMock._setError('API request failed')

      const { container } = render(ResultsGrid)
      expect(container.textContent).toContain('API request failed')
    })

    it('shows retry button when status is error', () => {
      generationMock._setStatus('error')
      generationMock._setError('API request failed')

      const { container } = render(ResultsGrid)
      const retryButton = container.querySelector('[data-testid="retry-button"]')
      expect(retryButton).not.toBeNull()
      expect(retryButton!.textContent).toContain('Try Again')
    })

    it('calls reset() when retry button is clicked and returns to idle state', async () => {
      generationMock._setStatus('error')
      generationMock._setError('API request failed')

      const { container } = render(ResultsGrid)
      const retryButton = container.querySelector('[data-testid="retry-button"]')
      expect(retryButton).not.toBeNull()

      await fireEvent.click(retryButton!)

      expect(generationMock.reset).toHaveBeenCalled()

      // Simulate what the real reset() does: transition to idle with empty results.
      // The mock doesn't trigger Svelte reactivity, so re-render manually.
      generationMock._reset()
      const { container: idleContainer } = render(ResultsGrid)
      expect(idleContainer.textContent).toContain('Generate images to see results here')
    })
  })

  describe('Skeleton count matches settings', () => {
    it('uses settingsState.imageCount for skeleton placeholders', () => {
      generationMock._setStatus('generating')
      settingsMock._setImageCount(6)

      const { container } = render(ResultsGrid)
      const skeletons = container.querySelectorAll('[data-testid^="skeleton-"]')
      expect(skeletons.length).toBe(6)
    })
  })

  describe('Grid adapts to available result counts', () => {
    it('uses 2-column grid layout', () => {
      generationMock._setStatus('complete')
      generationMock._setResults([
        { status: 'success', imageDataUrl: 'data:image/png;base64,img1', selected: false },
        { status: 'success', imageDataUrl: 'data:image/png;base64,img2', selected: false },
      ])

      const { container } = render(ResultsGrid)
      const grid = container.querySelector('[data-testid="results-grid"]')
      expect(grid).not.toBeNull()
      expect(grid!.className).toContain('lg:grid-cols-2')
    })

    it('uses a wider grid layout for 6 results', () => {
      generationMock._setStatus('complete')
      generationMock._setResults([
        { status: 'success', imageDataUrl: 'data:image/png;base64,img1', selected: false },
        { status: 'success', imageDataUrl: 'data:image/png;base64,img2', selected: false },
        { status: 'success', imageDataUrl: 'data:image/png;base64,img3', selected: false },
        { status: 'success', imageDataUrl: 'data:image/png;base64,img4', selected: false },
        { status: 'success', imageDataUrl: 'data:image/png;base64,img5', selected: false },
        { status: 'success', imageDataUrl: 'data:image/png;base64,img6', selected: false },
      ])

      const { container } = render(ResultsGrid)
      const grid = container.querySelector('[data-testid="results-grid"]')
      expect(grid).not.toBeNull()
      expect(grid!.className).toContain('xl:grid-cols-3')
      expect(grid!.className).toContain('max-w-7xl')
    })

    it('uses square cards and a narrower width for square 6-image runs', () => {
      generationMock._setStatus('complete')
      settingsMock._setSizePreset('1:1')
      generationMock._setResults([
        { status: 'success', imageDataUrl: 'data:image/png;base64,img1', selected: false },
        { status: 'success', imageDataUrl: 'data:image/png;base64,img2', selected: false },
        { status: 'success', imageDataUrl: 'data:image/png;base64,img3', selected: false },
        { status: 'success', imageDataUrl: 'data:image/png;base64,img4', selected: false },
        { status: 'success', imageDataUrl: 'data:image/png;base64,img5', selected: false },
        { status: 'success', imageDataUrl: 'data:image/png;base64,img6', selected: false },
      ])

      const { container } = render(ResultsGrid)
      const grid = container.querySelector('[data-testid="results-grid"]')
      expect(grid).not.toBeNull()
      expect(grid!.className).toContain('grid-cols-2')
      expect(grid!.className).toContain('xl:grid-cols-3')
      expect(grid!.className).toContain('max-w-4xl')
    })
  })

  describe('Error results display error message in place of image', () => {
    it('shows error message for error result items', () => {
      generationMock._setStatus('complete')
      generationMock._setResults([
        { status: 'success', imageDataUrl: 'data:image/png;base64,img1', selected: false },
        { status: 'error', error: 'Model timeout', selected: false },
      ])

      const { container } = render(ResultsGrid)
      const cards = container.querySelectorAll('[data-testid^="image-card-"]')
      expect(cards.length).toBe(2)

      // Second card should show error text
      const errorCard = container.querySelector('[data-testid="image-card-1"]')
      expect(errorCard!.textContent).toContain('Model timeout')
    })
  })

  describe('Image preview', () => {
    it('opens a larger preview when the preview button is clicked', async () => {
      generationMock._setStatus('complete')
      generationMock._setResults([
        { status: 'success', imageDataUrl: 'data:image/png;base64,img1', selected: false },
      ])

      const { container } = render(ResultsGrid)
      const previewButton = container.querySelector('[data-testid="preview-btn-0"]')
      expect(previewButton).not.toBeNull()

      await fireEvent.click(previewButton!)

      const preview = container.querySelector('[data-testid="image-preview"]')
      expect(preview).not.toBeNull()
      expect((preview as HTMLImageElement).src).toContain('data:image/png;base64,img1')
    })

    it('does not toggle selection when the preview button is clicked', async () => {
      generationMock._setStatus('complete')
      generationMock._setResults([
        { status: 'success', imageDataUrl: 'data:image/png;base64,img1', selected: false },
      ])

      const { container } = render(ResultsGrid)
      const previewButton = container.querySelector('[data-testid="preview-btn-0"]')
      expect(previewButton).not.toBeNull()

      await fireEvent.click(previewButton!)

      expect(generationMock.toggleSelection).not.toHaveBeenCalled()
    })
  })
})

describe('Canvas embeds ResultsGrid', () => {
  it('renders the results grid inside canvas', () => {
    generationMock._setStatus('idle')
    generationMock._setResults([])

    const { container } = render(Canvas)
    const canvas = container.querySelector('[data-testid="canvas"]')
    expect(canvas).not.toBeNull()
    // The placeholder text from ResultsGrid should be present
    expect(canvas!.textContent).toContain('Generate images to see results here')
  })
})
