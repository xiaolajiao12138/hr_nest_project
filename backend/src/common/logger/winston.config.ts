import * as winston from 'winston';
import 'winston-daily-rotate-file';

/**
 * Winston 日志配置生成器
 * 本地环境输出带色彩的控制台日志；测试与生产环境按天切片记录日志文件
 */
export function createWinstonTransports() {
  const env = process.env.NODE_ENV || 'development';
  const logDir = process.env.LOG_FILE_PATH || './logs';

  const transports: winston.transport[] = [];

  // 控制台输出
  transports.push(
    new winston.transports.Console({
      level: process.env.LOG_LEVEL || (env === 'production' ? 'warn' : 'debug'),
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.colorize(),
        winston.format.printf(
          ({ timestamp, level, message, context, ...meta }) => {
            const ctx = context ? `[${context}] ` : '';
            const metaStr = Object.keys(meta).length
              ? ` ${JSON.stringify(meta)}`
              : '';
            return `${timestamp} ${level}: ${ctx}${message}${metaStr}`;
          },
        ),
      ),
    }),
  );

  // 非本地环境（测试或生产），增加每日滚动的日志文件
  if (env === 'test' || env === 'production') {
    // 错误日志文件
    transports.push(
      new winston.transports.DailyRotateFile({
        dirname: `${logDir}/error`,
        filename: 'error-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        level: 'error',
        maxFiles: '30d',
        maxSize: '20m',
        format: winston.format.combine(
          winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
          winston.format.json(),
        ),
      }),
    );

    // 组合业务日志文件
    transports.push(
      new winston.transports.DailyRotateFile({
        dirname: `${logDir}/combined`,
        filename: 'app-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        level: process.env.LOG_LEVEL || 'info',
        maxFiles: '30d',
        maxSize: '20m',
        format: winston.format.combine(
          winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
          winston.format.json(),
        ),
      }),
    );
  }

  return transports;
}
