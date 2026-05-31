'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('settings', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      clubName: { type: Sequelize.STRING(150), defaultValue: 'Prime Billiard Club' },
      phone: { type: Sequelize.STRING(20), allowNull: true },
      address: { type: Sequelize.TEXT, allowNull: true },
      currency: { type: Sequelize.STRING(10), defaultValue: 'UZS' },
      currencySymbol: { type: Sequelize.STRING(5), defaultValue: "so'm" },
      defaultTablePrice: { type: Sequelize.DECIMAL(10, 2), defaultValue: 15000 },
      taxRate: { type: Sequelize.DECIMAL(5, 2), defaultValue: 0 },
      workingHoursStart: { type: Sequelize.STRING(5), defaultValue: '10:00' },
      workingHoursEnd: { type: Sequelize.STRING(5), defaultValue: '02:00' },
      logo: { type: Sequelize.TEXT, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
  },
  async down(queryInterface) {
    await queryInterface.dropTable('settings');
  },
};
