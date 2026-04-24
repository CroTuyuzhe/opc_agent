# OPC — One Prompt to Command

> **AI multi-agent team orchestrator.** One prompt dispatches tasks to PM, Dev, UI, Tester, and Admin agents that collaborate through a file-system message bus.

OPC is a CLI tool that simulates a complete software team. You describe what you want, and the agents handle requirements analysis, design, implementation, testing, and delivery — with you as the boss making key decisions.

---

## Install

```bash
npm install -g opc-agent
```

Requires Node.js 18+.

## Quick Start

```bash
mkdir my-team && cd my-team
opc init
# Edit opc.json — set your api_key
opc
```

```
┌─────────────────────────────────────┐
│ OPC Team Agent v0.1                 │
│                                     │
│   Provider : openai                 │
│   Model    : gpt-4o                │
│   Config   : OK                     │
│                                     │
│   /help for commands, /exit to quit │
└─────────────────────────────────────┘

opc > 做一个贪吃蛇H5小游戏
```

---

## 特点

- **5 角色协作** — PM、Dev、UI、Tester、Admin，各司其职
- **文件系统消息总线** — 角色间通过 BUS 异步通信，支持并行任务
- **交互式决策** — PM 会追问需求细节，关键节点需要你审批
- **真实代码输出** — Dev 和 UI 写出可运行的代码文件
- **项目隔离** — 每个项目独立目录，跨会话项目关联
- **可扩展 Skill 插件** — 通过 GitHub 安装自定义技能
- **支持 OpenAI / Anthropic** — 兼容任何 OpenAI-compatible API

---

## 配置

编辑 `opc.json`：

```json
{
    "provider": "openai",
    "api_key": "sk-your-api-key",
    "base_url": "https://api.openai.com/v1",
    "default_model": "gpt-4o",
    "team_root": ".",
    "max_tokens": 8192,
    "temperature": 0.7
}
```

| 字段 | 说明 | 默认值 |
|------|------|--------|
| `provider` | LLM 提供商 (`openai` / `anthropic`) | `openai` |
| `api_key` | API 密钥 | — |
| `base_url` | API 端点 | `https://api.openai.com/v1` |
| `default_model` | 模型名称 | `gpt-4o` |
| `team_root` | 团队根目录 | `.` |
| `max_tokens` | 单次回复最大 token 数 | `8192` |
| `temperature` | 生成温度 (0-2) | `0.7` |

也可以用环境变量：

```bash
export OPC_API_KEY="sk-your-api-key"
export OPC_PROVIDER="openai"
export OPC_MODEL="gpt-4o"
export OPC_BASE_URL="https://api.openai.com/v1"
export OPC_TEAM_ROOT="."
export OPC_MAX_TOKENS="8192"
export OPC_TEMPERATURE="0.7"
```

配置加载优先级：环境变量 > 当前目录 `opc.json` > `~/.opc/opc.json`

使用 Anthropic Claude：

```json
{
    "provider": "anthropic",
    "api_key": "sk-ant-your-key",
    "default_model": "claude-sonnet-4-20250514"
}
```

---

## 命令参考

| 命令 | 说明 |
|------|------|
| `/help` | 显示帮助信息 |
| `/status` | 查看各角色状态 |
| `/tasks` | 列出所有任务 |
| `/inbox <role>` | 查看角色收件箱 |
| `/dispatch <role> <desc>` | 手动分发任务到角色 |
| `/skills` | 列出已安装技能 |
| `/skill install <url>` | 从 GitHub 安装技能 |
| `/skill remove <name>` | 卸载技能 |
| `/compact` | 切换紧凑输出模式 |
| `/exit` | 退出 |

---

## 工作流程

```
用户输入
  │
  ├─ 普通聊天 → Brain 直接回复
  │
  └─ 任务意图 → Brain 拆解 → 分发到角色信箱
       │
       ├─ PM: 追问需求 → 产出 PRD (交互式)
       ├─ UI: 设计规范 → design_system.md
       ├─ Dev: 技术实现 → 写出代码文件
       ├─ Tester: 测试用例 → 测试报告
       └─ Admin: 项目归档 → 总结报告
```

---

## License

[Apache License 2.0](LICENSE)
