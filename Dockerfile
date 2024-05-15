FROM denoland/deno:1.43.3
EXPOSE 4036
WORKDIR /app
RUN mkdir -p data && chown -R deno data
USER deno
COPY . .
RUN deno cache src/server.ts
CMD deno task start
