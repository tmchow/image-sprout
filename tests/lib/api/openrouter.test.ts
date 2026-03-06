import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  generateImages,
  analyzeReferenceImages,
  MAX_REFERENCE_IMAGES,
} from '../../../src/lib/api/openrouter';
import type { GenerationRequest } from '../../../src/lib/types';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

function makeRequest(overrides: Partial<GenerationRequest> = {}): GenerationRequest {
  return {
    referenceImageDataUrls: ['data:image/png;base64,ref1'],
    visualStyle: 'watercolor style with muted tones',
    subjectGuide: 'robots in workplace scenes',
    instructions: '',
    prompt: 'robot working at desk',
    feedback: null,
    sizePreset: '16:9',
    imageCount: 4,
    model: 'google/gemini-3.1-flash-image-preview',
    ...overrides,
  };
}

function makeSuccessResponse(imageBase64 = 'generatedImageBase64') {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [
        {
          message: {
            content: 'Here is the generated image.',
            images: [
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/png;base64,${imageBase64}`,
                },
              },
            ],
          },
        },
      ],
    }),
  };
}

function makeAnalysisResponse(
  visualStyle = 'A watercolor style with soft edges and muted palette.',
  subjectGuide = 'Robots in everyday workplace situations.'
) {
  return makeTextOnlyResponse(JSON.stringify({ visualStyle, subjectGuide }));
}

function makeTextOnlyResponse(text = 'A watercolor style with soft edges and muted palette.') {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [
        {
          message: {
            content: [
              {
                type: 'text',
                text,
              },
            ],
          },
        },
      ],
    }),
  };
}

function makeErrorResponse(status = 429, message = 'Rate limit exceeded') {
  return {
    ok: false,
    status,
    json: async () => ({
      error: { message },
    }),
  };
}

describe('openrouter API client', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('MAX_REFERENCE_IMAGES', () => {
    it('is set to 14', () => {
      expect(MAX_REFERENCE_IMAGES).toBe(14);
    });
  });

  describe('generateImages', () => {
    it('constructs correct request body with image parts + text part', async () => {
      fetchMock.mockResolvedValue(makeSuccessResponse());
      const request = makeRequest({ imageCount: 1 });

      await generateImages(request, 'test-api-key');

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe(OPENROUTER_URL);

      const body = JSON.parse(options.body);
      expect(body.model).toBe('google/gemini-3.1-flash-image-preview');
      expect(body.modalities).toEqual(['image', 'text']);
      expect(body.image_config).toEqual({ aspect_ratio: '16:9', image_size: '1K' });

      // Check message content structure
      const content = body.messages[0].content;
      expect(content).toHaveLength(2); // 1 image part + 1 text part

      // Image part
      expect(content[0].type).toBe('image_url');
      expect(content[0].image_url.url).toBe('data:image/png;base64,ref1');

      // Text part
      expect(content[1].type).toBe('text');
      expect(content[1].text).toContain('Visual Style: watercolor style with muted tones');
      expect(content[1].text).toContain('Subject Guide: robots in workplace scenes');
      expect(content[1].text).toContain('Create: robot working at desk');
    });

    it('uses size param instead of image_config for OpenAI models', async () => {
      fetchMock.mockResolvedValue(makeSuccessResponse());
      const request = makeRequest({ imageCount: 1, model: 'openai/gpt-5-image', sizePreset: '16:9' });

      await generateImages(request, 'test-api-key');

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.size).toBe('1536x1024');
      expect(body.image_config).toBeUndefined();
    });

    it('maps all size presets correctly for OpenAI models', async () => {
      for (const [preset, expected] of [['1:1', '1024x1024'], ['9:16', '1024x1536'], ['16:9', '1536x1024']] as const) {
        fetchMock.mockResolvedValue(makeSuccessResponse());
        const request = makeRequest({ imageCount: 1, model: 'openai/gpt-5-image', sizePreset: preset });
        await generateImages(request, 'test-api-key');
        const body = JSON.parse(fetchMock.mock.calls.at(-1)![1].body);
        expect(body.size).toBe(expected);
      }
    });

    it('sends correct headers including Authorization and HTTP-Referer', async () => {
      fetchMock.mockResolvedValue(makeSuccessResponse());
      const request = makeRequest({ imageCount: 1 });

      await generateImages(request, 'my-secret-key');

      const [, options] = fetchMock.mock.calls[0];
      expect(options.headers['Authorization']).toBe('Bearer my-secret-key');
      expect(options.headers['Content-Type']).toBe('application/json');
      expect(options.headers['HTTP-Referer']).toBe('https://image-sprout.app');
    });

    it('fires N parallel requests matching imageCount', async () => {
      fetchMock.mockResolvedValue(makeSuccessResponse());
      const request = makeRequest({ imageCount: 3 });

      await generateImages(request, 'test-api-key');

      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('appends feedback to the text part when provided', async () => {
      fetchMock.mockResolvedValue(makeSuccessResponse());
      const request = makeRequest({
        imageCount: 1,
        feedback: 'make it more colorful',
      });

      await generateImages(request, 'test-api-key');

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      const textPart = body.messages[0].content.find(
        (p: { type: string }) => p.type === 'text'
      );
      expect(textPart.text).toContain('Feedback: make it more colorful');
    });

    it('does not include feedback line when feedback is null', async () => {
      fetchMock.mockResolvedValue(makeSuccessResponse());
      const request = makeRequest({ imageCount: 1, feedback: null });

      await generateImages(request, 'test-api-key');

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      const textPart = body.messages[0].content.find(
        (p: { type: string }) => p.type === 'text'
      );
      expect(textPart.text).not.toContain('Feedback:');
    });

    it('returns GenerationResult[] with successful results', async () => {
      fetchMock.mockResolvedValue(makeSuccessResponse('img1'));
      const request = makeRequest({ imageCount: 2 });

      const results = await generateImages(request, 'test-api-key');

      expect(results).toHaveLength(2);
      expect(results[0].status).toBe('success');
      expect(results[0]).toHaveProperty('imageDataUrl', 'data:image/png;base64,img1');
      expect(results[0].selected).toBe(false);
      expect(results[1].status).toBe('success');
      expect(results[1]).toHaveProperty('imageDataUrl', 'data:image/png;base64,img1');
      expect(results[1].selected).toBe(false);
    });

    it('handles partial failures -- returns successful results + error placeholders', async () => {
      fetchMock
        .mockResolvedValueOnce(makeSuccessResponse('good1'))
        .mockRejectedValueOnce(new Error('Network timeout'))
        .mockResolvedValueOnce(makeSuccessResponse('good2'))
        .mockResolvedValueOnce(makeErrorResponse(500, 'Server error'));

      const request = makeRequest({ imageCount: 4 });

      const results = await generateImages(request, 'test-api-key');

      expect(results).toHaveLength(4);

      // First request succeeded
      expect(results[0].status).toBe('success');
      expect(results[0]).toHaveProperty('imageDataUrl', 'data:image/png;base64,good1');

      // Second request threw network error
      expect(results[1].status).toBe('error');
      expect(results[1]).toHaveProperty('error');

      // Third request succeeded
      expect(results[2].status).toBe('success');
      expect(results[2]).toHaveProperty('imageDataUrl', 'data:image/png;base64,good2');

      // Fourth request returned non-200
      expect(results[3].status).toBe('error');
      expect(results[3]).toHaveProperty('error');
    });

    it('truncates reference images when exceeding MAX_REFERENCE_IMAGES, keeping the last N', async () => {
      fetchMock.mockResolvedValue(makeSuccessResponse());

      // Create 15 refs, should truncate to the last 14
      const refs = Array.from({ length: 15 }, (_, i) => `data:image/png;base64,ref${i}`);
      const request = makeRequest({
        referenceImageDataUrls: refs,
        imageCount: 1,
      });

      await generateImages(request, 'test-api-key');

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      const imageParts = body.messages[0].content.filter(
        (p: { type: string }) => p.type === 'image_url'
      );
      expect(imageParts).toHaveLength(MAX_REFERENCE_IMAGES);

      // Verify the kept images are the LAST MAX_REFERENCE_IMAGES (i.e., ref1 through ref14)
      const expectedUrls = refs.slice(refs.length - MAX_REFERENCE_IMAGES);
      const actualUrls = imageParts.map(
        (p: { image_url: { url: string } }) => p.image_url.url
      );
      expect(actualUrls).toEqual(expectedUrls);
    });

    it('keeps reference images under the cap unchanged', async () => {
      fetchMock.mockResolvedValue(makeSuccessResponse());

      const refs = Array.from({ length: 5 }, (_, i) => `data:image/png;base64,ref${i}`);
      const request = makeRequest({
        referenceImageDataUrls: refs,
        imageCount: 1,
      });

      await generateImages(request, 'test-api-key');

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      const imageParts = body.messages[0].content.filter(
        (p: { type: string }) => p.type === 'image_url'
      );
      expect(imageParts).toHaveLength(5);
    });

    it('throws descriptive error when API key is empty', async () => {
      const request = makeRequest({ imageCount: 1 });

      await expect(generateImages(request, '')).rejects.toThrow(
        /API key is required/
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('throws with status and message when API returns non-200', async () => {
      fetchMock.mockResolvedValue(makeErrorResponse(429, 'Rate limit exceeded'));
      const request = makeRequest({ imageCount: 1 });

      const results = await generateImages(request, 'test-api-key');

      // Non-200 on all requests means all results are error placeholders
      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('error');
      if (results[0].status === 'error') {
        expect(results[0].error).toContain('429');
        expect(results[0].error).toContain('Rate limit exceeded');
      }
    });

    it('uses "Unknown error" fallback when response.json() throws on non-200', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => { throw new Error('Invalid JSON'); },
      });

      const request = makeRequest({ imageCount: 1 });
      const results = await generateImages(request, 'test-api-key');

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('error');
      if (results[0].status === 'error') {
        expect(results[0].error).toContain('502');
        expect(results[0].error).toContain('Unknown error');
      }
    });

    it('parses response with inline base64 image in content array', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: [
                  {
                    type: 'text',
                    text: 'Here is an image of a robot at a desk.',
                  },
                  {
                    type: 'image_url',
                    image_url: {
                      url: 'data:image/png;base64,responseImg',
                    },
                  },
                ],
              },
            },
          ],
        }),
      });

      const request = makeRequest({ imageCount: 1 });
      const results = await generateImages(request, 'test-api-key');

      expect(results[0].status).toBe('success');
      expect(results[0]).toHaveProperty('imageDataUrl', 'data:image/png;base64,responseImg');
    });

    it('handles response where content is a plain string (text only, no image)', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: 'I could not generate an image.',
              },
            },
          ],
        }),
      });

      const request = makeRequest({ imageCount: 1 });
      const results = await generateImages(request, 'test-api-key');

      expect(results[0].status).toBe('error');
      expect(results[0]).toHaveProperty('error');
    });

    it('caps imageCount at MAX_IMAGE_COUNT (8), sending only 8 fetch calls for imageCount: 12', async () => {
      fetchMock.mockResolvedValue(makeSuccessResponse());
      const request = makeRequest({ imageCount: 12 });

      const results = await generateImages(request, 'test-api-key');

      // Should only fire 8 requests, not 12
      expect(fetchMock).toHaveBeenCalledTimes(8);
      expect(results).toHaveLength(8);
    });

    it('reuses the same image parts array across parallel requests', async () => {
      fetchMock.mockResolvedValue(makeSuccessResponse());
      const request = makeRequest({ imageCount: 3 });

      await generateImages(request, 'test-api-key');

      // All 3 calls should have identical content (same image parts)
      const bodies = fetchMock.mock.calls.map(
        (call: [string, { body: string }]) => JSON.parse(call[1].body)
      );
      const firstContent = JSON.stringify(bodies[0].messages[0].content);
      for (let i = 1; i < bodies.length; i++) {
        expect(JSON.stringify(bodies[i].messages[0].content)).toBe(firstContent);
      }
    });
  });

  describe('analyzeReferenceImages', () => {
    it('sends correct prompt with images and modalities: ["text"]', async () => {
      fetchMock.mockResolvedValue(makeAnalysisResponse());

      const images = [
        'data:image/png;base64,img1',
        'data:image/png;base64,img2',
      ];

      await analyzeReferenceImages(images, 'test-api-key');

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe(OPENROUTER_URL);

      const body = JSON.parse(options.body);
      expect(body.model).toBe('google/gemini-3.1-flash-image-preview');
      expect(body.modalities).toEqual(['text']);

      const content = body.messages[0].content;
      expect(content).toHaveLength(3);

      const imageParts = content.filter((p: { type: string }) => p.type === 'image_url');
      expect(imageParts).toHaveLength(2);

      const textPart = content.find((p: { type: string }) => p.type === 'text');
      expect(textPart.text).toContain('visualStyle');
      expect(textPart.text).toContain('subjectGuide');
    });

    it('returns both visualStyle and subjectGuide', async () => {
      fetchMock.mockResolvedValue(
        makeAnalysisResponse('Bold watercolor with warm tones.', 'A cat on a windowsill.')
      );

      const result = await analyzeReferenceImages(
        ['data:image/png;base64,img1'],
        'test-api-key'
      );

      expect(result.visualStyle).toBe('Bold watercolor with warm tones.');
      expect(result.subjectGuide).toBe('A cat on a windowsill.');
    });

    it('falls back to raw text as visualStyle when JSON parse fails', async () => {
      fetchMock.mockResolvedValue(
        makeTextOnlyResponse('Just a plain text description, not JSON.')
      );

      const result = await analyzeReferenceImages(
        ['data:image/png;base64,img1'],
        'test-api-key'
      );

      expect(result.visualStyle).toBe('Just a plain text description, not JSON.');
      expect(result.subjectGuide).toBe('');
    });

    it('sends correct headers', async () => {
      fetchMock.mockResolvedValue(makeAnalysisResponse());

      await analyzeReferenceImages(['data:image/png;base64,img1'], 'my-key');

      const [, options] = fetchMock.mock.calls[0];
      expect(options.headers['Authorization']).toBe('Bearer my-key');
      expect(options.headers['Content-Type']).toBe('application/json');
      expect(options.headers['HTTP-Referer']).toBe('https://image-sprout.app');
    });

    it('throws descriptive error when API key is empty', async () => {
      await expect(
        analyzeReferenceImages(['data:image/png;base64,img1'], '')
      ).rejects.toThrow(/API key is required/);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('throws with status and message when API returns non-200', async () => {
      fetchMock.mockResolvedValue(makeErrorResponse(401, 'Invalid API key'));

      await expect(
        analyzeReferenceImages(['data:image/png;base64,img1'], 'bad-key')
      ).rejects.toThrow(/401.*Invalid API key/);
    });

    it('handles response where content is a plain string with valid JSON', async () => {
      const jsonStr = JSON.stringify({
        visualStyle: 'Ink on parchment.',
        subjectGuide: 'Medieval knights.',
      });
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: jsonStr } }],
        }),
      });

      const result = await analyzeReferenceImages(
        ['data:image/png;base64,img1'],
        'test-api-key'
      );

      expect(result.visualStyle).toBe('Ink on parchment.');
      expect(result.subjectGuide).toBe('Medieval knights.');
    });

    it('accepts legacy analysis field names for compatibility', async () => {
      const jsonStr = JSON.stringify({
        styleDescription: 'Ink on parchment.',
        coreInstruction: 'Medieval knights.',
      });
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: jsonStr } }],
        }),
      });

      const result = await analyzeReferenceImages(
        ['data:image/png;base64,img1'],
        'test-api-key'
      );

      expect(result.visualStyle).toBe('Ink on parchment.');
      expect(result.subjectGuide).toBe('Medieval knights.');
    });

    it('sanitizes control sequences from derived guide text', async () => {
      fetchMock.mockResolvedValue(
        makeTextOnlyResponse(
          JSON.stringify({
            visualStyle: 'Painterly\u001b]11;rgb:0000/0000/0000\u001b\\\\ style',
            subjectGuide: 'Seed mascot\u001b[31m subject',
          })
        )
      );

      const result = await analyzeReferenceImages(
        ['data:image/png;base64,img1'],
        'test-api-key'
      );

      expect(result.visualStyle).toBe('Painterly style');
      expect(result.subjectGuide).toBe('Seed mascot subject');
    });

    it('truncates images to MAX_REFERENCE_IMAGES', async () => {
      fetchMock.mockResolvedValue(makeAnalysisResponse());

      const images = Array.from(
        { length: 20 },
        (_, i) => `data:image/png;base64,img${i}`
      );

      await analyzeReferenceImages(images, 'test-api-key');

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      const imageParts = body.messages[0].content.filter(
        (p: { type: string }) => p.type === 'image_url'
      );
      expect(imageParts).toHaveLength(MAX_REFERENCE_IMAGES);
    });

    it('throws when response contains no text at all', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: [
                  {
                    type: 'image_url',
                    image_url: { url: 'data:image/png;base64,img1' },
                  },
                ],
              },
            },
          ],
        }),
      });

      await expect(
        analyzeReferenceImages(['data:image/png;base64,ref1'], 'test-api-key')
      ).rejects.toThrow('No text response received from reference image analysis');
    });
  });
});
