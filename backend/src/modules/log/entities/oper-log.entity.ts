import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity('sys_oper_log')
export class OperLogEntity {
  @PrimaryGeneratedColumn({ comment: '日志主键' })
  id: number;

  @Column({ length: 50, nullable: true, comment: '模块标题' })
  title: string;

  @Column({ name: 'business_type', length: 50, nullable: true, comment: '业务类型' })
  businessType: string;

  @Column({ length: 150, nullable: true, comment: '方法名称' })
  method: string;

  @Column({ name: 'request_method', length: 20, nullable: true, comment: '请求方式' })
  requestMethod: string;

  @Column({ name: 'oper_name', length: 50, nullable: true, comment: '操作人员' })
  operName: string;

  @Column({ name: 'oper_url', length: 255, nullable: true, comment: '请求URL' })
  operUrl: string;

  @Column({ name: 'oper_ip', length: 50, nullable: true, comment: '主机地址' })
  operIp: string;

  @Column({ name: 'oper_param', type: 'text', nullable: true, comment: '请求参数' })
  operParam: string;

  @Column({ name: 'json_result', type: 'text', nullable: true, comment: '返回参数' })
  jsonResult: string;

  @Column({ type: 'smallint', default: 1, comment: '操作状态(1正常 0异常)' })
  status: number;

  @Column({ name: 'error_msg', type: 'text', nullable: true, comment: '错误消息' })
  errorMsg: string;

  @Column({ name: 'cost_time', type: 'bigint', nullable: true, comment: '消耗时间(毫秒)' })
  costTime: number;

  @CreateDateColumn({ name: 'oper_time', type: 'timestamp with time zone', comment: '操作时间' })
  operTime: Date;
}
