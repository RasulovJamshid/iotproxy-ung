import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as math from 'mathjs';
import { VirtualSensor } from '../../sensors/virtual-sensor.entity';
import { PipelineContext, StageResult } from '../pipeline.types';
import { ProcessedReading, PIPELINE_FLAGS } from '@iotproxy/shared';
import { randomUUID } from 'crypto';

// Restricted mathjs instance — no import, no createUnit, no access to globals
const restrictedMath = math.create(math.all);
restrictedMath.import(
  {
    import: () => { throw new Error('import is disabled'); },
    createUnit: () => { throw new Error('createUnit is disabled'); },
    evaluate: () => { throw new Error('evaluate is disabled'); },
    parse: () => { throw new Error('parse is disabled'); },
  },
  { override: true },
);

@Injectable()
export class DerivedStage {
  private readonly logger = new Logger(DerivedStage.name);

  constructor(
    @InjectRepository(VirtualSensor) private virtualSensors: Repository<VirtualSensor>,
  ) {}

  async run(ctx: PipelineContext): Promise<ProcessedReading[]> {
    // Skip derived stage for readings that are themselves derived — prevent infinite loops
    if (ctx.isDerived) return [];

    const virtuals = await this.virtualSensors.findBy({
      sourceSensorId: ctx.raw.sensorId,
      isActive: true,
    });

    if (virtuals.length === 0) return [];

    const derivedReadings: ProcessedReading[] = [];

    for (const vs of virtuals) {
      try {
        const scope = {
          ...(ctx.current as Record<string, unknown>),
          value: (ctx.current as Record<string, unknown>)['value'] ?? 0,
        };

        const result = restrictedMath.evaluate(vs.formula, scope);
        const computedValue = typeof result === 'number' ? result : Number(result);

        if (!isFinite(computedValue)) {
          this.logger.warn(
            `Virtual sensor ${vs.id} formula yielded non-finite result`,
            { formula: vs.formula },
          );
          continue;
        }

        derivedReadings.push({
          sensorId: vs.id,
          organizationId: ctx.raw.organizationId,
          siteId: ctx.raw.siteId,
          phenomenonTime: ctx.raw.phenomenonTime,
          receivedAt: new Date().toISOString(),
          rawData: ctx.current as Record<string, unknown>,
          processedData: { value: computedValue, _unit: vs.unit },
          qualityCode: ctx.qualityCode,
          pipelineFlags: [PIPELINE_FLAGS.DERIVED],
          configVersionId: null,
          correlationId: randomUUID(),
        });
      } catch (err) {
        this.logger.error(
          `Virtual sensor ${vs.id} formula evaluation failed`,
          { formula: vs.formula, error: (err as Error).message },
        );
      }
    }

    return derivedReadings;
  }
}
