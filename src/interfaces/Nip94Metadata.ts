/**
 * Required fields of NIP-94 metadata for images.
 * Contains the following fields:
 * * `url` - required, the URL to of the file
 * * `m` - required, the file mimetype.
 */
export type Nip94MetadataRequired = Record<'url' | 'm', string>;

/**
 * Optional fields of NIP-94 metadata for images.
 * Contains the following fields:
 * * `x` - sha-256 hash
 * * `ox` - sha-256 hash
 * * `dim` - image dimensions in ${w}x${h} format
 * * `blurhash` - the blurhash for the image. useful for image previews etc
 * * `cid` - the ipfs cid of the image.
 */
export type Nip94MetadataOptional = Partial<Record<'x' | 'ox' | 'size' | 'dim' | 'blurhash' | 'cid', string>>;

/**
 * NIP-94 metadata for images.
 * Contains the following fields:
 * * `url` - required, the URL to of the file
 * * `m` - required, the file mimetype.
 * * `x` - sha-256 hash
 * * `ox` - sha-256 hash
 * * `dim` - image dimensions in ${w}x${h} format
 * * `blurhash` - the blurhash for the image. useful for image previews etc
 * * `cid` - the ipfs cid of the image.
 */
export type Nip94Metadata = Nip94MetadataOptional & Nip94MetadataRequired;
