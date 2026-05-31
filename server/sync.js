require('dotenv').config();
const { sequelize } = require('./models');

const syncDb = async () => {
  try {
    console.log('Syncing database...');
    // Drop the enum type first if possible to let Sequelize recreate it, or just alter:true
    await sequelize.sync({ alter: true });
    console.log('Database synced successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Error syncing database:', err);
    process.exit(1);
  }
};

syncDb();
