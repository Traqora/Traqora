import '@testing-library/jest-dom'
import 'whatwg-fetch'

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

if (typeof globalThis.TextEncoder === 'undefined' || typeof globalThis.TextDecoder === 'undefined') {
  const util = require('node:util')
  class RealmTextEncoder {
    encode(input = '') {
      return new Uint8Array(new util.TextEncoder().encode(input))
    }
  }
  class RealmTextDecoder {
    constructor(label = 'utf-8', options) {
      this.decoder = new util.TextDecoder(label, options)
    }
    decode(input, options) {
      return this.decoder.decode(input, options)
    }
  }
  globalThis.TextEncoder = globalThis.TextEncoder ?? RealmTextEncoder
  globalThis.TextDecoder = globalThis.TextDecoder ?? RealmTextDecoder
}
