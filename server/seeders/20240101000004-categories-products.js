'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.bulkInsert('categories', [
      { name: 'Ichimliklar', description: 'Sovuq va issiq ichimliklar', icon: 'CoffeeOutlined', isActive: true, createdAt: new Date(), updatedAt: new Date() },
      { name: 'Oziq-ovqat', description: 'Snack va ovqatlar', icon: 'ShoppingOutlined', isActive: true, createdAt: new Date(), updatedAt: new Date() },
      { name: 'Tamaki', description: 'Sigaret va tamaki mahsulotlari', icon: 'FireOutlined', isActive: true, createdAt: new Date(), updatedAt: new Date() },
      { name: 'Boshqa', description: 'Boshqa mahsulotlar', icon: 'AppstoreOutlined', isActive: true, createdAt: new Date(), updatedAt: new Date() },
    ]);

    await queryInterface.bulkInsert('products', [
      { categoryId: 1, name: 'Coca-Cola 0.5L', price: 5000, stock: 50, unit: 'dona', isActive: true, createdAt: new Date(), updatedAt: new Date() },
      { categoryId: 1, name: 'Pepsi 0.5L', price: 5000, stock: 50, unit: 'dona', isActive: true, createdAt: new Date(), updatedAt: new Date() },
      { categoryId: 1, name: 'Sprite 0.5L', price: 5000, stock: 30, unit: 'dona', isActive: true, createdAt: new Date(), updatedAt: new Date() },
      { categoryId: 1, name: 'Choy', price: 3000, stock: 100, unit: 'piyola', isActive: true, createdAt: new Date(), updatedAt: new Date() },
      { categoryId: 1, name: 'Qahva', price: 8000, stock: 50, unit: 'piyola', isActive: true, createdAt: new Date(), updatedAt: new Date() },
      { categoryId: 1, name: 'Mineral suv', price: 3000, stock: 100, unit: 'dona', isActive: true, createdAt: new Date(), updatedAt: new Date() },
      { categoryId: 2, name: 'Chips Lays', price: 6000, stock: 40, unit: 'dona', isActive: true, createdAt: new Date(), updatedAt: new Date() },
      { categoryId: 2, name: 'Shokolad Snickers', price: 7000, stock: 30, unit: 'dona', isActive: true, createdAt: new Date(), updatedAt: new Date() },
      { categoryId: 2, name: 'Pechenye', price: 4000, stock: 60, unit: 'dona', isActive: true, createdAt: new Date(), updatedAt: new Date() },
      { categoryId: 3, name: 'Marlboro', price: 18000, stock: 20, unit: 'paket', isActive: true, createdAt: new Date(), updatedAt: new Date() },
      { categoryId: 3, name: 'Winston', price: 15000, stock: 25, unit: 'paket', isActive: true, createdAt: new Date(), updatedAt: new Date() },
      { categoryId: 4, name: 'Kuyi (chalk)', price: 2000, stock: 50, unit: 'dona', isActive: true, createdAt: new Date(), updatedAt: new Date() },
    ]);
  },
  async down(queryInterface) {
    await queryInterface.bulkDelete('products', null, {});
    await queryInterface.bulkDelete('categories', null, {});
  },
};
