import { IsString, IsNotEmpty, MaxLength, IsOptional, IsInt, Min, IsIn } from 'class-validator';
import { PartialType } from '@nestjs/swagger';
export class CreateDictDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(50)
    dictName: string;
    @IsString()
    @IsNotEmpty()
    @MaxLength(50)
    dictType: string;
    @IsString()
    @IsNotEmpty()
    @MaxLength(50)
    dictLabel: string;
    @IsString()
    @IsNotEmpty()
    @MaxLength(50)
    dictValue: string;
    @IsOptional()
    @IsInt()
    @Min(0)
    sort?: number;
    @IsOptional()
    @IsIn([0, 1])
    status?: number;
    @IsOptional()
    @IsString()
    @MaxLength(255)
    remark?: string;
}
export class UpdateDictDto extends PartialType(CreateDictDto) {
}
