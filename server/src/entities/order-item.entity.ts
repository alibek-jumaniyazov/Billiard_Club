import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { NumericTransformer } from '../common/transformers/numeric.transformer';
import { Order } from './order.entity';
import { Product } from './product.entity';

// DB darajasidagi cheklov migratsiyada yaratilgan, lekin metadatada ham
// e'lon qilinishi SHART (aks holda `migration:generate` uni DROP qiladi).
@Entity('order_items')
@Check('chk_order_items_valid', '"quantity" >= 1 AND "price" >= 0 AND "subtotal" >= 0')
export class OrderItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ type: 'int' })
  orderId: number;

  @ManyToOne(() => Order, (order) => order.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderId' })
  order: Order;

  @Index()
  @Column({ type: 'int' })
  productId: number;

  @ManyToOne(() => Product, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @Column({ type: 'int' })
  quantity: number;

  /** Sotuv paytidagi narx (keyinchalik mahsulot narxi o'zgarsa ham tarix buzilmaydi) */
  @Column({ type: 'decimal', precision: 14, scale: 2, transformer: new NumericTransformer() })
  price: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, transformer: new NumericTransformer() })
  subtotal: number;

  // Indeks entity darajasida ham e'lon qilinadi — aks holda keyingi
  // `migration:generate` uni "ortiqcha" deb hisoblab DROP qilib yuborardi
  @Index('IDX_order_items_createdAt')
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
