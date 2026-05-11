import { Global, Module } from '@nestjs/common';
import { DomainEventBus } from './domain-event-bus';
import { OutboxPublisher } from './outbox-publisher.service';

@Global()
@Module({
  providers: [DomainEventBus, OutboxPublisher],
  exports: [DomainEventBus, OutboxPublisher],
})
export class EventsModule {}
