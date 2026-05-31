'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Sale extends Model {
    static associate(models) {
      Sale.belongsTo(models.Session, { foreignKey: 'sessionId', as: 'session' });
    }
  }

  Sale.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      sessionId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        unique: true,
        references: { model: 'sessions', key: 'id' },
      },
      tableAmount: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 0,
      },
      barAmount: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 0,
      },
      totalAmount: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 0,
      },
      paymentMethod: {
        type: DataTypes.ENUM('cash', 'card', 'transfer'),
        defaultValue: 'cash',
      },
      discount: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 0,
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'Sale',
      tableName: 'sales',
      timestamps: true,
      indexes: [
        { fields: ['sessionId'] },
        { fields: ['createdAt'] },
        { fields: ['paymentMethod'] },
      ],
    }
  );

  return Sale;
};
