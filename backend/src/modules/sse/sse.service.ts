import { Injectable, Logger, MessageEvent } from '@nestjs/common';
import { Observable, Subject, merge, interval, map } from 'rxjs';

export interface SsePayload {
  type: 'NOTICE_BROADCAST' | 'LEAVE_AUDIT_NOTIFY' | 'TODO_BADGE_UPDATE' | 'HEARTBEAT';
  title?: string;
  message?: string;
  data?: any;
  timestamp?: number;
}

@Injectable()
export class SseService {
  private readonly logger = new Logger(SseService.name);

  // 每个在线用户专属的事件通道 (userId -> Subject)
  private userSubjects = new Map<number, Subject<MessageEvent>>();

  // 全员广播通道
  private broadcastSubject = new Subject<MessageEvent>();

  /**
   * 注册客户端 SSE 连接并返回合并的事件流
   */
  addClient(userId: number): Observable<MessageEvent> {
    let userSubject = this.userSubjects.get(userId);
    if (!userSubject) {
      userSubject = new Subject<MessageEvent>();
      this.userSubjects.set(userId, userSubject);
    }

    this.logger.log(`[SSE] 用户 ID: ${userId} 建立实时事件流连接, 当前在线连接数: ${this.userSubjects.size}`);

    // 定时心跳 (25秒一次)，防止 HTTP 代理和浏览器连接超时断开
    const heartbeat$ = interval(25000).pipe(
      map(() => ({
        data: {
          type: 'HEARTBEAT',
          timestamp: Date.now(),
        },
      } as MessageEvent)),
    );

    // 合并 专属事件流 + 全员广播流 + 心跳流
    return merge(userSubject.asObservable(), this.broadcastSubject.asObservable(), heartbeat$);
  }

  /**
   * 移除已断开连接的客户端
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
   * 向指定用户定向推送实时通知 (如请假审批结果提醒)
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
   * 向全体在线用户广播实时事件 (如新公告发布、待办审批数变动)
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
   */
  sendPendingBadgeUpdate(pendingCount: number) {
    this.broadcast({
      type: 'TODO_BADGE_UPDATE',
      data: { pendingCount },
    });
  }
}
