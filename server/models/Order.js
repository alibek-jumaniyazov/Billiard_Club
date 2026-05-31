'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Order extends Model {
    static associate(models) {
      Order.belongsTo(models.Session, { foreignKey: 'sessionId', as: 'session' });
      Order.belongsTo(models.Table, { foreignKey: 'tableId', as: 'table' });
      Order.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
      Order.hasMany(models.OrderItem, { foreignKey: 'orderId', as: 'items' });
    }
  }

  Order.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      sessionId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'sessions', key: 'id' },
      },
      tableId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'tables', key: 'id' },
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
      },
      totalAmount: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 0,
      },
      status: {
        type: DataTypes.ENUM('open', 'closed', 'cancelled'),
        defaultValue: 'open',
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'Order',
      tableName: 'orders',
      timestamps: true,
      indexes: [
        { fields: ['sessionId'] },
        { fields: ['tableId'] },
        { fields: ['status'] },
        { fields: ['createdAt'] },
      ],
    }
  );

  return Order;
};
