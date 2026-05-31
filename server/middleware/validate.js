const Joi = require('joi');

const validate = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (error) {
      const errors = error.details.map(d => ({ field: d.context.key, message: d.message }));
      return res.status(400).json({ success: false, message: 'Validatsiya xatosi', errors });
    }
    next();
  };
};

module.exports = validate;
