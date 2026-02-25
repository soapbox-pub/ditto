import type { NUser } from '@nostrify/react/login';

export interface RoomInfo {
  host: string;
  speakers: string[];
  admins: string[];
  link: string;
  recording: boolean;
}

export interface RoomRecording {
  id: string;
  started: number;
  stopped?: number;
  url: string;
}

export interface CreateRoomResponse {
  roomId: string;
  endpoints: string[];
  token: string;
}

export interface JoinRoomResponse {
  token: string;
}

/**
 * Client for the Nests API (https://nostrnests.com).
 * Uses NIP-98 HTTP auth via the user's nostrify signer.
 */
export class NestsApi {
  constructor(
    readonly url: string,
    readonly user?: NUser,
  ) {}

  /** Create a new audio room. Returns room ID, LiveKit endpoints, and auth token. */
  async createRoom(relays: string[]): Promise<CreateRoomResponse> {
    return await this.#fetch<CreateRoomResponse>(
      'PUT',
      true,
      '/api/v1/nests',
      JSON.stringify({ relays, hls_stream: false }),
    );
  }

  /** Join an existing room. Returns a LiveKit auth token. */
  async joinRoom(room: string): Promise<JoinRoomResponse> {
    if (this.user?.signer) {
      return await this.#fetch<JoinRoomResponse>('GET', true, `/api/v1/nests/${room}`);
    } else {
      return await this.#fetch<JoinRoomResponse>('GET', false, `/api/v1/nests/${room}/guest`);
    }
  }

  /** Update a participant's permissions (room admin required). */
  async updatePermissions(
    room: string,
    identity: string,
    req: { can_publish?: boolean; mute_microphone?: boolean; is_admin?: boolean },
  ): Promise<void> {
    await this.#fetchNoReturn(
      'POST',
      true,
      `/api/v1/nests/${room}/permissions`,
      JSON.stringify({ participant: identity, ...req }),
    );
  }

  /** Get room info (host, speakers, admins, recording state). */
  async getRoomInfo(room: string): Promise<RoomInfo> {
    return await this.#fetch<RoomInfo>('GET', false, `/api/v1/nests/${room}/info`);
  }

  /** Start recording (admin only). */
  async startRecording(room: string): Promise<void> {
    await this.#fetchNoReturn('POST', true, `/api/v1/nests/${room}/recording`);
  }

  /** Stop recording (admin only). */
  async stopRecording(room: string, recording: string): Promise<void> {
    await this.#fetchNoReturn('PATCH', true, `/api/v1/nests/${room}/recording/${recording}`);
  }

  /** Delete a recording (admin only). */
  async deleteRecording(room: string, recording: string): Promise<void> {
    await this.#fetchNoReturn('DELETE', true, `/api/v1/nests/${room}/recording/${recording}`);
  }

  /** List recordings for a room (admin only). */
  async listRecordings(room: string): Promise<RoomRecording[]> {
    return await this.#fetch<RoomRecording[]>('GET', true, `/api/v1/nests/${room}/recording`);
  }

  async #fetch<R>(
    method: 'GET' | 'PUT' | 'POST' | 'PATCH',
    auth: boolean,
    path: string,
    body?: BodyInit,
  ): Promise<R> {
    const url = `${this.url}${path}`;
    const headers: HeadersInit = {
      accept: 'application/json',
      'content-type': 'application/json',
    };
    if (auth) {
      headers['authorization'] = await this.#nip98(method, url);
    }
    const rsp = await fetch(url, { method, body, headers });
    if (rsp.ok) {
      return (await rsp.json()) as R;
    }
    throw new Error(await rsp.text());
  }

  async #fetchNoReturn(
    method: 'GET' | 'PUT' | 'POST' | 'PATCH' | 'DELETE',
    auth: boolean,
    path: string,
    body?: BodyInit,
  ): Promise<void> {
    const url = `${this.url}${path}`;
    const headers: HeadersInit = {
      accept: 'application/json',
      'content-type': 'application/json',
    };
    if (auth) {
      headers['authorization'] = await this.#nip98(method, url);
    }
    const rsp = await fetch(url, { method, body, headers });
    if (!rsp.ok) {
      throw new Error(await rsp.text());
    }
  }

  /** Build a NIP-98 HTTP Auth token using the user's signer. */
  async #nip98(method: string, url: string): Promise<string> {
    if (!this.user?.signer) {
      throw new Error('No signer available, cannot authenticate');
    }
    const event = await this.user.signer.signEvent({
      kind: 27235,
      content: '',
      tags: [
        ['u', url],
        ['method', method],
      ],
      created_at: Math.floor(Date.now() / 1000),
    });
    return `Nostr ${btoa(JSON.stringify(event))}`;
  }
}
