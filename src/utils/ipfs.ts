/** https://docs.ipfs.tech/how-to/address-ipfs-on-web/#path-gateway */
const IPFS_PATH_REGEX = /^\/ipfs\/([^/]+)/;
/** https://docs.ipfs.tech/how-to/address-ipfs-on-web/#subdomain-gateway */
const IPFS_HOST_REGEX = /^([^/]+)\.ipfs\./;

/** Get IPFS CID out of a path. */
function cidFromPath(path: string) {
  return path.match(IPFS_PATH_REGEX)?.[1];
}

/** Get IPFS CID out of a host. */
function cidFromHost(host: string) {
  return host.match(IPFS_HOST_REGEX)?.[1];
}

/** Get IPFS CID out of a URL. */
function cidFromUrl({ protocol, hostname, pathname }: URL) {
  switch (protocol) {
    case 'ipfs:':
      return hostname;
    case 'http:':
    case 'https:':
      return cidFromPath(pathname) || cidFromHost(hostname);
  }
}

export { cidFromUrl };