const path = require('path');
const winston = require('winston');

const mainFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.printf(info => `${info.timestamp} ${info.level}: ${info.message}`)
);

const transports = [new winston.transports.Console({
  format: winston.format.combine(
    winston.format.colorize({ all: true }),
    mainFormat
  )
})];
if (process.env.NODE_ENV !== 'development') {
  transports.push(new winston.transports.File({
    filename: path.resolve(__dirname, '../logs/ps.log'),
    maxFiles: 10,
    maxsize: 10 * Math.pow(2, 20), // 10MiB
    tailable: true
  }));
}

module.exports = winston.createLogger({
  level: 'info',
  format: mainFormat,
  transports
});
