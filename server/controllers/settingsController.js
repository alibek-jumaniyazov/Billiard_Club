const { Settings } = require('../models');

const getSettings = async (req, res, next) => {
  try {
    let settings = await Settings.findOne();
    if (!settings) {
      settings = await Settings.create({});
    }
    res.json({ success: true, data: settings });
  } catch (error) {
    next(error);
  }
};

const updateSettings = async (req, res, next) => {
  try {
    let settings = await Settings.findOne();
    if (!settings) settings = await Settings.create({});

    const { clubName, phone, address, currency, currencySymbol, defaultTablePrice, taxRate, workingHoursStart, workingHoursEnd } = req.body;
    await settings.update({ clubName, phone, address, currency, currencySymbol, defaultTablePrice, taxRate, workingHoursStart, workingHoursEnd });
    res.json({ success: true, message: 'Sozlamalar yangilandi', data: settings });
  } catch (error) {
    next(error);
  }
};

module.exports = { getSettings, updateSettings };
