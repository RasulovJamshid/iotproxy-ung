import { Injectable } from '@nestjs/common';
import { PipelineContext, StageResult } from '../pipeline.types';
import { PIPELINE_FLAGS } from '@iotproxy/shared';

@Injectable()
export class AliasStage {
  async run(ctx: PipelineContext): Promise<StageResult> {
    const sc = ctx.sensorConfig;
    if (!sc || !sc.fieldMappings || Object.keys(sc.fieldMappings).length === 0) {
      return { action: 'PASS' };
    }

    const data = ctx.current as Record<string, unknown>;
    let aliased = false;

    for (const [fromKey, toKey] of Object.entries(sc.fieldMappings)) {
      if (fromKey in data && fromKey !== toKey) {
        data[toKey] = data[fromKey];
        delete data[fromKey];
        aliased = true;
      }
    }

    if (aliased) ctx.flags.push(PIPELINE_FLAGS.ALIASED);
    ctx.current = data;
    return { action: 'PASS' };
  }
}
