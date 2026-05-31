'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Settings extends Model {
    static associate(models) {}
  }

  Settings.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      clubName: {
        type: DataTypes.STRING(150),
        defaultValue: 'Prime Billiard Club',
      },
      phone: {
        type: DataTypes.STRING(20),
        allowNull: true,
      },
      address: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      currency: {
        type: DataTypes.STRING(10),
        defaultValue: 'UZS',
      },
      currencySymbol: {
        type: DataTypes.STRING(5),
        defaultValue: "so'm",
      },
      defaultTablePrice: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 15000,
      },
      taxRate: {
        type: DataTypes.DECIMAL(5, 2),
        defaultValue: 0,
      },
      workingHoursStart: {
        type: DataTypes.STRING(5),
        defaultValue: '10:00',
      },
      workingHoursEnd: {
        type: DataTypes.STRING(5),
        defaultValue: '02:00',
      },
      logo: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'Settings',
      tableName: 'settings',
      timestamps: true,
    }
  );

  return Settings;
};
