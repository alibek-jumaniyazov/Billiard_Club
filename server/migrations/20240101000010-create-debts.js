'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('debts', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      sessionId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'sessions', key: 'id' },
        onDelete: 'SET NULL',
      },
      customerName: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },
      customerPhone: {
        type: Sequelize.STRING(20),
        allowNull: true,
      },
      tableAmount: {
        type: Sequelize.DECIMAL(10, 2),
        defaultValue: 0,
        comment: 'Stol uchun qarz miqdori',
      },
      barAmount: {
        type: Sequelize.DECIMAL(10, 2),
        defaultValue: 0,
        comment: 'Bar uchun qarz miqdori',
      },
      totalDebt: {
        type: Sequelize.DECIMAL(10, 2),
        defaultValue: 0,
        comment: 'Jami qarz',
      },
      paidAmount: {
        type: Sequelize.DECIMAL(10, 2),
        defaultValue: 0,
        comment: 'To\'langan miqdor',
      },
      remainingDebt: {
        type: Sequelize.DECIMAL(10, 2),
        defaultValue: 0,
        comment: 'Qolgan qarz',
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      isPaid: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },
      paidAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      dueDate: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'To\'lash muddati',
      },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.addIndex('debts', ['customerPhone']);
    await queryInterface.addIndex('debts', ['isPaid']);
    await queryInterface.addIndex('debts', ['sessionId']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('debts');
  },
};
