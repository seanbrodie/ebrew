'use strict'
const fs = require('mz/fs')

module.exports = (manifest, input, indent = 2) =>
  manifest.uuid ? Promise.resolve(manifest) :
  fs.writeFile(input, JSON.stringify(Object.assign(manifest, {uuid: uuid.v4()}), null, indent)).then(() => manifest)
