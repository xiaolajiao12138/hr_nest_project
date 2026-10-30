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
 * 管理全站所有在线客户端的长连接生命周期，支持定向用户推送与全员实时广播
 */
@Injectable()
export class SseService {
  private readonly logger = new Logger(SseService.name);

  /** 每个在线用户专属的事件通道映射表 (userId -> Subject) */
  private userSubjects = new Map<number, Subject<MessageEvent>>();

  /** 全员广播通用通道 */
  private broadcastSubject = new Subject<MessageEvent>();

  /**
   * 注册客户端 SSE 连接并返回合并后的响应式事件流
   *
   * @param userId 建立长连接的登录用户主键 ID
   * @returns 返回合并了“专属定向流 + 全员广播流 + 定时心跳流”的 RxJS Observable
   */
  addClient(userId: number): Observable<MessageEvent> {
    let userSubject = this.userSubjects.get(userId);
    if (!userSubject) {
      userSubject = new Subject<MessageEvent>();
      this.userSubjects.set(userId, userSubject);
    }

    this.logger.log(`[SSE] 用户 ID: ${userId} 建立实时事件流连接, 当前在线连接数: ${this.userSubjects.size}`);

    // 定时心跳 (25秒一次)，防止 Nginx/网关代理以及浏览器由于长久无数据传输而主动切断 TCP 连接
    const heartbeat$ = interval(25000).pipe(
      map(() => ({
        data: {
          type: 'HEARTBEAT',
          timestamp: Date.now(),
        },
      } as MessageEvent)),
    );

    // 将个人专属通知、全站广播通知与心跳信号无缝汇聚为单一输出流
    return merge(userSubject.asObservable(), this.broadcastSubject.asObservable(), heartbeat$);
  }

  /**
   * 移除已断开连接的客户端，释放 RxJS 观察者对象及内存通道
   *
   * @param userId 断开连接的用户主键 ID
   */
  removeClient(userId: number) {
    const userSubject = this.userSubjects.get(userId);
    if (userSubject) {
      userSubject.complete();
      this.userSubjects.delete(userId);
      this.logger.log(`[SSE] 用户 ID: ${userId} 连接已断开并注销, 剩余在线数: ${this.userSubjects.size}`);
    }
  }

  /**
   * 向指定用户定向推送实时通知
   * 典型场景：主管审批了请假申请，向提交申请的指定员工精准发送审批结果通知
   *
   * @param userId 目标接收者用户主键 ID
   * @param payload 消息载荷结构体
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
      this.logger.log(`[SSE] 定向推送成功 -> 用户 ID: ${userId}, 事件类型: ${payload.type}`);
    } else {
      this.logger.debug(`[SSE] 用户 ID: ${userId} 当前未建立长连接，跳过实时弹窗`);
    }
  }

  /**
   * 向全体在线用户广播实时事件
   * 典型场景：超级管理员发布全员公告、或者待办任务总数变更
   *
   * @param payload 广播消息载荷结构体
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
   * 广播待办审批任务徽标数量变动
   * 当有新请假申请提交或完成审批时，通知所有审批人更新徽标数字
   *
   * @param pendingCount 当前最新的待办审批任务总量
   */
  sendPendingBadgeUpdate(pendingCount: number) {
    this.broadcast({
      type: 'TODO_BADGE_UPDATE',
      data: { pendingCount },
    });
  }

  /**
   * 广播岗位权限与系统功能菜单配置变更事件
   * 通知全站所有在线客户端静默拉取最新权限并热重载动态路由与侧边栏
   *
   * @param message 友好通知提示语
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
