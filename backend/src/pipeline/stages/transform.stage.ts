import { Injectable } from '@nestjs/common';
import { PipelineContext, StageResult } from '../pipeline.types';
import { PIPELINE_FLAGS } from '@iotproxy/shared';

@Injectable()
export class TransformStage {
  async run(ctx: PipelineContext): Promise<StageResult> {
    const sc = ctx.sensorConfig;
    if (!sc) return { action: 'PASS' };

    const data = ctx.current as Record<string, unknown>;

    // Apply scale + offset to every numeric field
    for (const [key, val] of Object.entries(data)) {
      if (typeof val !== 'number') continue;

      let transformed = val * sc.scaleMultiplier + sc.scaleOffset;

      // Clamp to expectedMin/expectedMax if configured
      if (sc.expectedMin !== null && transformed < sc.expectedMin) {
        transformed = sc.expectedMin;
        if (!ctx.flags.includes(PIPELINE_FLAGS.CLAMPED)) {
          ctx.flags.push(PIPELINE_FLAGS.CLAMPED);
        }
      }
      if (sc.expectedMax !== null && transformed > sc.expectedMax) {
        transformed = sc.expectedMax;
        if (!ctx.flags.includes(PIPELINE_FLAGS.CLAMPED)) {
          ctx.flags.push(PIPELINE_FLAGS.CLAMPED);
        }
      }

      data[key] = transformed;
    }

    // Attach unit if configured
    if (sc.unit) {
      data['_unit'] = sc.unit;
      ctx.flags.push(PIPELINE_FLAGS.UNIT_CONVERTED);
    }

    ctx.current = data;
    return { action: 'PASS' };
  }
}
