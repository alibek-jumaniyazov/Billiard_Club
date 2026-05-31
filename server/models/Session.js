'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Session extends Model {
    static associate(models) {
      Session.belongsTo(models.Table, { foreignKey: 'tableId', as: 'table' });
      Session.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
      Session.hasOne(models.Sale, { foreignKey: 'sessionId', as: 'sale' });
      Session.hasMany(models.Order, { foreignKey: 'sessionId', as: 'orders' });
    }
  }

  Session.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      tableId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'tables', key: 'id' },
        onDelete: 'RESTRICT',
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
      },
      customerName: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      customerPhone: {
        type: DataTypes.STRING(20),
        allowNull: true,
      },
      startTime: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      endTime: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      durationMinutes: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      tableAmount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0,
      },
      barAmount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0,
      },
      totalAmount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0,
      },
      status: {
        type: DataTypes.ENUM('active', 'completed', 'cancelled'),
        defaultValue: 'active',
      },
      paymentMethod: {
        type: DataTypes.ENUM('cash', 'card', 'transfer'),
        allowNull: true,
      },
      isPaid: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'Session',
      tableName: 'sessions',
      timestamps: true,
      indexes: [
        { fields: ['tableId'] },
        { fields: ['userId'] },
        { fields: ['status'] },
        { fields: ['startTime'] },
        { fields: ['createdAt'] },
      ],
    }
  );

  return Session;
};
