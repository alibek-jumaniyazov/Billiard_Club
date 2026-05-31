'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.bulkInsert('settings', [
      {
        clubName: 'Prime Billiard Club',
        phone: '+998 90 123 45 67',
        address: 'Toshkent shahar, Chilonzor tumani, Bunyodkor ko\'chasi 12',
        currency: 'UZS',
        currencySymbol: "so'm",
        defaultTablePrice: 15000,
        taxRate: 0,
        workingHoursStart: '10:00',
        workingHoursEnd: '02:00',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
  },
  async down(queryInterface) {
    await queryInterface.bulkDelete('settings', null, {});
  },
};
