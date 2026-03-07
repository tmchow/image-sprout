import type { ModelRequestFormat } from './models.config';

export const SIZE_PRESETS = ['1:1', '4:3', '3:2', '16:9', '4:5', '9:16'] as const;
export type SizePreset = typeof SIZE_PRESETS[number];
export type ReferenceRole = 'style' | 'subject' | 'both';
export type DeriveTarget = 'style' | 'subject' | 'both';
export type ProjectMode = 'none' | 'style' | 'subject' | 'both';
export type ImageModel = string;
export const SUPPORTED_IMAGE_COUNTS = [1, 2, 4, 6] as const;
export type SupportedImageCount = typeof SUPPORTED_IMAGE_COUNTS[number];

export { BUILTIN_IMAGE_MODELS, DEFAULT_MODEL } from './models.config';

export interface ImageModelConfig {
  id: string;
  label: string;
  requestFormat: ModelRequestFormat;
  source: 'builtin' | 'user';
}

export interface PublicImageModel {
  id: string;
  label: string;
  source: 'builtin' | 'user';
}

export interface ModelRegistry {
  defaultModelId: string;
  models: ImageModelConfig[];
}

export interface PublicModelRegistry {
  defaultModelId: string;
  models: PublicImageModel[];
}

export interface Project {
  id: string;
  name: string;
  subjectGuide: string;
  visualStyle: string;
  instructions: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReferenceImage {
  id: string;
  projectId: string;
  role: ReferenceRole;
  blob?: Blob;
  dataUrl?: string;
  filename: string;
  mimeType: string;
  width?: number;
  height?: number;
  createdAt: string;
}

export interface Session {
  id: string;
  projectId: string;
  prompt: string;
  createdAt: string;
  updatedAt: string;
}

export interface Run {
  id: string;
  sessionId: string;
  prompt: string;
  feedback: string | null;
  model: ImageModel;
  sizePreset: SizePreset;
  imageCount: number;
  images: RunImage[];
  createdAt: string;
}

export interface RunImage {
  imageDataUrl: string;
  status: 'success' | 'error';
  error?: string;
}

export type GenerationResult =
  | { status: 'success'; imageDataUrl: string; selected: boolean }
  | { status: 'error'; error: string; selected: boolean };

export interface GenerationRequest {
  /** Reference image data URLs. Capped to MAX_REFERENCE_IMAGES (keeping the most recent) before sending to the API. */
  referenceImageDataUrls: string[];
  visualStyle: string;
  subjectGuide: string;
  instructions: string;
  prompt: string;
  feedback: string | null;
  sizePreset: SizePreset;
  imageCount: number;
  model: ImageModel;
  requestFormat?: ModelRequestFormat;
}

export interface PublicConfig {
  apiKeyConfigured: boolean;
  model: ImageModel;
  sizePreset: SizePreset;
  imageCount: number;
}

export interface ProjectStatus {
  projectId: string;
  projectName: string;
  mode: ProjectMode;
  refs: {
    total: number;
    styleOnly: number;
    subjectOnly: number;
    both: number;
    effectiveStyle: number;
    effectiveSubject: number;
  };
  guides: {
    stylePresent: boolean;
    subjectPresent: boolean;
  };
  readiness: {
    style: boolean;
    subject: boolean;
    generate: boolean;
  };
}
