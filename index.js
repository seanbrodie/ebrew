'use strict'

const fs = require('fs')
const path = require('path')
const mkdirp = require('mkdirp')
const archiver = require('archiver')
const slug = require('slug')
const uuid = require('uuid')
const async = require('async')
const marked = require('marked')
const cheerio = require('cheerio')
const mime = require('mime')
const h = require('./h')

const NS_XHTML = 'http://www.w3.org/1999/xhtml'
const NS_EPUB = 'http://www.idpf.org/2007/ops'

const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>'
const XHTML_DOCTYPE = '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">'
const NCX_DOCTYPE = '<!DOCTYPE ncx PUBLIC "-//NISO//DTD ncx 2005-1//EN" "http://www.daisy.org/z3986/2005/ncx-2005-1.dtd">'

marked.setOptions({
  gfm: true,
  sanitize: false,
  smartypants: true,
})

exports.generate = function generate(input, output, cb) {
  const cwd = process.cwd()
  input = path.resolve(cwd, input)
  const root = path.dirname(input)

  fs.readFile(input, {encoding: 'utf8'}, function(err, data) {
    if (err) return cb(err)

    exports.processManifest(JSON.parse(data), input, root, function(err, manifest) {
      if (err) return cb(err)

      if (output) {
        output = path.resolve(cwd, output)
        if (!/\.epub$/.test(output)) output += '.epub'
      } else {
        output = path.join(root, slug(manifest.title)+'.epub')
      }

      exports.createArchive({
        manifest,
        root,
        indent: '  ',
      }, function(err, archive) {
        if (err) return cb(err)

        mkdirp(path.dirname(output), function(err) {
          if (err) return cb(err)

          archive.pipe(fs.createWriteStream(output))
          archive.on('end', function() {
            cb(null, {input, root, manifest, output})
          })
        })
      })
    })
  })
}

exports.processManifest = function(manifest, input, root, cb) {
  const title = manifest.title || 'Untitled'
  const subtitle = manifest.subtitle || ''
  const language = manifest.language || 'en'
  const contents = strarray(manifest.contents, 'Manifest key "contents" must be a filename or an array of filenames.')
  const authors = strarray(manifest.authors || manifest.author, 'Manifest key "author" or "authors" must be a string or an array of strings', true) || null
  const publisher = manifest.publisher || ''
  const tocDepth = manifest.tocDepth || 6

  const date = manifest.date ? new Date(manifest.date) : new Date
  const created = manifest.created ? new Date(manifest.created) : date
  const copyrighted = manifest.copyrighted ? new Date(manifest.copyrighted) : date

  const rights = manifest.rights || (
    authors ? `Copyright ©${copyrighted.getFullYear()} ${formatList(authors)}` : null)

  async.map(contents, function(content, cb) {
    fs.readFile(path.resolve(root, content), {encoding: 'utf8'}, cb)
  }, function(err, texts) {
    if (err) return cb(err)

    const headings = []
    const stack = [headings]

    texts = texts.map(function(text, i) {
      return text.replace(/^(#{1,6}).+/gm, function(line, hashes) {
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
        while (n < stack.length) {
          stack.pop()
        }
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
      })
    })

    const resources = []
    const xhtmls = texts.map(function(text, i) {
      const $ = cheerio.load(marked(text))
      $('img').each(function() {
        if (!/^\w+:/.test(this.attribs.src)) {
          const file = path.resolve(root, contents[i], '..', this.attribs.src)
          const ext = path.extname(this.attribs.src)
          const href = `resources/${resources.length}${ext}`
          this.attribs.src = `../${href}`
          resources.push({file, href})
        }
      })
      return $.xml()
    })

    if (!manifest.uuid) {
      manifest.uuid = uuid.v4()
      fs.writeFile(input, JSON.stringify(manifest, null, 2), done)
    } else done()

    function done() {
      const fullTitle = title + (subtitle ? ': ' + subtitle : '')
      cb(null, {
        title, subtitle, fullTitle, language, tocDepth,
        contents, texts, xhtmls, resources, headings,
        authors, publisher, rights,
        date, created, copyrighted,
        uuid: manifest.uuid,
      })
    }
  })
}

exports.createArchive = function createArchive(options, cb) {
  const manifest = options.manifest
  const root = options.root
  const indent = options.indent

  const archive = archiver.create('zip')

  archive.append('application/epub+zip', {name: 'mimetype', store: true})

  archive.append(
    xml('container', {version: '1.0', xmlns: 'urn:oasis:names:tc:opendocument:xmlns:container'},
      h('rootfiles',
        h('rootfile', {'full-path': 'OEBPS/content.opf', 'media-type': 'application/oebps-package+xml'}))),
    {name: 'META-INF/container.xml'})

  archive.append(
    xml('package', {xmlns: 'http://www.idpf.org/2007/opf', 'unique-identifier': 'uuid', version: '2.0'},
      h('metadata', {'xmlns:dc': 'http://purl.org/dc/elements/1.1/', 'xmlns:opf': 'http://www.idpf.org/2007/opf'},
        h('dc:title', manifest.fullTitle),
        h('dc:language', manifest.language),
        h('dc:rights', manifest.rights),
        h('dc:date', {'opf:event': 'creation'}, formatDate(manifest.created)),
        h('dc:date', {'opf:event': 'copyright'}, formatDate(manifest.copyrighted)),
        h('dc:date', {'opf:event': 'publication'}, formatDate(manifest.date)),
        h('dc:publisher', manifest.publisher),
        h('dc:type', 'Text'),
        h('dc:identifier', {id: 'uuid', 'opf:scheme': 'UUID'}, manifest.uuid),
        manifest.authors.map(author =>
          h('dc:creator', {'opf:role': 'aut'}, author))),
      h('manifest',
        h('item', {id: 'toc', 'media-type': 'application/x-dtbncx+xml', href: 'toc.ncx'}),
        h('item', {id: 'text-title', 'media-type': 'application/xhtml+xml', href: 'text/_title.xhtml'}),
        h('item', {id: 'style', 'media-type': 'text/css', href: 'style.css'}),
        manifest.texts.map((text, i) =>
          h('item', {id: `text-${i}`, 'media-type': 'application/xhtml+xml', href: `text/${i}.xhtml`})),
        manifest.resources.map((res, i) =>
          h('item', {id: `res-${i}`, 'media-type': mime.lookup(res.href), href: res.href}))),
      h('spine', {toc: 'toc'},
        h('itemref', {idref: 'text-title'}),
        manifest.texts.map((text, i) =>
          h('itemref', {idref: `text-${i}`})))),
    {name: 'OEBPS/content.opf'})

  let navPointId = 0
  archive.append(
    ncx(
      h('head',
        h('meta', {name: 'dtb:uid', content: manifest.uuid}),
        h('meta', {name: 'dtb:depth', content: 6}),
        h('meta', {name: 'dtb:totalPageCount', content: 0}),
        h('meta', {name: 'dtb:maxPageNumber', content: 0})),
      h('docTitle', h('text', manifest.title)),
      h('navMap',
        h('navPoint', {id: `item-${navPointId++}`},
          h('navLabel', h('text', manifest.title)),
          h('content', {src: 'text/_title.xhtml'})),
        manifest.headings.map(function np(d) {
          return d.level > manifest.tocDepth ? [] : d.empty ? d.subheadings.map(np) : h('navPoint', {id: `item-${navPointId++}`},
            h('navLabel', h('text', d.title)),
            h('content', {src: `text/${d.chapter}.xhtml#${d.id}`}),
            d.subheadings.map(np))
        }))),
    {name: 'OEBPS/toc.ncx'})

  archive.append(
    xhtml({'xmlns:epub': NS_EPUB},
      h('head',
        h('title', 'Title Page'),
        h('link', {rel: 'stylesheet', href: '../style.css'})),
      h('body', {'epub:type': 'frontmatter'},
        h('section', {class: 'titlepage', 'epub:type': 'titlepage'},
          h('h1',
            h('span', {'epub:type': 'title'}, manifest.title),
            manifest.subtitle ? ':' : ''),
          manifest.subtitle ? [h('h2', {'epub:type': 'subtitle'}, manifest.subtitle)] : [],
          manifest.authors.length ? [h('p', {class: 'author'}, formatList(manifest.authors))] : []))),
    {name: 'OEBPS/text/_title.xhtml'})

  manifest.xhtmls.forEach(function(content, i) {
    archive.append(
      xhtml(
        h('head',
          h('title', `Chapter ${i+1}`),
          h('link', {rel: 'stylesheet', href: '../style.css'})),
        h('body', h.raw(content))),
      {name: `OEBPS/text/${i}.xhtml`})
  })

  manifest.resources.forEach(function(res) {
    archive.file(res.file, {name: `OEBPS/${res.href}`})
  })

  archive.append(`
.titlepage, h1, h2, h3, h4, h5, h6 {
  hyphens: manual;
  -webkit-hyphens: manual;
  line-height: 1.15;
}
.titlepage, .titlepage h1, .titlepage h2 {
  text-align: center;
}
.titlepage h1 {
  font-size: 3em;
  margin: 1em 0 0;
}
.titlepage h2 {
  font-size: 2em;
  margin: 0.25em 0 0;
}
.titlepage .author {
  margin: 4em 0 0;
  font-size: 1.5em;
  font-weight: bold;
}
hr {
  width: 5em;
  height: 1px;
  background: currentColor;
  border: 0;
  margin: 2em auto;
}
`.trim()+'\n', {name: 'OEBPS/style.css'})

  archive.finalize()
  process.nextTick(cb.bind(null, null, archive))
}

function strarray(data, message, optional) {
  if (optional && !data) return []
  if (typeof data === 'string') data = [data]
  if (!Array.isArray(data)) throw new Error(message)
  return data
}

function formatList(items) {
  switch (items.length) {
    case 0: return ''
    case 1: return items[0]
    case 2: return items[0]+' and '+items[1]
    default: return items.slice(0, -1).join(', ')+', and '+items[items.length - 1]
  }
}
exports.formatList = formatList

function formatDate(date) {
  return date.getUTCFullYear()+'-'+pad0(date.getUTCMonth() + 1)+'-'+pad0(date.getUTCDate())
}
exports.formatDate = formatDate

function pad0(n) {
  return n < 10 ? '0'+n : n
}

function xml(...a) {
  return XML_DECLARATION + h(...a)
}
function xhtml(...a) {
  return XML_DECLARATION + XHTML_DOCTYPE + h('html', {xmlns: NS_XHTML}, ...a)
}
function ncx(...a) {
  return XML_DECLARATION + NCX_DOCTYPE + h('ncx', {xmlns: 'http://www.daisy.org/z3986/2005/ncx/', version: '2005-1'}, ...a)
}
