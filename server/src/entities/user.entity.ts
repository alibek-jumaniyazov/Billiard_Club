import { Exclude } from 'class-transformer';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserRole } from './enums';
import { Club } from './club.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 50, unique: true })
  username: string;

  /** bcrypt hash — javoblarga hech qachon chiqmaydi */
  @Exclude()
  @Column({ type: 'varchar', select: false })
  password: string;

  @Index()
  @Column({ type: 'enum', enum: UserRole, enumName: 'user_role', default: UserRole.OPERATOR })
  role: UserRole;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  /**
   * Token versiyasi — parol almashtirilganda +1 bo'ladi va shu foydalanuvchining
   * barcha eski access/refresh tokenlari darhol bekor bo'ladi.
   */
  @Column({ type: 'int', default: 0 })
  tokenVersion: number;

  @Column({ type: 'timestamptz', nullable: true })
  lastLogin: Date | null;

  /** superadmin uchun NULL, qolganlar uchun majburiy */
  @Index()
  @Column({ type: 'int', nullable: true })
  clubId: number | null;

  @ManyToOne(() => Club, (club) => club.users, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'clubId' })
  club: Club | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
