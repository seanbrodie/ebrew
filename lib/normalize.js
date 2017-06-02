'use strict'
const format = require('./format')

function strarray(data, message, optional) {
  if (optional && !data) return []
  if (typeof data === 'string') data = [data]
  if (!Array.isArray(data)) throw new Error(message)
  return data
}

module.exports = m => {
  m.title = m.title || 'Untitled'
  m.sortTitle = m.sortTitle || format.sortTitle(m.title)
  m.subtitle = m.subtitle || ''
  m.fullTitle = m.title + (m.subtitle && !m.onlyTitle ? ': ' + m.subtitle : '')
  m.language = m.language || 'en'
  m.contents = strarray(m.contents, 'metadata key "contents" must be a filename or an array of filenames.')
  m.css = strarray(m.css, 'metadata key "css" must be a string or array of strings', true)
  const authors = m.authors || m.author
  m.authors = (Array.isArray(authors) ? authors : [authors]).map(a => {
    a = typeof a === 'object' ? a : { name: a }
    if (!a.name) throw new Error('metadata object in "authors" must have a "name" key')
    if (!a.sort) a.sort = format.sortAuthor(a.name)
    if (!a.role) a.role = 'aut'
    if (a.role.length !== 3) throw new Error('metadata key "role" in "authors" must be a three-character MARC relator')
    return a
  })
  m.publisher = m.publisher || ''
  m.tocDepth = m.tocDepth || 6

  m.date = m.date ? new Date(m.date) : new Date
  m.created = m.created ? new Date(m.created) : m.date
  m.copyrighted = m.copyrighted ? new Date(m.copyrighted) : m.date
  m.rights = m.rights || (m.authors ? `Copyright ©${m.copyrighted.getFullYear()} ${format.list(m.authors)}` : null)

  delete m.author
  return m
}
