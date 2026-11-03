import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CurrentUserPayload } from '../../../common/decorators/current-user.decorator';

/**
 * 智能体工具执行结果标准响应契约
 */
export interface AgentToolResult {
  /** 工具调用是否成功 */
  success: boolean;
  /** 用于前端展示的简短业务标题 */
  title: string;
  /** 用于大模型阅读或前端展示的执行概要摘要 */
  resultSummary: string;
  /** 返回给大模型做进一步推理的结构化业务数据或错误详情 */
  data: any;
}

/**
 * ============================================================================
 * 智能体数据查询安全网关（架构演进说明）
 * ============================================================================
 *
 * 【历史演进与安全决策】：
 * 1. 早期设计尝试：
 *    曾尝试过向大模型暴露只读表结构（Schema）并由大模型自主生成 SELECT SQL 查询。
 * 2. 生产环境安全隐患：
 *    - 绕过业务逻辑：直接查表会脱离业务 Controller 层的字段脱敏、软删除（deleted_at）与行级租户隔离；
 *    - 别名/聚合攻击风险：大模型可能通过别名混淆或 SUM/AVG 间接推断高管薪资等高敏感数据；
 *    - 维护成本高：业务表结构变动容易导致大模型生成的 SQL 语法不兼容。
 * 3. 终极架构收敛：
 *    - 全面关闭任意 Raw SQL 执行入口（返回 RAW_SQL_DISABLED）；
 *    - 数据读操作（GET）与业务写操作（POST/PUT/DELETE）全部统一收敛到【AgentApiGateway】；
 *    - 本服务仅作为兼容旧版依赖注入的只读门面存根（Stub），确保系统平滑过渡与架构一致性。
 */
@Injectable()
export class AgentSchemaInspector {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * 收集当前登录用户可见的数据表元数据字典
   *
   * 【逻辑作用】：
   * - 原先用于向模型透传数据表 Schema。
   * - 当前收敛策略下始终返回空数组，避免向大模型泄漏底层物理表结构与字段布局。
   */
  collectTableSchemas(_user: CurrentUserPayload): any[] {
    return [];
  }

  /**
   * 生成注入给大模型系统提示词（System Prompt）的数据库结构描述
   *
   * 【逻辑作用】：
   * - 引导大模型停止尝试编写 SQL，指引其统一通过 call_business_api 工具调用 Controller API 查询数据。
   */
  buildAuthorizedSchemaPrompt(_user: CurrentUserPayload): string {
    return '请使用已授权的业务 API 查询数据';
  }

  /**
   * 解析当前操作人员的可信员工档案 ID（empId）
   *
   * 【逻辑作用】：
   * - 仅读取 JWT Payload 中由后端鉴权拦截器注入的受信任 employeeId 字段；
   * - 杜绝按用户名、工号或姓名模糊推测，严防冒用他人身份越权读取员工个人档案。
   */
  async resolveCurrentEmployeeId(user: CurrentUserPayload): Promise<number | null> {
    return user.employeeId || null;
  }

  /**
   * 执行安全只读 SQL 查询接口（安全禁用）
   *
   * 【逻辑作用】：
   * - 严密阻断任何任意 SQL 执行尝试（包含管理员及普通员工）；
   * - 统一返回 RAW_SQL_DISABLED 错误码，迫使模型调用业务 API 网关执行标准业务接口。
   */
  async executeReadOnlyQuery(
    _sql: string,
    _user: CurrentUserPayload,
    _purpose?: string,
  ): Promise<AgentToolResult> {
    return {
      success: false,
      title: '数据查询',
      resultSummary: '任意 SQL 查询已关闭，请使用已授权的业务 API',
      data: { error: 'RAW_SQL_DISABLED' },
    };
  }
}
