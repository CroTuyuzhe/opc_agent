User is the human operator. Brain MUST call ask_user at these gates:

## Mandatory Approval Gates

1. **PRD Review** — PM 产出 PRD 后，必须请 User 审批，通过后才能分发给 Dev/UI
2. **Technical Decision** — Dev 提出重大技术选型（框架/架构/第三方服务），需 User 确认
3. **Launch Readiness** — 全部角色产出完成后，需 User 确认是否 ready
4. **Budget/Scope Change** — 任何涉及范围扩大或成本增加的决策

## Auto-proceed (不需审批)

- BUG 修复流转 (Dev→Tester→Dev 循环)
- 角色内部的细节决策（命名、变量、文案微调）
- 信息查询类操作

## Intervention Switch

读取 `staff/boss_decide/intervention.md` 中的状态:
- `RUNNING` — 正常运行，仅在 Gates 处暂停
- `PAUSE` — 每个 dispatch 都需要 User 确认
- `STOP` — 立即停止所有任务，不再分发
