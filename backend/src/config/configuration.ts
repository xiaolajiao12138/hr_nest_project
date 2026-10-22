export default () => ({
  port: parseInt(process.env.PORT, 10) || 3000,
  apiPrefix: process.env.API_PREFIX || '/api',
  nodeEnv: process.env.NODE_ENV || 'development',
  
  database: {
    type: 'postgres' as const,
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    username: process.env.DB_USER || 'hr_admin',
    password: process.env.DB_PASSWORD || 'hr_password_2026',
    database: process.env.DB_DATABASE || 'hr_manage_db',
    synchronize: process.env.DB_SYNCHRONIZE === 'true',
    logging: process.env.DB_LOGGING === 'true',
  },

  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || '',
    db: parseInt(process.env.REDIS_DB, 10) || 0,
  },

  minio: {
    endPoint: process.env.MINIO_ENDPOINT || '127.0.0.1',
    port: parseInt(process.env.MINIO_PORT, 10) || 9000,
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin_2026',
    bucketName: process.env.MINIO_BUCKET_NAME || 'hr-local-files',
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'hr_jwt_secret_dev_2026_key',
    expiresIn: process.env.JWT_EXPIRES_IN || '7200s',
    refreshSecret:
      process.env.REFRESH_TOKEN_SECRET || 'hr_refresh_token_secret_dev_2026_key',
    refreshExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d',
  },

  security: {
    enableRateLimit: process.env.ENABLE_RATE_LIMIT === 'true',
    enableHelmet: process.env.ENABLE_HELMET === 'true',
    maskStackError: process.env.MASK_STACK_ERROR === 'true',
  },
});
