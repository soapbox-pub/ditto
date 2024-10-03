FROM denoland/deno:1.44.2
EXPOSE 4036

ENV PORT 5000

WORKDIR /app
RUN mkdir -p data && chown -R deno data
USER deno
RUN mkdir -p data
COPY . .
RUN deno cache src/server.ts
RUN apt-get update && apt-get install -y unzip curl
RUN deno task soapbox
CMD deno task start