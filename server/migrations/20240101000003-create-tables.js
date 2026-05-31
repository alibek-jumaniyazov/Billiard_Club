'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('tables', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: Sequelize.STRING(100), allowNull: false },
      number: { type: Sequelize.INTEGER, allowNull: false, unique: true },
      pricePerHour: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
      status: { type: Sequelize.ENUM('bosh', 'band'), defaultValue: 'bosh' },
      description: { type: Sequelize.TEXT, allowNull: true },
      isActive: { type: Sequelize.BOOLEAN, defaultValue: true },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
    await queryInterface.addIndex('tables', ['number'], { unique: true });
    await queryInterface.addIndex('tables', ['status']);
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('tables');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_tables_status";');
  },
};
