export * from './enums';
export * from './club.entity';
export * from './user.entity';
export * from './table.entity';
export * from './session.entity';
export * from './category.entity';
export * from './product.entity';
export * from './order.entity';
export * from './order-item.entity';
export * from './sale.entity';
export * from './debt.entity';
export * from './debt-payment.entity';
export * from './settings.entity';
export * from './contract.entity';

import { Club } from './club.entity';
import { User } from './user.entity';
import { Table } from './table.entity';
import { Session } from './session.entity';
import { Category } from './category.entity';
import { Product } from './product.entity';
import { Order } from './order.entity';
import { OrderItem } from './order-item.entity';
import { Sale } from './sale.entity';
import { Debt } from './debt.entity';
import { DebtPayment } from './debt-payment.entity';
import { Settings } from './settings.entity';
import { Contract } from './contract.entity';

export const ALL_ENTITIES = [
  Club,
  User,
  Table,
  Session,
  Category,
  Product,
  Order,
  OrderItem,
  Sale,
  Debt,
  DebtPayment,
  Settings,
  Contract,
];
