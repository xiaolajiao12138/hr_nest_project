import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../common/base/base.entity';
import { SysFile } from '../../../upload/entities/file.entity';

@Entity('sys_notice')
export class Notice extends BaseEntity {
  @Column({ length: 150, comment: '公告标题' })
  title: string;

  @Column({ type: 'text', comment: '公告内容' })
  content: string;

  @Column({
    name: 'notice_type',
    length: 20,
    default: 'NOTICE',
    comment: '类型: NOTICE(通知), ANNOUNCEMENT(公告)',
  })
  noticeType: string;

  @Column({ name: 'file_id', nullable: true, comment: '附件文件ID' })
  fileId: number;

  @ManyToOne(() => SysFile, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'file_id' })
  file?: SysFile;

  @Column({
    type: 'smallint',
    default: 1,
    comment: '状态 1:正常发布 0:已下架',
  })
  status: number;

  @Column({ name: 'created_by', length: 50, nullable: true, comment: '发布人' })
  createdBy: string;
}
