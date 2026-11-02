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

  /**
   * 大语言模型与智能体 (LLM Agent) 基础接入配置
   * 包含 API 鉴权密钥、默认模型标识以及网关基础 URL
   * 类似字段参考：database (数据库连接参数)、redis (缓存参数)、jwt (鉴权令牌参数)
   */
  llm: {
    /**
     * 大语言模型接口鉴权密钥 (API Key)
     * 用于向大模型服务供应商（例如 OpenAI 协议兼容端点）进行身份校验
     */
    apiKey: process.env.LLM_API_KEY || '',
    /**
     * 智能体默认驱动的模型名称标识
     * 例如 'gpt-6.1-sol'、'gpt-4o' 等支持 Function Calling 规范的模型
     */
    model: process.env.LLM_MODEL || 'gpt-6.1-sol',
    /**
     * 大模型 API 请求网关根地址 (Base URL)
     * 支持第三方代理网关或私有化部署接口，必须以 /v1 规范兼容 OpenAI RESTful 路由
     */
    baseUrl: process.env.LLM_BASE_URL || 'https://sub2api.starysp.top/v1',
  },
});
