/**
 * Type declarations for the Credential Management API's PasswordCredential
 * interface. This is an experimental Chromium-only API not included in
 * TypeScript's default DOM lib.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/PasswordCredential
 */

interface PasswordCredentialInit {
  id: string;
  password: string;
  name?: string;
  iconURL?: string;
}

declare class PasswordCredential extends Credential {
  constructor(init: PasswordCredentialInit);
  readonly password: string;
  readonly name: string;
  readonly iconURL: string;
}

interface CredentialRequestOptions {
  password?: boolean;
}
