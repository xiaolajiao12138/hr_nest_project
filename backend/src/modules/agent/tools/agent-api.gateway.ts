import {
  Inject,
  Injectable,
  Logger,
  Optional,
  RequestMethod,
} from '@nestjs/common';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { ModulesContainer, Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { getMetadataStorage } from 'class-validator';
import { PERMISSIONS_KEY } from '../../../common/decorators/permissions.decorator';
import {
  OPER_LOG_KEY,
  OperLogOptions,
} from '../../../common/decorators/oper-log.decorator';
import { CurrentUserPayload } from '../../../common/decorators/current-user.decorator';
import { AgentToolResult } from './agent-schema.inspector';

export interface DiscoveredEndpoint {
  method: string;
  path: string;
  title: string;
  requiredPermissions: string[];
  dtoFieldsSummary: string;
}

export interface ApiCallInput {
  method: string;
  path: string;
  pathParams?: Record<string, any>;
  query?: Record<string, any>;
  body?: Record<string, any>;
  targetName?: string;
  confirmed?: boolean;
}

const HTTP_METHOD_NAMES: Record<number, string> = {
  [RequestMethod.GET]: 'GET',
  [RequestMethod.POST]: 'POST',
  [RequestMethod.PUT]: 'PUT',
  [RequestMethod.DELETE]: 'DELETE',
  [RequestMethod.PATCH]: 'PATCH',
};

const PRIMITIVE_TYPES = new Set<any>([
  Object,
  String,
  Number,
  Boolean,
  Array,
  Function,
]);

/**
 * NestJS 全系统路由自动发现与内部业务接口网关
 *
 * 核心职责：
 * 1. 启动/调用时通过 ModulesContainer + Reflector 自动发现全系统所有 Controller 路由及 @Permissions 权限码；
 * 2. 通过 class-validator 元数据自动解析 DTO 字段名、必填项与校验提示，彻底免除手写 JSON Schema；
 * 3. 对 DELETE 等破坏性路由统一自动拦截并下发人机协同二次确认卡片；
 * 4. 携带当前登录人真实 Bearer Token 转发本机内部接口，100% 复用全局守卫、DTO 管道、业务事务与审计日志。
 */
@Injectable()
export class AgentApiGateway {
  private readonly logger = new Logger(AgentApiGateway.name);
  private cachedEndpoints: DiscoveredEndpoint[] | null = null;
  private readonly fetcher: typeof fetch;

  constructor(
    private readonly modulesContainer: ModulesContainer,
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
    @Optional() @Inject('AGENT_CUSTOM_FETCHER') customFetcher?: typeof fetch,
  ) {
    this.fetcher = customFetcher || globalThis.fetch.bind(globalThis);
  }

  /**
   * 扫描并缓存全系统可由 AI 安全调用的业务接口元数据
   */
  discoverAllEndpoints(): DiscoveredEndpoint[] {
    if (this.cachedEndpoints) {
      return this.cachedEndpoints;
    }

    const endpoints: DiscoveredEndpoint[] = [];
    const seen = new Set<string>();

    for (const moduleRef of this.modulesContainer.values()) {
      const controllers = moduleRef?.controllers;
      if (!controllers) continue;

      for (const wrapper of controllers.values()) {
        const metatype = wrapper?.metatype as any;
        if (!metatype || !metatype.prototype) continue;

        const rawCtrlPath = Reflect.getMetadata(PATH_METADATA, metatype);
        if (rawCtrlPath === undefined) continue;

        const ctrlPrefix = this.normalizeSegment(String(rawCtrlPath || ''));
        // 排除智能体自身、SSE 流与底层文件上传控制器
        if (/^\/(agent|sse|upload)(\/|$)/i.test(ctrlPrefix)) {
          continue;
        }

        const proto = metatype.prototype;
        for (const methodName of Object.getOwnPropertyNames(proto)) {
          if (methodName === 'constructor') continue;
          const handler = proto[methodName];
          if (typeof handler !== 'function') continue;

          const reqMethodNum: number | undefined = Reflect.getMetadata(
            METHOD_METADATA,
            handler,
          );
          if (reqMethodNum === undefined) continue;

          const httpMethod = HTTP_METHOD_NAMES[reqMethodNum];
          if (!httpMethod) continue;

          const rawMethodPath = Reflect.getMetadata(PATH_METADATA, handler);
          const fullPath = this.joinPaths(
            ctrlPrefix,
            String(rawMethodPath || ''),
          );

          // 排除登录鉴权基础设施及二进制导入/导出/下载流接口
          if (
            /^\/auth\/(login|captcha|logout)(\/|$)/i.test(fullPath) ||
            /(export|import|download|template)/i.test(fullPath)
          ) {
            continue;
          }

          const uniqueKey = `${httpMethod} ${fullPath}`;
          if (seen.has(uniqueKey)) continue;
          seen.add(uniqueKey);

          const requiredPermissions =
            this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
              handler,
              metatype,
            ]) || [];

          const operLog = this.reflector.get<OperLogOptions>(
            OPER_LOG_KEY,
            handler,
          );
          const title =
            operLog?.title ||
            `${metatype.name.replace(/Controller$/, '')}.${methodName}`;

          const dtoFieldsSummary = this.extractDtoSummary(proto, methodName);

          endpoints.push({
            method: httpMethod,
            path: fullPath,
            title,
            requiredPermissions,
            dtoFieldsSummary,
          });
        }
      }
    }

    this.cachedEndpoints = endpoints;
    return endpoints;
  }

  /**
   * 利用 TypeScript emitDecoratorMetadata + class-validator 自动提取 DTO 字段约束
   */
  private extractDtoSummary(proto: any, methodName: string): string {
    try {
      const paramTypes: any[] =
        Reflect.getMetadata('design:paramtypes', proto, methodName) || [];
      const storage = getMetadataStorage();
      const parts: string[] = [];

      for (const paramType of paramTypes) {
        if (
          !paramType ||
          typeof paramType !== 'function' ||
          PRIMITIVE_TYPES.has(paramType) ||
          paramType.name === 'Response' ||
          paramType.name === 'Request'
        ) {
          continue;
        }

        const metas = storage.getTargetValidationMetadatas(
          paramType,
          '',
          false,
          false,
        );
        if (!metas || metas.length === 0) continue;

        const grouped = storage.groupByPropertyName(metas);
        for (const [propName, rules] of Object.entries(grouped)) {
          const isOptional = rules.some(
            (r) => r.type === 'conditionalValidation',
          );
          const msgRule = rules.find(
            (r) => typeof r.message === 'string' && r.message.length <= 20,
          );
          const flag = isOptional ? '?' : '*';
          const hint = msgRule?.message ? `(${msgRule.message})` : '';
          parts.push(`${propName}${flag}${hint}`);
        }
      }

      return parts.join(', ');
    } catch {
      return '';
    }
  }

  /**
   * 判定当前用户是否有权调用某个路由（与 PermissionsGuard 规则严格一致）
   */
  private canAccessEndpoint(
    ep: DiscoveredEndpoint,
    user: CurrentUserPayload,
  ): boolean {
    if (!ep.requiredPermissions || ep.requiredPermissions.length === 0) {
      return true;
    }
    if (user.roles?.includes('admin')) {
      return true;
    }
    const userPerms = user.permissions || [];
    if (userPerms.includes('*')) {
      return true;
    }
    return ep.requiredPermissions.every((perm) => userPerms.includes(perm));
  }

  /**
   * 获取当前登录人已获权调用的业务接口列表
   */
  getAuthorizedEndpoints(user: CurrentUserPayload): DiscoveredEndpoint[] {
    return this.discoverAllEndpoints().filter((ep) =>
      this.canAccessEndpoint(ep, user),
    );
  }

  /**
   * 构建注入给大模型的已授权业务接口目录提示文本
   */
  buildAuthorizedApiPrompt(user: CurrentUserPayload): string {
    const endpoints = this.getAuthorizedEndpoints(user);
    if (endpoints.length === 0) {
      return '当前账号暂无可调用的业务写操作接口。';
    }

    return endpoints
      .map((ep) => {
        const dtoPart = ep.dtoFieldsSummary
          ? ` | 参数: { ${ep.dtoFieldsSummary} }`
          : '';
        return `- ${ep.method} ${ep.path} [${ep.title}]${dtoPart}`;
      })
      .join('\n');
  }

  /**
   * 匹配目标路由模板，支持模板路径（/hr/training/:id）与已填充实例路径（/hr/training/88）双模式识别
   */
  private matchEndpoint(
    endpoints: DiscoveredEndpoint[],
    method: string,
    inputPath: string,
  ): {
    endpoint: DiscoveredEndpoint;
    extractedParams: Record<string, string>;
  } | null {
    const exact = endpoints.find(
      (ep) => ep.method === method && ep.path === inputPath,
    );
    if (exact) {
      return { endpoint: exact, extractedParams: {} };
    }

    for (const ep of endpoints) {
      if (ep.method !== method || !ep.path.includes(':')) continue;
      const paramNames: string[] = [];
      const regexPattern = ep.path.replace(
        /:([a-zA-Z0-9_]+)/g,
        (_full, paramName) => {
          paramNames.push(paramName);
          return '([^/]+)';
        },
      );
      const regex = new RegExp(`^${regexPattern}$`);
      const match = regex.exec(inputPath);
      if (match) {
        const extractedParams: Record<string, string> = {};
        paramNames.forEach((name, idx) => {
          extractedParams[name] = decodeURIComponent(match[idx + 1]);
        });
        return { endpoint: ep, extractedParams };
      }
    }

    return null;
  }

  /**
   * 执行内部业务 API 调用（含二次确认拦截与真实 HTTP 鉴权管道代理）
   */
  async executeApiCall(
    input: ApiCallInput,
    user: CurrentUserPayload,
    authHeader: string,
  ): Promise<AgentToolResult> {
    const upperMethod = String(input.method || '')
      .trim()
      .toUpperCase();
    const apiPrefix = this.normalizeSegment(
      this.configService.get<string>('apiPrefix') || '/api',
    );
    const normalizedPath = this.stripApiPrefix(
      String(input.path || ''),
      apiPrefix,
    );

    const allEndpoints = this.discoverAllEndpoints();
    const matched = this.matchEndpoint(allEndpoints, upperMethod, normalizedPath);

    if (!matched) {
      return {
        success: false,
        title: `${upperMethod} ${normalizedPath}`,
        resultSummary: `未找到业务接口 [${upperMethod} ${normalizedPath}]，请从已授权接口目录中选择正确的路径与方法`,
        data: { error: 'ENDPOINT_NOT_FOUND' },
      };
    }

    const { endpoint, extractedParams } = matched;

    // 1. 网关侧前置权限核验
    if (!this.canAccessEndpoint(endpoint, user)) {
      return {
        success: false,
        title: endpoint.title,
        resultSummary: `权限不足：当前账号无权执行【${endpoint.title}】（缺少权限: ${endpoint.requiredPermissions.join(', ')}）`,
        data: {
          error: 'FORBIDDEN',
          requiredPermissions: endpoint.requiredPermissions,
        },
      };
    }

    // 2. 合并路径参数并解析真实请求路径
    const mergedPathParams: Record<string, any> = {
      ...extractedParams,
      ...(input.pathParams || {}),
    };

    let missingParam: string | null = null;
    const resolvedSubPath = endpoint.path.replace(
      /:([a-zA-Z0-9_]+)/g,
      (_full, key) => {
        const val =
          mergedPathParams[key] ?? input.body?.[key] ?? input.query?.[key];
        if (val === undefined || val === null || val === '') {
          missingParam = key;
          return '';
        }
        return encodeURIComponent(String(val));
      },
    );

    if (missingParam) {
      return {
        success: false,
        title: endpoint.title,
        resultSummary: `参数缺失：接口 [${endpoint.path}] 缺少必填路径参数 [${missingParam}]`,
        data: { error: 'MISSING_PATH_PARAM', param: missingParam },
      };
    }

    // 3. 对 DELETE 等高危破坏性操作统一实施二次确认卡片拦截
    const isDestructive =
      upperMethod === 'DELETE' || /\/(delete|remove)(\/|$)/i.test(endpoint.path);
    if (isDestructive && input.confirmed !== true) {
      const targetId =
        mergedPathParams.id ?? input.body?.id ?? input.query?.id ?? 0;
      const targetName =
        input.targetName || `${endpoint.title}(#${targetId || '目标记录'})`;
      return {
        success: true,
        title: `${endpoint.title}（待人工确认）`,
        resultSummary: `已拦截高危删除操作【${endpoint.title}】，等待用户在聊天窗口点击确认按钮`,
        data: {
          requireConfirmation: true,
          action: `${upperMethod} ${resolvedSubPath}`,
          targetId: Number(targetId) || 0,
          targetName,
          prompt: `即将执行高危操作【${endpoint.title}】对象：${targetName}，删除后可能无法恢复，是否确认执行？`,
        },
      };
    }

    // 4. 组装本机回环 URL 与 Query 参数并携带真实 Authorization 头调用
    const port = this.configService.get<number>('port') || 3000;
    const urlObj = new URL(
      `http://127.0.0.1:${port}${this.joinPaths(apiPrefix, resolvedSubPath)}`,
    );

    if (input.query && typeof input.query === 'object') {
      for (const [k, v] of Object.entries(input.query)) {
        if (v !== undefined && v !== null && v !== '') {
          urlObj.searchParams.set(k, String(v));
        }
      }
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (authHeader) {
      headers.Authorization = authHeader;
    }

    const hasBody =
      upperMethod !== 'GET' &&
      upperMethod !== 'HEAD' &&
      input.body !== undefined;

    try {
      const response = await this.fetcher(urlObj.toString(), {
        method: upperMethod,
        headers,
        body: hasBody ? JSON.stringify(input.body) : undefined,
      });

      const rawText = await response.text();
      let payload: any = null;
      try {
        payload = rawText ? JSON.parse(rawText) : null;
      } catch {
        payload = { raw: rawText };
      }

      const bizFailed =
        !response.ok ||
        (payload &&
          typeof payload === 'object' &&
          'code' in payload &&
          payload.code !== 200);

      if (bizFailed) {
        const errMsg =
          payload?.msg ||
          payload?.message ||
          `HTTP ${response.status} 请求未通过校验`;
        const finalMsg = Array.isArray(errMsg) ? errMsg.join('；') : String(errMsg);
        return {
          success: false,
          title: endpoint.title,
          resultSummary: `执行未通过：${finalMsg}`,
          data: payload ?? { status: response.status, message: finalMsg },
        };
      }

      const unwrappedData =
        payload && typeof payload === 'object' && 'data' in payload
          ? payload.data
          : payload;

      return {
        success: true,
        title: endpoint.title,
        resultSummary: `成功执行【${endpoint.title}】`,
        data: unwrappedData,
      };
    } catch (err: any) {
      this.logger.error(
        `[内部网关调用异常] ${upperMethod} ${urlObj.toString()}: ${err.message}`,
      );
      return {
        success: false,
        title: endpoint.title,
        resultSummary: `接口调用异常: ${err.message}`,
        data: { error: 'GATEWAY_REQUEST_FAILED', message: err.message },
      };
    }
  }

  private normalizeSegment(seg: string): string {
    const trimmed = seg.trim().replace(/^\/+|\/+$/g, '');
    return trimmed ? `/${trimmed}` : '';
  }

  private joinPaths(base: string, sub: string): string {
    const b = this.normalizeSegment(base);
    const s = this.normalizeSegment(sub);
    const joined = `${b}${s}`;
    return joined || '/';
  }

  private stripApiPrefix(inputPath: string, apiPrefix: string): string {
    let norm = this.normalizeSegment(inputPath.split('?')[0] || '');
    if (apiPrefix && norm.startsWith(`${apiPrefix}/`)) {
      norm = norm.slice(apiPrefix.length);
    } else if (apiPrefix && norm === apiPrefix) {
      norm = '/';
    }
    return norm || '/';
  }
}
