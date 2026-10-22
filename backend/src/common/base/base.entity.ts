import {
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * 通用实体基类，所有业务实体可继承此类以获得基础字段
 */
export abstract class BaseEntity {
  @PrimaryGeneratedColumn({ comment: '主键ID' })
  id: number;

  @CreateDateColumn({
    type: 'timestamp with time zone',
    name: 'created_at',
    comment: '创建时间',
  })
  createdAt: Date;

  @UpdateDateColumn({
    type: 'timestamp with time zone',
    name: 'updated_at',
    comment: '最后更新时间',
  })
  updatedAt: Date;
}
