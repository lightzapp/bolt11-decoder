const {bech32, hex, utf8} = require('@scure/base')

// defaults for encode; default timestamp is current time at call
const FLOKICOIN_MAINNET = {
  // default network is flokicoin
  bech32: 'fc',
  pubKeyHash: 0x23,
  scriptHash: 0x05,
  validWitnessVersions: [0]
}
const FLOKICOIN_TESTNET = {
  bech32: 'tf',
  pubKeyHash: 0x6f,
  scriptHash: 0xc4,
  validWitnessVersions: [0]
}
const FLOKICOIN_SIGNET = {
  bech32: 'tbs',
  pubKeyHash: 0x6f,
  scriptHash: 0xc4,
  validWitnessVersions: [0]
}
const FLOKICOIN_REGTEST = {
  bech32: 'fcrt',
  pubKeyHash: 0x6f,
  scriptHash: 0xc4,
  validWitnessVersions: [0]
}
const FLOKICOIN_SIMNET = {
  bech32: 'sf',
  pubKeyHash: 0x3f,
  scriptHash: 0x7b,
  validWitnessVersions: [0]
}



const FEATUREBIT_ORDER = [
  'option_data_loss_protect',
  'initial_routing_sync',
  'option_upfront_shutdown_script',
  'gossip_queries',
  'var_onion_optin',
  'gossip_queries_ex',
  'option_static_remotekey',
  'payment_secret',
  'basic_mpp',
  'option_support_large_channel'
]

const DIVISORS = {
  m: BigInt(1e3),
  u: BigInt(1e6),
  n: BigInt(1e9),
  p: BigInt(1e12)
}

const MAX_MILLILOKIS = BigInt('9223372036854775807000')

const MILLILOKIS_PER_FLC = BigInt(1e11)

const TAGCODES = {
  payment_hash: 1,
  payment_secret: 16,
  description: 13,
  payee: 19,
  description_hash: 23, // commit to longer descriptions (used by lnurl-pay)
  expiry: 6, // default: 3600 (1 hour)
  min_final_cltv_expiry: 24, // default: 9
  fallback_address: 9,
  route_hint: 3, // for extra routing info (private etc.)
  feature_bits: 5,
  metadata: 27
}

// reverse the keys and values of TAGCODES and insert into TAGNAMES
const TAGNAMES = {}
for (let i = 0, keys = Object.keys(TAGCODES); i < keys.length; i++) {
  const currentName = keys[i]
  const currentCode = TAGCODES[keys[i]].toString()
  TAGNAMES[currentCode] = currentName
}

const TAGPARSERS = {
  1: words => hex.encode(bech32.fromWordsUnsafe(words)), // 256 bits
  16: words => hex.encode(bech32.fromWordsUnsafe(words)), // 256 bits
  13: words => utf8.encode(bech32.fromWordsUnsafe(words)), // string variable length
  19: words => hex.encode(bech32.fromWordsUnsafe(words)), // 264 bits
  23: words => hex.encode(bech32.fromWordsUnsafe(words)), // 256 bits
  27: words => hex.encode(bech32.fromWordsUnsafe(words)), // variable
  6: wordsToIntBE, // default: 3600 (1 hour)
  24: wordsToIntBE, // default: 9
  3: routingInfoParser, // for extra routing info (private etc.)
  5: featureBitsParser // keep feature bits as array of 5 bit words
}

function getUnknownParser(tagCode) {
  return words => ({
    tagCode: parseInt(tagCode),
    words: bech32.encode('unknown', words, Number.MAX_SAFE_INTEGER)
  })
}

function wordsToIntBE(words) {
  return words.reverse().reduce((total, item, index) => {
    return total + item * Math.pow(32, index)
  }, 0)
}

// first convert from words to buffer, trimming padding where necessary
// parse in 51 byte chunks. See encoder for details.
function routingInfoParser(words) {
  const routes = []
  let pubkey,
    shortChannelId,
    feeBaseMlokis,
    feeProportionalMillionths,
    cltvExpiryDelta
  let routesBuffer = convertWords(words, 5, 8, true)
  while (routesBuffer.length > 0) {
    pubkey = hex.encode(routesBuffer.slice(0, 33)) // 33 bytes
    shortChannelId = hex.encode(routesBuffer.slice(33, 41)) // 8 bytes
    feeBaseMlokis = parseInt(hex.encode(routesBuffer.slice(41, 45)), 16) // 4 bytes
    feeProportionalMillionths = parseInt(
      hex.encode(routesBuffer.slice(45, 49)),
      16
    ) // 4 bytes
    cltvExpiryDelta = parseInt(hex.encode(routesBuffer.slice(49, 51)), 16) // 2 bytes

    routesBuffer = routesBuffer.slice(51)

    routes.push({
      pubkey,
      short_channel_id: shortChannelId,
      fee_base_msat: feeBaseMlokis,
      fee_proportional_millionths: feeProportionalMillionths,
      cltv_expiry_delta: cltvExpiryDelta
    })
  }
  return routes
}

function featureBitsParser(words) {
  const bools = words
    .slice()
    .reverse()
    .map(word => [
      !!(word & 0b1),
      !!(word & 0b10),
      !!(word & 0b100),
      !!(word & 0b1000),
      !!(word & 0b10000)
    ])
    .reduce((finalArr, itemArr) => finalArr.concat(itemArr), [])
  while (bools.length < FEATUREBIT_ORDER.length * 2) {
    bools.push(false)
  }

  const featureBits = {}

  FEATUREBIT_ORDER.forEach((featureName, index) => {
    let status
    if (bools[index * 2]) {
      status = 'required'
    } else if (bools[index * 2 + 1]) {
      status = 'supported'
    } else {
      status = 'unsupported'
    }
    featureBits[featureName] = status
  })

  const extraBits = bools.slice(FEATUREBIT_ORDER.length * 2)
  featureBits.extra_bits = {
    start_bit: FEATUREBIT_ORDER.length * 2,
    bits: extraBits,
    has_required: extraBits.reduce(
      (result, bit, index) =>
        index % 2 !== 0 ? result || false : result || bit,
      false
    )
  }

  return featureBits
}

function hrpToMilliloki(hrpString, outputString) {
  let divisor, value
  if (hrpString.slice(-1).match(/^[munp]$/)) {
    divisor = hrpString.slice(-1)
    value = hrpString.slice(0, -1)
  } else if (hrpString.slice(-1).match(/^[^munp0-9]$/)) {
    throw new Error('Not a valid multiplier for the amount')
  } else {
    value = hrpString
  }

  if (!value.match(/^\d+$/))
    throw new Error('Not a valid human readable amount')

  const valueBN = BigInt(value)

  const millilokisBN = divisor
    ? (valueBN * MILLILOKIS_PER_FLC) / DIVISORS[divisor]
    : valueBN * MILLILOKIS_PER_FLC

  if (
    (divisor === 'p' && !(valueBN % BigInt(10) === BigInt(0))) ||
    millilokisBN > MAX_MILLILOKIS
  ) {
    throw new Error('Amount is outside of valid range')
  }

  return outputString ? millilokisBN.toString() : millilokisBN
}

// decode will only have extra comments that aren't covered in encode comments.
// also if anything is hard to read I'll comment.

function decode(paymentRequest, network) {
  if (typeof paymentRequest !== 'string')
    throw new Error('Lightning Payment Request must be string')
  if (paymentRequest.slice(0, 2).toLowerCase() !== 'ln')
    throw new Error('Not a proper lightning payment request')

  const sections = []
  const decoded = tryDecode(paymentRequest)
  paymentRequest = paymentRequest.toLowerCase()
  const prefix = decoded.prefix
  let words = decoded.words
  let letters = paymentRequest.slice(prefix.length + 1)
  let sigWords = words.slice(-104)
  words = words.slice(0, -104)

  // Without reverse lookups, can't say that the multipier at the end must
  // have a number before it, so instead we parse, and if the second group
  // doesn't have anything, there's a good chance the last letter of the
  // coin type got captured by the third group, so just re-regex without
  // the number.
  let prefixMatches = prefix.match(/^ln(\S+?)(\d*)([a-zA-Z]?)$/)
  if (prefixMatches && !prefixMatches[2])
    prefixMatches = prefix.match(/^ln(\S+)$/)
  if (!prefixMatches) {
    throw new Error('Not a proper lightning payment request')
  }

  // "ln" section
  sections.push({
    name: 'lightning_network',
    letters: 'ln'
  })

  // "bc" section
  const bech32Prefix = prefixMatches[1]
  let coinNetwork
  if (!network) {
    switch (bech32Prefix) {
      case FLOKICOIN_MAINNET.bech32:
        coinNetwork = FLOKICOIN_MAINNET
        break
      case FLOKICOIN_TESTNET.bech32:
        coinNetwork = FLOKICOIN_TESTNET
        break
      case FLOKICOIN_SIGNET.bech32:
        coinNetwork = FLOKICOIN_SIGNET
        break
      case FLOKICOIN_REGTEST.bech32:
        coinNetwork = FLOKICOIN_REGTEST
        break
      case FLOKICOIN_SIMNET.bech32:
        coinNetwork = FLOKICOIN_SIMNET
        break
    }
  } else {
    if (
      network.bech32 === undefined ||
      network.pubKeyHash === undefined ||
      network.scriptHash === undefined ||
      !Array.isArray(network.validWitnessVersions)
    )
      throw new Error('Invalid network')
    coinNetwork = network
  }
  if (!coinNetwork || coinNetwork.bech32 !== bech32Prefix) {
    throw new Error('Unknown coin bech32 prefix')
  }
  sections.push({
    name: 'coin_network',
    letters: bech32Prefix,
    value: coinNetwork
  })

  // amount section
  const value = prefixMatches[2]
  let millilokis
  if (value) {
    const divisor = prefixMatches[3]
    millilokis = hrpToMilliloki(value + divisor, true)
    sections.push({
      name: 'amount',
      letters: prefixMatches[2] + prefixMatches[3],
      value: millilokis
    })
  } else {
    millilokis = null
  }

  // "1" separator
  sections.push({
    name: 'separator',
    letters: '1'
  })

  // timestamp
  const timestamp = wordsToIntBE(words.slice(0, 7))
  words = words.slice(7) // trim off the left 7 words
  sections.push({
    name: 'timestamp',
    letters: letters.slice(0, 7),
    value: timestamp
  })
  letters = letters.slice(7)

  let tagName, parser, tagLength, tagWords
  // we have no tag count to go on, so just keep hacking off words
  // until we have none.
  while (words.length > 0) {
    const tagCode = words[0].toString()
    tagName = TAGNAMES[tagCode] || 'unknown_tag'
    parser = TAGPARSERS[tagCode] || getUnknownParser(tagCode)
    words = words.slice(1)

    tagLength = wordsToIntBE(words.slice(0, 2))
    words = words.slice(2)

    tagWords = words.slice(0, tagLength)
    words = words.slice(tagLength)

    sections.push({
      name: tagName,
      tag: letters[0],
      letters: letters.slice(0, 1 + 2 + tagLength),
      value: parser(tagWords) // see: parsers for more comments
    })
    letters = letters.slice(1 + 2 + tagLength)
  }

  // signature
  sections.push({
    name: 'signature',
    letters: letters.slice(0, 104),
    value: hex.encode(bech32.fromWordsUnsafe(sigWords))
  })
  letters = letters.slice(104)

  // checksum
  sections.push({
    name: 'checksum',
    letters: letters
  })

  let result = {
    paymentRequest,
    sections,

    get expiry() {
      let exp = sections.find(s => s.name === 'expiry')
      if (exp) return getValue('timestamp') + exp.value
    },

    get route_hints() {
      return sections.filter(s => s.name === 'route_hint').map(s => s.value)
    }
  }

  for (let name in TAGCODES) {
    if (name === 'route_hint') {
      // route hints can be multiple, so this won't work for them
      continue
    }

    Object.defineProperty(result, name, {
      get() {
        return getValue(name)
      }
    })
  }

  return result

  function getValue(name) {
    let section = sections.find(s => s.name === name)
    return section ? section.value : undefined
  }
}

module.exports = {
  decode,
  hrpToMilliloki
}



function tryDecode(paymentRequest) {
  // Try standard bech32
  try {
    return bech32.decode(paymentRequest, Number.MAX_SAFE_INTEGER)
  } catch (e) {
    // continue
  }

  // Try standard bech32m
  try {
    const { bech32m } = require('@scure/base')
    return bech32m.decode(paymentRequest, Number.MAX_SAFE_INTEGER)
  } catch (e) {
    // continue
  }

  // Try custom Flokicoin check
  try {
     return manualDecode(paymentRequest)
  } catch (e) {
    throw new Error('Not a proper lightning payment request: ' + e.message)
  }
}

function manualDecode(str) {
  const ALPHABET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'
  const ALPHABET_MAP = {}
  for (let i = 0; i < ALPHABET.length; i++) {
     ALPHABET_MAP[ALPHABET[i]] = i
  }

  str = str.toLowerCase()
  const sepIndex = str.lastIndexOf('1')
  if (sepIndex === -1) throw new Error('No separator')
  
  const prefix = str.slice(0, sepIndex)
  const dataPart = str.slice(sepIndex + 1)
  
  if (dataPart.length < 6) throw new Error('Data too short')
  
  const words = []
  for (let i = 0; i < dataPart.length; i++) {
     const val = ALPHABET_MAP[dataPart[i]]
     if (val === undefined) throw new Error('Invalid character')
     words.push(val)
  }
  
  // Calculate checksum
  const combined = hrpExpand(prefix).concat(words)
  const constRes = polymod(combined)
  
  // 1 = bech32, 0x2bc830a3 = bech32m, 0x136ca640 = Flokicoin observed
  if (constRes !== 1 && constRes !== 0x2bc830a3 && constRes !== 0x136ca640) {
      throw new Error('Invalid checksum signature: ' + constRes.toString(16))
  }
  
  return {
      prefix,
      words: words.slice(0, -6)
  }
}

function hrpExpand(hrp) {
    let ret = []
    for (let i = 0; i < hrp.length; i++) {
        ret.push(hrp.charCodeAt(i) >> 5)
    }
    ret.push(0)
    for (let i = 0; i < hrp.length; i++) {
        ret.push(hrp.charCodeAt(i) & 31)
    }
    return ret
}

function polymod(values) {
    let chk = 1
    for (let v of values) {
        let b = chk >> 25
        chk = ((chk & 0x1ffffff) << 5) ^ v
        if ((b >> 0) & 1) chk ^= 0x3b6a57b2
        if ((b >> 1) & 1) chk ^= 0x26508e6d
        if ((b >> 2) & 1) chk ^= 0x1ea119fa
        if ((b >> 3) & 1) chk ^= 0x3d4233dd
        if ((b >> 4) & 1) chk ^= 0x2a1462b3
    }
    return chk
}

function convertWords(words, from, to) {
    let acc = 0
    let bits = 0
    const out = []
    const maxv = (1 << to) - 1
    const max_acc = (1 << (from + to - 1)) - 1
    
    for (let w of words) {
        if (w < 0 || (w >> from) !== 0) {
            throw new Error("Invalid word")
        }
        acc = ((acc << from) | w) & max_acc
        bits += from
        while (bits >= to) {
            bits -= to
            out.push((acc >> bits) & maxv)
        }
    }
    return Uint8Array.from(out)
}
