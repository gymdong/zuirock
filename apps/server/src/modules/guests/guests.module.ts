import { Module } from '@nestjs/common';
import { GuestsController } from './guests.controller.js';
import { GuestsService } from './guests.service.js';
import { MergeService } from './merge.service.js';

@Module({ controllers: [GuestsController], providers: [GuestsService, MergeService], exports: [MergeService, GuestsService] })
export class GuestsModule {}
