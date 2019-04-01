
// return Promise.all(manifest.contents.map(async (content) => {
//   let stream = fs.createReadStream(path.resolve(root, content), { encoding: 'utf8' });
//   console.log('create read stream')
//   let chunks = [];

//   for await (const chunk of stream) {
//     chunks.push(chunk);
//   }

//   console.log('done')
//   let text = chunks;
//   return Promise.resolve(text);

// stream.on('error', err => {
//   console.error(err);
//   return Promise.reject(err);
// });

// stream.on('data', chunk => {
//   chunks.push(chunk);
// });

// stream.on('close', () => {
//   console.log('done');
//   let text = [].concat(chunks);
//   return Promise.resolve(text);
// });
// }))

'use strict'
// const fs = require('mz/fs')
const path = require('path')
const cheerio = require('cheerio')
const slug = require('slug')

const admin = require('firebase-admin');
admin.initializeApp();

var bucket = admin.storage().bucket('medium-to-kindle-articles');


const marked = require('marked')
marked.setOptions({
  gfm: true,
  sanitize: false,
  smartypants: true,
})

module.exports = (manifest, root) => {
  // return Promise.all(manifest.contents.map(content => fs.readFile(path.resolve(root, content), { encoding: 'utf8' })))
  return Promise.all(manifest.contents.map(async (content) => {
    // let stream = fs.createReadStream(path.resolve(root, content), { encoding: 'utf8' });
    let download = await bucket.file(content + '/index.md').download();
    let text = download[0].toString();
    return Promise.resolve(text);
  }))
    .then(texts => {
      const headings = []
      const stack = [headings]

      texts = texts.map((text, i) =>
        text.replace(/^(#{1,6}).+/gm, function (line, hashes) {
          const n = hashes.length
          const title = line.slice(n).trim()
          while (n > stack.length) {
            const anon = {
              empty: true,
              level: stack.length,
              subheadings: [],
            }
            stack[stack.length - 1].push(anon)
            stack.push(anon.subheadings)
          }
          while (n < stack.length) stack.pop()
          const head = {
            title,
            subheadings: [],
            chapter: i,
            level: n,
            id: slug(title),
          }
          stack[stack.length - 1].push(head)
          stack.push(head.subheadings)

          return `<h${n} id="${head.id}">${title}</h${n}>`
        }))

      const resources = []
      function addResource(src, relative = []) {
        // const file = path.resolve(root, ...relative, src)
        const file = manifest.contents[0] + '/' + src;
        const ext = path.extname(file)
        const href = `resources/${resources.length}${ext}`
        resources.push({ file, href })
        return href
      }
      const cssURLs = manifest.css.map(s => '../' + addResource(s))
      const xhtmls = texts.map(function (text, i) {
        const $ = cheerio.load(marked(text))
        $('img').each(function () {
          if (!/^\w+:/.test(this.attribs.src)) {
            this.attribs.src = '../' + addResource(this.attribs.src, [manifest.contents[i], '..'])
          }
        })
        return $.xml()
      })
      if (manifest.cover) manifest.coverURL = addResource(manifest.cover)

      return Object.assign({}, manifest, { texts, xhtmls, resources, headings, cssURLs })
    })
}