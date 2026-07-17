import 'reflect-metadata';
import * as bcrypt from 'bcryptjs';
import { AppDataSource } from './data-source';
import { Category } from '../entities/category.entity';
import { Club } from '../entities/club.entity';
import { ClubStatus, UserRole } from '../entities/enums';
import { Plan } from '../entities/plan.entity';
import { PlatformSetting } from '../entities/platform-setting.entity';
import { Product } from '../entities/product.entity';
import { Settings } from '../entities/settings.entity';
import { Table } from '../entities/table.entity';
import { User } from '../entities/user.entity';
import {
  DEFAULT_TELEGRAM_EVENTS,
  TELEGRAM_EVENTS_SETTING_KEY,
} from '../telegram/telegram.service';

/**
 * Boshlang'ich ma'lumotlar:
 *  - Superadmin (SUPERADMIN_USERNAME / SUPERADMIN_PASSWORD .env dan)
 *  - Standart obuna tariflari (oylik / 6 oylik / yillik)
 *  - Telegram hodisa sozlamalari (platform_settings, hammasi yoqilgan)
 *  - SEED_DEMO_CLUB=true bo'lsa — demo klub (7 kunlik sinov) namunaviy
 *    stollar/mahsulotlar bilan. Faqat development uchun!
 *
 * Skript idempotent: mavjud yozuvlar qayta yaratilmaydi.
 */
async function seed() {
  await AppDataSource.initialize();

  const userRepo = AppDataSource.getRepository(User);
  const clubRepo = AppDataSource.getRepository(Club);

  // ---------- Superadmin ----------
  const superUsername = process.env.SUPERADMIN_USERNAME || 'superadmin';
  const superPassword = process.env.SUPERADMIN_PASSWORD;
  if (!superPassword || superPassword.length < 6) {
    console.error('❌ SUPERADMIN_PASSWORD .env da kamida 6 belgidan iborat bo\'lishi kerak');
    process.exit(1);
  }

  let superadmin = await userRepo.findOne({ where: { username: superUsername } });
  if (!superadmin) {
    superadmin = await userRepo.save({
      name: 'Platforma egasi',
      username: superUsername,
      password: await bcrypt.hash(superPassword, 12),
      role: UserRole.SUPERADMIN,
      clubId: null,
      isActive: true,
    });
    console.log(`✅ Superadmin yaratildi: ${superUsername}`);
  } else {
    console.log(`ℹ️ Superadmin mavjud: ${superUsername}`);
  }

  // ---------- Obuna tariflari ----------
  const planRepo = AppDataSource.getRepository(Plan);
  const defaultPlans: Array<Partial<Plan> & { code: string }> = [
    {
      code: 'monthly',
      nameUz: 'Oylik',
      nameRu: 'Месячный',
      descriptionUz: '30 kunlik obuna — barcha imkoniyatlar',
      descriptionRu: 'Подписка на 30 дней — все возможности',
      durationDays: 30,
      price: 290000,
      sortOrder: 1,
    },
    {
      code: 'semiannual',
      nameUz: '6 oylik',
      nameRu: 'Полугодовой',
      descriptionUz: '180 kunlik obuna — oylikdan 14% tejamkor',
      descriptionRu: 'Подписка на 180 дней — на 14% выгоднее месячной',
      durationDays: 180,
      price: 1490000,
      sortOrder: 2,
    },
    {
      code: 'yearly',
      nameUz: 'Yillik',
      nameRu: 'Годовой',
      descriptionUz: '365 kunlik obuna — oylikdan 28% tejamkor',
      descriptionRu: 'Подписка на 365 дней — на 28% выгоднее месячной',
      durationDays: 365,
      price: 2490000,
      sortOrder: 3,
    },
  ];
  for (const plan of defaultPlans) {
    const existingPlan = await planRepo.findOne({ where: { code: plan.code } });
    if (!existingPlan) {
      await planRepo.save(plan);
      console.log(`✅ Tarif yaratildi: ${plan.code}`);
    } else {
      console.log(`ℹ️ Tarif mavjud: ${plan.code}`);
    }
  }

  // ---------- Telegram hodisa sozlamalari ----------
  const platformSettingRepo = AppDataSource.getRepository(PlatformSetting);
  const tgEvents = await platformSettingRepo.findOne({
    where: { key: TELEGRAM_EVENTS_SETTING_KEY },
  });
  if (!tgEvents) {
    await platformSettingRepo.save({
      key: TELEGRAM_EVENTS_SETTING_KEY,
      value: DEFAULT_TELEGRAM_EVENTS,
    });
    console.log('✅ Telegram hodisa sozlamalari yaratildi (hammasi yoqilgan)');
  } else {
    console.log('ℹ️ Telegram hodisa sozlamalari mavjud');
  }

  // ---------- Demo klub (faqat dev) ----------
  if (process.env.SEED_DEMO_CLUB === 'true' && process.env.NODE_ENV !== 'production') {
    const existing = await clubRepo.findOne({ where: { name: 'Demo Billiard Club' } });
    if (!existing) {
      await AppDataSource.transaction(async (manager) => {
        const club = await manager.save(Club, {
          name: 'Demo Billiard Club',
          ownerName: 'Demo Ega',
          phone: '+998901234567',
          status: ClubStatus.TRIAL,
          trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        });

        await manager.save(User, [
          {
            name: 'Demo Admin',
            username: 'demo_admin',
            password: await bcrypt.hash('demo123!', 12),
            role: UserRole.ADMIN,
            clubId: club.id,
            isActive: true,
          },
          {
            name: 'Demo Kassir',
            username: 'demo_kassir',
            password: await bcrypt.hash('demo123!', 12),
            role: UserRole.KASSIR,
            clubId: club.id,
            isActive: true,
          },
          {
            name: 'Demo Operator',
            username: 'demo_operator',
            password: await bcrypt.hash('demo123!', 12),
            role: UserRole.OPERATOR,
            clubId: club.id,
            isActive: true,
          },
        ]);

        await manager.save(Settings, {
          clubId: club.id,
          clubName: club.name,
          phone: club.phone,
        });

        const tables: Partial<Table>[] = [];
        for (let i = 1; i <= 8; i++) {
          tables.push({
            clubId: club.id,
            name: i <= 6 ? `Stol ${i}` : `VIP Stol ${i}`,
            number: i,
            pricePerHour: i <= 6 ? 15000 : 20000,
            description: i <= 6 ? null : 'VIP zona',
          });
        }
        await manager.save(Table, tables);

        const categories = await manager.save(Category, [
          { clubId: club.id, name: 'Ichimliklar', icon: 'CoffeeOutlined' },
          { clubId: club.id, name: 'Gazaklar', icon: 'ShoppingOutlined' },
          { clubId: club.id, name: 'Issiq taomlar', icon: 'FireOutlined' },
          { clubId: club.id, name: 'Choy va kofe', icon: 'RestOutlined' },
        ]);
        const [drinks, snacks, hot, tea] = categories;

        await manager.save(Product, [
          { clubId: club.id, categoryId: drinks.id, name: 'Coca-Cola 0.5', price: 8000, stock: 50, unit: 'dona' },
          { clubId: club.id, categoryId: drinks.id, name: 'Fanta 0.5', price: 8000, stock: 40, unit: 'dona' },
          { clubId: club.id, categoryId: drinks.id, name: 'Suv 0.5', price: 3000, stock: 100, unit: 'dona' },
          { clubId: club.id, categoryId: snacks.id, name: 'Chipsi Lays', price: 12000, stock: 30, unit: 'paket' },
          { clubId: club.id, categoryId: snacks.id, name: 'Pista', price: 15000, stock: 25, unit: 'paket' },
          { clubId: club.id, categoryId: hot.id, name: 'Lavash', price: 25000, stock: 20, unit: 'dona' },
          { clubId: club.id, categoryId: hot.id, name: 'Burger', price: 28000, stock: 15, unit: 'dona' },
          { clubId: club.id, categoryId: tea.id, name: 'Choy (choynak)', price: 5000, stock: 200, unit: 'piyola' },
          { clubId: club.id, categoryId: tea.id, name: 'Kofe', price: 10000, stock: 80, unit: 'piyola' },
        ]);
      });
      console.log('✅ Demo klub yaratildi (demo_admin / demo123!)');
    } else {
      console.log('ℹ️ Demo klub mavjud');
    }
  }

  await AppDataSource.destroy();
  console.log('🌱 Seed tugadi');
}

seed().catch((err) => {
  console.error('❌ Seed xatosi:', err);
  process.exit(1);
});
