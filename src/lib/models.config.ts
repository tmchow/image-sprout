export type ModelRequestFormat = 'image-config' | 'openai-size';

export interface BuiltinImageModel {
  id: string;
  label: string;
  requestFormat: ModelRequestFormat;
}

/**
 * Built-in image model defaults restored by `model restore-defaults`.
 */
export const BUILTIN_IMAGE_MODELS: BuiltinImageModel[] = [
  {
    id: 'google/gemini-3.1-flash-image-preview',
    label: 'Nano Banana 2',
    requestFormat: 'image-config',
  },
  {
    id: 'google/gemini-3-pro-image-preview',
    label: 'Nano Banana Pro',
    requestFormat: 'image-config',
  },
  {
    id: 'openai/gpt-5-image',
    label: 'GPT-5 Image',
    requestFormat: 'openai-size',
  },
];

export const DEFAULT_MODEL = BUILTIN_IMAGE_MODELS[0].id;
