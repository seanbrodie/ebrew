'use strict'

const fs = require('mz/fs')
const path = require('path')
const _mkdirp = require('mkdirp')
const mkdirp = (dir, opts) => new Promise((r, j) => _mkdirp(dir, opts, e => e ? j(e) : r()))
const slug = require('slug')
const uuid = require('uuid')
const getStdin = require('get-stdin')

exports.normalizeManifest = require('./normalize')
exports.loadBook = require('./load')

exports.generate = (input, output) => {
  const stdin = input === '-'
  const root = stdin ? process.cwd() : path.dirname(input)
  return (stdin ? getStdin() : fs.readFile(input, {encoding: 'utf8'}))
  .then(JSON.parse)
  .then(m => stdin ? m : exports.ensureUUID(m, input))
  .then(exports.normalizeManifest)
  .then(manifest =>
    exports.loadBook(manifest, root).then(book => {
      const stdout = output === '-'
      output = output || exports.getOutputName(manifest)
      return Promise.all([
        stdout || mkdirp(path.dirname(output)),
        exports.createArchive({book, root, indent: 2})
      ]).then(([_, archive]) => new Promise((resolve, reject) => {
        archive.pipe(stdout ? process.stdout : fs.createWriteStream(output))
        archive.on('end', () => resolve(output))
        archive.on('error', reject)
      }))
    }))
}

exports.getOutputName = m => slug(m.title)+'.epub'

exports.ensureUUID = (manifest, input, indent = 2) =>
  manifest.uuid ? Promise.resolve(manifest) :
  fs.writeFile(input, JSON.stringify(Object.assign(manifest, {uuid: uuid.v4()}), null, indent)).then(() => manifest)

exports.createArchive = require('./create')
