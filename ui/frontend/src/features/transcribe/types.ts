export type DiarizationSafetyMode = 'safe' | 'balanced' | 'performance';
export type DiarizationDevice = 'cpu' | 'gpu' | 'auto';

export type DiarizationSafetySettings = {
  mode: DiarizationSafetyMode;
  device: DiarizationDevice;
};

