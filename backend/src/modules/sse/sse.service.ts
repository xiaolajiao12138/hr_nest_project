import { Injectable, Logger, MessageEvent } from '@nestjs/common';
import { Observable, Subject, merge, interval, map } from 'rxjs';

/**
 * SSE 实时消息载荷接口规范
 */
export interface SsePayload {
  /** 消息事件分类标识 */
  type:
    | 'NOTICE_BROADCAST'
    | 'LEAVE_AUDIT_NOTIFY'
    | 'TODO_BADGE_UPDATE'
    | 'HEARTBEAT'
    | 'PERMISSION_UPDATE';
  /** 消息标题（弹窗顶部展示） */
  title?: string;
  /** 消息主体正文提示 */
  message?: string;
  /** 附带的业务数据对象 */
  data?: any;
  /** 消息产生的时间戳（毫秒） */
  timestamp?: number;
}

/**
 * SSE (Server-Sent Events) 服务端实时推送核心服务
 * 管理全站所有在线客户端的长连接生命周期：
 * - 全员广播（broadcast）：仅用于公司全员公告、系统通知及全局角色菜单变更；
 * - 定向推送（sendToUser / sendToUsers）：用于请假审批回执（仅本人）、新请假待办（仅审批人）及单用户权限同步。
 */
@Injectable()
export class SseService {
  private readonly logger = new Logger(SseService.name);

  /** 每个在线用户专属的事件通道映射表 (userId -> Subject) */
  private userSubjects = new Map<number, Subject<MessageEvent>>();

  /** 同账号多标签页连接引用计数 (userId -> 连接数) */
  private clientCounts = new Map<number, number>();

  /** 全员广播通用通道 */
  private broadcastSubject = new Subject<MessageEvent>();

  /**
   * 注册客户端 SSE 连接并返回合并后的响应式事件流
   */
  addClient(userId: number): Observable<MessageEvent> {
    let userSubject = this.userSubjects.get(userId);
    if (!userSubject) {
      userSubject = new Subject<MessageEvent>();
      this.userSubjects.set(userId, userSubject);
    }
    const nextCount = (this.clientCounts.get(userId) || 0) + 1;
    this.clientCounts.set(userId, nextCount);

    this.logger.log(
      `[SSE] 用户 ID: ${userId} 建立实时事件流连接(标签页数: ${nextCount}), 在线用户数: ${this.userSubjects.size}`,
    );

    const heartbeat$ = interval(25000).pipe(
      map(
        () =>
          ({
            data: {
              type: 'HEARTBEAT',
              timestamp: Date.now(),
            },
          }) as MessageEvent,
      ),
    );

    return merge(
      userSubject.asObservable(),
      this.broadcastSubject.asObservable(),
      heartbeat$,
    );
  }

  /**
   * 移除已断开连接的客户端，仅在该用户所有标签页均关闭时销毁 Subject
   */
  removeClient(userId: number) {
    const currentCount = this.clientCounts.get(userId) || 0;
    if (currentCount > 1) {
      this.clientCounts.set(userId, currentCount - 1);
      return;
    }

    this.clientCounts.delete(userId);
    const userSubject = this.userSubjects.get(userId);
    if (userSubject) {
      userSubject.complete();
      this.userSubjects.delete(userId);
      this.logger.log(
        `[SSE] 用户 ID: ${userId} 连接已断开并注销, 剩余在线用户数: ${this.userSubjects.size}`,
      );
    }
  }

  /**
   * 向指定单个用户定向推送实时通知
   */
  sendToUser(userId: number, payload: SsePayload) {
    const userSubject = this.userSubjects.get(userId);
    const event: MessageEvent = {
      data: {
        ...payload,
        timestamp: payload.timestamp || Date.now(),
      },
    };

    if (userSubject) {
      userSubject.next(event);
      this.logger.log(
        `[SSE] 定向推送成功 -> 用户 ID: ${userId}, 事件类型: ${payload.type}`,
      );
    } else {
      this.logger.debug(
        `[SSE] 用户 ID: ${userId} 当前未建立长连接，跳过实时推送`,
      );
    }
  }

  /**
   * 向指定的一组用户（如本人或拥有审批权限的主管集合）批量定向推送
   */
  sendToUsers(userIds: number[], payload: SsePayload) {
    const uniqueIds = Array.from(
      new Set((userIds || []).map(Number).filter((id) => id > 0)),
    );
    for (const uid of uniqueIds) {
      this.sendToUser(uid, payload);
    }
  }

  /**
   * 向全体在线用户广播实时事件（适用于公司全员公告与全局通知）
   */
  broadcast(payload: SsePayload) {
    const event: MessageEvent = {
      data: {
        ...payload,
        timestamp: payload.timestamp || Date.now(),
      },
    };
    this.broadcastSubject.next(event);
    this.logger.log(`[SSE] 全员广播推送成功 -> 事件类型: ${payload.type}`);
  }

  /**
   * 向指定审批人列表（若未提供则降级全站静默更新）更新待办审批徽标数字
   */
  sendPendingBadgeUpdate(pendingCount: number, targetUserIds?: number[]) {
    const payload: SsePayload = {
      type: 'TODO_BADGE_UPDATE',
      data: { pendingCount },
    };
    if (Array.isArray(targetUserIds)) {
      this.sendToUsers(targetUserIds, payload);
      return;
    }
    this.broadcast(payload);
  }

  /**
   * 向单个被修改权限/状态的用户定向推送权限重载信号
   */
  sendPermissionUpdateToUser(
    userId: number,
    message = '您的账号角色或权限已更新',
  ) {
    this.sendToUser(userId, {
      type: 'PERMISSION_UPDATE',
      title: '权限实时同步',
      message,
      data: { reloadRoutes: true },
      timestamp: Date.now(),
    });
  }

  /**
   * 广播全局角色菜单或系统菜单树配置变更事件（静默同步在线用户菜单）
   */
  broadcastPermissionUpdate(message = '系统权限与功能配置已更新') {
    this.broadcast({
      type: 'PERMISSION_UPDATE',
      title: '权限实时同步',
      message,
      data: { reloadRoutes: true },
      timestamp: Date.now(),
    });
  }
}
