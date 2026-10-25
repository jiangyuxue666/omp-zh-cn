# OMP 简体中文扩展

[![Release](https://img.shields.io/github/v/release/jiangyuxue666/omp-zh-cn?label=release)](https://github.com/jiangyuxue666/omp-zh-cn/releases)
![OMP](https://img.shields.io/badge/OMP-18.12.6-orange)
[![License](https://img.shields.io/github/license/jiangyuxue666/omp-zh-cn)](LICENSE)
![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows-blue)
[![Stars](https://img.shields.io/github/stars/jiangyuxue666/omp-zh-cn)](https://github.com/jiangyuxue666/omp-zh-cn/stargazers)
[![Issues](https://img.shields.io/github/issues/jiangyuxue666/omp-zh-cn)](https://github.com/jiangyuxue666/omp-zh-cn/issues)

> 适配 **OMP 18.12.6** · macOS / Linux / Windows · 本地词典，无需联网

为 OMP（Oh My Pi）提供简体中文界面翻译的本地扩展。它使用本地词典翻译 OMP 自带的命令说明、设置项和部分界面提示，无需联网、额外模型或 Python 环境。

## 功能特性

- 汉化 OMP 内置命令的帮助说明与补全候选，包括官方随附的 `/review`、`/annotate`、`/green` 等。
- 汉化设置项、选项标签的说明文本。
- 纯本地词典匹配，不调用在线翻译服务，不上传任何数据。
- 保留命令名、设置名、选项标签、键位、模型 ID 和实际配置值，只翻译解释性文字。
- 提供 `/zh on`、`/zh off`、`/zh status` 开关，可随时关闭汉化。
- 不修改 OMP 官方可执行文件，不接管命令执行和设置保存逻辑。

## 快速开始

### 1. 下载

前往 [Releases](https://github.com/jiangyuxue666/omp-zh-cn/releases) 下载最新发行版压缩包，例如 `omp-zh-cn-v1.0.0.zip`。

也可以直接克隆仓库：

```sh
git clone https://github.com/jiangyuxue666/omp-zh-cn.git
```

### 2. 解压到扩展目录

不论使用 macOS、Linux 还是 Windows，操作都一样：把压缩包内的文件解压到 OMP 的扩展目录下的 `zh-cn` 文件夹中。请确认解压后 `index.ts`、`zh.json`、`settings-desc.json` **直接位于** `zh-cn` 目录下，不要再套一层文件夹。

各平台扩展目录路径：

| 平台 | 扩展目录 |
| --- | --- |
| macOS | `~/.omp/agent/extensions/zh-cn/` |
| Linux | `~/.omp/agent/extensions/zh-cn/` |
| Windows | `%USERPROFILE%\.omp\agent\extensions\zh-cn\` |

macOS / Linux 也可以直接执行：

```sh
mkdir -p ~/.omp/agent/extensions/zh-cn
unzip omp-zh-cn-v1.0.0.zip -d ~/.omp/agent/extensions/zh-cn
```

Windows PowerShell 可以执行：

```powershell
New-Item -ItemType Directory -Force "$HOME\.omp\agent\extensions\zh-cn" | Out-Null
Expand-Archive .\omp-zh-cn-v1.0.0.zip -DestinationPath "$HOME\.omp\agent\extensions\zh-cn" -Force
```

### 3. 重启 OMP

安装或更新后需要重启 OMP。进入后执行：

```text
/zh status
```

如果显示已接入，说明扩展加载成功。

### 不想安装？直接加载

解压或克隆后，在项目目录中运行：

```sh
omp -e ./index.ts
```

macOS、Linux 和 Windows PowerShell 都支持这种显式加载方式。注意不要同时自动加载扩展目录里的副本和 `-e` 指定的副本。

### 更新与卸载

- **更新**：下载新版本压缩包，覆盖 `zh-cn` 目录中的文件，然后重启 OMP。
- **卸载**：删除 `zh-cn` 目录（或其中的扩展文件），然后重启 OMP。`/zh off` 只是关闭翻译，不会卸载扩展。

## 使用

| 命令 | 作用 |
| --- | --- |
| `/zh status` | 查看汉化接入状态 |
| `/zh on` | 开启汉化 |
| `/zh off` | 关闭汉化 |

开关只作用于当前 OMP 进程，不会写入语言配置。已经打开的静态帮助面板需要关闭再重新打开才会刷新。

## 目录结构

```text
omp-zh-cn/
├── index.ts           # 扩展入口与界面翻译逻辑
├── zh.json            # 命令、帮助和界面词典
├── settings-desc.json # 设置与选项说明词典
├── README.md
├── CHANGELOG.md
└── LICENSE
```

运行时只需要前三个文件，安装时请全部保留。

## 兼容性

- 已在 macOS、Linux 和 Windows 上通过验证，OMP 版本 18.12.6。
- 其他 OMP 版本尚未实际验证。
- 扩展依赖 OMP 的内部组件接口，OMP 升级后可能需要相应调整。

## 常见问题

### 安装后界面还是英文？

请依次检查：

1. `index.ts`、`zh.json`、`settings-desc.json` 是否直接位于 `zh-cn` 目录下，而不是多套了一层文件夹。
2. 是否已经重启 OMP。
3. 执行 `/zh status`，确认汉化处于开启状态。
4. 是否同时通过扩展目录自动加载和 `omp -e` 加载了两份副本。

### 支持哪些 OMP 版本？

目前已在 OMP 18.12.6 上验证。其他版本可能可用，但 OMP 内部接口变化时可能需要调整。

### 会上传我的数据吗？

不会。扩展只读取仓库内的本地 JSON 词典并在界面显示时做匹配，不调用网络接口，也不会上传任何内容。

### 会修改 OMP 本体吗？

不会。扩展不修改 OMP 官方可执行文件，也不接管命令执行和设置保存逻辑。

### 为什么有些文字仍然是英文？

扩展只翻译已接入的内置说明和提示。未接入、未收录或受布局限制的文字可能保持英文，欢迎通过 Issue 或 Pull Request 补充词典。

## 工作原理与边界

扩展读取 OMP 的内置元数据，包装指定界面组件和命令补全方法，在显示时匹配本地词典或指定模板。

- 只翻译已接入的内置说明和提示。
- 不对用户输入、模型回复、工具输出、文件内容或第三方扩展说明做全局翻译扫描。
- 未接入、未收录或受布局限制的文字可能保持英文，因此不保证所有界面文字都已汉化。
- `/zh off` 只关闭翻译，不会卸载运行时包装；要完全移除，请删除扩展目录中的文件并重启 OMP。

已在 OMP 18.12.6 中检查官方随附命令的同步/异步候选、汉化开关、用户同名覆盖和第三方同文案保护，以及 76 列/256 色、170 列/真彩色界面。其他前端、全部条件设置、错误和认证分支、长期运行及插件组合仍需进一步验证。

## 参与贡献

欢迎提交 Issue 或 Pull Request 补充词典、修正翻译。提交前请确认：

- 不修改命令名、设置名、选项标签、键位、模型 ID 和配置值。
- 新增词典条目保持 JSON 格式合法。
- 说明改动的适用 OMP 版本。

## 许可证

本项目采用 [MIT License](LICENSE)。
