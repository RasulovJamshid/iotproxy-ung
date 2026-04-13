import { IngestJob, ReadingQuality, SensorConfigSnapshot } from '@iotproxy/shared';

export interface PipelineContext {
  raw: IngestJob;
  current: Record<string, unknown>;   // mutated by each stage
  qualityCode: ReadingQuality;
  flags: string[];
  correlationId: string;
  sensorConfig?: SensorConfigSnapshot;
  configVersionId?: string;
  isDerived?: boolean;                 // true for re-enqueued virtual sensor readings
}

export interface StageResult {
  action: 'PASS' | 'REJECT' | 'DROP' | 'FLAG';
  qualityCode?: ReadingQuality;
  reason?: string;
}
