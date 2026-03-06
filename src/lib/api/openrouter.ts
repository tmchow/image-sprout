import type { GenerationRequest, GenerationResult, SizePreset } from '../types';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const ANALYSIS_MODEL = 'google/gemini-3.1-flash-image-preview';
const REFERER = 'https://image-sprout.app';

/** OpenAI models use a `size` param (WxH) instead of `image_config.aspect_ratio`. */
const OPENAI_SIZE_MAP: Record<SizePreset, string> = {
  '1:1': '1024x1024',
  '16:9': '1536x1024',
  '9:16': '1024x1536',
};

/** Maximum number of reference images sent per API request. Images beyond this cap are truncated (keeping the most recent). */
export const MAX_REFERENCE_IMAGES = 14;
const MAX_IMAGE_COUNT = 8;

interface ImageUrlPart {
  type: 'image_url';
  image_url: { url: string };
}

interface TextPart {
  type: 'text';
  text: string;
}

type ContentPart = ImageUrlPart | TextPart;

function buildHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': REFERER,
  };
}

function buildImageParts(imageDataUrls: string[]): ImageUrlPart[] {
  return imageDataUrls.map((url) => ({
    type: 'image_url' as const,
    image_url: { url },
  }));
}

function capImages(imageDataUrls: string[]): string[] {
  if (imageDataUrls.length <= MAX_REFERENCE_IMAGES) {
    return imageDataUrls;
  }
  console.warn(`Reference images capped from ${imageDataUrls.length} to ${MAX_REFERENCE_IMAGES}`);
  // Truncate to the most recent MAX_REFERENCE_IMAGES (keep last N)
  return imageDataUrls.slice(imageDataUrls.length - MAX_REFERENCE_IMAGES);
}

function assemblePromptText(
  visualStyle: string,
  subjectGuide: string,
  instructions: string,
  prompt: string,
  feedback: string | null
): string {
  const sections = [
    `Visual Style: ${visualStyle}`,
    `Subject Guide: ${subjectGuide}`,
  ];
  if (instructions.trim()) {
    sections.push(`Instructions: ${instructions}`);
  }
  sections.push(`Create: ${prompt}`);
  let text = sections.join('\n\n');
  if (feedback) {
    text += `\n\nFeedback: ${feedback}`;
  }
  return text;
}

function sanitizeGuideText(text: string): string {
  return text
    .replace(/\u001B\][^\u0007\u001B]*(?:\u0007|\u001B\\)/g, '')
    .replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\\(?=\s)/g, '')
    .replace(/\r\n/g, '\n')
    .trim();
}

function validateApiKey(apiKey: string): void {
  if (!apiKey) {
    throw new Error('API key is required. Please set your OpenRouter API key.');
  }
}

/**
 * Parse the response content from an OpenRouter/Gemini response.
 * Returns the content as ContentPart[], a plain string, or null.
 */
function parseResponseContent(responseData: unknown): ContentPart[] | string | null {
  const data = responseData as {
    choices?: Array<{ message?: { content?: ContentPart[] | string } }>;
  };
  return data?.choices?.[0]?.message?.content ?? null;
}

/**
 * Extract image data URL from the OpenRouter/Gemini response.
 *
 * The response format can vary:
 * - content is an array of parts with type "image_url" or "text"
 * - content is a plain string (text only, no image generated)
 *
 * Returns the image data URL if found, or null if no image is present.
 */
function extractImageFromResponse(responseData: unknown): string | null {
  const data = responseData as {
    choices?: Array<{
      message?: {
        content?: ContentPart[] | string;
        images?: Array<{ type?: string; image_url?: { url?: string } }>;
      };
    }>;
  };
  const message = data?.choices?.[0]?.message;
  if (!message) return null;

  // Check message.images array first (current OpenRouter format)
  if (Array.isArray(message.images)) {
    for (const img of message.images) {
      const url = img.image_url?.url;
      if (url) return url;
    }
  }

  // Fallback: check content array for image_url parts
  const content = message.content;
  if (Array.isArray(content)) {
    for (const part of content) {
      if (part.type === 'image_url' && 'image_url' in part) {
        const url = (part as ImageUrlPart).image_url?.url;
        if (url) return url;
      }
    }
  }

  return null;
}

/**
 * Extract text from the response.
 *
 * Handles both array-of-parts format and plain string format.
 */
function extractTextFromResponse(responseData: unknown): string | null {
  const content = parseResponseContent(responseData);
  if (!content) {
    return null;
  }

  // Content is a plain string
  if (typeof content === 'string') {
    return content;
  }

  // Content is an array of parts -- look for text type
  if (Array.isArray(content)) {
    for (const part of content) {
      if (part.type === 'text' && 'text' in part) {
        return (part as TextPart).text;
      }
    }
  }

  return null;
}

async function sendRequest(
  content: ContentPart[],
  modalities: string[],
  apiKey: string,
  model: string,
  options?: { imageConfig?: { aspect_ratio: string; image_size: string }; size?: string },
  signal?: AbortSignal
): Promise<unknown> {
  const body: Record<string, unknown> = {
    model,
    messages: [{ role: 'user', content }],
    modalities,
  };

  if (options?.imageConfig) {
    body.image_config = options.imageConfig;
  }
  if (options?.size) {
    body.size = options.size;
  }

  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: buildHeaders(apiKey),
    body: JSON.stringify(body),
    signal: signal ?? AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    const errorMessage = errorData?.error?.message || 'Unknown error';
    throw new Error(`OpenRouter API error ${response.status}: ${errorMessage}`);
  }

  return response.json();
}

/**
 * Generate images via the OpenRouter API.
 *
 * Fires N parallel requests (one per imageCount) using Promise.allSettled.
 * Returns GenerationResult[] with successful results and error placeholders.
 */
export async function generateImages(
  request: GenerationRequest,
  apiKey: string,
  signal?: AbortSignal
): Promise<GenerationResult[]> {
  validateApiKey(apiKey);

  const cappedImageUrls = capImages(request.referenceImageDataUrls);

  // Build content parts once, reuse across all parallel requests
  const imageParts = buildImageParts(cappedImageUrls);
  const textPart: TextPart = {
    type: 'text',
    text: assemblePromptText(
      request.visualStyle,
      request.subjectGuide,
      request.instructions,
      request.prompt,
      request.feedback
    ),
  };
  const content: ContentPart[] = [...imageParts, textPart];

  const requestFormat = request.requestFormat ?? (request.model.startsWith('openai/') ? 'openai-size' : 'image-config');
  const requestOptions = requestFormat === 'openai-size'
    ? { size: OPENAI_SIZE_MAP[request.sizePreset] }
    : { imageConfig: { aspect_ratio: request.sizePreset, image_size: '1K' } };

  // Validate and cap imageCount
  const count = Math.min(request.imageCount, MAX_IMAGE_COUNT);

  // Fire N parallel requests
  const promises = Array.from({ length: count }, () =>
    sendRequest(content, ['image', 'text'], apiKey, request.model, requestOptions, signal)
  );

  const settled = await Promise.allSettled(promises);

  return settled.map((result): GenerationResult => {
    if (result.status === 'fulfilled') {
      const imageDataUrl = extractImageFromResponse(result.value);
      if (imageDataUrl) {
        return { status: 'success', imageDataUrl, selected: false };
      }
      return {
        status: 'error',
        selected: false,
        error: 'No image found in API response',
      };
    }
    // Rejected promise (network error, etc.)
    return {
      status: 'error',
      selected: false,
      error: result.reason?.message || 'Request failed',
    };
  });
}

export interface AnalysisResult {
  visualStyle: string;
  subjectGuide: string;
}

/**
 * Analyze reference images and generate a reusable visual style and subject guide.
 *
 * Sends reference images with a prompt asking the model to separately describe:
 * 1. The visual rendering style (how it looks)
 * 2. The subject matter (what is depicted)
 *
 * Returns both as a structured result.
 */
export async function analyzeReferenceImages(
  imageDataUrls: string[],
  apiKey: string,
  signal?: AbortSignal
): Promise<AnalysisResult> {
  validateApiKey(apiKey);

  const cappedImageUrls = capImages(imageDataUrls);
  const imageParts = buildImageParts(cappedImageUrls);

  const textPart: TextPart = {
    type: 'text',
    text: `You are analyzing reference images for an image generation tool. Your output will be split into two parts that are used separately:

- visualStyle is combined with new scene prompts to reproduce the visual style
- subjectGuide is combined with new scene prompts to reproduce the subject/character

Respond with valid JSON (no markdown fences):
{"visualStyle": "...", "subjectGuide": "..."}

visualStyle: Describe ONLY the visual rendering style. Cover color palette, line weight and quality, shading technique, texture, composition approach, and overall aesthetic. Do NOT mention specific subjects, objects, or characters.

subjectGuide: Describe ONLY the recurring subject(s) that appear across images — their physical design, proportions, distinguishing features, and general personality or tone. Focus on who or what should stay consistent across generations. Exclude rendering style, medium, palette, composition, lighting, and other art-direction details, even if they are prominent in the images. Do NOT list specific scenes, actions, settings, or scenarios from the images. These will be provided separately by the user for each new image.`,
  };

  const content: ContentPart[] = [...imageParts, textPart];
  const responseData = await sendRequest(content, ['text'], apiKey, ANALYSIS_MODEL, undefined, signal);

  const text = extractTextFromResponse(responseData);
  if (!text) {
    throw new Error('No text response received from reference image analysis');
  }

  try {
    const parsed = JSON.parse(text) as {
      visualStyle?: string;
      subjectGuide?: string;
      styleDescription?: string;
      coreInstruction?: string;
    };
    return {
      visualStyle: sanitizeGuideText(parsed.visualStyle ?? parsed.styleDescription ?? ''),
      subjectGuide: sanitizeGuideText(parsed.subjectGuide ?? parsed.coreInstruction ?? ''),
    };
  } catch {
    // Fallback: if the model didn't return valid JSON, treat the whole response as visual style.
    return { visualStyle: sanitizeGuideText(text), subjectGuide: '' };
  }
}
