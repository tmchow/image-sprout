import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/svelte'

let _availableModels: any[] = [
  { id: 'google/gemini-3.1-flash-image-preview', label: 'Nano Banana 2', source: 'builtin' },
  { id: 'google/gemini-3-pro-image-preview', label: 'Nano Banana Pro', source: 'builtin' },
  { id: 'openai/gpt-5-image', label: 'GPT-5 Image', source: 'builtin' },
]

vi.mock('../../../../src/lib/stores/settings.svelte.ts', () => ({
  settingsState: {
    get availableModels() { return _availableModels },
  },
}))

// Mock the generation store before importing components
vi.mock('../../../../src/lib/stores/generation.svelte.ts', () => {
  let _status = 'idle' as string
  let _results: any[] = []
  let _error: string | null = null
  let _prompt = ''
  let _feedback = ''
  let _activeSessionId: string | null = null
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
      get prompt() { return _prompt },
      set prompt(val: string) { _prompt = val },
      get feedback() { return _feedback },
      set feedback(val: string) { _feedback = val },
      get activeSessionId() { return _activeSessionId },
      set activeSessionId(val: string | null) { _activeSessionId = val },
      get sessionRuns() { return _sessionRuns },
      set sessionRuns(val: any[]) { _sessionRuns = val },
      get activeRunIndex() { return _activeRunIndex },
      set activeRunIndex(val: number) { _activeRunIndex = val },
    },
    startGeneration: vi.fn(),
    setResults: vi.fn(),
    toggleSelection: vi.fn(),
    clearSelection: vi.fn(),
    setFeedback: vi.fn((text: string) => { _feedback = text }),
    reset: vi.fn(),
    generate: vi.fn(),
    startNewSessionDraft: vi.fn(() => {
      _status = 'idle'
      _results = []
      _error = null
      _prompt = ''
      _feedback = ''
      _activeSessionId = null
      _sessionRuns = []
    }),
    selectedResults: vi.fn(() => []),
    _reset: () => {
      _status = 'idle'
      _results = []
      _error = null
      _prompt = ''
      _feedback = ''
      _activeSessionId = null
      _sessionRuns = []
      _activeRunIndex = 0
    },
    _setStatus: (s: string) => { _status = s },
    _setResults: (r: any[]) => { _results = r },
    _setError: (e: string | null) => { _error = e },
    _setPrompt: (p: string) => { _prompt = p },
    _setFeedback: (f: string) => { _feedback = f },
    _setSessionRuns: (runs: any[]) => { _sessionRuns = runs },
    _setActiveRunIndex: (index: number) => { _activeRunIndex = index },
  }
})

import ActionBar from '../../../../src/lib/components/canvas/ActionBar.svelte'

const generationMock = await vi.importMock<any>('../../../../src/lib/stores/generation.svelte.ts')

beforeEach(() => {
  generationMock._reset()
  vi.clearAllMocks()
})

describe('ActionBar', () => {
  describe('No results - action bar not rendered', () => {
    it('does not render when status is idle', () => {
      generationMock._setStatus('idle')
      generationMock._setResults([])

      const { container } = render(ActionBar)
      const actionBar = container.querySelector('[data-testid="action-bar"]')
      expect(actionBar).toBeNull()
    })

    it('does not render when status is generating', () => {
      generationMock._setStatus('generating')
      generationMock._setResults([])

      const { container } = render(ActionBar)
      const actionBar = container.querySelector('[data-testid="action-bar"]')
      expect(actionBar).toBeNull()
    })

    it('stays visible while generating if current results are still on screen', () => {
      generationMock._setStatus('generating')
      generationMock._setPrompt('A bunny in a forest')
      generationMock._setResults([
        { status: 'success', imageDataUrl: 'data:image/png;base64,img1', selected: false },
      ])
      generationMock.selectedResults.mockReturnValue([])

      const { container } = render(ActionBar)
      const actionBar = container.querySelector('[data-testid="action-bar"]')
      expect(actionBar).not.toBeNull()
      expect(container.textContent).toContain('A bunny in a forest')
    })

    it('does not render when status is error', () => {
      generationMock._setStatus('error')
      generationMock._setResults([])

      const { container } = render(ActionBar)
      const actionBar = container.querySelector('[data-testid="action-bar"]')
      expect(actionBar).toBeNull()
    })
  })

  describe('Results, 0 selected, no feedback - only Run Again visible', () => {
    it('shows Run Again button when results exist', () => {
      generationMock._setStatus('complete')
      generationMock._setResults([
        { status: 'success', imageDataUrl: 'data:image/png;base64,img1', selected: false },
        { status: 'success', imageDataUrl: 'data:image/png;base64,img2', selected: false },
      ])
      generationMock.selectedResults.mockReturnValue([])

      const { container } = render(ActionBar)
      const actionBar = container.querySelector('[data-testid="action-bar"]')
      expect(actionBar).not.toBeNull()

      const runAgainBtn = container.querySelector('[data-testid="run-again-button"]')
      expect(runAgainBtn).not.toBeNull()
      expect(runAgainBtn!.textContent).toContain('Run Again')
    })

    it('hides Iterate button when 0 selected and no feedback', () => {
      generationMock._setStatus('complete')
      generationMock._setResults([
        { status: 'success', imageDataUrl: 'data:image/png;base64,img1', selected: false },
      ])
      generationMock.selectedResults.mockReturnValue([])

      const { container } = render(ActionBar)
      const iterateBtn = container.querySelector('[data-testid="iterate-button"]')
      expect(iterateBtn).toBeNull()
    })

    it('does not show selected count when 0 selected', () => {
      generationMock._setStatus('complete')
      generationMock._setResults([
        { status: 'success', imageDataUrl: 'data:image/png;base64,img1', selected: false },
      ])
      generationMock.selectedResults.mockReturnValue([])

      const { container } = render(ActionBar)
      const selectedCount = container.querySelector('[data-testid="selected-count"]')
      expect(selectedCount).toBeNull()
      expect(container.textContent).toContain('click one or more images above to carry them forward visually')
    })

    it('shows the settings used for the active run', () => {
      generationMock._setStatus('complete')
      generationMock._setPrompt('A flower in a forest')
      generationMock._setResults([
        { status: 'success', imageDataUrl: 'data:image/png;base64,img1', selected: false },
      ])
      generationMock._setSessionRuns([
        {
          id: 'run-1',
          prompt: 'A flower in a forest',
          feedback: null,
          model: 'google/gemini-3.1-flash-image-preview',
          sizePreset: '16:9',
          imageCount: 6,
          images: [],
        },
      ])
      generationMock._setActiveRunIndex(0)
      generationMock.selectedResults.mockReturnValue([])

      const { container } = render(ActionBar)
      expect(container.textContent).toContain('16:9 · 6 images · Nano Banana 2')
    })

    it('shows the active run prompt and feedback when switching runs', () => {
      generationMock._setStatus('complete')
      generationMock._setPrompt('A flower in a forest')
      generationMock._setResults([
        { status: 'success', imageDataUrl: 'data:image/png;base64,img1', selected: false },
      ])
      generationMock._setSessionRuns([
        {
          id: 'run-1',
          prompt: 'A flower in a forest',
          feedback: null,
          model: 'google/gemini-3.1-flash-image-preview',
          sizePreset: '16:9',
          imageCount: 4,
          images: [],
        },
        {
          id: 'run-2',
          prompt: 'A flower in a forest',
          feedback: 'Make the colors more vibrant',
          model: 'google/gemini-3.1-flash-image-preview',
          sizePreset: '16:9',
          imageCount: 4,
          images: [],
        },
      ])
      generationMock._setActiveRunIndex(1)
      generationMock.selectedResults.mockReturnValue([])

      const { container } = render(ActionBar)
      expect(container.textContent).toContain('Feedback')
      expect(container.textContent).toContain('Make the colors more vibrant')
    })

    it('does not show feedback label when active run has no feedback', () => {
      generationMock._setStatus('complete')
      generationMock._setPrompt('A flower in a forest')
      generationMock._setResults([
        { status: 'success', imageDataUrl: 'data:image/png;base64,img1', selected: false },
      ])
      generationMock._setSessionRuns([
        {
          id: 'run-1',
          prompt: 'A flower in a forest',
          feedback: null,
          model: 'google/gemini-3.1-flash-image-preview',
          sizePreset: '16:9',
          imageCount: 4,
          images: [],
        },
      ])
      generationMock._setActiveRunIndex(0)
      generationMock.selectedResults.mockReturnValue([])

      const { container } = render(ActionBar)
      expect(container.textContent).not.toContain('Feedback')
    })
  })

  describe('Results, 0 selected, with feedback - Iterate button appears', () => {
    it('shows Iterate button when feedback text is non-empty', async () => {
      generationMock._setStatus('complete')
      generationMock._setResults([
        { status: 'success', imageDataUrl: 'data:image/png;base64,img1', selected: false },
      ])
      generationMock.selectedResults.mockReturnValue([])

      const { container } = render(ActionBar)

      // Type feedback into the input
      const feedbackInput = container.querySelector('[data-testid="feedback-input"]') as HTMLInputElement
      expect(feedbackInput).not.toBeNull()
      await fireEvent.input(feedbackInput, { target: { value: 'Make it brighter' } })

      const iterateBtn = container.querySelector('[data-testid="iterate-button"]')
      expect(iterateBtn).not.toBeNull()
    })
  })

  describe('Results, 1+ selected - Iterate visible and selected count shown', () => {
    it('shows Iterate button when images are selected', () => {
      generationMock._setStatus('complete')
      generationMock._setResults([
        { status: 'success', imageDataUrl: 'data:image/png;base64,img1', selected: true },
        { status: 'success', imageDataUrl: 'data:image/png;base64,img2', selected: false },
      ])
      generationMock.selectedResults.mockReturnValue([
        { status: 'success', imageDataUrl: 'data:image/png;base64,img1', selected: true },
      ])

      const { container } = render(ActionBar)
      const iterateBtn = container.querySelector('[data-testid="iterate-button"]')
      expect(iterateBtn).not.toBeNull()
    })

    it('shows selected count text', () => {
      generationMock._setStatus('complete')
      generationMock._setResults([
        { status: 'success', imageDataUrl: 'data:image/png;base64,img1', selected: true },
        { status: 'success', imageDataUrl: 'data:image/png;base64,img2', selected: true },
      ])
      generationMock.selectedResults.mockReturnValue([
        { status: 'success', imageDataUrl: 'data:image/png;base64,img1', selected: true },
        { status: 'success', imageDataUrl: 'data:image/png;base64,img2', selected: true },
      ])

      const { container } = render(ActionBar)
      const selectedCount = container.querySelector('[data-testid="selected-count"]')
      expect(selectedCount).not.toBeNull()
      expect(selectedCount!.textContent).toContain('2 selected')
      expect(container.textContent).toContain('Using 2 selected images as visual references')
    })

    it('shows "1 selected" for a single selection', () => {
      generationMock._setStatus('complete')
      generationMock._setResults([
        { status: 'success', imageDataUrl: 'data:image/png;base64,img1', selected: true },
        { status: 'success', imageDataUrl: 'data:image/png;base64,img2', selected: false },
      ])
      generationMock.selectedResults.mockReturnValue([
        { status: 'success', imageDataUrl: 'data:image/png;base64,img1', selected: true },
      ])

      const { container } = render(ActionBar)
      const selectedCount = container.querySelector('[data-testid="selected-count"]')
      expect(selectedCount).not.toBeNull()
      expect(selectedCount!.textContent).toContain('1 selected')
    })
  })

  describe('Run Again click triggers generation', () => {
    it('calls clearSelection, setFeedback(\"\"), and generate when Run Again is clicked', async () => {
      generationMock._setStatus('complete')
      generationMock._setPrompt('A sunset')
      generationMock._setResults([
        { status: 'success', imageDataUrl: 'data:image/png;base64,img1', selected: false },
      ])
      generationMock.selectedResults.mockReturnValue([])

      const { container } = render(ActionBar)
      const runAgainBtn = container.querySelector('[data-testid="run-again-button"]')
      expect(runAgainBtn).not.toBeNull()

      await fireEvent.click(runAgainBtn!)

      expect(generationMock.clearSelection).toHaveBeenCalled()
      expect(generationMock.setFeedback).toHaveBeenCalledWith('')
      expect(generationMock.generate).toHaveBeenCalledWith({ prompt: 'A sunset' })
    })
  })


  describe('Iterate click triggers generation and clears state', () => {
    it('calls generate then clears selections and feedback', async () => {
      generationMock._setStatus('complete')
      generationMock._setPrompt('A sunset')
      generationMock._setFeedback('Make it brighter')
      generationMock._setResults([
        { status: 'success', imageDataUrl: 'data:image/png;base64,img1', selected: true },
      ])
      generationMock.selectedResults.mockReturnValue([
        { status: 'success', imageDataUrl: 'data:image/png;base64,img1', selected: true },
      ])

      const { container } = render(ActionBar)
      const iterateBtn = container.querySelector('[data-testid="iterate-button"]')
      expect(iterateBtn).not.toBeNull()

      await fireEvent.click(iterateBtn!)

      expect(generationMock.generate).toHaveBeenCalledWith({ prompt: 'A sunset' })
      // After iterate, feedback and selections should be cleared
      expect(generationMock.setFeedback).toHaveBeenCalledWith('')
      expect(generationMock.clearSelection).toHaveBeenCalled()
    })
  })

  describe('Feedback input', () => {
    it('renders feedback input with correct placeholder', () => {
      generationMock._setStatus('complete')
      generationMock._setResults([
        { status: 'success', imageDataUrl: 'data:image/png;base64,img1', selected: false },
      ])
      generationMock.selectedResults.mockReturnValue([])

      const { container } = render(ActionBar)
      const feedbackInput = container.querySelector('[data-testid="feedback-input"]') as HTMLInputElement
      expect(feedbackInput).not.toBeNull()
      expect(feedbackInput.placeholder).toBe("Describe changes you'd like...")
    })

    it('calls setFeedback when input value changes', async () => {
      generationMock._setStatus('complete')
      generationMock._setResults([
        { status: 'success', imageDataUrl: 'data:image/png;base64,img1', selected: false },
      ])
      generationMock.selectedResults.mockReturnValue([])

      const { container } = render(ActionBar)
      const feedbackInput = container.querySelector('[data-testid="feedback-input"]') as HTMLInputElement
      await fireEvent.input(feedbackInput, { target: { value: 'More contrast' } })

      expect(generationMock.setFeedback).toHaveBeenCalledWith('More contrast')
    })
  })

  describe('Iterate flow with feedback', () => {
    it('shows Iterate button when feedback is typed and calls generate with current prompt', async () => {
      generationMock._setStatus('complete')
      generationMock._setPrompt('A landscape')
      generationMock._setResults([
        { status: 'success', imageDataUrl: 'data:image/png;base64,img1', selected: false },
      ])
      generationMock.selectedResults.mockReturnValue([])

      const { container } = render(ActionBar)

      // Initially no Iterate button
      expect(container.querySelector('[data-testid="iterate-button"]')).toBeNull()

      // Type feedback
      const feedbackInput = container.querySelector('[data-testid="feedback-input"]') as HTMLInputElement
      await fireEvent.input(feedbackInput, { target: { value: 'Add more trees' } })

      // Iterate button should now appear
      const iterateBtn = container.querySelector('[data-testid="iterate-button"]')
      expect(iterateBtn).not.toBeNull()

      await fireEvent.click(iterateBtn!)

      expect(generationMock.generate).toHaveBeenCalledWith({ prompt: 'A landscape' })
      expect(generationMock.setFeedback).toHaveBeenCalledWith('')
      expect(generationMock.clearSelection).toHaveBeenCalled()
    })
  })

  describe('Buttons disabled during generation', () => {
    it('disables Run Again button when status is generating', () => {
      generationMock._setStatus('generating')
      generationMock._setResults([
        { status: 'success', imageDataUrl: 'data:image/png;base64,img1', selected: false },
      ])

      const { container } = render(ActionBar)
      // ActionBar stays visible when results exist, even during generation
      const actionBar = container.querySelector('[data-testid="action-bar"]')
      expect(actionBar).not.toBeNull()
      const runAgainButton = container.querySelector('[data-testid="run-again-button"]') as HTMLButtonElement
      expect(runAgainButton).not.toBeNull()
      expect(runAgainButton.disabled).toBe(true)
    })
  })
})
