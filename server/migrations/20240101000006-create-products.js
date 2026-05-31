'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('products', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      categoryId: {
        type: Sequelize.INTEGER, allowNull: false,
        references: { model: 'categories', key: 'id' },
        onUpdate: 'CASCADE', onDelete: 'RESTRICT',
      },
      name: { type: Sequelize.STRING(150), allowNull: false },
      price: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
      stock: { type: Sequelize.INTEGER, defaultValue: 0 },
      unit: { type: Sequelize.STRING(20), defaultValue: 'dona' },
      description: { type: Sequelize.TEXT, allowNull: true },
      isActive: { type: Sequelize.BOOLEAN, defaultValue: true },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
    await queryInterface.addIndex('products', ['categoryId']);
    await queryInterface.addIndex('products', ['isActive']);
  },
  async down(queryInterface) {
    await queryInterface.dropTable('products');
  },
};
