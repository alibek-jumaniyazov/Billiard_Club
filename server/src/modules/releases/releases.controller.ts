import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SkipThrottle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Lang, Language } from '../../common/decorators/lang.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { SkipSubscription } from '../../common/decorators/skip-subscription.decorator';
import { t } from '../../common/i18n/messages';
import { UserRole } from '../../entities/enums';
import { User } from '../../entities/user.entity';
import { CreateReleaseDto, StartReleaseUploadDto } from './dto/releases.dto';
import {
  CHUNK_MAX_BYTES,
  MAX_UPLOAD_BYTES,
  ReleasesService,
  toAdminRelease,
  UploadedFileLike,
} from './releases.service';

/**
 * Desktop relizlarini boshqarish — FAQAT superadmin.
 *
 * @SkipSubscription: bu platforma yo'li, klub obunasiga bog'liq emas.
 */
@Roles(UserRole.SUPERADMIN)
@SkipSubscription()
@Controller('admin/releases')
export class ReleasesController {
  constructor(private readonly releases: ReleasesService) {}

  @Get()
  async list() {
    const rows = await this.releases.list();
    return { success: true, data: rows.map(toAdminRelease) };
  }

  /**
   * O'rnatgichni yuklash.
   *
   * `dest` bilan multer faylni VAQTINCHALIK papkaga, tasodifiy nom bilan
   * yozadi — xotiraga EMAS. 200 MB lik `.exe` ni buferga o'qish serverni
   * bir necha bir vaqtdagi yuklashda o'ldirardi. Yakuniy nomga ko'chirish
   * (va sha512 hisoblash) servisda, tekshiruvlardan keyin bo'ladi.
   */
  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      dest: ReleasesService.tmpDir(),
      limits: { fileSize: MAX_UPLOAD_BYTES },
    }),
  )
  async create(
    @UploadedFile() file: UploadedFileLike | undefined,
    @Body() dto: CreateReleaseDto,
    @CurrentUser() user: User,
    @Lang() lang: Language,
  ) {
    if (!file) throw new BadRequestException({ key: 'releases.fileRequired' });
    const created = await this.releases.create(file, dto, user.id);
    return { success: true, message: t(lang, 'releases.uploaded'), data: toAdminRelease(created) };
  }

  /** Nashr etish — shundan keyin /download da va auto-update'da ko'rinadi */
  @Post(':id/publish')
  async publish(@Param('id', ParseIntPipe) id: number, @Lang() lang: Language) {
    const updated = await this.releases.setPublished(id, true);
    return { success: true, message: t(lang, 'releases.published'), data: toAdminRelease(updated) };
  }

  /** Nashrdan olish — yangi mijozlar bu versiyani endi olmaydi */
  @Post(':id/unpublish')
  async unpublish(@Param('id', ParseIntPipe) id: number, @Lang() lang: Language) {
    const updated = await this.releases.setPublished(id, false);
    return {
      success: true,
      message: t(lang, 'releases.unpublished'),
      data: toAdminRelease(updated),
    };
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number, @Lang() lang: Language) {
    await this.releases.remove(id);
    return { success: true, message: t(lang, 'releases.deleted') };
  }

  /* ------------------------------------------------- Bo'laklab yuklash
   * Katta o'rnatgich bitta so'rovda server oldidagi proksi (nginx
   * client_max_body_size) chegarasiga urilib 413 olardi. Admin paneli
   * faylni 4 MB lik bo'laklarda yuboradi: boshlash -> bo'laklar -> yakunlash.
   */

  @Post('uploads')
  async startUpload(@Body() dto: StartReleaseUploadDto, @CurrentUser() user: User) {
    const data = await this.releases.startUpload(dto, user.id);
    return { success: true, data };
  }

  /** Bo'laklar ko'p (500 MB = 125 ta) — umumiy so'rov limitini yemasin */
  @SkipThrottle()
  @Put('uploads/:uploadId')
  @UseInterceptors(FileInterceptor('chunk', { limits: { fileSize: CHUNK_MAX_BYTES } }))
  appendChunk(
    @Param('uploadId') uploadId: string,
    @Query('offset', ParseIntPipe) offset: number,
    @UploadedFile() chunk: { buffer?: Buffer } | undefined,
    @CurrentUser() user: User,
  ) {
    if (!chunk?.buffer) throw new BadRequestException({ key: 'releases.fileRequired' });
    return { success: true, data: this.releases.appendUploadChunk(uploadId, user.id, offset, chunk.buffer) };
  }

  @Post('uploads/:uploadId/complete')
  async completeUpload(@Param('uploadId') uploadId: string, @CurrentUser() user: User, @Lang() lang: Language) {
    const created = await this.releases.completeUpload(uploadId, user.id);
    return { success: true, message: t(lang, 'releases.uploaded'), data: toAdminRelease(created) };
  }

  @Delete('uploads/:uploadId')
  abortUpload(@Param('uploadId') uploadId: string, @CurrentUser() user: User) {
    this.releases.abortUpload(uploadId, user.id);
    return { success: true };
  }
}
