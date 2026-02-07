/* eslint-env jest */

const {decode} = require('..')

describe('decoding issue', () => {
  it('should decode the provided bolt11 invoice', () => {
    const invoice = 'lnfc20n1p5cd9wcpp5z56luf9e6lutfd6r0rknl8nm2k5vc3c953068e3r00tma6zmf33qhp5mtgly8nhqwxt9mwszjhkmmy7awxng7ljrvy63lnmce53td99k92scqzvsxqyz5vqrzjq0uu9vvap7vzzlt63829ht853lrzuzuxgw76qe7l6qf6u5fsm2qjlapyqqqqqqqqzqqqqqqqqqqqqqqqqpjqrzjq0uu9vvap7vzzlt63829ht853lrzuzuxgw76qe7l6qf6u5fsm2qjlapyqqqqqqqqzsqqqqlgqqqqqeqpjqsp5fmjgml2f8xyg0yjccx5uzguagc75p9fn0qurksdf9vjzexwagwas9qxpqysgq0g7kcsd3vrpys90v266jdvh0s8t2vnkmmmxz8gsfefqaur8qs4fnvl53jj96qyn6m6xuyethc6u4x35m659235n3f2eehyk2z77fyzqqlemjra'
    const decoded = decode(invoice)
    console.log(decoded)
    expect(decoded).toBeDefined()
    expect(decoded.paymentRequest).toEqual(invoice)
  })
})
