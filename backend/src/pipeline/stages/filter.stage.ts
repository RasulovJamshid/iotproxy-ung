import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Sensor } from '../../sensors/sensor.entity';
import { PipelineContext, StageResult } from '../pipeline.types';

@Injectable()
export class FilterStage {
  constructor(
    @InjectRepository(Sensor) private sensors: Repository<Sensor>,
  ) {}

  async run(ctx: PipelineContext): Promise<StageResult> {
    const sensor = await this.sensors.findOne({
      where: { id: ctx.raw.sensorId },
      select: ['status'],
    });

    if (!sensor) {
      return { action: 'DROP', reason: 'Sensor not found' };
    }

    if (sensor.status === 'DISABLED') {
      return { action: 'DROP', reason: 'Sensor is disabled' };
    }

    if (sensor.status === 'MAINTENANCE' || sensor.status === 'CALIBRATING') {
      return { action: 'FLAG', reason: `Sensor in ${sensor.status} state` };
    }

    return { action: 'PASS' };
  }
}
