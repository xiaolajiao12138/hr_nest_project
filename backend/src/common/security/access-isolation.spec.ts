import 'reflect-metadata';
import { it } from 'node:test';
import * as assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import * as ExcelJS from 'exceljs';
import { dataSourceOptions } from '../../config/typeorm.config';
import { AccessIsolation1793610000000 } from '../../migrations/1793610000000-AccessIsolation';
import { Employee } from '../../modules/employee/entities/employee.entity';
import { Dept } from '../../modules/department/entities/dept.entity';
import { SalaryRecord } from '../../modules/salary/entities/salary.entity';
import { Leave } from '../../modules/leave/entities/leave.entity';
import { AnnualLeave } from '../../modules/leave/entities/annual.entity';
import { User } from '../../modules/rbac/entities/user.entity';
import { Role } from '../../modules/rbac/entities/role.entity';
import { Menu } from '../../modules/rbac/entities/menu.entity';
import { AttendanceRecord } from '../../modules/attendance/entities/record.entity';
import { AttendanceSchedule } from '../../modules/attendance/entities/schedule.entity';
import { AttendanceShift } from '../../modules/attendance/entities/shift.entity';
import { PerformanceRecord } from '../../modules/performance/entities/performance-record.entity';
import { PerformancePlan } from '../../modules/performance/entities/performance-plan.entity';
import { EmployeeService } from '../../modules/employee/employee.service';
import { SalaryService } from '../../modules/salary/salary.service';
import { LeaveService } from '../../modules/leave/leave.service';
import { PerformanceService } from '../../modules/performance/performance.service';
import { AttendanceService } from '../../modules/attendance/attendance.service';
import { UserService } from '../../modules/rbac/services/user.service';
import { AuthCacheService } from '../../modules/rbac/services/auth-cache.service';
import { SseService } from '../../modules/sse/sse.service';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SysFile } from '../../upload/entities/file.entity';
import { UploadService } from '../../upload/upload.service';
import { ValidationPipe } from '@nestjs/common';
import { SalaryController } from '../../modules/salary/salary.controller';
import { EmployeeController } from '../../modules/employee/employee.controller';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { TransformInterceptor } from '../interceptors/transform.interceptor';
import { AllExceptionsFilter } from '../filters/all-exceptions.filter';
import { sanitizeResponse } from './sanitize';
// 所有读写都限定于随机临时 schema；绝不使用或清理 public 中的业务数据。
it('PostgreSQL 数据隔离、归属、状态与并发回归', { skip: process.env.RUN_DB_SECURITY_TEST !== '1', timeout: 120000 }, async (t) => {
    const schema = 'hr_security_' + randomBytes(8).toString('hex');
    assert.match(schema, /^hr_security_[a-f0-9]{16}$/);
    const setup = new DataSource({ ...dataSourceOptions, entities: [], migrations: [], synchronize: false, logging: false });
    let ds: DataSource;
    await setup.initialize();
    try {
        await setup.query('CREATE SCHEMA "' + schema + '"');
        ds = new DataSource({ ...dataSourceOptions, type: 'postgres', schema, extra: { options: '-c search_path=' + schema }, migrations: [], synchronize: true, logging: false });
        await ds.initialize();
        const repo = <T extends object>(cls: new () => T) => ds.getRepository(cls);
        const [deptA, deptB] = await repo(Dept).save([{ deptName: '测试甲' }, { deptName: '测试乙' }]);
        const employees = await repo(Employee).save([deptA, deptA, deptB].map((d, i) => ({ empNo: 'SEC' + i, name: '测试' + i, deptId: d.id, phone: '1380000000' + i, idCard: '11010119900101000' + i, entryDate: '2026-01-01', post: '测试', salary: 1000, status: 1 })));
        const [a, peer, b] = employees;
        const hash = await bcrypt.hash('only-test-secret', 4);
        const accounts = await repo(User).save(employees.map((e, i) => ({ username: e.empNo, realName: e.name, employeeId: e.id, deptId: e.deptId, password: hash, roles: [] })));
        const role = await repo(Role).save({ roleName: '测试管理员', roleKey: 'admin' });
        const menu = await repo(Menu).save({ title: '员工', path: 'employee', perms: 'hr:employee:list' });
        const managerRole = await repo(Role).save({ roleName: '部门管理', roleKey: 'scope-test', dataScope: 'DEPT', menus: [menu] });
        accounts[0].roles = [managerRole];
        await repo(User).save(accounts[0]);
        const runner = ds.createQueryRunner();
        await runner.connect();
        try {
            await runner.startTransaction();
            await new AccessIsolation1793610000000().up(runner);
            await new AccessIsolation1793610000000().up(runner);
            await runner.commitTransaction();
        }
        catch (e) {
            await runner.rollbackTransaction();
            throw e;
        }
        finally {
            await runner.release();
        }
        const cache = new AuthCacheService(repo(User), { get: async () => null, set: async () => { }, del: async () => { }, delByPrefix: async () => { } } as any);
        const permissions = ['hr:employee:list', 'hr:employee:sensitive', 'hr:employee:edit', 'hr:salary:list', 'hr:salary:edit', 'hr:salary:calc', 'hr:salary:confirm', 'hr:salary:sync', 'hr:leave:add', 'hr:leave:audit', 'hr:attendance:schedule', 'hr:attendance:approveRepair', 'hr:performance:eval', 'hr:performance:manager', 'hr:performance:start'];
        const dataScopes = Object.fromEntries(['employee', 'salary', 'leave', 'attendance', 'performance', 'user'].map(key => [key, { all: false, deptIds: [deptA.id], self: true }]));
        const actor = { userId: accounts[0].id, username: accounts[0].username, roles: [], permissions, employeeId: a.id, deptId: deptA.id, dataScopes };
        const self = { ...actor, dataScopes: Object.fromEntries(Object.keys(dataScopes).map(key => [key, { all: false, deptIds: [], self: true }])) };
        const admin = { ...actor, roles: ['admin'] };
        const sse = new SseService();
        const employeeService = new EmployeeService(repo(Employee), repo(Dept), repo(AnnualLeave), {} as any, ds, cache);
        const salaryService = new SalaryService(repo(SalaryRecord), repo(Employee), repo(Leave), repo(User), ds);
        const leaveService = new LeaveService(repo(Leave), repo(AnnualLeave), repo(Employee), ds, sse, cache);
        const performanceService = new PerformanceService(repo(PerformancePlan), repo(PerformanceRecord), repo(Employee), repo(Dept), repo(SalaryRecord), ds);
        const attendanceService = new AttendanceService(repo(AttendanceShift), repo(AttendanceSchedule), repo(AttendanceRecord), repo(Employee), repo(User), ds);
        const userService = new UserService(repo(User), repo(Role), cache, sse, ds);
        const salaries = await repo(SalaryRecord).save(employees.map(e => ({ empId: e.id, yearMonth: '2026-10', baseSalary: 1000, grossSalary: 1000, netSalary: 1000, status: 2, payslipPassword: hash })));
        const [sa, sp, sb] = salaries;
        const draft = await repo(SalaryRecord).save({ empId: a.id, yearMonth: '2026-11', baseSalary: 1000, status: 1 });
        await t.test('角色范围按资源计算，无关角色不能扩大薪资范围', async () => { const authority = await cache.getUserAuthorities(actor.userId); assert.deepEqual(authority.dataScopes.employee.deptIds, [deptA.id]); assert.deepEqual(authority.dataScopes.salary.deptIds, []); assert.equal(authority.employeeId, a.id); });
        await t.test('员工列表和详情限制部门；SELF、未绑定与缺失身份默认拒绝', async () => {
            assert.equal((await employeeService.findEmployeePage({} as any, actor)).total, 2);
            assert.equal((await employeeService.findEmployeePage({} as any, self)).total, 1);
            assert.equal((await employeeService.findEmployeePage({} as any, { ...self, employeeId: undefined })).total, 0);
            const options = await employeeService.getEmployeeOptions('employee', {} as any, actor);
            assert.equal(options.total, 2);
            assert.ok(options.list.every(employee => employee.dept?.deptName === deptA.deptName));
            assert.ok(options.list.every(employee => employee.phone === undefined && employee.salary === undefined));
            assert.equal((await employeeService.getEmployeeOptions('employee', {} as any, self)).total, 1);
            assert.equal((await employeeService.getEmployeeOptions('employee', { deptId: deptB.id } as any, actor)).total, 0);
            await assert.rejects(() => employeeService.getEmployeeOptions('employee', {} as any, { ...actor, permissions: [] }));
            await assert.rejects(() => employeeService.findEmployeePage({} as any));
            await assert.rejects(() => employeeService.getEmployeeDetail(b.id, [], actor));
            await assert.rejects(() => employeeService.updateEmployee(b.id, { name: '越权' } as any, actor));
            assert.equal((await repo(Employee).findOneBy({ id: b.id })).name, b.name);
        });
        await t.test('工资条严格校验本人、口令、状态，响应不含哈希或员工证件', async () => { await assert.rejects(() => salaryService.verifyPayslip(actor.userId, { salaryId: sb.id, password: 'only-test-secret' })); await assert.rejects(() => salaryService.verifyPayslip(actor.userId, { salaryId: sa.id })); await assert.rejects(() => salaryService.verifyPayslip(actor.userId, { salaryId: sa.id, password: 'wrong' })); await assert.rejects(() => salaryService.verifyPayslip(actor.userId, { salaryId: draft.id })); const detail = await salaryService.verifyPayslip(actor.userId, { salaryId: sa.id, password: 'only-test-secret' }); assert.equal(detail.employee.id, a.id); assert.equal('payslipPassword' in detail, false); assert.equal('idCard' in detail.employee, false); const slips = await salaryService.getMyPayslips(actor.userId); assert.equal(slips.length, 1); assert.equal('netSalary' in slips[0], false); });
        await t.test('薪资统计、详情、导出与批量状态均隔离，失败整批回滚', async () => { const list = await salaryService.getSalaryList({ yearMonth: '2026-10' } as any, actor); assert.equal(list.total, 2); assert.equal(list.kpi.totalGross, 2000); await assert.rejects(() => salaryService.getSalaryDetail(sb.id, actor)); const book = new ExcelJS.Workbook(); await book.xlsx.load(await salaryService.exportExcel({ yearMonth: '2026-10' } as any, actor) as any); assert.equal(book.worksheets[0].rowCount, 3); await assert.rejects(() => salaryService.batchConfirm({ ids: [sa.id, sb.id], targetStatus: 3 }, actor)); assert.equal((await repo(SalaryRecord).findOneBy({ id: sa.id })).status, 2); await assert.rejects(() => salaryService.updateSalary(sa.id, { baseSalary: 10 }, actor)); await assert.rejects(() => salaryService.updateSalary(sb.id, { baseSalary: 10 }, actor)); });
        await t.test('账号不能自授管理员，不能越部门改账号或伪造身份', async () => { await assert.rejects(() => userService.updateUser(actor.userId, { roleIds: [role.id] }, actor)); await assert.rejects(() => userService.updateUser(actor.userId, { employeeId: b.id }, actor)); await assert.rejects(() => userService.resetPassword(accounts[2].id, { newPassword: 'Test-secure-123' } as any, actor)); assert.equal((await repo(User).findOneBy({ id: actor.userId })).employeeId, a.id); });
        await repo(AnnualLeave).save({ empId: peer.id, year: 2026, totalDays: 5, usedDays: 0, remainDays: 5 });
        const peerActor = { ...self, userId: accounts[1].id, username: accounts[1].username, employeeId: peer.id };
        let annual: Leave;
        await t.test('年假创建及并发驳回只返还一次，禁止自审和跨部门审批', async () => { annual = await leaveService.applyLeave({ empId: peer.id, leaveType: 'ANNUAL', startTime: '2026-11-03 09:00:00', endTime: '2026-11-03 18:00:00', days: 99, reason: '测试' } as any, peerActor); assert.equal(Number(annual.days), 1); await assert.rejects(() => leaveService.auditLeave(annual.id, { action: 'REJECTED' } as any, peerActor)); const results = await Promise.allSettled([1, 2].map(() => leaveService.auditLeave(annual.id, { action: 'REJECTED' } as any, actor))); assert.equal(results.filter(r => r.status === 'fulfilled').length, 1); const balance = await repo(AnnualLeave).findOneBy({ empId: peer.id, year: 2026 }); assert.equal(Number(balance.remainDays), 5); assert.equal(Number(balance.usedDays), 0); await assert.rejects(() => leaveService.getEmployeeAnnualBalance(b.id, 2026, actor)); const absent = await leaveService.getEmployeeAnnualBalance(a.id, 2026, actor); assert.equal((absent as any).initialized, false); assert.equal(await repo(AnnualLeave).countBy({ empId: a.id }), 0); });
        await t.test('考勤列表/统计/排班/修正均隔离', async () => { const records = await repo(AttendanceRecord).save(employees.map(e => ({ empId: e.id, date: '2026-11-02', status: 1 }))); const result = await attendanceService.getRecordList({} as any, actor); assert.equal(result.total, 2); await assert.rejects(() => attendanceService.getRecordDetail(records[2].id, actor)); await assert.rejects(() => attendanceService.repairRecord({ recordId: records[2].id, status: 1 }, actor)); await assert.rejects(() => attendanceService.repairRecord({ recordId: records[1].id, status: 1 }, { ...actor, permissions: [] })); await assert.rejects(() => attendanceService.batchSetSchedule({ empIds: [b.id], startDate: '2026-11-02', endDate: '2026-11-02', isRest: true }, actor)); const month = await attendanceService.getMonthSchedule('2026-11', undefined, self); assert.deepEqual(month.list.map(x => x.empId), [a.id]); });
        const plan = await performanceService.createPlan({ title: '隔离方案', cycleType: 'MONTHLY', startDate: '2026-11-01', endDate: '2026-11-30' } as any, admin);
        await performanceService.launchAppraisal({ planId: plan.id }, admin);
        const [pa, pp, pb] = await Promise.all(employees.map(e => repo(PerformanceRecord).findOneBy({ planId: plan.id, empId: e.id })));
        await t.test('绩效只允许本人自评/授权主管评；不能代填、跨部门、改已完成记录', async () => { await assert.rejects(() => performanceService.evaluate({ recordId: pb.id, evalType: 'manager', managerScore: 10 }, actor)); await assert.rejects(() => performanceService.evaluate({ recordId: pp.id, evalType: 'self', selfScore: 10 }, actor)); await assert.rejects(() => performanceService.evaluate({ recordId: pp.id, evalType: 'manager', managerScore: 10 }, actor)); await performanceService.evaluate({ recordId: pp.id, evalType: 'self', selfScore: 0 }, peerActor); await assert.rejects(() => performanceService.evaluate({ recordId: pp.id, evalType: 'manager', managerScore: 0 }, { ...actor, permissions: ['hr:performance:eval'] })); const done = await performanceService.evaluate({ recordId: pp.id, evalType: 'manager', managerScore: 0 }, actor); assert.equal(Number(done.coefficient), 0); await assert.rejects(() => performanceService.evaluate({ recordId: pp.id, evalType: 'manager', managerScore: 99 }, actor)); assert.equal((await performanceService.findRecordPage({ planId: plan.id } as any, actor)).total, 2); });
        await t.test('绩效不得改已核准薪资；草稿保留零系数且隔离其他部门', async () => { await assert.rejects(() => performanceService.syncToSalary({ planId: plan.id, yearMonth: '2026-10' }, actor)); await repo(SalaryRecord).update(sp.id, { status: 1, performanceSalary: 100 }); assert.equal((await performanceService.syncToSalary({ planId: plan.id, yearMonth: '2026-10' }, actor)).updatedCount, 1); assert.equal(Number((await repo(SalaryRecord).findOneBy({ id: sp.id })).performanceSalary), 0); assert.equal((await repo(SalaryRecord).findOneBy({ id: sb.id })).status, 2); await assert.rejects(() => performanceService.archivePlan(plan.id, admin)); });
        await t.test('核算仅写授权员工，重复核算不覆盖草稿', async () => { const result = await salaryService.calculateMonthlySalary({ yearMonth: '2026-12', overwrite: false }, actor); assert.equal(result.createdCount, 2); assert.equal(await repo(SalaryRecord).countBy({ empId: b.id, yearMonth: '2026-12' }), 0); const next = await salaryService.calculateMonthlySalary({ yearMonth: '2026-12', overwrite: false }, actor); assert.equal(next.updatedCount, 0); });
        await t.test('附件按归属和员工范围授权，不能拿本人上传身份越过关联档案范围', async () => {
            const file = await repo(SysFile).save({ ownerUserId: actor.userId, originalName: 'test.png', fileName: 'test.png', fileSize: 1, fileExt: '.png', mimeType: 'image/png', bucketName: 'test', filePath: 'idcard/test.png', fileUrl: '/api/upload/preview/idcard/test.png' });
            const service = new UploadService(new ConfigService({ minio: { endPoint: '127.0.0.1', port: 9000, useSSL: false, accessKey: 'test', secretKey: 'test-secret', bucketName: 'test' }, jwt: { secret: 'test-only-secret' } }), repo(SysFile), cache);
            await service.assertFileAccess(file.id, actor);
            await repo(Employee).update(b.id, { idCardFrontId: file.id });
            await assert.rejects(() => service.assertFileAccess(file.id, actor));
            await assert.rejects(() => service.getPresignedUrl(file.id, actor));
            await service.assertFileAccess(file.id, admin);
            await assert.rejects(() => service.verifyPreview('idcard/test.png', file.id, actor.userId, 1, '0'.repeat(64)));
            await assert.rejects(() => service.deleteFile(file.id, admin));
        });
        await t.test('并发签到只保存一次，不覆盖已有签到时间', async () => {
            const results = await Promise.allSettled([1, 2].map(() => attendanceService.clockIn(actor.userId, { type: 'CHECK_IN' })));
            assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
            const now = new Date(), date = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
            assert.equal(await repo(AttendanceRecord).countBy({ empId: a.id, date }), 1);
        });
        await t.test('员工状态修改与归档不能绕过管理员账号保护',async()=>{
          await assert.rejects(()=>employeeService.archiveEmployee(a.id,actor));
          accounts[1].roles=[role];await repo(User).save(accounts[1]);
          await assert.rejects(()=>employeeService.updateEmployee(peer.id,{status:2} as any,actor));
          await assert.rejects(()=>employeeService.archiveEmployee(peer.id,actor));
          assert.equal((await repo(Employee).findOneBy({id:peer.id})).status,1);
          assert.equal((await repo(User).findOneBy({id:accounts[1].id})).status,1);
        });
        await t.test('HTTP 层执行动作鉴权、DTO白名单、对象归属与响应脱敏', async () => {
            const module = await Test.createTestingModule({ controllers: [SalaryController, EmployeeController], providers: [{ provide: SalaryService, useValue: salaryService }, { provide: EmployeeService, useValue: employeeService }] }).overrideGuard(JwtAuthGuard).useValue({ canActivate(context: any) { context.switchToHttp().getRequest().user = context.switchToHttp().getRequest().headers['x-test-actor'] === 'restricted' ? { ...self, permissions: [] } : context.switchToHttp().getRequest().headers['x-test-actor'] === 'reader' ? { ...actor, permissions: ['hr:employee:list'] } : actor; return true; } }).compile();
            const app = module.createNestApplication({ logger: false });
            app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: false }));
            app.useGlobalInterceptors(new TransformInterceptor());
            app.useGlobalFilters(new AllExceptionsFilter());
            try {
                await app.listen(0, '127.0.0.1');
                const address = app.getHttpServer().address(), base = 'http://127.0.0.1:' + address.port;
                assert.equal((await fetch(base + '/salary/list', { headers: { 'x-test-actor': 'restricted' } })).status, 403);
                assert.equal((await fetch(base + '/salary/detail?id=' + sb.id)).status, 404);
                const others = await fetch(base + '/salary/my-payslips/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ salaryId: sb.id, password: 'only-test-secret' }) });
                assert.equal(others.status, 404);
                const bypass = await fetch(base + '/salary/' + draft.id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 3 }) });
                assert.equal(bypass.status, 200);
                assert.equal((await repo(SalaryRecord).findOneBy({ id: draft.id })).status, 1);
                const response = await fetch(base + '/hr/employee/list', { headers: { 'x-test-actor': 'restricted' } });
                assert.equal(response.status, 403);
                const read = await fetch(base + '/hr/employee/list', { headers: { 'x-test-actor': 'reader' } });
                assert.equal(read.status, 200);
                const payload: any = await read.json();
                assert.equal(payload.data.total, 2);
                assert.equal(payload.data.list[0].salary, undefined);
                assert.ok(payload.data.list[0].phone.includes('*'));
            }
            finally {
                await app.close();
            }
        });
        await t.test('关联员工对象脱敏并删除口令', () => { const cleaned = sanitizeResponse({ employee: a, payslipPassword: hash, hasPassword: true }, { ...self, permissions: [] }); assert.equal(cleaned.employee.salary, undefined); assert.ok(cleaned.employee.idCard.includes('*')); assert.equal(cleaned.payslipPassword, undefined); assert.equal(cleaned.hasPassword, true); });
    }
    finally {
        if (ds?.isInitialized)
            await ds.destroy();
        await setup.query('DROP SCHEMA IF EXISTS "' + schema + '" CASCADE');
        await setup.destroy();
    }
});
