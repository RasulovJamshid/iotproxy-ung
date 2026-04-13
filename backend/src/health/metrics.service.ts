import { Injectable } from '@nestjs/common';
import {
  Registry, Counter, Gauge, Histogram, collectDefaultMetrics,
} from 'prom-client';

@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  readonly ingestRequestsTotal = new Counter({
    name: 'iot_ingest_requests_total',
    help: 'Total ingest HTTP requests',
    labelNames: ['method', 'status', 'org'],
    registers: [this.registry],
  });

  readonly queueDepth = new Gauge({
    name: 'iot_queue_depth',
    help: 'BullMQ readings queue waiting job count',
    registers: [this.registry],
  });

  readonly pipelineStageDuration = new Histogram({
    name: 'iot_pipeline_stage_duration_ms',
    help: 'Pipeline stage execution duration in ms',
    labelNames: ['stage'],
    buckets: [1, 5, 10, 25, 50, 100, 250, 500],
    registers: [this.registry],
  });

  readonly readingsProcessedTotal = new Counter({
    name: 'iot_readings_processed_total',
    help: 'Total readings processed by quality code',
    labelNames: ['quality_code'],
    registers: [this.registry],
  });

  readonly workerBatchSize = new Histogram({
    name: 'iot_worker_batch_size',
    help: 'Number of readings per worker batch flush',
    buckets: [1, 5, 10, 25, 50, 100],
    registers: [this.registry],
  });

  readonly timescaleInsertDuration = new Histogram({
    name: 'iot_timescale_insert_duration_ms',
    help: 'TimescaleDB batch insert duration in ms',
    buckets: [5, 10, 25, 50, 100, 250, 500, 1000],
    registers: [this.registry],
  });

  readonly wsConnections = new Gauge({
    name: 'iot_websocket_connections',
    help: 'Active WebSocket connections',
    registers: [this.registry],
  });

  readonly alertEvaluationsTotal = new Counter({
    name: 'iot_alert_evaluations_total',
    help: 'Total alert rule evaluations',
    labelNames: ['rule_id', 'outcome'],
    registers: [this.registry],
  });

  constructor() {
    collectDefaultMetrics({ register: this.registry });
  }
}
