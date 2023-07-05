import { Module } from '@nestjs/common';
import { GithubGuard } from './guards/github.guard';

@Module({
  imports: [],
  providers: [],
  exports: [GithubGuard],
})
export class AuthModule {}
