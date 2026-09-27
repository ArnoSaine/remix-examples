import { readdir, readFile, stat } from 'node:fs/promises'
import { relative, resolve } from 'node:path'

import { extractMessages, serializeMessages, type SourceFile } from './extractMessages.ts'

async function* sources(paths: string[]): AsyncGenerator<SourceFile> {
  for (let path of paths) {
    if ((await stat(path)).isFile()) {
      if (/\.tsx?$/.test(path) && !/\.test\.[jt]sx?$/.test(path)) {
        yield { file: relative(process.cwd(), resolve(path)), source: await readFile(path, 'utf8') }
      }
      continue
    }
    let entries = await readdir(path, { withFileTypes: true })
    for (let entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      let fullPath = resolve(path, entry.name)
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules') yield* sources([fullPath])
      } else if (
        entry.isFile() &&
        /\.tsx?$/.test(entry.name) &&
        !/\.test\.[jt]sx?$/.test(entry.name)
      ) {
        yield { file: relative(process.cwd(), fullPath), source: await readFile(fullPath, 'utf8') }
      }
    }
  }
}

let paths = process.argv.slice(2)
if (!paths.length) paths = ['app']
let files: SourceFile[] = []
for await (let file of sources(paths)) files.push(file)
let { messages, diagnostics } = extractMessages(files)
process.stdout.write(serializeMessages(messages))
for (let { message, reference } of diagnostics) {
  console.error(`${reference.file}:${reference.line}:${reference.column}: ${message}`)
}
if (diagnostics.length) process.exitCode = 1
