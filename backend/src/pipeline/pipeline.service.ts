import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ValidateStage } from './stages/validate.stage';
import { FilterStage } from './stages/filter.stage';
import { TransformStage } from './stages/transform.stage';
import { AliasStage } from './stages/alias.stage';
import { DerivedStage } from './stages/derived.stage';
import { AlertStage } from './stages/alert.stage';
import { SensorConfig } from '../sensors/sensor-config.entity';
import { Sensor } from '../sensors/sensor.entity';
import { PipelineContext } from './pipeline.types';
import { IngestJob, ProcessedReading } from '@iotproxy/shared';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class PipelineService {
  private readonly logger = new Logger(PipelineService.name);

  constructor(
    private validate: ValidateStage,
    private filter: FilterStage,
    private transform: TransformStage,
    private alias: AliasStage,
    private derived: DerivedStage,
    private alert: AlertStage,
    @InjectRepository(SensorConfig) private configRepo: Repository<SensorConfig>,
    @InjectRepository(Sensor) private sensorRepo: Repository<Sensor>,
  ) {}

  async process(raw: IngestJob): Promise<ProcessedReading | null> {
    // Resolve external IDs → internal UUID if sensorId is not a UUID
    let sensorId = raw.sensorId;
    if (!UUID_RE.test(sensorId)) {
      const sensor = await this.sensorRepo.findOne({ where: { externalId: sensorId } });
      if (!sensor) {
        this.logger.warn(
          `Dropping reading: sensorId "${sensorId}" is not a UUID and no sensor with that externalId exists`,
        );
        return null;
      }
      sensorId = sensor.id;
      raw = { ...raw, sensorId };
    }

    // Load sensor config snapshot with its latest version row
    const config = await this.configRepo
      .createQueryBuilder('config')
      .leftJoinAndMapOne(
        'config.latestVersion',
        'config.versions',
        'latestVersion',
        'latestVersion.version = (SELECT MAX(v.version) FROM sensor_config_versions v WHERE v.config_id = config.id)',
      )
      .where('config.sensorId = :sensorId', { sensorId: raw.sensorId })
      .andWhere('config.isActive = :active', { active: true })
      .orderBy('config.createdAt', 'DESC')
      .getOne();

    const ctx: PipelineContext = {
      raw,
      current: { ...(raw.data as Record<string, unknown>) },
      qualityCode: 'GOOD',
      flags: [],
      correlationId: raw.correlationId,
      sensorConfig: config?.toSnapshot(),
      configVersionId: config?.latestVersion?.id,
      isDerived: false,
    };

    // Stage 1: Validate — rejects bad timestamps, out-of-range values
    const v = await this.validate.run(ctx);
    if (v.action === 'REJECT') {
      this.logger.debug(`Reading rejected: ${v.reason}`, { correlationId: raw.correlationId });
      return null;
    }
    if (v.qualityCode) ctx.qualityCode = v.qualityCode;

    // Stage 2: Filter — drops readings from disabled/maintenance sensors
    const f = await this.filter.run(ctx);
    if (f.action === 'DROP') return null;
    if (f.action === 'FLAG') ctx.qualityCode = 'MAINTENANCE';

    // Stage 3: Transform — scale, offset, unit conversion, clamp
    await this.transform.run(ctx);

    // Stage 4: Alias — field key remapping
    await this.alias.run(ctx);

    // Stage 5: Derived — virtual sensor formulas (spawns additional readings)
    const derivedReadings = await this.derived.run(ctx);

    // Stage 6: Alert — threshold rule evaluation
    await this.alert.run(ctx);

    return {
      sensorId:        raw.sensorId,
      organizationId:  raw.organizationId,
      siteId:          raw.siteId,
      phenomenonTime:  raw.phenomenonTime,
      receivedAt:      raw.receivedAt,
      rawData:         raw.data as Record<string, unknown>,
      processedData:   ctx.current,
      qualityCode:     ctx.qualityCode,
      pipelineFlags:   ctx.flags,
      configVersionId: ctx.configVersionId ?? null,
      correlationId:   raw.correlationId,
      derivedReadings,
    };
  }
}
