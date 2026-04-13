import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Sensor } from './sensor.entity';
import { SensorConfig } from './sensor-config.entity';
import { SensorConfigVersion } from './sensor-config-version.entity';
import { VirtualSensor } from './virtual-sensor.entity';
import { ERROR_CODES } from '@iotproxy/shared';

@Injectable()
export class SensorsService {
  constructor(
    @InjectRepository(Sensor) private sensors: Repository<Sensor>,
    @InjectRepository(SensorConfig) private configs: Repository<SensorConfig>,
    @InjectRepository(SensorConfigVersion) private versions: Repository<SensorConfigVersion>,
    @InjectRepository(VirtualSensor) private virtuals: Repository<VirtualSensor>,
    private dataSource: DataSource,
  ) {}

  // ── Sensors ───────────────────────────────────────────────────────────────

  findAll(siteId: string, organizationId: string) {
    return this.sensors.find({ where: { siteId, organizationId } });
  }

  async findOne(id: string, organizationId: string) {
    const s = await this.sensors.findOne({ where: { id, organizationId } });
    if (!s) throw new NotFoundException(`Sensor ${id} not found`);
    return s;
  }

  async create(organizationId: string, siteId: string, data: Partial<Sensor>) {
    return this.sensors.save(this.sensors.create({ organizationId, siteId, ...data }));
  }

  async updateStatus(id: string, organizationId: string, status: string) {
    await this.findOne(id, organizationId);
    await this.sensors.update(id, { status });
    return this.findOne(id, organizationId);
  }

  async update(id: string, organizationId: string, data: Pick<Sensor, 'name' | 'description' | 'externalId' | 'reportingIntervalSeconds' | 'maxRecordsPerSensor'>) {
    await this.findOne(id, organizationId);
    await this.sensors.update(id, data);
    return this.findOne(id, organizationId);
  }

  async softDelete(id: string, organizationId: string) {
    await this.findOne(id, organizationId);
    await this.sensors.softDelete(id);
  }

  async hardDelete(id: string, organizationId: string) {
    await this.findOne(id, organizationId);
    await this.sensors.delete(id);
  }

  // ── SensorConfig (immutable versioning) ───────────────────────────────────

  async getActiveConfig(sensorId: string, organizationId: string) {
    await this.findOne(sensorId, organizationId);
    return this.configs.findOne({
      where: { sensorId, isActive: true },
      order: { createdAt: 'DESC' },
    });
  }

  async upsertConfig(
    sensorId: string,
    organizationId: string,
    data: Partial<SensorConfig>,
    changedBy?: string,
  ) {
    await this.findOne(sensorId, organizationId);

    return this.dataSource.transaction(async (em) => {
      // Deactivate current active config
      await em.update(SensorConfig, { sensorId, isActive: true }, { isActive: false });

      // Create new active config
      const config = await em.save(
        em.create(SensorConfig, { sensorId, isActive: true, ...data }),
      );

      // Count existing versions for increment
      const count = await em.count(SensorConfigVersion, { where: { configId: config.id } });

      // Create immutable version record
      await em.save(
        em.create(SensorConfigVersion, {
          configId: config.id,
          version: count + 1,
          snapshot: data as Record<string, unknown>,
          changedBy,
        }),
      );

      return config;
    });
  }

  // ── Virtual sensors (with circular dependency guard) ─────────────────────

  async createVirtualSensor(
    organizationId: string,
    siteId: string,
    data: Partial<VirtualSensor>,
  ) {
    // Detect cycles using topological sort before saving
    const existing = await this.virtuals.find({ where: { organizationId } });
    const hypothetical = [...existing, { ...data, id: '__new__' }] as VirtualSensor[];
    this.detectCycles(hypothetical);

    return this.virtuals.save(
      this.virtuals.create({ organizationId, siteId, ...data }),
    );
  }

  async findOneVirtual(id: string, organizationId: string) {
    const v = await this.virtuals.findOne({ where: { id, organizationId } });
    if (!v) throw new NotFoundException(`Virtual sensor ${id} not found`);
    return v;
  }

  async softDeleteVirtual(id: string, organizationId: string) {
    await this.findOneVirtual(id, organizationId);
    await this.virtuals.softDelete(id);
  }

  async hardDeleteVirtual(id: string, organizationId: string) {
    await this.findOneVirtual(id, organizationId);
    await this.virtuals.delete(id);
  }

  private detectCycles(virtuals: VirtualSensor[]) {
    // Build adjacency: virtual sensor → source sensor
    // A cycle means a virtual sensor transitively depends on itself
    const deps: Map<string, string> = new Map(
      virtuals.map((v) => [v.id, v.sourceSensorId]),
    );
    const virtualIds = new Set(virtuals.map((v) => v.id));

    for (const v of virtuals) {
      let current = v.sourceSensorId;
      const visited = new Set<string>([v.id]);
      while (virtualIds.has(current)) {
        if (visited.has(current)) {
          throw new UnprocessableEntityException({
            errorCode: ERROR_CODES.FORMULA_CIRCULAR_DEPENDENCY,
            title: 'Circular dependency detected',
            detail: `Virtual sensor formula creates a circular dependency`,
          });
        }
        visited.add(current);
        current = deps.get(current) ?? '';
      }
    }
  }
}
