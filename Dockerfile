FROM denoland/deno:2.0.0
ENV PORT 5000

WORKDIR /app
RUN mkdir -p data && chown -R deno data
COPY . .
RUN deno cache --allow-import src/server.ts
RUN apt-get update && apt-get install -y unzip curl
RUN deno task soapbox
CMD deno task start
