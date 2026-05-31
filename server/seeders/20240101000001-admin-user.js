'use strict';
const bcrypt = require('bcryptjs');

module.exports = {
  async up(queryInterface) {
    const hashedPassword = await bcrypt.hash('admin123', 12);
    const kassirPassword = await bcrypt.hash('kassir123', 12);
    const operatorPassword = await bcrypt.hash('operator123', 12);

    await queryInterface.bulkInsert('users', [
      { name: 'Super Admin', username: 'admin', password: hashedPassword, role: 'admin', isActive: true, createdAt: new Date(), updatedAt: new Date() },
      { name: 'Kassir Alisher', username: 'kassir', password: kassirPassword, role: 'kassir', isActive: true, createdAt: new Date(), updatedAt: new Date() },
      { name: 'Operator Bobur', username: 'operator', password: operatorPassword, role: 'operator', isActive: true, createdAt: new Date(), updatedAt: new Date() },
    ]);
  },
  async down(queryInterface) {
    await queryInterface.bulkDelete('users', null, {});
  },
};
