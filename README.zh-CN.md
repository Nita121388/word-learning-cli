# Word Learning CLI 中文说明

本项目是一个本地优先的英语单词学习系统，面向命令行、AI agent 和 Obsidian 使用。

它把结构化数据保存在 SQLite 中，同时写入 JSONL 操作日志，并为 Obsidian 生成少量受控 Markdown 视图。SQLite 是事实数据源，生成出来的 Obsidian Markdown 主要用于阅读和复习，不建议手动修改。

## 项目结构

- `packages/core`：核心领域模型、SQLite schema、复习调度、词典导入、Obsidian 视图生成。
- `packages/cli`：Node.js 命令行工具，正式提供 `wl` 和 `wordcli` 两个跨平台命令；`wl` 适合日常使用，`wordcli` 保留给旧脚本兼容。
- `packages/obsidian-plugin`：Obsidian 桌面插件，复用 core 包能力。
- `docs/cli.md`：CLI 命令速查。

## 环境要求

- Node.js 25+。CLI 使用 Node 内置的实验性 `node:sqlite`。
- pnpm 10+。仓库当前配置为 `pnpm@10.32.1`。

如果运行时没有 `node:sqlite`，CLI 无法正常使用 SQLite。Obsidian 插件会降级为在线查词和发音播放，但保存单词、本地 ECDICT 查词、复习排程和生成视图都需要 SQLite 支持。

## 开发使用

```bash
pnpm install
pnpm build
pnpm test
pnpm --filter @word-learning/cli dev -- --help
```

打包 CLI：

```bash
pnpm pack:cli
```

打包 Obsidian 插件：

```bash
pnpm pack:plugin
```

插件 zip 会生成到：

```text
dist/obsidian-plugin/word-learning.zip
```

## CLI 快速开始

CLI 不强制使用 Obsidian。你有两种常用方式：

- 使用 `--db`：直接指定 SQLite 数据库文件，适合纯命令行或脚本使用。
- 使用 `--vault`：指定 Obsidian vault，CLI 会把数据库放在 `<vault>/.word-learning/user.sqlite`，并且可以生成 Obsidian Markdown 视图。

推荐先设置默认数据库位置，这样日常命令不用每次输入路径。

安装后会有两个命令：

- `wl`：短命令，推荐日常使用。
- `wordcli`：完整命令名，保留给脚本和兼容用途。

纯命令行模式：

```bash
wl config set db ~/.word-learning/user.sqlite
wl --db ~/.word-learning/user.sqlite init
```

添加一个单词：

```bash
wl add precise --meaning-zh "精确的" --tag writing
```

Obsidian 集成模式：

```bash
wl config set vault ~/Documents/MyVault
wl --vault ~/Documents/MyVault init
```

添加一个单词：

```bash
wl add precise --meaning-zh "精确的" --tag writing
```

查看单词：

```bash
wl get precise
wl g precise
```

查看待复习单词：

```bash
wl due --limit 20
wl review due --limit 20
```

提交复习结果：

```bash
wl review answer precise --rating good
```

常用复习评分：

- `again`：不认识，需要重新学。
- `hard`：有点熟悉，但还不稳定。
- `good`：认识，正常进入下一轮。

## 全局选项

常用全局选项需要放在子命令前：

```bash
wl --vault <obsidian-vault> <command>
wl --db <user.sqlite> <command>
wl config set vault <obsidian-vault>
wl config set db <user.sqlite>
wl --json <command>
wl --review-algorithm simple_v1 <command>
wl --review-algorithm fsrs_v1 <command>
```

说明：

- `--db`：直接指定 SQLite 数据库路径，不需要 Obsidian。
- `--vault`：指定 Obsidian vault，数据库默认写入 `<vault>/.word-learning/user.sqlite`，并支持刷新 Obsidian 生成视图。
- `config set db`：保存默认 SQLite 数据库路径。
- `config set vault`：保存默认 Obsidian vault 路径。
- `--json`：输出机器可读 JSON，适合脚本和 AI agent。
- `--review-algorithm`：给新添加的单词选择复习算法。

路径优先级：

```text
命令行 --db / --vault
> 环境变量 WORDCLI_DB / WORDCLI_VAULT
> 用户配置 ~/.config/wordcli/config.json
> 当前目录 ./.word-learning/user.sqlite
```

查看当前配置：

```bash
wl config show
```

清除默认路径：

```bash
wl config unset db
wl config unset vault
```

常用短命令：

```bash
wl g precise
wl a precise --meaning-zh "精确的"
wl due
wl d
```

## 单词管理

添加或更新单词：

```bash
wl add retain \
  --meaning-zh "记住；保留" \
  --meaning-en "to keep something" \
  --phonetic "/rɪˈteɪn/" \
  --pos verb \
  --example "Try to retain the main idea." \
  --note "和 remember 接近，但更强调保留住"
```

更新字段：

```bash
wl update retain --status learning --note "需要重点复习"
```

支持的状态：

- `new`
- `learning`
- `mastered`
- `suspended`
- `archived`

导入单词文件：

```bash
wl import words.csv --tag imported
wl import words.tsv --format tsv
wl import words.json --format json
```

## 标签

添加标签：

```bash
wl tag add precise writing adjective
```

移除标签：

```bash
wl tag remove precise adjective
```

列出标签：

```bash
wl tag list
```

按标签查看待复习词：

```bash
wl due --tag writing --limit 20
```

## 复习算法

默认复习算法是 `simple_v1`。也可以使用可选的 `fsrs_v1`：

```bash
wl --review-algorithm fsrs_v1 add durable --meaning-zh "持久的"
wl review answer durable --rating good
```

注意：`--review-algorithm` 只影响新添加单词的初始 schedule。已有单词会继续使用数据库里保存的 `schedules.algorithm`。

core 包暴露了 `ReviewScheduler` 接口，可以接入自定义调度器而不改变 CLI 命令。

## 词典查询

导入本地 ECDICT CSV 到词典缓存：

```bash
wl dictionary import-ecdict /path/to/ecdict.csv
```

查询本地 ECDICT：

```bash
wl lookup precise
```

查询并保存第一个词典结果：

```bash
wl lookup precise --save
```

使用在线 Free Dictionary API：

```bash
wl lookup hello --source free-dictionary
```

同时查询本地和在线来源：

```bash
wl lookup hello --source all --save
```

支持的查询来源：

- `ecdict`：本地 ECDICT 缓存。
- `free-dictionary`：在线 Free Dictionary API。
- `all`：先查本地 ECDICT，再查在线 Free Dictionary API。

保存词典结果时，来源信息会写入 `word_sources`，便于追踪内容来自哪个 provider。在线词条可能包含 `audioUrl`，Obsidian 插件可用于播放发音。

## 例句、词根和关系图

添加例句，并关联到单词：

```bash
wl sentence "Use precise words." \
  --translation-zh "使用精确的词。" \
  --word precise
```

添加词根、前缀或后缀：

```bash
wl morpheme add pre --type prefix --meaning-zh "在前；预先"
```

把单词和词素关联起来：

```bash
wl morpheme link preview pre --position prefix
```

查看一个单词相关的单词、例句、词素和关系：

```bash
wl graph word precise
```

## Obsidian 视图

刷新生成的 Obsidian Markdown 视图：

```bash
wl views refresh
```

生成内容会写到 vault 下的 `单词学习/` 目录。

数据库默认位置：

```text
<vault>/.word-learning/user.sqlite
```

本地 ECDICT 缓存默认位置：

```text
<vault>/.word-learning/dictionaries/ecdict.sqlite
```

## Obsidian 插件

插件是桌面端 MVP，主要功能：

- 侧边栏查词。
- 保存单词到学习库。
- 查看待复习单词并提交复习结果。
- 刷新生成视图。
- 从设置页或命令面板导入 ECDICT CSV。
- 使用在线 Free Dictionary 查词。
- 当查询结果包含音频链接时播放发音。
- 在设置页选择新单词使用 `simple_v1` 或 `fsrs_v1`。

命令面板动作：

- Lookup selected word
- Add selected word
- Open today review
- Refresh generated views

## 维护命令

查看统计：

```bash
wl stats
```

备份 SQLite 数据库：

```bash
wl backup
```

修复缺失的 schedule 和基础数据库不变量：

```bash
wl repair
```

## 数据安全提示

- SQLite 是事实数据源。
- `单词学习/` 下的 Markdown 是生成视图，建议通过 CLI 或插件刷新，不要手动维护。
- 不要直接编辑 `.word-learning/user.sqlite`。
- 自动化调用优先使用 `--json`。
- 在线 Free Dictionary 不保证每个单词都有中文翻译或发音。

## 相关文档

- [CLI 命令速查](docs/cli.md)
- [CLI package README](packages/cli/README.md)
- [Obsidian plugin README](packages/obsidian-plugin/README.md)
