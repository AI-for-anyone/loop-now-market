# Loop Now 插件市场

[Loop Now](https://github.com/AI-for-anyone/loop-now) 官方插件市场的索引仓库。索引就是根目录的 `loop-now-market.json`，Loop Now 服务端通过这个地址读取它：

```
https://raw.githubusercontent.com/AI-for-anyone/loop-now-market/main/loop-now-market.json
```

## 索引格式

```json
{
  "name": "Loop Now 官方插件市场",
  "plugins": [
    {
      "id": "example",
      "source": "git:https://github.com/someone/loop-now-plugin-example@v1.0.0",
      "version": "1.0.0",
      "displayName": "示例插件",
      "description": "一句话说明它为 Agent 或平台增加了什么。",
      "verified": true
    }
  ]
}
```

- 一个插件一条，按 `id` 字母顺序排列。`id` 必须与插件 `package.json` 里 `loopNow.id` 一致。
- `displayName`、`description` 可以写成字符串，也可以按语言写成对象，如 `{ "zh-CN": "示例插件", "en-US": "Example plugin" }`：键是语言标签（zh-CN、en-US、en 等），至少一项；`description` 每项 1 到 200 个字符。Loop Now 按控制台的语言显示。
- `source` 写 `git:<https 地址>@<tag>` 或 `npm:<包名>`。`version` 是当前收录的版本；git 条目的 tag 必须对应这个版本，npm 条目的版本必须已发布。
- 发新版本同样提 PR，改 tag（或只改 `version`）。Loop Now 按 `version` 判断是否提示更新；安装时固定到精确的提交或 npm 版本，不会自动升级。
- 收录进官方市场的插件在 Loop Now 里免确认安装，所以每条都会被维护者审阅。`verified` 只对非官方市场有意义：其他市场里标为 `true` 的条目同样免确认。

## 提交插件

1. 插件须通过 Loop Now 仓库里宿主的校验：`node plugins/host/dist/main.js validate <插件目录>`。插件写法见 Loop Now 仓库的 `plugins/SPEC.md` 与 `plugins/official/hello`。
2. Fork 本仓库，在 `loop-now-market.json` 里加上或修改你的条目。
3. 本地检查：`node scripts/check.mjs` 只查格式；`node scripts/check.mjs --fetch` 会取回每个条目并核对清单里的 id 与版本（需要 git 与 npm；设置 `LOOP_NOW_HOST_ENTRY` 指向宿主的 `main.js` 时会同时运行宿主校验）。
4. 开 PR，说明插件做什么、Agent 半边和平台半边各有什么、订阅的事件和申请的权限。CI 跑的就是上面的检查。

## 自建市场

把同样格式的 JSON 放到任何 https 地址，在 Loop Now 全局设置的插件市场里加上即可。

---

## English

This repository is the index of the official [Loop Now](https://github.com/AI-for-anyone/loop-now) plugin market. The index is `loop-now-market.json` at the repository root, read by the Loop Now server from the raw URL above.

One entry per plugin, sorted by `id`. `source` is `git:<https url>@<tag>` or `npm:<package name>`; `version` is the version currently listed. `displayName` and `description` are either strings or objects keyed by language tag, such as `{ "zh-CN": "示例插件", "en-US": "Example plugin" }`, with at least one entry; each `description` is 1 to 200 characters. Loop Now shows them in the console's language. Entries in the official market install without confirmation in Loop Now, so every entry is reviewed before merge.

To submit a plugin: make sure it passes `node plugins/host/dist/main.js validate <dir>` from the Loop Now repository, add your entry, run `node scripts/check.mjs` (format) and `node scripts/check.mjs --fetch` (fetches each entry and checks its manifest), then open a pull request describing what the plugin does, what it adds on the Agent and platform sides, and which events and permissions it needs. New releases are submitted the same way.

Any JSON file in this format served over https can be added as an extra market in Loop Now's global settings.
