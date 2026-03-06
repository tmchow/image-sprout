import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/svelte'

vi.mock('../../../../src/lib/stores/generation.svelte.ts', () => {
  let _sessionRuns: any[] = []
  let _activeRunIndex = 0

  return {
    generationState: {
      get sessionRuns() { return _sessionRuns },
      set sessionRuns(val: any[]) { _sessionRuns = val },
      get activeRunIndex() { return _activeRunIndex },
      set activeRunIndex(val: number) { _activeRunIndex = val },
    },
    switchRun: vi.fn(),
    _reset: () => {
      _sessionRuns = []
      _activeRunIndex = 0
    },
    _setSessionRuns: (runs: any[]) => { _sessionRuns = runs },
    _setActiveRunIndex: (index: number) => { _activeRunIndex = index },
  }
})

import RunStrip from '../../../../src/lib/components/canvas/RunStrip.svelte'

const generationMock = await vi.importMock<any>('../../../../src/lib/stores/generation.svelte.ts')

function makeRun(id: string, imageDataUrl: string) {
  return {
    id,
    prompt: 'A flower in a forest',
    sizePreset: '1:1',
    imageCount: 2,
    model: 'google/gemini-3.1-flash-image-preview',
    images: [
      { status: 'success', imageDataUrl, selected: false }
    ]
  }
}

beforeEach(() => {
  generationMock._reset()
  vi.clearAllMocks()
})

describe('RunStrip', () => {
  it('renders nothing when there is fewer than 2 runs', () => {
    generationMock._setSessionRuns([makeRun('run-1', 'data:image/png;base64,one')])

    const { container } = render(RunStrip)

    expect(container.querySelector('[data-testid="run-strip"]')).toBeNull()
  })

  it('renders compact thumbnails that fit the full image', () => {
    generationMock._setSessionRuns([
      makeRun('run-1', 'data:image/png;base64,one'),
      makeRun('run-2', 'data:image/png;base64,two')
    ])

    const { container } = render(RunStrip)
    const frame = container.querySelector('[data-testid="run-thumbnail-frame-0"]')
    const image = container.querySelector('[data-testid="run-thumbnail-0"] img')

    expect(frame).not.toBeNull()
    expect(frame!.className).toContain('h-8')
    expect(frame!.getAttribute('style')).toContain('aspect-ratio: 1 / 1')
    expect(image).not.toBeNull()
    expect(image!.className).toContain('object-contain')
  })

  it('uses an in-box border for the active run instead of an outer ring', () => {
    generationMock._setSessionRuns([
      makeRun('run-1', 'data:image/png;base64,one'),
      makeRun('run-2', 'data:image/png;base64,two')
    ])
    generationMock._setActiveRunIndex(1)

    const { container } = render(RunStrip)
    const activeFrame = container.querySelector('[data-testid="run-thumbnail-frame-1"]')
    const inactiveFrame = container.querySelector('[data-testid="run-thumbnail-frame-0"]')

    expect(activeFrame).not.toBeNull()
    expect(activeFrame!.className).toContain('border-2')
    expect(activeFrame!.className).toContain('border-indigo-500')
    expect(activeFrame!.className).not.toContain('ring-')
    expect(inactiveFrame!.className).toContain('border-slate-200')
  })

  it('switches runs when a thumbnail is clicked', async () => {
    generationMock._setSessionRuns([
      makeRun('run-1', 'data:image/png;base64,one'),
      makeRun('run-2', 'data:image/png;base64,two')
    ])

    const { container } = render(RunStrip)
    const secondThumb = container.querySelector('[data-testid="run-thumbnail-1"]')
    expect(secondThumb).not.toBeNull()

    await fireEvent.click(secondThumb!)

    expect(generationMock.switchRun).toHaveBeenCalledWith(1)
  })
})
