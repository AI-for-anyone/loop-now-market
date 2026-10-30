// check.mjs 的静态检查：用临时的索引文件运行它，核对通过与报错。
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(new URL('./check.mjs', import.meta.url))
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-now-market-check-'))
after(() => fs.rmSync(tmp, { recursive: true, force: true }))

const entry = (extra = {}) => ({
  id: 'example',
  source: 'git:https://github.com/someone/loop-now-plugin-example@v1.0.0',
  version: '1.0.0',
  displayName: '示例插件',
  description: '一句话说明。',
  verified: true,
  ...extra,
})

let n = 0
function check(plugins) {
  const file = path.join(tmp, `market-${++n}.json`)
  fs.writeFileSync(file, JSON.stringify({ name: '测试市场', plugins }))
  const r = spawnSync(process.execPath, [script, file], { encoding: 'utf8' })
  return { status: r.status, out: `${r.stdout}${r.stderr}` }
}

describe('check.mjs', () => {
  it('仓库里的索引通过', () => {
    const r = spawnSync(process.execPath, [script], { cwd: fileURLToPath(new URL('..', import.meta.url)), encoding: 'utf8' })
    assert.equal(r.status, 0, r.stdout + r.stderr)
  })

  it('displayName、description 接受字符串或按语言的对象', () => {
    const r = check([
      entry({
        displayName: { 'zh-CN': '示例插件', 'en-US': 'Example plugin' },
        description: { 'zh-CN': '一句话说明。', en: 'One line about it.', 'zh-Hant-TW': '一句話說明。' },
      }),
    ])
    assert.equal(r.status, 0, r.out)
  })

  for (const [label, value] of [
    ['空对象', {}],
    ['键不是语言标签', { zh_CN: '示例' }],
    ['值为空白', { 'zh-CN': '  ' }],
    ['值不是字符串', { 'zh-CN': 1 }],
    ['数组', ['示例']],
    ['null', null],
    ['空字符串', ''],
  ]) {
    it(`displayName 与 description 拒绝${label}`, () => {
      const r = check([entry({ displayName: value, description: value })])
      assert.equal(r.status, 1)
      assert.match(r.out, /example：displayName 须是非空字符串，或以语言标签（如 zh-CN、en-US）为键、非空字符串为值的对象，至少一项/)
      assert.match(r.out, /example：description 须是 1 到 200 个字符，或以语言标签（如 zh-CN、en-US）为键、每项 1 到 200 个字符的对象，至少一项/)
    })
  }

  it('description 每项不超过 200 个字符', () => {
    assert.equal(check([entry({ description: { 'zh-CN': '短', 'en-US': 'x'.repeat(200) } })]).status, 0)
    const r = check([entry({ description: { 'zh-CN': '短', 'en-US': 'x'.repeat(201) } })])
    assert.equal(r.status, 1)
    assert.match(r.out, /description 须是 1 到 200 个字符/)
    assert.equal(check([entry({ description: 'x'.repeat(201) })]).status, 1)
  })
})
