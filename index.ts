/** Localize OMP-owned metadata and components. Never intercept terminal output. */
import { appendFileSync, writeFileSync } from "node:fs";
import { AsyncLocalStorage } from "node:async_hooks";
import dictionary from "./zh.json";
import descriptions from "./settings-desc.json";

type AnyObject = Record<string, any>;
type Context = { ui: { notify(text: string, level?: string): void } };
type Extension = {
 registerCommand(name: string, command: { description: string; handler(args: string, ctx: Context): void }): void;
 registerFileDeleteFallback?(handler: () => boolean): void;
 setLabel(label: string): void;
};
type Shared = { enabled: boolean; revision: number; failures: number; features: string[]; unavailable: string[]; restore: Array<() => void> };
const OWNER = Symbol.for("omp.zh-cn.components.v2");
const globals = globalThis as typeof globalThis & { [OWNER]?: Shared };
const state: Shared = globals[OWNER] ??= {
 enabled: !/^(?:0|off)$/i.test(process.env.OMP_ZH ?? ""), revision: 0, failures: 0,
 features: [], unavailable: [], restore: [],
};
const normalize = (text: string) => text.replace(/\s+/g, " ").trim();
const phrases = new Map<string, string>([...Object.entries(descriptions), ...Object.entries(dictionary)].map(([en, zh]) => [normalize(en), zh]));
const settingIds = new Set<string>();
const settingNames = new Set<string>();
let settingsCatalog: AnyObject = {};
let initialized: Promise<void> | undefined;
let scope: "setting" | undefined;
const logPath = process.env.OMP_ZH_LOG;
const logged = new Set<string>();
let logBytes = 0;

function missing(text: string, area: string): void {
 if (!(area.startsWith("setting:") || ["setting-option", "builtin-command", "welcome-tip"].includes(area))) return;
 if (!logPath || !/[A-Za-z]/.test(text) || logged.size >= 4000 || logBytes >= 512_000) return;
 const key = `${area}:${text}`;
 if (logged.has(key)) return;
 logged.add(key);
 const line = JSON.stringify({ scope: area, text: text.slice(0, 2000) }) + "\n";
 logBytes += Buffer.byteLength(line);
 try { appendFileSync(logPath, line, { mode: 0o600 }); } catch { /* diagnostics are optional */ }
}

const dynamic: Array<[RegExp, (...values: string[]) => string]> = [
 [/^Compact: context (\d+)% used$/, n => `压缩：上下文已用 ${n}%`],
 [/^(\d+) skills?$/, n => `${n} 个技能`],
 [/^Model: (.+)$/, id => `模型：${id}`],
 [/^Tools: (\d+) active \/ (\d+) available$/, (a, n) => `工具：启用 ${a} / 可用 ${n}`],
 [/^Context: (\d+)% \(([\d,]+)\/([\d,]+)\)$/, (p, a, n) => `上下文：${p}% (${a}/${n})`],
 [/^Thinking: (\w+)$/, level => `思考强度：${level}`],
 [/^Force: (\d+) active tools$/, n => `强制：启用 ${n} 个工具`],
 [/^Celebrate unscheduled Codex weekly usage resets and newly banked saved resets with a top-third fireworks overlay that remains until (.+)$/, key => `当 Codex 周用量意外重置或新增已保存重置次数时，在屏幕上方显示烟花，持续到按下 ${key}`],
 [/^Capture mouse clicks in the main session so live subagent cards and HUD rows focus on click, with a hover highlight on the target\. Native text selection becomes (.+)\+drag and wheel scroll becomes (.+)\+wheel while on$/, (a, b) => `捕获主会话中的鼠标点击，点击子智能体卡片和 HUD 行可聚焦，悬停时高亮。开启后，文本选择使用 ${a}+drag，滚轮滚动使用 ${b}+wheel`],
 [/^Modal prompt editing\. (.+) leaves Insert mode; Normal mode has hjkl, 0, \$, \^, w, b, e, gg, G, counts, x\/D\/C, dd\/yy, p and u; operators take motions or text objects \(diw, ca\(, dap\); v\/V start a Visual selection that y copies and d deletes$/, key => `使用 Vim 模态编辑。${key} 退出 Insert 模式；Normal 模式支持 hjkl、0、$、^、w、b、e、gg、G、计数、x/D/C、dd/yy、p 和 u；操作符可接移动或文本对象（diw、ca(、dap）；v/V 开始 Visual 选择，y 复制，d 删除`],
 [/^Keep drafts cleared with (.+) in local (.+) history until exit; disabling affects future clears$/, (key, history) => `用 ${key} 清空的草稿保留在本地 ${history} 历史中，直到退出；关闭后仅影响后续清空操作`],
 [/^What pressing (.+) twice with an empty editor does: open the transcript rewind selector, open the session tree, or nothing$/, key => `编辑器为空时连按两次 ${key} 的操作：打开会话回退选择器、打开会话树或不执行操作`],
 [/^After a completed turn, ask the active model to predict your next message and show it as ghost text in the empty composer; (.+) or (.+) inserts it without sending\. Extra usage: every completed turn sends one more billed request over the whole conversation \(counted in \/stats\)$/, (a, b) => `每轮完成后，请当前模型预测下一条消息，并在空输入框中显示；按 ${a} 或 ${b} 插入而不发送。额外用量：每轮都会对整个对话再发一次计费请求（计入 /stats）`],
 [/^When a provider reports usage-limit exhaustion with a reset time \(5-hour or weekly quota windows on any provider\), sleep until the reset instead of failing fast past retry\.maxDelayMs\. Waits are abortable \((.+)\) but also hold subagents, so leave off for unattended runs\.$/, key => `供应商报告用量耗尽和重置时间时，等待 5 小时或每周配额窗口重置，而不是超过 retry.maxDelayMs 后立即失败。按 ${key} 可中止等待；等待也会阻塞子智能体，无人值守运行时建议关闭`],
 [/^Hard timeout for each provider's search transport before web_search advances to the next fallback, in seconds \(maximum (\d+)\)$/, max => `每个搜索供应商的硬超时秒数，超时后 web_search 切换到下一后备供应商（最大 ${max}）`],
];

/** Exact metadata only. No prefix guessing or sentence substrings. */
export function translateText(text: string, area = "metadata"): string {
 if (!state.enabled || typeof text !== "string" || !text) return text;
 const key = normalize(text);
 const direct = phrases.get(key);
 if (direct) return direct;
 for (const [pattern, build] of dynamic) {
  const hit = pattern.exec(key);
  if (hit) return build(...hit.slice(1));
 }
 missing(key, area);
 return text;
}

function patch(proto: AnyObject | undefined, key: string, wrap: (original: (...args: any[]) => any) => (...args: any[]) => any): boolean {
 if (!proto || typeof proto[key] !== "function") return false;
 const own = Object.getOwnPropertyDescriptor(proto, key);
 const original = proto[key];
 const replacement = wrap(original);
 try {
  Object.defineProperty(proto, key, { configurable: true, writable: true, value: replacement });
  const target = new WeakRef(proto);
  state.restore.push(() => {
   const object = target.deref();
   if (!object || object[key] !== replacement) return;
   if (own) Object.defineProperty(object, key, own); else delete object[key];
  });
  return true;
 } catch { return false; }
}

function temporary<T>(object: AnyObject, key: string, value: any, run: () => T): T {
 const original = Object.getOwnPropertyDescriptor(object, key);
 if (object[key] === value) return run();
 if (original && !original.configurable) return run();
 try { Object.defineProperty(object, key, { configurable: true, writable: true, enumerable: original?.enumerable ?? true, value }); } catch { return run(); }
 try { return run(); }
 finally { if (original) Object.defineProperty(object, key, original); else delete object[key]; }
}

// ANSI handling is limited to text returned by named OMP UI components. Escape
// bytes and row geometry are preserved; text layout stays in OMP's components.
const SGR = /\x1b\[[0-9;:]*m/g;
const width = (text: string): number => {
 let n = 0;
 for (const char of text) {
  const cp = char.codePointAt(0)!;
  if (/\p{Mark}/u.test(char) || cp === 0x200d || cp === 0xfe0f) continue;
  n += cp >= 0x1100 && (cp <= 0x115f || cp >= 0x2e80 && cp <= 0xa4cf || cp >= 0xac00 && cp <= 0xd7a3 || cp >= 0xf900 && cp <= 0xfaff || cp >= 0xfe10 && cp <= 0xfe6f || cp >= 0xff01 && cp <= 0xff60 || cp >= 0xffe0 && cp <= 0xffe6 || cp >= 0x1f300 && cp <= 0x1faff) ? 2 : 1;
 }
 return n;
};
function fitted(original: string, translated: string): string {
 const spare = width(original) - width(translated);
 return spare < 0 ? original : translated + " ".repeat(spare);
}

const hintActions: Record<string, string> = {
 "to change": "修改", "to jump sections": "跳转分区", "to jump tabs": "切换标签页",
 "to switch tabs": "切换标签页", "to settings": "进入设置", "to exit search": "退出搜索",
 "to close": "关闭", "to go back": "返回", "to select": "选择", "to save": "保存", "to cancel": "取消",
 "scroll": "滚动", "select": "选择", "to edit search": "编辑搜索",
};
function hint(text: string, preserveWidth = true): string {
 // Each segment must start with a key name; keys themselves remain unchanged.
 return text.split(/(\s*·\s*)/).map(part => {
  const direct = phrases.get(part.trim());
  if (direct) return preserveWidth ? fitted(part, direct) : direct;
  const hit = /^(\s*(?:[A-Za-z][A-Za-z0-9+\-]*(?:\/[A-Za-z][A-Za-z0-9+\-]*)*|[←→↑↓/]+)\s+)(.+?)(\s*)$/.exec(part);
  if (!hit) return phrases.get(part.trim()) ?? part;
  const action = hintActions[hit[2]] ?? phrases.get(hit[2]);
  return action ? (preserveWidth ? fitted(part, hit[1] + action + hit[3]) : hit[1] + action + hit[3]) : part;
 }).join("");
}
function exactRun(text: string, area: string): string {
 const core = text.trim();
 if (!core || area === "model" && !core.includes(" ")) return text;
 const translated = translateText(core, area);
 return translated === core ? text : fitted(text, text.slice(0, text.indexOf(core)) + translated);
}
function chrome(line: string, area: string): string {
 return line.split(/(\x1b\[[0-9;:]*m)/).map(part => {
  if (part.startsWith("\x1b")) return part;
  if (area === "session") {
   // Localize field labels, never the field values (names, ids, paths, etc.).
   part = part.replace(/\b(File|Build|Name|Model|API|Auth|Endpoint|Source|User|Assistant|Tool Calls|Tool Results|Total|Input|Output|Append-Only):(?=\s)/g, label => fitted(label, translateText(label.slice(0, -1), "session-label") + ":"));
  }
  if (part.includes("·") || /(?:PgUp|Up\/Down).*scroll/.test(part)) return hint(part);
  // Hotkeys table cells are known OMP chrome. No message/skill/plugin tables.
  if (area === "hotkeys" && /[|│]/.test(part)) {
   return part.split(/([|│])/).map(cell => /^[|│]$/.test(cell) ? cell : exactRun(cell, area)).join("");
  }
  return exactRun(part, area);
 }).join("");
}
function ownText(text: string): string {
 // A setting form's Text contains only form chrome/metadata. Input is a separate
 // component, and plugin settings never enter this scope.
 return text.split(/(\x1b\[[0-9;:]*m)/).map(part => part.startsWith("\x1b") || settingNames.has(normalize(part)) ? part : translateText(part, "setting-form")).join("");
}

function suggestions(result: any, builtinNames: Set<string>, commandLine: string, icons: Map<string, string>, bundled: Set<string>): any {
 if (!state.enabled || !Array.isArray(result?.items) || !/^\/[\w:-]*$/.test(commandLine)) return result;
 return { ...result, items: result.items.map((item: AnyObject) => {
  if (item.value === "skill:") return { ...item, description: translateText(item.description, "skill-count") };
  if (!builtinNames.has(item.value)) return item;
  if (icons.has(item.value) && item.iconName !== icons.get(item.value)) return item;
  if (bundled.has(item.value) && item.iconName !== "prompt") return item;
  return { ...item, description: translateText(item.description, "builtin-command") };
 }) };
}

async function install(): Promise<void> {
 for (const restore of state.restore.splice(0).reverse()) restore();
 state.features = []; state.unavailable = [];
 const modules = await Promise.allSettled([
  import("@oh-my-pi/pi-tui"),
  import("@oh-my-pi/pi-coding-agent/config/all-settings"),
  import("@oh-my-pi/pi-coding-agent/slash-commands/builtin-registry"),
  import("@oh-my-pi/pi-coding-agent"),
  import("@oh-my-pi/pi-tui/hotkeys-markdown"),
  import("@oh-my-pi/pi-tui/overlays/session-info-overlay"),
  import("@oh-my-pi/pi-coding-agent/modes/controllers/command-controller"),
  import("@oh-my-pi/pi-tui/overlays/model-hub"),
  import("@oh-my-pi/pi-tui/overlays/model-browser"),
  import("@oh-my-pi/pi-coding-agent/modes/controllers/input-controller"),
 ]);
 const values = modules.map((result, i) => {
  if (result.status === "fulfilled") return result.value as AnyObject;
  state.unavailable.push(["TUI", "设置目录", "命令目录", "界面组件", "快捷键", "会话信息", "命令面板", "模型面板", "模型列表", "输入控制器"][i]);
  return {} as AnyObject;
 });
 const [tui, settings, commands, app, hotkeys, session, controller, modelHub, modelBrowser, input] = values;
 if (typeof settings.orderedSettings === "function") {
  for (const setting of settings.orderedSettings()) {
   if (!setting.ui) continue;
   settingIds.add(setting.id);
   settingNames.add(normalize(setting.ui.label ?? ""));
   if (Array.isArray(setting.ui.options)) for (const option of setting.ui.options) settingNames.add(normalize(option.label ?? ""));
   settingsCatalog[setting.id] = {
    label: setting.ui.label, description: setting.ui.description,
    options: Array.isArray(setting.ui.options) ? setting.ui.options.map((o: AnyObject) => ({ value: o.value, label: o.label ?? "", description: o.description ?? "" })) : [],
   };
  }
 }
 // Maintenance export: actual evaluated metadata, without binary regex parsing.
 if (process.env.OMP_ZH_CATALOG) writeFileSync(process.env.OMP_ZH_CATALOG, JSON.stringify(settingsCatalog, null, 1), { mode: 0o600 });
 const builtin = commands.BUILTIN_SLASH_COMMANDS_INTERNAL ?? [];
 const builtinNames = new Set<string>(builtin.flatMap((c: AnyObject) => [c.name, ...(c.aliases ?? [])]));
 const builtinIcons = new Map<string, string>(builtin.flatMap((c: AnyObject) => [c.name, ...(c.aliases ?? [])].map(name => [name, c.icon ?? "action"])));
 const bundledNames = new Set<string>();
 const updateBundled = (entries: AnyObject[]) => {
  if (!Array.isArray(entries)) return;
  for (const name of bundledNames) builtinNames.delete(name);
  bundledNames.clear();
  for (const command of entries) if (command.source === "bundled") { builtinNames.add(command.name); bundledNames.add(command.name); }
 };
 if (typeof app.discoverSlashCommands === "function") {
  try { updateBundled(await app.discoverSlashCommands({ cwd: process.cwd() })); }
  catch { state.unavailable.push("内置提示词来源"); }
 }
 patch(app.InteractiveMode?.prototype, "refreshSlashCommandState", original => async function(this: AnyObject, ...args: any[]) {
  const result = await original.apply(this, args);
  updateBundled(this.session.slashCommands);
  return result;
 });
 if (process.env.OMP_ZH_COMMANDS) writeFileSync(process.env.OMP_ZH_COMMANDS, JSON.stringify(builtin.map((c: AnyObject) => ({ name: c.name, description: c.description, subcommands: c.subcommands })), null, 1), { mode: 0o600 });

 for (const method of ["render", "describe"]) {
  patch(tui.SettingsList?.prototype, method, original => function(this: AnyObject, ...args: any[]) {
   const selected = this.getSelectedItem?.();
   const previous = scope;
   scope = settingIds.has(selected?.id) ? "setting" : undefined;
   try {
    if (!state.enabled || !scope) return original.apply(this, args);
    return temporary(selected, "description", translateText(selected.description, `setting:${selected.id}`), () => original.apply(this, args));
   } finally { scope = previous; }
  });
  patch(tui.Text?.prototype, method, original => function(this: AnyObject, ...args: any[]) {
   if (!state.enabled || scope !== "setting" || (typeof this.getText !== "function" || typeof this.setText !== "function")) return original.apply(this, args);
   const text = this.getText(); const translated = ownText(text);
   if (text === translated) return original.apply(this, args);
   this.setText(translated);
   try { return original.apply(this, args); } finally { this.setText(text); }
  });
  patch(tui.SelectList?.prototype, method, original => function(this: AnyObject, ...args: any[]) {
   if (!state.enabled || scope !== "setting") return original.apply(this, args);
   const items = this.pickerView?.().items ?? [];
   const run = (index: number): any => index === items.length ? original.apply(this, args)
    : temporary(items[index], "description", translateText(items[index].description, "setting-option"), () => run(index + 1));
   return run(0);
  });
 }
 if (settingIds.size && tui.SettingsList) state.features.push(`设置 ${settingIds.size} 项及选择器`);

 const seen = new WeakMap<object, number>();
 const areas: Array<[any, string]> = [[hotkeys.HotkeysSheetComponent, "hotkeys"], [session.SessionInfoOverlay, "session"], [app.SettingsSelectorComponent, "settings"]];
 for (const [component, area] of areas) {
  if (patch(component?.prototype, "render", original => function(this: AnyObject, ...args: any[]) {
   if (seen.get(this) !== state.revision) { this.invalidate?.(); seen.set(this, state.revision); }
   const fg = app.theme?.fg;
   const draw = () => original.apply(this, args);
   const lines = state.enabled && area === "settings" && typeof fg === "function"
    ? temporary(app.theme, "fg", function(this: AnyObject, tone: string, text: string, ...rest: any[]) {
       const localized = tone === "dim" && typeof text === "string" && text.includes("·") && /\bto (?:change|close|switch tabs|jump sections)/.test(text) ? hint(text, false) : text;
       return fg.call(this, tone, localized, ...rest);
      }, draw) : draw();
   if (!state.enabled || !Array.isArray(lines) || lines.some(line => typeof line !== "string")) return lines;
   if (area === "settings") {
    // Only outer chrome. Settings rows, names, values and plugin content are
    // handled separately or preserved, including user-entered search text.
    return lines.map((line: string, i: number) => i === 0 || i >= lines.length - 2 || /(?:No matching settings|No settings available)/.test(line) ? chrome(line, area) : line);
   }
   return lines.map((line: string) => chrome(line, area));
  })) state.features.push(area);
 }

 // Translate the builtin hotkeys source before Markdown performs its layout.
 patch(controller.CommandController?.prototype, "showCommandReport", original => function(this: AnyObject, options: AnyObject) {
  if (!state.enabled || options.title !== "Keyboard Shortcuts" || (typeof hotkeys.buildHotkeysMarkdown !== "function" || typeof tui.Markdown !== "function" || typeof app.getMarkdownTheme !== "function")) return original.call(this, options);
  const source = hotkeys.buildHotkeysMarkdown({ keybindings: this.ctx.keybindings });
  const localized = source.split("\n").map((line: string) => {
   if (line === "| Key | Action |") return "| 键 | 操作 |";
   if (/^\*\*.+\*\*$/.test(line)) return "**" + translateText(line.slice(2, -2), "hotkeys") + "**";
   return line.replace(/^(\|.*\|)([^|]+)(\|\s*)$/, (_: string, keys: string, action: string, tail: string) => keys + " " + translateText(action.trim(), "hotkeys-action") + " " + tail);
  }).join("\n");
  return original.call(this, { ...options, title: translateText(options.title), body: new tui.Markdown(localized, 0, 0, app.getMarkdownTheme()) });
 });

 // Exclude actual model rows from the hub's explanatory chrome pass.
 let browserRows: string[] | undefined;
 patch(modelBrowser.ModelBrowser?.prototype, "render", original => function(this: AnyObject, ...args: any[]) {
  const lines = original.apply(this, args);
  if (!browserRows || !Array.isArray(lines) || lines.some(line => typeof line !== "string")) return lines;
  const localized = state.enabled && this.visibleCount === 0 ? lines.map((line: string) => chrome(line, "model")) : lines;
  browserRows.push(...localized.map((line: string) => line.replace(SGR, "").trim()).filter(Boolean));
  return localized;
 });
 if (patch(modelHub.ModelHubComponent?.prototype, "render", original => function(this: AnyObject, ...args: any[]) {
  if (!state.enabled) return original.apply(this, args);
  const previous = browserRows; const protectedRows: string[] = []; browserRows = protectedRows;
  try {
   const lines = original.apply(this, args);
   if (!Array.isArray(lines) || lines.some(line => typeof line !== "string")) return lines;
   return lines.map((line: string) => protectedRows.some(row => line.replace(SGR, "").includes(row)) ? line : chrome(line, "model"));
  } finally { browserRows = previous; }
 })) state.features.push("模型面板说明");

 // Record provenance without changing command objects or cached descriptions.
 patch(app.ExtensionRunner?.prototype, "getRegisteredCommands", original => function(this: AnyObject, ...args: any[]) {
  const result = original.apply(this, args);
  if (!Array.isArray(result) || !Array.isArray(this.extensions)) return result;
  const command = result.find((item: AnyObject) => item.name === "autoresearch");
  const owner = command && [...this.extensions].reverse().find((extension: AnyObject) => extension.commands?.get(command.name) === command);
  if (/^<inline-\d+>$/.test(owner?.path ?? "")) builtinNames.add("autoresearch");
  else builtinNames.delete("autoresearch");
  return result;
 });

 const proto = tui.CombinedAutocompleteProvider?.prototype;
 patch(proto, "trySyncSlashCompletion", original => function(this: AnyObject, text: string) {
  return suggestions(original.call(this, text), builtinNames, text, builtinIcons, bundledNames);
 });
 if (patch(proto, "getSuggestions", original => async function(this: AnyObject, lines: string[], row: number, column: number, ...args: any[]) {
  return suggestions(await original.call(this, lines, row, column, ...args), builtinNames, Array.isArray(lines) && typeof lines[row] === "string" ? lines[row].slice(0, column) : "", builtinIcons, bundledNames);
 })) state.features.push("内置命令描述");

 // Bundled TS commands (review/annotate/green) are not slash prompt files.
 // Capture provenance for each provider; do not trust a name or displayed suffix.
 if (patch(input.InputController?.prototype, "createAutocompleteProvider", original => function(this: AnyObject, ...args: any[]) {
  const provider = original.apply(this, args);
  const bundled = new Map<string, string>();
  for (const entry of this.ctx?.session?.customCommands ?? []) {
   const name = entry.command?.name;
   const description = entry.command?.description;
   if (typeof name !== "string" || typeof description !== "string" || entry.source !== "bundled"
    || entry.path !== `bundled:${name}` || entry.resolvedPath !== entry.path) continue;
   bundled.set(name, `${description} (bundled)`);
  }
  if (!bundled.size) return provider;
  const localize = (result: any, commandLine: string): any => {
   if (!state.enabled || !/^\/[\w:-]*$/.test(commandLine) || !Array.isArray(result?.items)) return result;
   return { ...result, items: result.items.map((item: AnyObject) =>
    item.iconName === "prompt" && bundled.has(item.value) && bundled.get(item.value) === item.description
     ? { ...item, description: translateText(item.description, "builtin-command") } : item) };
  };
  patch(provider, "trySyncSlashCompletion", run => function(this: AnyObject, text: string) {
   return localize(run.call(this, text), text);
  });
  patch(provider, "getSuggestions", run => async function(this: AnyObject, lines: string[], row: number, column: number, ...rest: any[]) {
   return localize(await run.call(this, lines, row, column, ...rest), Array.isArray(lines) && typeof lines[row] === "string" ? lines[row].slice(0, column) : "");
  });
  return provider;
 })) state.features.push("官方随附命令描述");
 else state.unavailable.push("官方随附命令描述");

 // Async context follows builtin UI handlers across awaits without touching
 // concurrent user/plugin notifications or rebinding their context objects.
 const statusScope = new AsyncLocalStorage<string>();
 for (const command of builtin) {
  if (!["skills", "plugins"].includes(command.name)) continue;
  for (const method of ["handleTui", "handle"]) patch(command, method, original => function(this: AnyObject, ...args: any[]) {
   return statusScope.run(command.name, () => original.apply(this, args));
  });
 }
 patch(app.InteractiveMode?.prototype, "showStatus", original => function(this: AnyObject, text: string, ...args: any[]) {
  let localized = text;
  if (state.enabled && typeof text === "string") {
   if (statusScope.getStore() === "plugins" && text === "No plugins installed") localized = translateText(text);
   if (statusScope.getStore() === "skills" && text.startsWith("Skill registry (skills.omp.sh) commands:")) {
    localized = text.split("\n").map(line => line.replace(/^(\s*\/skills\b.*?\s{2,})(\S.*)$/, (_: string, head: string, body: string) => head + translateText(body, "skills-help"))).join("\n");
    localized = localized.replace("Skill registry (skills.omp.sh) commands:", translateText("Skill registry (skills.omp.sh) commands:"));
   }
  }
  return original.call(this, localized, ...args);
 });

 const welcome = app.WelcomeComponent?.prototype;
 const tip = welcome && Object.getOwnPropertyDescriptor(welcome, "tip");
 if (tip?.get && tip.configurable) {
  const getter = tip.get;
  Object.defineProperty(welcome, "tip", { ...tip, get() { const text = getter.call(this); return typeof text === "string" ? translateText(text, "welcome-tip") : text; } });
  state.restore.push(() => Object.defineProperty(welcome, "tip", tip));
 }
 state.revision++;
}

export default async function zhCn(pi: Extension): Promise<void> {
 // An explicit early-load signal is still necessary on OMP 18.12.6.
 pi.registerFileDeleteFallback?.(() => false);
 try { await (initialized ??= install()); }
 catch { state.enabled = false; state.unavailable.push("初始化失败"); }
 pi.setLabel(state.features.length ? "中文界面" : "中文界面（未启用）");
 pi.registerCommand("zh", {
  description: "中文界面：/zh on · off · status",
  handler(args, ctx) {
   const mode = args.trim().toLowerCase();
   if (mode === "on" || mode === "off") { state.enabled = mode === "on"; state.revision++; }
   const unavailable = state.unavailable.length ? ` · 不兼容：${state.unavailable.join("、")}` : "";
   ctx.ui.notify(`中文界面：${!state.features.length ? "未启用" : state.enabled ? "已开启" : "已关闭"} · 设置 ${settingIds.size} 项 · 词条 ${phrases.size} · 已接入 ${state.features.length} 项${unavailable}`, "info");
  },
 });
}
