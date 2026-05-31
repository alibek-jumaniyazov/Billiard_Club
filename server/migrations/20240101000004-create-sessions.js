'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('sessions', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      tableId: {
        type: Sequelize.INTEGER, allowNull: false,
        references: { model: 'tables', key: 'id' },
        onUpdate: 'CASCADE', onDelete: 'RESTRICT',
      },
      userId: {
        type: Sequelize.INTEGER, allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE', onDelete: 'SET NULL',
      },
      customerName: { type: Sequelize.STRING(100), allowNull: true },
      customerPhone: { type: Sequelize.STRING(20), allowNull: true },
      startTime: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      endTime: { type: Sequelize.DATE, allowNull: true },
      durationMinutes: { type: Sequelize.INTEGER, allowNull: true },
      tableAmount: { type: Sequelize.DECIMAL(10, 2), defaultValue: 0 },
      barAmount: { type: Sequelize.DECIMAL(10, 2), defaultValue: 0 },
      totalAmount: { type: Sequelize.DECIMAL(10, 2), defaultValue: 0 },
      status: { type: Sequelize.ENUM('active', 'completed', 'cancelled'), defaultValue: 'active' },
      paymentMethod: { type: Sequelize.ENUM('cash', 'card', 'transfer'), allowNull: true },
      isPaid: { type: Sequelize.BOOLEAN, defaultValue: false },
      notes: { type: Sequelize.TEXT, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
    await queryInterface.addIndex('sessions', ['tableId']);
    await queryInterface.addIndex('sessions', ['userId']);
    await queryInterface.addIndex('sessions', ['status']);
    await queryInterface.addIndex('sessions', ['startTime']);
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('sessions');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_sessions_status";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_sessions_paymentMethod";');
  },
};
