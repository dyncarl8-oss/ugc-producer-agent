
export enum AdVibe {
  EXCITED_UNBOXING = 'Excited Unboxing',
  MINIMALIST_REVIEW = 'Minimalist Review',
  LIFESTYLE_DEMO = 'Lifestyle Demo',
  LUXURY_SHOWCASE = 'Luxury Showcase',
  TECH_EXPLAINER = 'Tech Explainer'
}

export enum AspectRatio {
  LANDSCAPE = '16:9',
  PORTRAIT = '9:16'
}

export interface Config {
  projectId: string;
  location: string;
  simulateMode: boolean;
  aspectRatio: AspectRatio;
}

export interface GenerationStatus {
  stage: 'idle' | 'uploading' | 'generating' | 'fetching' | 'completed' | 'error';
  message: string;
  progress?: number;
}
