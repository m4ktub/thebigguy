import { fromHex } from "ecash-lib";

/**
 * The private key used to sign all transactions. This can be public because
 * the script ensures that, for each input, there's a single combination of
 * outputs that is valid. At most, the public will be able to perform the
 * splits at random times and pay additional fees to miners.
 *
 * seed: gun grit retire number myth tube drink require pulp eager nut total
 * derivation: m/44'/899'/0'
 * wif: Kz9ZSUN8Ku61XShmSFsayv95NoXX2uMBGGgXNHSg1VcNqzmfB2gB
 * address: qqvvpj6k6u2klccpag6nfpt6k53yl9uwcvt0qecxej
 */
export const PRV_KEY = fromHex("57607b06ad855ecf808440130a2b466c1ce5fca269dff8a92b69697216460d6e");
export const PUB_KEY = fromHex("027ce376e17e46e46614266096d8bc723c881b600227c1b496ada37b1a668b2d8b");
