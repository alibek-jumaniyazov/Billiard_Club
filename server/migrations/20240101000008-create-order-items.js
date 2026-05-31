'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('order_items', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      orderId: {
        type: Sequelize.INTEGER, allowNull: false,
        references: { model: 'orders', key: 'id' },
        onUpdate: 'CASCADE', onDelete: 'CASCADE',
      },
      productId: {
        type: Sequelize.INTEGER, allowNull: false,
        references: { model: 'products', key: 'id' },
        onUpdate: 'CASCADE', onDelete: 'RESTRICT',
      },
      quantity: { type: Sequelize.INTEGER, allowNull: false },
      price: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
      subtotal: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
    await queryInterface.addIndex('order_items', ['orderId']);
    await queryInterface.addIndex('order_items', ['productId']);
  },
  async down(queryInterface) {
    await queryInterface.dropTable('order_items');
  },
};
