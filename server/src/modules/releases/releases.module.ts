import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppRelease } from '../../entities/app-release.entity';
import { PublicReleasesController } from './public-releases.controller';
import { ReleasesCleanupService } from './releases-cleanup.service';
import { ReleasesController } from './releases.controller';
import { ReleasesService } from './releases.service';

@Module({
  imports: [TypeOrmModule.forFeature([AppRelease])],
  controllers: [ReleasesController, PublicReleasesController],
  providers: [ReleasesService, ReleasesCleanupService],
  exports: [ReleasesService],
})
export class ReleasesModule implements OnModuleInit {
  /**
   * Papkalar server ko'tarilganda yaratiladi.
   *
   * Multer `dest` papkasini O'ZI yaratmaydi: birinchi yuklashda u yo'q bo'lsa
   * so'rov ENOENT bilan yiqilardi — va buni faqat superadmin birinchi marta
   * reliz yuklaganda, ya'ni eng noqulay paytda bilib olardik.
   */
  onModuleInit(): void {
    ReleasesService.ensureDirs();
  }
}
