'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Debt extends Model {
    static associate(models) {
      Debt.belongsTo(models.Session, { foreignKey: 'sessionId', as: 'session' });
    }
  }

  Debt.init(
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
      customerName: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      customerPhone: {
        type: DataTypes.STRING(20),
        allowNull: true,
      },
      tableAmount: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 0,
      },
      barAmount: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 0,
      },
      totalDebt: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 0,
      },
      paidAmount: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 0,
      },
      remainingDebt: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 0,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      isPaid: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      paidAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      dueDate: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'Debt',
      tableName: 'debts',
      timestamps: true,
    }
  );

  return Debt;
};
