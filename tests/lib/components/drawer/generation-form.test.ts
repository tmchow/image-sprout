import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/svelte'

// Mock the stores before importing components
vi.mock('../../../../src/lib/stores/settings.svelte.ts', () => {
  let _sizePreset = '16:9'
  let _imageCount = 4
  let _apiKeyConfigured = false
  let _model = 'google/gemini-3.1-flash-image-preview'
  const _availableModels = [
    { id: 'google/gemini-3.1-flash-image-preview', label: 'Nano Banana 2', requestFormat: 'image-config', source: 'builtin' },
    { id: 'google/gemini-3-pro-image-preview', label: 'Nano Banana Pro', requestFormat: 'image-config', source: 'builtin' },
    { id: 'openai/gpt-5-image', label: 'GPT-5 Image', requestFormat: 'openai-size', source: 'builtin' },
  ]
  return {
    settingsState: {
      get apiKeyConfigured() { return _apiKeyConfigured },
      get sizePreset() { return _sizePreset },
      get imageCount() { return _imageCount },
      get model() { return _model },
      get availableModels() { return _availableModels },
      get defaultModelId() { return 'google/gemini-3.1-flash-image-preview' },
    },
    setSizePreset: vi.fn((preset: string) => { _sizePreset = preset }),
    setImageCount: vi.fn((n: number) => { _imageCount = n }),
    setModel: vi.fn((m: string) => { _model = m }),
    setApiKey: vi.fn((key: string) => { _apiKeyConfigured = key.trim().length > 0 }),
    clearApiKey: vi.fn(),
    // Helper to reset mock state between tests
    _reset: () => {
      _sizePreset = '16:9'
      _imageCount = 4
      _apiKeyConfigured = false
      _model = 'google/gemini-3.1-flash-image-preview'
    },
    _setApiKey: (key: string) => { _apiKeyConfigured = key.trim().length > 0 },
    _setSizePreset: (preset: string) => { _sizePreset = preset },
    _setImageCount: (n: number) => { _imageCount = n },
    _setModel: (m: string) => { _model = m },
  }
})

vi.mock('../../../../src/lib/stores/generation.svelte.ts', () => {
  let _status = 'idle' as string
  let _activeSessionId: string | null = null
  let _sessionRuns: any[] = []
  let _prompt = ''
  return {
    generationState: {
      get status() { return _status },
      set status(val: string) { _status = val },
      results: [],
      get prompt() { return _prompt },
      set prompt(val: string) { _prompt = val },
      feedback: '',
      error: null,
      get activeSessionId() { return _activeSessionId },
      set activeSessionId(val: string | null) { _activeSessionId = val },
      get sessionRuns() { return _sessionRuns },
      set sessionRuns(val: any[]) { _sessionRuns = val },
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
      _activeSessionId = null
      _sessionRuns = []
      _prompt = ''
    },
    _setStatus: (s: string) => { _status = s },
    _setActiveSessionId: (id: string | null) => { _activeSessionId = id },
    _setSessionRuns: (runs: any[]) => { _sessionRuns = runs },
    _setPrompt: (p: string) => { _prompt = p },
  }
})

vi.mock('../../../../src/lib/stores/projects.svelte.ts', () => {
  let _referenceImages: any[] = []
  let _projectStatus: any = {
    mode: 'none',
    readiness: { style: false, subject: false, generate: false },
  }
  return {
    projects: [],
    activeProjectId: { get value() { return null } },
    activeProject: () => undefined,
    projectStatus: {
      get value() { return _projectStatus }
    },
    referenceImages: new Proxy([] as any[], {
      get(_target, prop) {
        return Reflect.get(_referenceImages, prop)
      },
    }),
    loadProjects: vi.fn(),
    createProject: vi.fn(),
    switchProject: vi.fn(),
    updateProject: vi.fn(),
    deleteProject: vi.fn(),
    addReferenceImage: vi.fn(),
    removeReferenceImage: vi.fn(),
    resetProjectsStore: vi.fn(),
    _setReferenceImages: (imgs: any[]) => {
      _referenceImages = imgs
      _projectStatus = imgs.length > 0
        ? { mode: 'both', readiness: { style: true, subject: true, generate: true } }
        : { mode: 'none', readiness: { style: false, subject: false, generate: false } }
    },
    _setProjectStatus: (status: any) => { _projectStatus = status },
    _reset: () => {
      _referenceImages = []
      _projectStatus = { mode: 'none', readiness: { style: false, subject: false, generate: false } }
    },
  }
})

import GenerationForm from '../../../../src/lib/components/drawer/GenerationForm.svelte'
import SizePresets from '../../../../src/lib/components/drawer/SizePresets.svelte'
import Drawer from '../../../../src/lib/components/drawer/Drawer.svelte'

// Access mock internals for test setup
const settingsMock = await vi.importMock<any>('../../../../src/lib/stores/settings.svelte.ts')
const generationMock = await vi.importMock<any>('../../../../src/lib/stores/generation.svelte.ts')
const projectsMock = await vi.importMock<any>('../../../../src/lib/stores/projects.svelte.ts')

beforeEach(() => {
  settingsMock._reset()
  generationMock._reset()
  projectsMock._reset()
  vi.clearAllMocks()
})

describe('GenerationForm', () => {
  describe('Generate button disabled when prompt is empty', () => {
    it('disables generate button when prompt textarea is empty', () => {
      // With API key and reference images, but no prompt text
      settingsMock._setApiKey('test-key')
      projectsMock._setReferenceImages([{ id: '1', projectId: 'p1', blob: new Blob(), filename: 'test.png', mimeType: 'image/png', width: 100, height: 100, createdAt: '' }])

      const { container } = render(GenerationForm)
      const button = container.querySelector('[data-testid="generate-button"]') as HTMLButtonElement
      expect(button).not.toBeNull()
      expect(button.disabled).toBe(true)
    })
  })

  describe('Generate button disabled when no reference images exist', () => {
    it('disables generate button when reference images array is empty', async () => {
      settingsMock._setApiKey('test-key')
      projectsMock._setReferenceImages([])

      const { container } = render(GenerationForm)

      // Type something in the prompt
      const textarea = container.querySelector('[data-testid="prompt-textarea"]') as HTMLTextAreaElement
      expect(textarea).not.toBeNull()
      await fireEvent.input(textarea, { target: { value: 'A nice landscape' } })

      const button = container.querySelector('[data-testid="generate-button"]') as HTMLButtonElement
      expect(button.disabled).toBe(true)
    })
  })

  describe('Generate button enabled when all conditions met', () => {
    it('enables generate button when prompt, API key, and reference images exist', async () => {
      settingsMock._setApiKey('test-key')
      projectsMock._setReferenceImages([{ id: '1', projectId: 'p1', blob: new Blob(), filename: 'test.png', mimeType: 'image/png', width: 100, height: 100, createdAt: '' }])

      const { container } = render(GenerationForm)

      const textarea = container.querySelector('[data-testid="prompt-textarea"]') as HTMLTextAreaElement
      await fireEvent.input(textarea, { target: { value: 'A nice landscape' } })

      const button = container.querySelector('[data-testid="generate-button"]') as HTMLButtonElement
      expect(button.disabled).toBe(false)
    })
  })

  describe('Generate button disabled during generation', () => {
    it('disables generate button when status is generating', async () => {
      settingsMock._setApiKey('test-key')
      projectsMock._setReferenceImages([{ id: '1', projectId: 'p1', blob: new Blob(), filename: 'test.png', mimeType: 'image/png', width: 100, height: 100, createdAt: '' }])
      generationMock._setStatus('generating')

      const { container } = render(GenerationForm)

      const textarea = container.querySelector('[data-testid="prompt-textarea"]') as HTMLTextAreaElement
      await fireEvent.input(textarea, { target: { value: 'A nice landscape' } })

      const button = container.querySelector('[data-testid="generate-button"]') as HTMLButtonElement
      expect(button.disabled).toBe(true)
    })
  })

  describe('Prompt textarea', () => {
    it('renders prompt textarea with correct placeholder', () => {
      const { container } = render(GenerationForm)
      const textarea = container.querySelector('[data-testid="prompt-textarea"]') as HTMLTextAreaElement
      expect(textarea).not.toBeNull()
      expect(textarea.placeholder).toBe('Describe what you want to generate...')
    })
  })

  describe('Model selector', () => {
    it('renders a model select dropdown', () => {
      const { container } = render(GenerationForm)
      const select = container.querySelector('[data-testid="model-select"]') as HTMLSelectElement
      expect(select).not.toBeNull()
      expect(select.options.length).toBe(3)
    })

    it('defaults to Nano Banana 2', () => {
      const { container } = render(GenerationForm)
      const select = container.querySelector('[data-testid="model-select"]') as HTMLSelectElement
      expect(select.value).toBe('google/gemini-3.1-flash-image-preview')
    })

    it('calls setModel when changed', async () => {
      const { container } = render(GenerationForm)
      const select = container.querySelector('[data-testid="model-select"]') as HTMLSelectElement
      await fireEvent.change(select, { target: { value: 'openai/gpt-5-image' } })
      expect(settingsMock.setModel).toHaveBeenCalledWith('openai/gpt-5-image')
    })
  })

  describe('Empty prompt validation', () => {
    it('does not call onGenerate when prompt is whitespace-only', async () => {
      const onGenerate = vi.fn()
      settingsMock._setApiKey('test-key')
      projectsMock._setReferenceImages([{ id: '1', projectId: 'p1', blob: new Blob(), filename: 'test.png', mimeType: 'image/png', width: 100, height: 100, createdAt: '' }])

      const { container } = render(GenerationForm, { props: { onGenerate } })

      const textarea = container.querySelector('[data-testid="prompt-textarea"]') as HTMLTextAreaElement
      await fireEvent.input(textarea, { target: { value: '   ' } })

      const button = container.querySelector('[data-testid="generate-button"]') as HTMLButtonElement
      expect(button.disabled).toBe(true)

      await fireEvent.click(button)
      expect(onGenerate).not.toHaveBeenCalled()
    })

    it('trims prompt before checking emptiness', async () => {
      settingsMock._setApiKey('test-key')
      projectsMock._setReferenceImages([{ id: '1', projectId: 'p1', blob: new Blob(), filename: 'test.png', mimeType: 'image/png', width: 100, height: 100, createdAt: '' }])

      const { container } = render(GenerationForm)

      const textarea = container.querySelector('[data-testid="prompt-textarea"]') as HTMLTextAreaElement
      await fireEvent.input(textarea, { target: { value: '  \n  ' } })

      const button = container.querySelector('[data-testid="generate-button"]') as HTMLButtonElement
      expect(button.disabled).toBe(true)
    })
  })

  describe('Disabled state combinations', () => {
    it('disabled when no API key is set', async () => {
      settingsMock._setApiKey('')
      projectsMock._setReferenceImages([{ id: '1', projectId: 'p1', blob: new Blob(), filename: 'test.png', mimeType: 'image/png', width: 100, height: 100, createdAt: '' }])

      const { container } = render(GenerationForm)
      const textarea = container.querySelector('[data-testid="prompt-textarea"]') as HTMLTextAreaElement
      await fireEvent.input(textarea, { target: { value: 'test prompt' } })

      const button = container.querySelector('[data-testid="generate-button"]') as HTMLButtonElement
      expect(button.disabled).toBe(true)
    })

    it('disabled when no reference images and no API key', async () => {
      settingsMock._setApiKey('')
      projectsMock._setReferenceImages([])

      const { container } = render(GenerationForm)
      const textarea = container.querySelector('[data-testid="prompt-textarea"]') as HTMLTextAreaElement
      await fireEvent.input(textarea, { target: { value: 'test prompt' } })

      const button = container.querySelector('[data-testid="generate-button"]') as HTMLButtonElement
      expect(button.disabled).toBe(true)
    })

    it('shows "Generating..." text during generation', () => {
      settingsMock._setApiKey('test-key')
      generationMock._setStatus('generating')

      const { container } = render(GenerationForm)
      const button = container.querySelector('[data-testid="generate-button"]') as HTMLButtonElement
      expect(button.textContent).toContain('Generating...')
    })
  })
})

describe('SizePresets', () => {
  describe('Size preset selection updates store', () => {
    it('renders three size preset options', () => {
      const { container } = render(SizePresets)
      const presets = container.querySelectorAll('[data-testid^="size-preset-"]')
      expect(presets.length).toBe(3)
    })

    it('shows Blog Header (16:9), Square (1:1), and Story (9:16)', () => {
      const { container } = render(SizePresets)
      expect(container.textContent).toContain('Blog Header')
      expect(container.textContent).toContain('Square')
      expect(container.textContent).toContain('Story')
    })

    it('highlights the active preset with indigo styling', () => {
      settingsMock._setSizePreset('16:9')
      const { container } = render(SizePresets)
      const activePreset = container.querySelector('[data-testid="size-preset-16:9"]')
      expect(activePreset).not.toBeNull()
      // Active preset should have indigo background class
      expect(activePreset!.className).toMatch(/bg-indigo/)
    })

    it('clicking a preset calls setSizePreset', async () => {
      const { container } = render(SizePresets)
      const squarePreset = container.querySelector('[data-testid="size-preset-1:1"]')
      expect(squarePreset).not.toBeNull()
      await fireEvent.click(squarePreset!)
      expect(settingsMock.setSizePreset).toHaveBeenCalledWith('1:1')
    })
  })
})

  describe('GenerationForm image count selector', () => {
    describe('Image count selector updates store', () => {
    it('renders image count options for 1, 2, 4, and 6', () => {
      const { container } = render(GenerationForm)
      const countOptions = container.querySelectorAll('[data-testid^="image-count-"]')
      expect(countOptions.length).toBe(4)
    })

    it('highlights the active image count', () => {
      settingsMock._setImageCount(4)
      const { container } = render(GenerationForm)
      const activeCount = container.querySelector('[data-testid="image-count-4"]')
      expect(activeCount).not.toBeNull()
      expect(activeCount!.className).toMatch(/bg-indigo/)
    })

    it('clicking a count option calls setImageCount', async () => {
      const { container } = render(GenerationForm)
      const count2 = container.querySelector('[data-testid="image-count-2"]')
      expect(count2).not.toBeNull()
      await fireEvent.click(count2!)
      expect(settingsMock.setImageCount).toHaveBeenCalledWith(2)
    })

    it('supports selecting 6 images', async () => {
      const { container } = render(GenerationForm)
      const count6 = container.querySelector('[data-testid="image-count-6"]')
      expect(count6).not.toBeNull()
      await fireEvent.click(count6!)
      expect(settingsMock.setImageCount).toHaveBeenCalledWith(6)
    })
  })
})

describe('Drawer integration', () => {
  describe('Collapsed state shows summary of current settings', () => {
    it('shows current size preset in collapsed bar', () => {
      settingsMock._setSizePreset('1:1')
      const { container } = render(Drawer)
      const collapsedBar = container.querySelector('[data-testid="drawer-collapsed-bar"]')
      expect(collapsedBar).not.toBeNull()
      expect(collapsedBar!.textContent).toContain('1:1')
    })

    it('shows current image count in collapsed bar', () => {
      settingsMock._setImageCount(6)
      const { container } = render(Drawer)
      const collapsedBar = container.querySelector('[data-testid="drawer-collapsed-bar"]')
      expect(collapsedBar!.textContent).toContain('6 images')
    })

    it('shows truncated prompt text in collapsed bar when prompt is entered', async () => {
      const { container } = render(Drawer)

      // Type in the prompt (drawer starts expanded)
      const textarea = container.querySelector('[data-testid="prompt-textarea"]') as HTMLTextAreaElement
      if (textarea) {
        await fireEvent.input(textarea, { target: { value: 'A beautiful sunset over the ocean' } })
      }

      // Collapse the drawer
      const toggleBar = container.querySelector('[data-testid="drawer-collapsed-bar"]')
      await fireEvent.click(toggleBar!)

      // Check that prompt text appears in the collapsed bar
      expect(toggleBar!.textContent).toContain('A beautiful sunset over the ocean')
    })
  })

  describe('Drawer toggle behavior', () => {
    it('shows generation form by default (expanded)', () => {
      const { container } = render(Drawer)
      const form = container.querySelector('[data-testid="generation-form"]')
      expect(form).not.toBeNull()
    })

    it('hides generation form when drawer is collapsed', async () => {
      const { container } = render(Drawer)
      const toggleBar = container.querySelector('[data-testid="drawer-collapsed-bar"]')
      await fireEvent.click(toggleBar!)

      const form = container.querySelector('[data-testid="generation-form"]')
      expect(form).toBeNull()
    })

    it('collapses into session mode when an active session exists', () => {
      generationMock._setActiveSessionId('session-1')
      generationMock._setSessionRuns([{ id: 'run-1' }])

      const { container } = render(Drawer)
      const form = container.querySelector('[data-testid="generation-form"]')
      const collapsedBar = container.querySelector('[data-testid="drawer-collapsed-bar"]')

      expect(form).toBeNull()
      expect(collapsedBar!.textContent).toContain('Next iteration settings')
    })

    it('opens iteration settings when clicking the collapsed bar in session mode', async () => {
      generationMock._setActiveSessionId('session-1')
      generationMock._setSessionRuns([{ id: 'run-1' }])

      const { container } = render(Drawer)
      const toggleBar = container.querySelector('[data-testid="drawer-collapsed-bar"]')
      await fireEvent.click(toggleBar!)

      expect(container.querySelector('[data-testid="generation-form"]')).not.toBeNull()
      expect(container.querySelector('[data-testid="prompt-textarea"]')).toBeNull()
      expect(container.querySelector('[data-testid="generate-button"]')).toBeNull()
    })
  })
})
