import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, createEvent, fireEvent, render } from '@testing-library/svelte';

vi.mock('../../../../src/lib/stores/projects.svelte.ts', () => {
  let images = [
    {
      id: 'ref-1',
      projectId: 'project-1',
      role: 'both',
      filename: 'shared-ref.png',
      mimeType: 'image/png',
      createdAt: '2026-03-05T00:00:00.000Z',
      dataUrl: 'data:image/png;base64,abc',
    },
  ];

  return {
    referenceImages: new Proxy([] as any[], {
      get(_target, prop) {
        return Reflect.get(images, prop);
      },
    }),
    addReferenceImage: vi.fn(),
    removeReferenceImage: vi.fn(),
    updateReferenceImageRole: vi.fn(async (id: string, role: string) => {
      images = images.map((img) => (img.id === id ? { ...img, role } : img));
      return images.find((img) => img.id === id);
    }),
    _reset() {
      images = [
        {
          id: 'ref-1',
          projectId: 'project-1',
          role: 'both',
          filename: 'shared-ref.png',
          mimeType: 'image/png',
          createdAt: '2026-03-05T00:00:00.000Z',
          dataUrl: 'data:image/png;base64,abc',
        },
      ];
    },
  };
});

import ReferenceImages from '../../../../src/lib/components/sidebar/ReferenceImages.svelte';

const projectsMock = await vi.importMock<any>('../../../../src/lib/stores/projects.svelte.ts');

function withDataTransfer(event: Event, dataTransfer: { types: string[]; getData: (type: string) => string }) {
  Object.defineProperty(event, 'dataTransfer', {
    value: dataTransfer,
  });
  return event;
}

describe('ReferenceImages', () => {
  beforeEach(() => {
    projectsMock._reset();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('moves a dragged reference into a different role section', async () => {
    const { getByTestId } = render(ReferenceImages, {
      props: {
        title: 'Visual Style References',
        description: 'desc',
        role: 'style',
        emptyLabel: 'empty',
        allowRoleMove: true,
      },
    });

    const dropzone = getByTestId('reference-images-dropzone-style');
    const dragOver = withDataTransfer(
      createEvent.dragOver(dropzone),
      {
        types: ['application/x-image-sprout-ref'],
        getData: () => JSON.stringify({ id: 'ref-1', role: 'both' }),
      }
    );
    await fireEvent(dropzone, dragOver);

    const drop = withDataTransfer(
      createEvent.drop(dropzone),
      {
        types: ['application/x-image-sprout-ref'],
        getData: () => JSON.stringify({ id: 'ref-1', role: 'both' }),
      }
    );
    await fireEvent(dropzone, drop);

    expect(projectsMock.updateReferenceImageRole).toHaveBeenCalledWith('ref-1', 'style');
  });
});
