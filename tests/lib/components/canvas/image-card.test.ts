import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/svelte'

// Mock the generation store before importing components
vi.mock('../../../../src/lib/stores/generation.svelte.ts', () => {
  let _status = 'idle' as string
  let _results: any[] = []
  let _error: string | null = null
  return {
    generationState: {
      get status() { return _status },
      set status(val: string) { _status = val },
      get results() { return _results },
      set results(val: any[]) { _results = val },
      get error() { return _error },
      set error(val: string | null) { _error = val },
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
    },
    _setStatus: (s: string) => { _status = s },
    _setResults: (r: any[]) => { _results = r },
    _setError: (e: string | null) => { _error = e },
  }
})

import ImageCard from '../../../../src/lib/components/canvas/ImageCard.svelte'

const generationMock = await vi.importMock<any>('../../../../src/lib/stores/generation.svelte.ts')

beforeEach(() => {
  generationMock._reset()
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe('ImageCard export actions', () => {
  const successResult = {
    status: 'success' as const,
    imageDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==',
    selected: false,
  }

  const errorResult = {
    status: 'error' as const,
    error: 'Model timeout',
    selected: false,
  }

  describe('Download button creates correct link and triggers download', () => {
    it('renders a download button for success results', () => {
      const { container } = render(ImageCard, {
        props: { result: successResult, index: 0 },
      })

      const downloadBtn = container.querySelector('[data-testid="download-btn-0"]')
      expect(downloadBtn).not.toBeNull()
    })

    it('creates an anchor element with correct download filename and triggers click', async () => {
      // Spy on document.createElement to capture the anchor element
      const origCreateElement = document.createElement.bind(document)
      let capturedAnchor: HTMLAnchorElement | null = null

      vi.spyOn(document, 'createElement').mockImplementation((tagName: string, options?: ElementCreationOptions) => {
        const el = origCreateElement(tagName, options)
        if (tagName === 'a') {
          capturedAnchor = el as HTMLAnchorElement
          vi.spyOn(capturedAnchor, 'click').mockImplementation(() => {})
        }
        return el
      })

      const { container } = render(ImageCard, {
        props: { result: successResult, index: 2 },
      })

      const downloadBtn = container.querySelector('[data-testid="download-btn-2"]')
      expect(downloadBtn).not.toBeNull()

      await fireEvent.click(downloadBtn!)

      expect(capturedAnchor).not.toBeNull()
      expect(capturedAnchor!.href).toContain('data:image/png;base64,')
      expect(capturedAnchor!.download).toBe('image-sprout-3.png')
      expect(capturedAnchor!.click).toHaveBeenCalled()
    })
  })

  describe('Preview button', () => {
    it('renders a preview button for success results', () => {
      const onPreview = vi.fn()
      const { container } = render(ImageCard, {
        props: { result: successResult, index: 0, onPreview },
      })

      const previewBtn = container.querySelector('[data-testid="preview-btn-0"]')
      expect(previewBtn).not.toBeNull()
    })

    it('calls onPreview with the image index', async () => {
      const onPreview = vi.fn()
      const { container } = render(ImageCard, {
        props: { result: successResult, index: 2, onPreview },
      })

      const previewBtn = container.querySelector('[data-testid="preview-btn-2"]')
      await fireEvent.click(previewBtn!)

      expect(onPreview).toHaveBeenCalledWith(2)
    })
  })

  describe('Copy button calls clipboard API', () => {
    it('renders a copy button for success results', () => {
      const { container } = render(ImageCard, {
        props: { result: successResult, index: 0 },
      })

      const copyBtn = container.querySelector('[data-testid="copy-btn-0"]')
      expect(copyBtn).not.toBeNull()
    })

    it('calls navigator.clipboard.write when copy button is clicked', async () => {
      // Stub ClipboardItem (not available in jsdom)
      const MockClipboardItem = vi.fn().mockImplementation((items: Record<string, Blob>) => ({ items }))
      vi.stubGlobal('ClipboardItem', MockClipboardItem)

      // Mock clipboard API
      const writeMock = vi.fn().mockResolvedValue(undefined)
      Object.defineProperty(navigator, 'clipboard', {
        value: { write: writeMock },
        writable: true,
        configurable: true,
      })

      const { container } = render(ImageCard, {
        props: { result: successResult, index: 0 },
      })

      const copyBtn = container.querySelector('[data-testid="copy-btn-0"]')
      await fireEvent.click(copyBtn!)

      // Wait for async operations
      await vi.waitFor(() => {
        expect(writeMock).toHaveBeenCalledTimes(1)
      })

      // Verify clipboard.write was called with a ClipboardItem containing a Blob
      // (no fetch is used — base64 is converted directly to a Blob)
      const writeArg = writeMock.mock.calls[0][0]
      expect(writeArg).toHaveLength(1)
      expect(MockClipboardItem).toHaveBeenCalledTimes(1)
      const clipboardItemArg = MockClipboardItem.mock.calls[0][0]
      expect(clipboardItemArg['image/png']).toBeInstanceOf(Blob)
    })

    it('shows "Copied!" feedback after successful copy', async () => {
      const mockBlob = new Blob(['fake image'], { type: 'image/png' })
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        blob: () => Promise.resolve(mockBlob),
      }))

      // Stub ClipboardItem (not available in jsdom)
      vi.stubGlobal('ClipboardItem', vi.fn().mockImplementation((items: Record<string, Blob>) => ({ items })))

      Object.defineProperty(navigator, 'clipboard', {
        value: { write: vi.fn().mockResolvedValue(undefined) },
        writable: true,
        configurable: true,
      })

      const { container } = render(ImageCard, {
        props: { result: successResult, index: 0 },
      })

      const copyBtn = container.querySelector('[data-testid="copy-btn-0"]')
      await fireEvent.click(copyBtn!)

      await vi.waitFor(() => {
        const feedback = container.querySelector('[data-testid="copy-feedback-0"]')
        expect(feedback).not.toBeNull()
        expect(feedback!.textContent).toContain('Copied!')
      })
    })
  })

  describe('Clipboard API unavailable shows fallback message', () => {
    it('shows error message when clipboard write fails', async () => {
      const mockBlob = new Blob(['fake image'], { type: 'image/png' })
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        blob: () => Promise.resolve(mockBlob),
      }))

      Object.defineProperty(navigator, 'clipboard', {
        value: { write: vi.fn().mockRejectedValue(new Error('Not allowed')) },
        writable: true,
        configurable: true,
      })

      const { container } = render(ImageCard, {
        props: { result: successResult, index: 0 },
      })

      const copyBtn = container.querySelector('[data-testid="copy-btn-0"]')
      await fireEvent.click(copyBtn!)

      await vi.waitFor(() => {
        const feedback = container.querySelector('[data-testid="copy-error-0"]')
        expect(feedback).not.toBeNull()
        expect(feedback!.textContent).toContain('Copy not supported')
      })
    })
  })

  describe('Export buttons render for success results', () => {
    it('renders export toolbar with download and copy buttons for success results', () => {
      const { container } = render(ImageCard, {
        props: { result: successResult, index: 0 },
      })

      const toolbar = container.querySelector('[data-testid="export-toolbar-0"]')
      expect(toolbar).not.toBeNull()

      const previewBtn = container.querySelector('[data-testid="preview-btn-0"]')
      const downloadBtn = container.querySelector('[data-testid="download-btn-0"]')
      const copyBtn = container.querySelector('[data-testid="copy-btn-0"]')
      expect(previewBtn).not.toBeNull()
      expect(downloadBtn).not.toBeNull()
      expect(copyBtn).not.toBeNull()
    })
  })

  describe('Export buttons only appear for success results', () => {
    it('does not render export toolbar for error results', () => {
      const { container } = render(ImageCard, {
        props: { result: errorResult, index: 0 },
      })

      const toolbar = container.querySelector('[data-testid="export-toolbar-0"]')
      expect(toolbar).toBeNull()

      const downloadBtn = container.querySelector('[data-testid="download-btn-0"]')
      const copyBtn = container.querySelector('[data-testid="copy-btn-0"]')
      expect(downloadBtn).toBeNull()
      expect(copyBtn).toBeNull()
    })
  })

  describe('Download action sets correct filename with 1-based index', () => {
    it('sets download attribute to image-sprout-1.png for index 0', async () => {
      const origCreateElement = document.createElement.bind(document)
      let capturedAnchor: HTMLAnchorElement | null = null

      vi.spyOn(document, 'createElement').mockImplementation((tagName: string, options?: ElementCreationOptions) => {
        const el = origCreateElement(tagName, options)
        if (tagName === 'a') {
          capturedAnchor = el as HTMLAnchorElement
          vi.spyOn(capturedAnchor, 'click').mockImplementation(() => {})
        }
        return el
      })

      const { container } = render(ImageCard, {
        props: { result: successResult, index: 0 },
      })

      const downloadBtn = container.querySelector('[data-testid="download-btn-0"]')
      await fireEvent.click(downloadBtn!)

      expect(capturedAnchor).not.toBeNull()
      expect(capturedAnchor!.download).toBe('image-sprout-1.png')
    })
  })

  describe('Copy-to-clipboard action', () => {
    it('converts data URL to blob and writes to clipboard without fetch', async () => {
      const MockClipboardItem = vi.fn().mockImplementation((items: Record<string, Blob>) => ({ items }))
      vi.stubGlobal('ClipboardItem', MockClipboardItem)

      const writeMock = vi.fn().mockResolvedValue(undefined)
      Object.defineProperty(navigator, 'clipboard', {
        value: { write: writeMock },
        writable: true,
        configurable: true,
      })

      const { container } = render(ImageCard, {
        props: { result: successResult, index: 0 },
      })

      const copyBtn = container.querySelector('[data-testid="copy-btn-0"]')
      await fireEvent.click(copyBtn!)

      await vi.waitFor(() => {
        expect(writeMock).toHaveBeenCalledTimes(1)
      })

      // Verify a Blob was created from the data URL (no fetch involved)
      const clipboardItemArg = MockClipboardItem.mock.calls[0][0]
      expect(clipboardItemArg['image/png']).toBeInstanceOf(Blob)
    })

    it('does not attempt clipboard write for error results', async () => {
      const writeMock = vi.fn()
      Object.defineProperty(navigator, 'clipboard', {
        value: { write: writeMock },
        writable: true,
        configurable: true,
      })

      const { container } = render(ImageCard, {
        props: { result: errorResult, index: 0 },
      })

      // No copy button should exist for error results
      const copyBtn = container.querySelector('[data-testid="copy-btn-0"]')
      expect(copyBtn).toBeNull()
      expect(writeMock).not.toHaveBeenCalled()
    })
  })
})
