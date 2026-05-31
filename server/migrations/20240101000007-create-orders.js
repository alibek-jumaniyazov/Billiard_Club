'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('orders', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      sessionId: {
        type: Sequelize.INTEGER, allowNull: true,
        references: { model: 'sessions', key: 'id' },
        onUpdate: 'CASCADE', onDelete: 'SET NULL',
      },
      tableId: {
        type: Sequelize.INTEGER, allowNull: true,
        references: { model: 'tables', key: 'id' },
        onUpdate: 'CASCADE', onDelete: 'SET NULL',
      },
      userId: {
        type: Sequelize.INTEGER, allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE', onDelete: 'SET NULL',
      },
      totalAmount: { type: Sequelize.DECIMAL(10, 2), defaultValue: 0 },
      status: { type: Sequelize.ENUM('open', 'closed', 'cancelled'), defaultValue: 'open' },
      notes: { type: Sequelize.TEXT, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
    await queryInterface.addIndex('orders', ['sessionId']);
    await queryInterface.addIndex('orders', ['tableId']);
    await queryInterface.addIndex('orders', ['status']);
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('orders');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_orders_status";');
  },
};
