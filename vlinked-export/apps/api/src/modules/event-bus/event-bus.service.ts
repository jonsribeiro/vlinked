import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { v4 as uuidv4 } from 'uuid';
import { DomainEvent, DomainEventType } from '../../common/constants/events.constants';

@Injectable()
export class EventBusService {
  private readonly logger = new Logger(EventBusService.name);

  constructor(
    @InjectQueue('events') private readonly eventsQueue: Queue,
  ) {}

  /**
   * Emite um evento para a fila
   */
  async emit<T>(
    eventType: DomainEventType,
    aggregateId: string,
    payload: T,
    metadata: { userId?: string; correlationId: string },
  ): Promise<void> {
    const event: DomainEvent<T> = {
      eventId: uuidv4(),
      eventType,
      aggregateId,
      payload,
      metadata: {
        ...metadata,
        timestamp: new Date().toISOString(),
      },
    };

    await this.eventsQueue.add(eventType, event, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
    });

    this.logger.debug(`Evento emitido: ${eventType} (${event.eventId})`);
  }

  /**
   * Emite evento sem esperar (fire and forget)
   */
  emitAsync<T>(
    eventType: DomainEventType,
    aggregateId: string,
    payload: T,
    metadata: { userId?: string; correlationId: string },
  ): void {
    this.emit(eventType, aggregateId, payload, metadata).catch((error) => {
      this.logger.error(`Erro ao emitir evento ${eventType}:`, error);
    });
  }
}
