import { Controller, Get } from '@nestjs/common';
import type { TopicDto } from '@zuirock/shared';
import { TopicsService } from './topics.service.js';

@Controller()
export class TopicsController {
  constructor(private readonly topics: TopicsService) {}

  @Get('topics')
  list(): Promise<TopicDto[]> {
    return this.topics.list();
  }

  @Get('questions/stats')
  stats() {
    return this.topics.stats();
  }
}
