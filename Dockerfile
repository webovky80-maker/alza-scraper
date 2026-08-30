# Playwright image so the optional browser fallback works.
# Default run path is pure HTTP (CheerioCrawler) — no browser is launched.
FROM apify/actor-node-playwright-chrome:22

COPY --chown=myuser:myuser package*.json ./

RUN npm --quiet set progress=false \
    && npm install --omit=dev --omit=optional \
    && echo "Installed NPM packages:" \
    && (npm list --omit=dev --all || true) \
    && echo "Node.js version:" && node --version

COPY --chown=myuser:myuser . ./

CMD npm start --silent
