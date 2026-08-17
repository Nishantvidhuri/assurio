import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PackagesController } from './packages.controller';
import { PackagesService } from './packages.service';

// Global: SubjectsService (provided by several modules) prices wallet-paid
// checks from the default package.
@Global()
@Module({
  imports: [AuthModule],
  controllers: [PackagesController],
  providers: [PackagesService],
  exports: [PackagesService],
})
export class PackagesModule {}
