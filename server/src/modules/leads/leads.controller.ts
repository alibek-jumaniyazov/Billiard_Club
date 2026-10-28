import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { Lang, Language } from '../../common/decorators/lang.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { SkipSubscription } from '../../common/decorators/skip-subscription.decorator';
import { t } from '../../common/i18n/messages';
import { UserRole } from '../../entities/enums';
import { CreateLeadDto, ListLeadsQueryDto, UpdateLeadDto } from './dto/leads.dto';
import { LeadsService } from './leads.service';

/** Landing arizasi — autentifikatsiyasiz; spam himoyasi: IP bo'yicha soatiga 5 ta */
@Controller('public/leads')
export class LeadsPublicController {
  constructor(private readonly leads: LeadsService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60 * 60 * 1000 } })
  @HttpCode(201)
  @Post()
  async create(
    @Body() dto: CreateLeadDto,
    @Lang() lang: Language,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    const data = await this.leads.create(dto, {
      ip: req.ip ?? null,
      userAgent: (req.headers['user-agent'] as string | undefined) ?? null,
    });
    return { success: true, message: t(lang, 'leads.created'), data: data ?? { id: 0 } };
  }
}

/** Arizalar — superadmin savdo voronkasi */
@Roles(UserRole.SUPERADMIN)
@SkipSubscription()
@Controller('admin/leads')
export class LeadsAdminController {
  constructor(private readonly leads: LeadsService) {}

  @Get()
  async findAll(@Query() query: ListLeadsQueryDto) {
    const { data, pagination, totals } = await this.leads.findAll(query);
    return { success: true, data, pagination, totals };
  }

  @Put(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateLeadDto,
    @Lang() lang: Language,
  ) {
    const data = await this.leads.update(id, dto);
    return { success: true, message: t(lang, 'leads.updated'), data };
  }
}
