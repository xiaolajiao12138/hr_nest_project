import { Entity, Column } from 'typeorm';
import { BaseEntity } from '../../../common/base/base.entity';

@Entity('sys_dict')
export class Dict extends BaseEntity {
  @Column({ name: 'dict_name', length: 50, comment: '字典名称' })
  dictName: string;

  @Column({ name: 'dict_type', length: 50, comment: '字典类型' })
  dictType: string;

  @Column({ name: 'dict_label', length: 50, comment: '字典标签(显示名)' })
  dictLabel: string;

  @Column({ name: 'dict_value', length: 50, comment: '字典键值' })
  dictValue: string;

  @Column({ default: 0, comment: '显示排序' })
  sort: number;

  @Column({ type: 'smallint', default: 1, comment: '状态 1:正常 0:停用' })
  status: number;

  @Column({ length: 255, nullable: true, comment: '备注' })
  remark: string;
}
