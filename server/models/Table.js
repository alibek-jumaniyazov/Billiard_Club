'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Table extends Model {
    static associate(models) {
      Table.hasMany(models.Session, { foreignKey: 'tableId', as: 'sessions' });
      Table.hasMany(models.Order, { foreignKey: 'tableId', as: 'orders' });
    }
  }

  Table.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        validate: { notEmpty: true },
      },
      number: {
        type: DataTypes.INTEGER,
        allowNull: false,
        unique: true,
        validate: { min: 1 },
      },
      pricePerHour: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        validate: { min: 0 },
      },
      status: {
        type: DataTypes.ENUM('bosh', 'band'),
        defaultValue: 'bosh',
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
    },
    {
      sequelize,
      modelName: 'Table',
      tableName: 'tables',
      timestamps: true,
      indexes: [
        { unique: true, fields: ['number'] },
        { fields: ['status'] },
        { fields: ['isActive'] },
      ],
    }
  );

  return Table;
};
