'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('sales', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      sessionId: {
        type: Sequelize.INTEGER, allowNull: false, unique: true,
        references: { model: 'sessions', key: 'id' },
        onUpdate: 'CASCADE', onDelete: 'RESTRICT',
      },
      tableAmount: { type: Sequelize.DECIMAL(10, 2), defaultValue: 0 },
      barAmount: { type: Sequelize.DECIMAL(10, 2), defaultValue: 0 },
      totalAmount: { type: Sequelize.DECIMAL(10, 2), defaultValue: 0 },
      paymentMethod: { type: Sequelize.ENUM('cash', 'card', 'transfer'), defaultValue: 'cash' },
      discount: { type: Sequelize.DECIMAL(10, 2), defaultValue: 0 },
      notes: { type: Sequelize.TEXT, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
    await queryInterface.addIndex('sales', ['sessionId'], { unique: true });
    await queryInterface.addIndex('sales', ['createdAt']);
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('sales');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_sales_paymentMethod";');
  },
};
