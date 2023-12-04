class ExpiringCache implements Cache {
  #cache: Cache;

  constructor(cache: Cache) {
    this.#cache = cache;
  }

  add(request: RequestInfo | URL): Promise<void> {
    return this.#cache.add(request);
  }

  addAll(requests: RequestInfo[]): Promise<void> {
    return this.#cache.addAll(requests);
  }

  keys(request?: RequestInfo | URL | undefined, options?: CacheQueryOptions | undefined): Promise<readonly Request[]> {
    return this.#cache.keys(request, options);
  }

  matchAll(
    request?: RequestInfo | URL | undefined,
    options?: CacheQueryOptions | undefined,
  ): Promise<readonly Response[]> {
    return this.#cache.matchAll(request, options);
  }

  put(request: RequestInfo | URL, response: Response): Promise<void> {
    return this.#cache.put(request, response);
  }

  putExpiring(request: RequestInfo | URL, response: Response, expiresIn: number): Promise<void> {
    const expires = Date.now() + expiresIn;

    const clone = new Response(response.body, {
      status: response.status,
      headers: {
        expires: new Date(expires).toUTCString(),
        ...Object.fromEntries(response.headers.entries()),
      },
    });

    return this.#cache.put(request, clone);
  }

  async match(request: RequestInfo | URL, options?: CacheQueryOptions | undefined): Promise<Response | undefined> {
    const response = await this.#cache.match(request, options);
    const expires = response?.headers.get('Expires');

    if (response && expires) {
      if (new Date(expires).getTime() > Date.now()) {
        return response;
      } else {
        await Promise.all([
          this.delete(request),
          response.text(), // Prevent memory leaks
        ]);
      }
    } else if (response) {
      return response;
    }
  }

  delete(request: RequestInfo | URL, options?: CacheQueryOptions | undefined): Promise<boolean> {
    return this.#cache.delete(request, options);
  }
}

export default ExpiringCache;
