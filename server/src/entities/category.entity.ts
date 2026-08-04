import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Club } from './club.entity';
import { Product } from './product.entity';

// Qisman unikal indeks migratsiyada yaratilgan, lekin metadatada ham e'lon
// qilinishi SHART (aks holda `migration:generate` uni DROP qiladi).
@Entity('categories')
// Klub ichida faol kategoriya nomi unikal
@Index('uq_categories_club_name_active', ['clubId', 'name'], {
  unique: true,
  where: `"isActive" = true`,
})
export class Category {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ type: 'int' })
  clubId: number;

  @ManyToOne(() => Club, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'clubId' })
  club: Club;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true, default: 'AppstoreOutlined' })
  icon: string | null;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => Product, (product) => product.category)
  products: Product[];
}
