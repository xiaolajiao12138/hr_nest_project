import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity('sys_file')
export class SysFile {
  @PrimaryGeneratedColumn({ comment: '文件ID' })
  id: number;

  @Column({ name: 'original_name', length: 255, comment: '原始文件名' })
  originalName: string;

  @Column({ name: 'file_name', length: 255, comment: '存储文件名' })
  fileName: string;

  @Column({ name: 'file_size', type: 'bigint', comment: '文件大小(字节)' })
  fileSize: number;

  @Column({ name: 'file_ext', length: 20, comment: '文件扩展名' })
  fileExt: string;

  @Column({ name: 'mime_type', length: 100, comment: 'MIME类型' })
  mimeType: string;

  @Column({ name: 'bucket_name', length: 50, comment: '所属桶' })
  bucketName: string;

  @Column({ name: 'file_path', length: 255, comment: '桶内存储路径' })
  filePath: string;

  @Column({ name: 'file_url', length: 500, comment: '文件直接访问或预签名URL' })
  fileUrl: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone', comment: '上传时间' })
  createdAt: Date;
}
