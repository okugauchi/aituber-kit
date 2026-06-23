require('@testing-library/jest-dom')
require('./src/__mocks__/readableStream.js')
require('web-streams-polyfill/dist/polyfill.js')

const { TextDecoder, TextEncoder } = require('util')

global.TextDecoder = global.TextDecoder || TextDecoder
global.TextEncoder = global.TextEncoder || TextEncoder
