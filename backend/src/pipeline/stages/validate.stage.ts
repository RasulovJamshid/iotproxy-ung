import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PipelineContext, StageResult } from '../pipeline.types';
import { PIPELINE_FLAGS } from '@iotproxy/shared';

@Injectable()
export class ValidateStage {
  constructor(private config: ConfigService) {}

  async run(ctx: PipelineContext): Promise<StageResult> {
    const { raw } = ctx;

    if (!raw.phenomenonTime) {
      ctx.flags.push(PIPELINE_FLAGS.INVALID_TIMESTAMP);
      return { action: 'REJECT', qualityCode: 'BAD', reason: 'Missing phenomenonTime' };
    }

    const ts = new Date(raw.phenomenonTime);
    if (isNaN(ts.getTime())) {
      ctx.flags.push(PIPELINE_FLAGS.INVALID_TIMESTAMP);
      return { action: 'REJECT', qualityCode: 'BAD', reason: 'Invalid timestamp format' };
    }

    const futureMs = this.config.get<number>('ingest.clockSkewFutureH')! * 3_600_000;
    if (ts.getTime() > Date.now() + futureMs) {
      ctx.flags.push(PIPELINE_FLAGS.FUTURE_TIMESTAMP);
      return { action: 'REJECT', qualityCode: 'BAD', reason: 'Timestamp too far in the future' };
    }

    const pastMs = this.config.get<number>('ingest.clockSkewPastD')! * 86_400_000;
    if (ts.getTime() < Date.now() - pastMs) {
      ctx.flags.push(PIPELINE_FLAGS.STALE_TIMESTAMP);
      return { action: 'REJECT', qualityCode: 'BAD', reason: 'Timestamp too far in the past' };
    }

    // Range validation (requires SensorConfig)
    const sc = ctx.sensorConfig;
    if (sc && sc.expectedMin !== null && sc.expectedMax !== null) {
      const val = (ctx.current as Record<string, unknown>)['value'];
      if (typeof val === 'number') {
        if (val < sc.expectedMin || val > sc.expectedMax) {
          ctx.flags.push(PIPELINE_FLAGS.OUT_OF_RANGE);
          if (sc.rejectOutOfRange) {
            return { action: 'REJECT', qualityCode: 'BAD', reason: 'Value out of configured range' };
          }
          return { action: 'PASS', qualityCode: 'UNCERTAIN' };
        }
      }
    }

    return { action: 'PASS', qualityCode: 'GOOD' };
  }
}
