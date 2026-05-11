import { Inject, Injectable, Logger } from '@nestjs/common';
import dayjs from 'dayjs';
import { DomainEventBus } from '../../../shared-kernel/events/domain-event-bus';
import { CashFlowDeficitPredicted } from '../domain/events/cashflow-events';
import { CashFlowProjection } from '../domain/projection.entity';
import {
  PROJECTION_REPOSITORY,
  ProjectionRepository,
} from '../domain/repositories.interface';

const MIN_CONFIDENCE_TO_EMIT = 0.4;

/**
 * Walks the projection's points, identifies deficit windows (median trajectory
 * < 0) and:
 *
 *  - Persists deficit_predictions rows (denormalized, for Inbox + AI tools).
 *  - Emits cashflow.deficit.predicted events for the recommendation pipeline
 *    (subscribed in event-routing.ts).
 *
 * We dedup the event stream: only the worst day of a contiguous deficit
 * window emits an event; that's the "alert-worthy" point.
 */
@Injectable()
export class DeficitDetectorService {
  private readonly logger = new Logger(DeficitDetectorService.name);

  constructor(
    @Inject(PROJECTION_REPOSITORY)
    private readonly projections: ProjectionRepository,
    private readonly events: DomainEventBus,
  ) {}

  async scanAndFlag(projection: CashFlowProjection): Promise<number> {
    const windows = projection.detectDeficitWindows();
    if (windows.length === 0) return 0;

    let emitted = 0;
    for (const window of windows) {
      // Each persisted row corresponds to a worst-day of a window so the
      // recommendations engine doesn't get spammed for every dip day.
      await this.projections.recordDeficit({
        userId: projection.userId,
        projectionId: projection.id,
        predictedFor: window.worstDay,
        estimatedAmount: window.worstAmount,
        confidence: window.confidence,
      });

      if (window.confidence < MIN_CONFIDENCE_TO_EMIT) continue;
      const daysAhead = dayjs(window.worstDay).diff(dayjs().startOf('day'), 'day');
      await this.events.publish(
        new CashFlowDeficitPredicted(
          projection.id,
          {
            userId: projection.userId,
            projectionId: projection.id,
            predictedFor: window.worstDay.toISOString(),
            estimatedAmount: window.worstAmount.toFixed(2),
            confidence: window.confidence,
            daysAhead,
          },
          { userId: projection.userId },
        ),
      );
      emitted++;
    }
    if (emitted > 0) {
      this.logger.log(
        `User ${projection.userId}: flagged ${emitted} deficit window(s) for projection ${projection.id}`,
      );
    }
    return emitted;
  }
}
