'use strict';

module.exports = {
  async up(queryInterface) {
    const tables = [];
    for (let i = 1; i <= 8; i++) {
      tables.push({
        name: `Stol ${i}`,
        number: i,
        pricePerHour: i <= 4 ? 15000 : 20000,
        status: 'bosh',
        description: i <= 4 ? 'Standart bilyard stoli' : 'Premium bilyard stoli',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    await queryInterface.bulkInsert('tables', tables);
  },
  async down(queryInterface) {
    await queryInterface.bulkDelete('tables', null, {});
  },
};
