FROM denoland/deno:2.2.2
ENV PORT 5000

WORKDIR /app
RUN mkdir -p data && chown -R deno data
COPY . .
RUN deno cache --allow-import packages/ditto/server.ts
RUN apt-get update && apt-get install -y unzip curl
RUN deno task soapbox
CMD deno task start
