'use strict'

const fs = require('mz/fs')
const path = require('path')
const _mkdirp = require('mkdirp')
const mkdirp = (dir, opts) => new Promise((r, j) => _mkdirp(dir, opts, e => e ? j(e) : r()))
const archiver = require('archiver')
const slug = require('slug')
const uuid = require('uuid')
const mime = require('mime')
const getStdin = require('get-stdin')
const h = require('./h')
const format = require('./format')

const NS_XHTML = 'http://www.w3.org/1999/xhtml'
const NS_EPUB = 'http://www.idpf.org/2007/ops'

const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>'
const XHTML_DOCTYPE = '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">'
const NCX_DOCTYPE = '<!DOCTYPE ncx PUBLIC "-//NISO//DTD ncx 2005-1//EN" "http://www.daisy.org/z3986/2005/ncx-2005-1.dtd">'

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

exports.createArchive = ({book, root, indent}) => {
  const archive = archiver.create('zip')

  archive.append('application/epub+zip', {name: 'mimetype', store: true})

  archive.append(
    xml('container', {version: '1.0', xmlns: 'urn:oasis:names:tc:opendocument:xmlns:container'},
      h('rootfiles',
        h('rootfile', {'full-path': 'book/content.opf', 'media-type': 'application/oebps-package+xml'}))),
    {name: 'META-INF/container.xml'})

  archive.append(
    xml('package', {xmlns: 'http://www.idpf.org/2007/opf', 'unique-identifier': 'uuid', version: '2.0'},
      h('metadata', {'xmlns:dc': 'http://purl.org/dc/elements/1.1/', 'xmlns:opf': 'http://www.idpf.org/2007/opf'},
        book.coverURL ? h('meta', {name: 'cover', content: 'cover-image'}) : [],
        h('dc:title', book.sortTitle && book.sortTitle !== book.title ? {'opf:file-as': book.sortTitle} : {}, book.fullTitle),
        h('dc:language', book.language),
        h('dc:rights', book.rights),
        h('dc:date', {'opf:event': 'creation'}, format.date(book.created)),
        h('dc:date', {'opf:event': 'copyright'}, format.date(book.copyrighted)),
        h('dc:date', {'opf:event': 'publication'}, format.date(book.date)),
        h('dc:publisher', book.publisher),
        h('dc:type', 'Text'),
        h('dc:identifier', {id: 'uuid', 'opf:scheme': 'uuid'}, book.uuid),
        book.isbn ? h('dc:identifier', {'opf:scheme': 'isbn'}, book.isbn) : [],
        book.doi ? h('dc:identifier', {'opf:scheme': 'doi'}, book.doi) : [],
        book.authors.map(author =>
          h('dc:creator', {'opf:role': 'aut'}, author))),
      h('manifest',
        book.coverURL ? h('item', {id: 'cover-image', properties: 'cover-image', 'media-type': mime.lookup(book.coverURL), href: book.coverURL}) : [],
        h('item', {id: 'toc', 'media-type': 'application/x-dtbncx+xml', href: 'toc.ncx'}),
        h('item', {id: 'nav', properties: 'nav', 'media-type': 'application/xhtml+xml', href: 'text/_nav.xhtml'}),
        h('item', {id: 'text-title', 'media-type': 'application/xhtml+xml', href: 'text/_title.xhtml'}),
        h('item', {id: 'style', 'media-type': 'text/css', href: 'style.css'}),
        book.texts.map((text, i) =>
          h('item', {id: `text-${i}`, 'media-type': 'application/xhtml+xml', href: `text/${i}.xhtml`})),
        book.resources.map((res, i) =>
          h('item', {id: `res-${i}`, 'media-type': mime.lookup(res.href), href: res.href}))),
      h('spine', {toc: 'toc'},
        h('itemref', {idref: 'text-title'}),
        book.toc === false ? [] : h('itemref', {idref: 'nav'}),
        book.texts.map((text, i) =>
          h('itemref', {idref: `text-${i}`}))),
      h('guide',
        h('reference', {type: 'title-page', title: 'Title Page', href: 'text/_title.xhtml'}),
        book.toc === false ? [] : h('reference', {type: 'toc', title: 'Table of Contents', href: 'text/_nav.xhtml'}),
        h('reference', {type: 'text', title: 'Start of Content', href: 'text/0.xhtml'}))),
    {name: 'book/content.opf'})

  let navPointId = 0
  archive.append(
    ncx(
      h('head',
        h('meta', {name: 'dtb:uid', content: book.uuid}),
        h('meta', {name: 'dtb:depth', content: 6}),
        h('meta', {name: 'dtb:totalPageCount', content: 0}),
        h('meta', {name: 'dtb:maxPageNumber', content: 0})),
      h('docTitle', h('text', book.title)),
      h('navMap',
        h('navPoint', {id: `item-${navPointId++}`},
          h('navLabel', h('text', book.title)),
          h('content', {src: 'text/_title.xhtml'})),
        book.headings.map(function np(d) {
          return d.level > book.tocDepth ? [] : d.empty ? d.subheadings.map(np) : h('navPoint', {id: `item-${navPointId++}`},
            h('navLabel', h('text', d.title)),
            h('content', {src: `text/${d.chapter}.xhtml#${d.id}`}),
            d.subheadings.map(np))
        }))),
    {name: 'book/toc.ncx'})

  archive.append(
    xhtml({'xmlns:epub': NS_EPUB},
      h('head',
        h('title', 'Table of Contents'),
        h('link', {rel: 'stylesheet', href: '../style.css'})),
      h('body', {'epub:type': 'frontmatter'},
        h('nav', {'epub:type': 'toc'},
          h('h1', 'Table of Contents'),
          h('ol',
            book.headings.map(function ol(d) {
              return d.level > book.tocDepth ? [] :
                h('li', d.empty ? [] : h('a', {href: `${d.chapter}.xhtml#${d.id}`}, d.title), d.subheadings.length ? h('ol', d.subheadings.map(ol)) : [])
            }))),
        h('nav', {'epub:type': 'landmarks', hidden: ''},
          h('h1', 'Guide'),
          h('ol',
            h('li', h('a', {'epub:type': 'titlepage', href: '_title.xhtml'}, 'Title Page')),
            book.toc === false ? [] : h('li', h('a', {'epub:type': 'toc', href: '_nav.xhtml'}, 'Table of Contents')),
            h('li', h('a', {'epub:type': 'bodymatter', href: '0.xhtml'}, 'Start of Content')))))),
    {name: 'book/text/_nav.xhtml'})

  archive.append(
    xhtml({'xmlns:epub': NS_EPUB},
      h('head',
        h('title', 'Title Page'),
        h('link', {rel: 'stylesheet', href: '../style.css'})),
      h('body', {'epub:type': 'frontmatter'},
        h('section', {class: 'titlepage', 'epub:type': 'titlepage'},
          h('h1',
            h('span', {'epub:type': 'title'}, book.title),
            book.subtitle ? ':' : ''),
          book.subtitle ? [h('h2', {'epub:type': 'subtitle'}, book.subtitle)] : [],
          book.authors.length ? [h('p', {class: 'author'}, format.list(book.authors))] : []))),
    {name: 'book/text/_title.xhtml'})

  book.xhtmls.forEach(function(content, i) {
    archive.append(
      xhtml({'xmlns:epub': NS_EPUB},
        h('head',
          h('title', `Chapter ${i+1}`),
          h('link', {rel: 'stylesheet', href: '../style.css'}),
          book.cssURLs.map(href => h('link', {rel: 'stylesheet', href}))),
        h('body', {'epub:type': 'bodymatter'}, h.raw(content))),
      {name: `book/text/${i}.xhtml`})
  })

  book.resources.forEach(function(res) {
    archive.file(res.file, {name: `book/${res.href}`})
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
`.trim()+'\n', {name: 'book/style.css'})

  archive.finalize()
  return Promise.resolve(archive)
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
