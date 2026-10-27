#!/usr/bin/env node
// 检查 loop-now-market.json。不带参数只做静态检查：格式、字段、id 唯一与排序、来源写法。
// 加 --fetch 时再取回每个条目（git 按 tag 克隆，npm 按版本 pack），核对插件清单里的 id 与版本；
// 设置 LOOP_NOW_HOST_ENTRY（Loop Now 插件宿主的 main.js）时还会运行宿主的 validate。
// 用法：node scripts/check.mjs [loop-now-market.json] [--fetch]

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

// 与 Loop Now 服务端 internal/pluginmanifest 的规则一致。
const ID = /^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$/
const VERSION = /^[0-9A-Za-z][0-9A-Za-z.+-]{0,63}$/
const NPM_NAME = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/
const KEYS = ['id', 'source', 'version', 'displayName', 'description', 'verified']

const args = process.argv.slice(2)
const doFetch = args.includes('--fetch')
const file = args.find((a) => !a.startsWith('--')) ?? 'loop-now-market.json'
const hostEntry = process.env.LOOP_NOW_HOST_ENTRY

const errors = []
const fail = (message) => {
  errors.push(message)
  return null
}

let market
try {
  market = JSON.parse(fs.readFileSync(file, 'utf8'))
} catch (error) {
  console.error(`${file}: ${error.message}`)
  process.exit(1)
}

if (!market || typeof market !== 'object' || Array.isArray(market)) {
  fail('顶层须是对象')
} else {
  for (const key of Object.keys(market)) if (!['name', 'plugins'].includes(key)) fail(`不认识的顶层字段 ${key}`)
  if (typeof market.name !== 'string' || !market.name.trim()) fail('name 须是非空字符串')
  if (!Array.isArray(market.plugins)) fail('plugins 须是数组')
}

const entries = Array.isArray(market?.plugins) ? market.plugins : []
const seen = new Set()
const parsed = []
entries.forEach((entry, index) => {
  const where = `plugins[${index}]`
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return fail(`${where} 须是对象`)
  const label = typeof entry.id === 'string' && entry.id ? entry.id : where
  for (const key of Object.keys(entry)) if (!KEYS.includes(key)) fail(`${label}：不认识的字段 ${key}`)
  for (const key of KEYS) if (!(key in entry)) fail(`${label}：缺少 ${key}`)
  if (typeof entry.id !== 'string' || !ID.test(entry.id)) fail(`${label}：id 须是小写字母、数字和连字符，1 到 64 个字符`)
  else if (seen.has(entry.id)) fail(`${label}：id 重复`)
  else seen.add(entry.id)
  if (typeof entry.version !== 'string' || !VERSION.test(entry.version)) fail(`${label}：version 写法不对`)
  if (typeof entry.displayName !== 'string' || !entry.displayName.trim()) fail(`${label}：displayName 须是非空字符串`)
  if (typeof entry.description !== 'string' || !entry.description.trim() || entry.description.length > 200) fail(`${label}：description 须是 1 到 200 个字符`)
  if (typeof entry.verified !== 'boolean') fail(`${label}：verified 须是 true 或 false`)
  const source = parseSource(entry.source, label)
  if (source) parsed.push({ ...entry, ...source, label })
})

const ids = entries.map((entry) => entry?.id).filter((id) => typeof id === 'string')
const sorted = [...ids].sort()
if (ids.some((id, index) => id !== sorted[index])) fail('条目须按 id 字母顺序排列')

function parseSource(source, label) {
  if (typeof source !== 'string') return fail(`${label}：source 须是字符串`)
  const colon = source.indexOf(':')
  const kind = colon < 0 ? '' : source.slice(0, colon)
  const rest = colon < 0 ? '' : source.slice(colon + 1)
  if (kind === 'git') {
    const at = rest.lastIndexOf('@')
    if (at <= rest.lastIndexOf('/')) return fail(`${label}：git 来源须带 @<tag>，例如 git:https://github.com/o/r@v1.0.0`)
    const url = rest.slice(0, at)
    const ref = rest.slice(at + 1)
    if (!/^https:\/\/[^\s@]+$/.test(url) || !ref) return fail(`${label}：git 来源须是 https 地址加 @<tag>`)
    return { kind, url, ref }
  }
  if (kind === 'npm') {
    if (!NPM_NAME.test(rest)) return fail(`${label}：npm 来源只写包名，版本放在 version 里`)
    return { kind, name: rest }
  }
  return fail(`${label}：source 须写成 git:<https 地址>@<tag> 或 npm:<包名>`)
}

function run(command, commandArgs, cwd) {
  return spawnSync(command, commandArgs, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', npm_config_update_notifier: 'false' },
    maxBuffer: 64 * 1024 * 1024,
  })
}

function derivedID(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/^@/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

// 读取取回目录里的清单：有宿主就用宿主校验，没有就只读 package.json。
function readManifest(dir, label) {
  if (hostEntry) {
    const result = run(process.execPath, [hostEntry, 'validate', dir])
    let report
    try {
      report = JSON.parse(result.stdout)
    } catch {
      return fail(`${label}：宿主校验没有返回结果：${(result.stderr || '').trim()}`)
    }
    if (!report.ok) {
      const problems = (report.findings ?? []).filter((f) => f.level === 'error').map((f) => f.message)
      return fail(`${label}：宿主校验未通过：${problems.join('；') || '见宿主输出'}`)
    }
    return { id: report.manifest?.id, version: report.manifest?.version }
  }
  let pkg
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
  } catch (error) {
    return fail(`${label}：读不到 package.json：${error.message}`)
  }
  return { id: pkg.loopNow?.id ?? derivedID(pkg.name), version: pkg.version }
}

if (doFetch && errors.length === 0 && parsed.length > 0) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-now-market-'))
  try {
    for (const entry of parsed) {
      let dir = path.join(tmp, entry.id)
      if (entry.kind === 'git') {
        const tags = run('git', ['ls-remote', '--tags', entry.url, `refs/tags/${entry.ref}`])
        if (tags.status !== 0 || !tags.stdout.trim()) {
          fail(`${entry.label}：${entry.url} 上没有 tag ${entry.ref}`)
          continue
        }
        const clone = run('git', ['clone', '--quiet', '--depth', '1', '--branch', entry.ref, entry.url, dir])
        if (clone.status !== 0) {
          fail(`${entry.label}：克隆失败：${clone.stderr.trim()}`)
          continue
        }
      } else {
        fs.mkdirSync(dir)
        const pack = run('npm', ['pack', `${entry.name}@${entry.version}`, '--pack-destination', dir, '--ignore-scripts', '--json'], dir)
        if (pack.status !== 0) {
          fail(`${entry.label}：npm 上没有 ${entry.name}@${entry.version}：${pack.stderr.trim()}`)
          continue
        }
        const tarball = fs.readdirSync(dir).find((name) => name.endsWith('.tgz'))
        const untar = tarball ? run('tar', ['-xzf', path.join(dir, tarball), '-C', dir]) : { status: 1 }
        if (untar.status !== 0) {
          fail(`${entry.label}：解开 npm 包失败`)
          continue
        }
        dir = path.join(dir, 'package')
      }
      const manifest = readManifest(dir, entry.label)
      if (!manifest) continue
      if (manifest.id !== entry.id) fail(`${entry.label}：清单里的 id 是 ${manifest.id}，与索引不一致`)
      if (manifest.version !== entry.version) fail(`${entry.label}：清单里的版本是 ${manifest.version}，索引写的是 ${entry.version}`)
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

if (errors.length > 0) {
  for (const message of errors) console.error(`错误：${message}`)
  process.exit(1)
}
console.log(`${file}：${entries.length} 个条目${doFetch ? '，已取回核对' : ''}，检查通过`)
