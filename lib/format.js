'use strict'
const slug = require('slug')

exports.list = function formatList(items) {
  switch (items.length) {
    case 0: return ''
    case 1: return items[0]
    case 2: return items[0]+' and '+items[1]
    default: return items.slice(0, -1).join(', ')+', and '+items[items.length - 1]
  }
}

exports.date = function formatDate(date) {
  return date.getUTCFullYear()+'-'+pad0(date.getUTCMonth() + 1)+'-'+pad0(date.getUTCDate())
}

exports.sortTitle = function sortTitle(s) {
  if (s.startsWith('The ')) return s.slice(4) + ', The'
  if (s.startsWith('A ')) return s.slice(2) + ', A'
  return s
}

exports.outputName = m => slug(m.title)+'.epub'

function pad0(n) {return n < 10 ? '0'+n : n}
