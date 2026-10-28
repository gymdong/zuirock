import { Module } from '@nestjs/common';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';
import { StagePlanner } from '../solo/stage-planner.js';

@Module({ controllers: [UsersController], providers: [UsersService, StagePlanner], exports: [UsersService, StagePlanner] })
export class UsersModule {}
