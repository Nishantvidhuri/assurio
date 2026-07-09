import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter } from 'events';
import { Observable } from 'rxjs';
import type { MessageEvent } from '@nestjs/common';

@Injectable()
export class EventsService implements OnModuleDestroy {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(0);
  }

  onModuleDestroy() {
    this.emitter.removeAllListeners();
  }

  emit(channel: string, data: unknown): void {
    this.emitter.emit(channel, data);
  }

  stream(channel: string): Observable<MessageEvent> {
    return new Observable((subscriber) => {
      const handler = (data: unknown) => {
        subscriber.next({ data } as MessageEvent);
      };
      this.emitter.on(channel, handler);
      return () => {
        this.emitter.off(channel, handler);
      };
    });
  }

  subjectChannel(subjectId: string): string {
    return `subject:${subjectId}`;
  }

  batchChannel(batchId: string): string {
    return `batch:${batchId}`;
  }
}
