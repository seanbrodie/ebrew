'use strict'
const slug = require('slug')
const pad0 = n => n < 10 ? '0'+n : n

exports.list = items => {
  switch (items.length) {
    case 0: return ''
    case 1: return items[0]
    case 2: return items[0]+' and '+items[1]
    default: return items.slice(0, -1).join(', ')+', and '+items[items.length - 1]
  }
}

exports.date = date =>
  date.getUTCFullYear()+'-'+pad0(date.getUTCMonth() + 1)+'-'+pad0(date.getUTCDate())

exports.sortTitle = s => {
  const x = /^(the|an?) /i.exec(s)
  return x ? s.slice(x[0].length) + ', ' + x[1] : s
}

exports.sortAuthor = s => {
  const els = /^(.*?) ([^ ,]+)(?:,?((?: (?:(?:\w+\.)+|x{1,3}v?i{1,3}|v|x{0,3}i[xv]))+))?$/i.exec(s)
  if (els) return els[2] + ', ' + els[1] + (els[3] ? ', ' + els[3].trim() : '')
  return s
}

exports.outputName = m => slug(m.title)+'.epub'
