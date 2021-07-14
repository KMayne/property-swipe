const winston = require('winston');

const transports = [new winston.transports.Console()];
if (process.env.NODE_ENV !== 'development') {
  transports.push(new winston.transports.File({
    filename: '../logs/ps.log',
    maxFiles: 10,
    maxsize: 10 * Math.pow(2, 20), // 10MiB
    tailable: true
  }));
}

module.exports = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.colorize({ all: true }),
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.printf(info => `${info.timestamp} ${info.level}: ${info.message}`)
  ),
  transports
});
